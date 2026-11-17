#!/usr/bin/env node
/**
 * ds_snapshot.cjs — снапшот фактических данных даркстора из Superset (ВкусВилл, дашборд 977).
 * Печатает JSON на stdout; с --out пишет его в файл (UTF-8, без кракозябр консоли Windows).
 *
 * Использование:
 *   node ds_snapshot.cjs <shopno|all> [YYYY-MM-DD] [--out snap.json]
 * Примеры:
 *   node ds_snapshot.cjs 7745                     # вчера, один даркстор
 *   node ds_snapshot.cjs 7745 2026-11-16 --out snap.json
 *   node ds_snapshot.cjs all                      # вся сеть (для калибровки)
 *
 * Авторизация (по приоритету):
 *   1) session-cookie браузера из local.json / env SS_COOKIE — основной рабочий путь;
 *   2) best-effort POST /login/ по username/password (CSRF в этом инстансе ломает путь, оставлен на будущее);
 *   3) если открыт Chrome с включённым удалённым отладчиком — cookie берётся оттуда не требуется.
 * После успешного входа cookies кешуются в local.json (git-ignored).
 *
 * Маппинг снапшота в поля формы index.html см. в superset-core.js (mapToForm).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL, URLSearchParams } = require('url');

const Core = require('./superset-core.js');

const BASE = Core.BASE;
const LOCAL_FILE = path.join(__dirname, 'local.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36';

// ---------------- storage helpers ----------------
function readLocal() {
  try { return JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8')); } catch (e) { return {}; }
}
function writeLocal(obj) {
  fs.writeFileSync(LOCAL_FILE, JSON.stringify(obj, null, 2));
}

// ---------------- HTTP core ----------------
function request(urlStr, opts) {
  const u = new URL(urlStr);
  const transport = u.protocol === 'http:' ? http : https;
  return new Promise((resolve, reject) => {
    const req = transport.request(u, {
      method: opts.method || 'GET',
      headers: opts.headers || {},
      timeout: opts.timeoutMs || 30000
    }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', ch => body += ch);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

// ---------------- auth ----------------
// Superset в этом инстансе не принимает programmatic POST /login/
// (CSRF включён, скрытое поле пустое, /api/v1/security/csrf_token/ требует Authorization).
// Поэтому основной путь — session-cookie из браузера; username/password-логин остаётся
// best-effort и проверяется реальным запросом /api/v1/me/.

async function verify(auth) {
  const res = await request(BASE + '/api/v1/me/', {
    headers: { 'accept': 'application/json', 'cookie': auth.sessionCookie, 'user-agent': UA }
  });
  return res.status === 200;
}

async function login(force) {
  const local = readLocal();

  // 1) сохранённая живая сессия
  if (!force && local.sessionCookie && local.cookieExpiry > Date.now()) {
    const auth = { sessionCookie: local.sessionCookie, csrfToken: local.csrfToken || '' };
    if (await verify(auth)) return auth;
    console.error('[auth] сохранённая сессия невалидна, пробую залогиниться');
  }

  // 2) best-effort username/password
  const pw = process.env.SS_PASSWORD || local.password;
  if (pw && pw !== '__test_placeholder__') {
    const auth = await tryPasswordLogin(local.username || 'aosmanov', pw);
    if (auth) {
      writeLocal(Object.assign(local, {
        sessionCookie: auth.sessionCookie,
        csrfToken: auth.csrfToken,
        cookieExpiry: Date.now() + 2 * 3600 * 1000
      }));
      console.error('[auth] OK (username/password), cookies saved');
      return auth;
    }
    console.error('[auth] username/password не прошёл (сервер редиректит на /login — вероятно CSRF/SSO)');
  }

  // 3) fallback: cookie из браузера
  const manual = manualCookie();
  if (manual) {
    const auth = { sessionCookie: manual, csrfToken: '' };
    if (await verify(auth)) {
      writeLocal(Object.assign(local, {
        sessionCookie: manual,
        cookieExpiry: Date.now() + 2 * 3600 * 1000
      }));
      console.error('[auth] OK (cookie из local.json/SS_COOKIE)');
      return auth;
    }
    throw new Error('Переданный session-cookie не авторизован (401 на /api/v1/me). Обновите его в браузере (см. README-расширения).');
  }

  throw new Error(
    'Нет рабочих учётных данных. Варианты:\n' +
    '  A) расширение DarkStore Superset Bridge (chrome-extension/) — данные берутся прямо со страницы Superset;\n' +
    '  B) положить в local.json поле sessionCookie (cookie "session" из DevTools браузера с открытым Superset)\n' +
    '     или задать env SS_COOKIE.'
  );
}

async function tryPasswordLogin(username, pw) {
  const gp = await request(BASE + '/login/?next=%2Fsuperset%2Fwelcome%2F', {
    headers: { 'user-agent': UA, accept: '*/*' }
  });
  const csrf = extractCsrf(gp.body);
  const jar = (gp.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');

  const form = new URLSearchParams({ username, password: pw, csrf_token: csrf || '' });
  const lp = await request(BASE + '/login/?next=%2Fsuperset%2Fwelcome%2F', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'content-length': String(Buffer.byteLength(form.toString())),
      'cookie': jar,
      'referer': BASE + '/login/?next=%2Fsuperset%2Fwelcome%2F',
      'x-csrftoken': csrf || '',
      'user-agent': UA
    },
    body: form.toString()
  });

  // Успешный Superset-логин = 302 НЕ на /login
  const loc = lp.headers.location || '';
  if (lp.status >= 300 && lp.status < 400 && !/login/.test(loc)) {
    const sess = (lp.headers['set-cookie'] || []).find(c => c.startsWith('session='));
    if (sess) {
      const auth = { sessionCookie: sess.split(';')[0], csrfToken: csrf || '' };
      if (await verify(auth)) return auth;
    }
  }
  return null;
}

function manualCookie() {
  const local = readLocal();
  let raw = process.env.SS_COOKIE || local.sessionCookie || '';
  if (!raw) {
    try { raw = fs.readFileSync(path.join(__dirname, 'cookie.txt'), 'utf8').trim(); } catch (e) { /* noop */ }
  }
  if (!raw) return '';
  if (!/^session=/.test(raw)) raw = 'session=' + raw.replace(/^.*session=/, ''); // терпимость к «session=...»/«...»
  return raw.split(';')[0];
}

function extractCsrf(html) {
  const m = html.match(/name="csrf_token"[^>]*value="([^"]+)"/i);
  return m ? decodeURIComponent(m[1]) : '';
}

// ---------------- chart data (через ядро) ----------------
async function fetchChart(auth, filters) {
  const res = await request(Core.chartUrl(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'accept': 'application/json',
      'origin': BASE,
      'referer': `${BASE}/superset/dashboard/services_lite/`,
      'x-csrftoken': auth.csrfToken || '',
      'cookie': auth.sessionCookie,
      'user-agent': UA
    },
    body: JSON.stringify(Core.buildQueryBody(filters))
  });
  if (res.status === 401 || res.status === 302) {
    auth = await login(true);
    return fetchChart(auth, filters);
  }
  if (res.status !== 200) throw new Error(`Chart: HTTP ${res.status}`);
  return JSON.parse(res.body);
}

// ---------------- main ----------------
(async () => {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const outFile = outIdx >= 0 ? args.splice(outIdx, 2)[1] : null;
  const shopArg = (args[0] || 'all').trim();
  const dateArg = args[1] || Core.yesterdayISO();

  const auth = await login(false);
  const filters = { shopno: shopArg === 'all' ? null : shopArg, time_range: dateArg };

  const chart = await fetchChart(auth, filters);
  const acc = Core.aggregateRows(chart);
  const snap = Core.toSnapshot(acc, { shopno: shopArg === 'all' ? null : shopArg, date: dateArg });
  if (shopArg === 'all') delete snap.by_service;
  const mapped = Core.mapToForm(snap);
  const result = { snapshot: snap, mapped: mapped };
  const text = JSON.stringify(result, null, 2);

  if (outFile) {
    fs.writeFileSync(outFile, text, 'utf8');
    console.error('[ok] снапшот записан в ' + outFile + ' (' + snap.orders_per_day + ' заказов/день, чек ' + snap.avg_check_rub + ' ₽)');
  } else {
    console.log(text);
  }
})().catch(e => { console.error('[fatal]', e.message); process.exit(1); });
