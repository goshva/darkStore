/* bridge.js — внедряется расширением во вкладку darkStoreBB (file:// или http://).
   Даёт window.darkstoreBridge для импорта снапшота Superset и экспорта JSON. */
(function () {
  'use strict';
  if (window.__dsBridgeLoaded) return;
  window.__dsBridgeLoaded = true;

  var KEY = 'darkstore_superset_snap';

  function readSnap() {
    try { var raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }

  /* ---------- API окна darkStoreBB ---------- */

  // Импорт снапшота из Superset → патч недели 1 (использует SupersetCore.mapToForm, если загружен).
  function importSnapshot(snap) {
    // snap может быть: 1) {snapshot, mapped}  2) массив таких  3) чистый snapshot
    if (Array.isArray(snap)) {
      if (snap.length === 1) return importSnapshot(snap[0]);
      var results = [];
      snap.forEach(function (s) { results.push(importSnapshot(s)); });
      return results;
    }
    var mapped = snap.mapped || (window.SupersetCore && snap.snapshot ? SupersetCore.mapToForm(snap.snapshot) : null);
    if (!mapped) {
      // fallback: попытаться сконструировать mapped из snapshot напрямую
      if (snap.snapshot && window.SupersetCore) {
        mapped = SupersetCore.mapToForm(snap.snapshot);
      } else if (snap.orders_per_day != null) {
        // snapshot прямо тут
        mapped = window.SupersetCore ? SupersetCore.mapToForm(snap) : null;
      }
    }
    if (!mapped) throw new Error('Нет данных для маппинга: передайте {snapshot, mapped} из ds_snapshot.cjs или объект с orders_per_day');
    applyPatch(mapped.patch, mapped.notes);
    try { localStorage.setItem(KEY, JSON.stringify(snap)); } catch (e) {}
    return mapped;
  }

  // Экспорт текущей формы darkStoreBB (недели + бенчмарки) в JSON-строку для анализа.
  function exportJSON() {
    var raw = null;
    try { raw = localStorage.getItem('darkstore_profit_live_v5'); } catch (e) {}
    return raw ? JSON.parse(raw) : null;
  }

  function download(name, text, mime) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime || 'application/json' }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  function exportFile() {
    var data = { exported_at: new Date().toISOString(), project: exportJSON(), superset: readSnap() };
    download('darkstore_export_' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(data, null, 2));
    return data;
  }

  /* ---------- применение патча к форме ---------- */
  function findApplyFn() {
    // index.html может экспортировать свой апликер; иначе — пишем напрямую в localStorage-состояние.
    return typeof window._dsApplyPatch === 'function' ? window._dsApplyPatch : null;
  }

  function applyPatch(patch, notes) {
    var fn = findApplyFn();
    if (fn) return fn(patch, notes);

    // fallback: правим saved state напрямую и перезагружаем страницу
    var KEY_PROJ = 'darkstore_profit_live_v5';
    var payload = null;
    try { payload = JSON.parse(localStorage.getItem(KEY_PROJ) || 'null'); } catch (e) {}
    if (!payload) payload = { state_version: 2, weeks: {}, currentWeek: 1 };
    if (!payload.weeks['1']) payload.weeks['1'] = {};
    Object.keys(patch).forEach(function (k) {
      if (patch[k] != null && isFinite(patch[k])) payload.weeks['1'][k] = patch[k];
    });
    payload.saved_at = new Date().toISOString();
    localStorage.setItem(KEY_PROJ, JSON.stringify(payload));
    setStatus('Данные Superset записаны в неделю 1' + (notes && notes.length ? ': ' + notes.join('; ') : '') + '. Обновите страницу (F5).');
    return { applied: patch, via: 'localStorage' };
  }

  /* ---------- UI: панель + кнопки ---------- */
  function cssInject() {
    if (document.getElementById('dsBridgeStyle')) return;
    var s = document.createElement('style');
    s.id = 'dsBridgeStyle';
    s.textContent = '#dsBridgeBar{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}' +
      '#dsBridgeBar button{padding:10px 14px;border-radius:12px;border:1px solid #0b8a4b;background:#0b8a4b;color:#fff;font-size:14px;font-weight:600;cursor:pointer}' +
      '#dsBridgeBar button.alt{background:#fff;color:#0a6b3b}' +
      '#dsBridgeStatus{font-size:13px;color:#0a6b3b;margin:4px 0 min-height:18px}' +
      '#dsBridgeModal{position:fixed;inset:0;background:rgba(20,26,34,.45);display:none;align-items:center;justify-content:center;z-index:9999;padding:12px}' +
      '#dsBridgeModal.on{display:flex}' +
      '#dsBridgeModal .box{background:#fff;border-radius:14px;padding:16px;max-width:720px;width:100%;max-height:80vh;overflow:auto}' +
      '#dsBridgeModal textarea{width:100%;min-height:220px;font-family:ui-monospace,Consolas,monospace;font-size:12px;padding:10px;border:1px solid #e3e6ea;border-radius:10px}' +
      '#dsBridgeModal h3{margin:0 0 8px;font-size:15px}';
    document.head.appendChild(s);
  }

  function setStatus(t, err) {
    var el = document.getElementById('dsBridgeStatus');
    if (el) { el.textContent = t; el.style.color = err ? '#b42318' : '#0a6b3b'; }
  }

  function modal(title, bodyHtml, onOk) {
    cssInject();
    var m = document.getElementById('dsBridgeModal');
    if (!m) {
      m = document.createElement('div'); m.id = 'dsBridgeModal';
      m.innerHTML = '<div class="box"><h3 id="dsBModalTitle"></h3><div id="dsBModalBody"></div>' +
        '<div style="display:flex;gap:8px;margin-top:10px"><button id="dsBModalOk" style="padding:10px 16px;border-radius:12px;border:0;background:#0b8a4b;color:#fff;font-weight:600">ОК</button>' +
        '<button id="dsBModalCancel" style="padding:10px 16px;border-radius:12px;border:1px solid #e3e6ea;background:#fff">Отмена</button></div></div>';
      document.body.appendChild(m);
      m.addEventListener('click', function (e) { if (e.target === m) m.classList.remove('on'); });
      m.querySelector('#dsBModalCancel').addEventListener('click', function () { m.classList.remove('on'); });
    }
    m.querySelector('#dsBModalTitle').textContent = title;
    m.querySelector('#dsBModalBody').innerHTML = bodyHtml;
    m.classList.add('on');
    var ok = m.querySelector('#dsBModalOk');
    ok.onclick = function () { if (!onOk || onOk(m) !== false) m.classList.remove('on'); };
  }

  function parseSnapText(txt) {
    txt = (txt || '').trim();
    if (!txt) throw new Error('Пусто');
    var j = JSON.parse(txt);
    // формы: [{snapshot,mapped},...] | {snapshot,mapped} | чистый snapshot | {days:{...}} из __dsHistory
    if (Array.isArray(j)) return j.map(parseSnapObj);
    return parseSnapObj(j);
  }

  function parseSnapObj(j) {
    if (j && j.snapshot) return j;
    if (j && j.orders_per_day != null) return { snapshot: j, mapped: window.SupersetCore ? SupersetCore.mapToForm(j) : null };
    if (j && j.days && typeof j.days === 'object') {
      // экспорт __dsHistory: превращаем дни в список {snapshot}
      return Object.keys(j.days).sort().map(function (d) {
        var s = j.days[d];
        return { snapshot: s, mapped: window.SupersetCore ? SupersetCore.mapToForm(s) : null };
      });
    }
    throw new Error('Не похоже на снапшот Superset (нет orders_per_day/snapshot/days)');
  }

  function pullFromSuperset(btn) {
    // 1) расширение? запрашиваем данные прямо со вкладки Superset
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
      setStatus('Запрос к Superset…');
      if (btn) btn.textContent = '…';
      chrome.runtime.sendMessage({ type: 'DARKSTORE_PULL_ALL' }, function (resp) {
        if (btn) btn.textContent = 'Superset';
        if (chrome.runtime.lastError || !resp || !resp.ok) {
          setStatus((resp && resp.error) || (chrome.runtime.lastError && chrome.runtime.lastError.message) ||
            'Вкладка Superset не найдена. Откройте дашборд services_lite и повторите.', true);
          return;
        }
        var r = importSnapshot(resp.result);
        setStatus('Superset → форма применено: ' + (r.notes ? r.notes.join('; ') : JSON.stringify(r.patch)));
        if (typeof window.render === 'function') window.render(true);
      });
      return;
    }
    // 2) расширения нет — подсказка про CLI
    modal('Данные из Superset',
      '<p style="font-size:13px">Расширение <b>DarkStore Superset Bridge</b> не установлено, поэтому тянуть данные из браузера нельзя.<br>' +
      'Варианты:<br>1) Установите расширение (chrome://extensions → «Загрузить распакованное» → папка <code>chrome-extension</code>) и откройте вкладку Superset.<br>' +
      '2) Или получите файл в консоли: <code>node ds_snapshot.cjs 7745 &gt; snap.json</code> и импортируйте его кнопкой «Импорт JSON…».</p>');
  }

  function injectUI() {
    cssInject();
    if (document.getElementById('dsBridgeBar')) return;

    // Кнопка в sticky-бар: на локальном index.html она уже есть (#dsSupersetBtn со своим
    // обработчиком внутри IIFE страницы), на GitHub Pages (старая версия) — создаём сами.
    var existing = document.getElementById('dsSupersetBtn');
    if (!existing) {
      var sticky = document.querySelector('.sticky');
      if (sticky) {
        existing = document.createElement('button');
        existing.type = 'button';
        existing.id = 'dsSupersetBtn';
        existing.className = 'secondary';
        existing.style.cssText = 'background:#0b8a4b;color:#fff;border-color:#0b8a4b;';
        existing.textContent = 'Superset';
        existing.addEventListener('click', function () { pullFromSuperset(existing); });
        sticky.insertBefore(existing, sticky.firstChild);
      }
    }

    var bar = document.createElement('div');
    bar.id = 'dsBridgeBar';
    bar.innerHTML = '<button type="button" id="dsBSupBtn">⚡ Из Superset</button>' +
      '<button type="button" id="dsBImportBtn" class="alt">Импорт JSON…</button>' +
      '<button type="button" id="dsBExportBtn" class="alt">Экспорт JSON</button>';
    var st = document.createElement('div');
    st.id = 'dsBridgeStatus';

    var anchor = document.querySelector('.sticky') || document.querySelector('h1');
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(bar, anchor.nextSibling);
      anchor.parentNode.insertBefore(st, bar.nextSibling);
    } else {
      document.body.insertBefore(bar, document.body.firstChild);
      document.body.insertBefore(st, bar.nextSibling);
    }

    document.getElementById('dsBSupBtn').addEventListener('click', function () { pullFromSuperset(null); });

    document.getElementById('dsBImportBtn').addEventListener('click', function () {
      modal('Импорт снапшота Superset',
        '<textarea id="dsBJsonTa" placeholder=\'[{"snapshot":{...},"mapped":{...}}, ...] или {"orders_per_day":1748,...}\' spellcheck="false"></textarea>',
        function (m) {
          var ta = m.querySelector('#dsBJsonTa');
          try {
            var parsed = parseSnapText(ta.value);
            var list = Array.isArray(parsed) ? parsed : [parsed];
            // складываем все дни в историю (для графика факт/план)
            if (window.__dsHistory) {
              window.__dsHistory.addDays(list.map(function (x) { return x.snapshot; }).filter(Boolean));
            }
            var r = importSnapshot(list.length === 1 ? list[0] : list);
            setStatus('Импортировано дней: ' + list.length + '. ' + ((Array.isArray(r) ? r[r.length - 1] : r).notes || []).join('; '));
            if (typeof window.render === 'function') window.render(true);
          } catch (e) { setStatus('Ошибка импорта: ' + e.message, true); return false; }
        });
      setTimeout(function () { var ta = document.getElementById('dsBJsonTa'); if (ta) ta.focus(); }, 50);
    });

    document.getElementById('dsBExportBtn').addEventListener('click', function () {
      try { exportFile(); setStatus('JSON проекта выгружен (файл загрузки браузера).'); }
      catch (e) { setStatus('Экспорт не удался: ' + e.message, true); }
    });

    // автоподхват снапшота, сохранённого расширением
    var saved = readSnap();
    if (saved) setStatus('Есть сохранённый снапшот Superset от ' + (saved.date || saved.pulled_at || '?') + ' — «Из Superset» применит его.');
  }

  // сообщения от popup'а расширения (вставка в открытую страницу)
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      if (!msg || !msg.type) return;
      if (msg.type === 'DARKSTORE_APPLY_PATCH') {
        try {
          applyPatch(msg.patch, msg.notes);
          if (typeof window.render === 'function') window.render(true);
          sendResponse({ ok: true });
        } catch (e) { sendResponse({ ok: false, error: e.message }); }
        return;
      }
      if (msg.type === 'DARKSTORE_IMPORT_SNAP') {
        try { sendResponse({ ok: true, result: importSnapshot(msg.snap) }); }
        catch (e) { sendResponse({ ok: false, error: e.message }); }
        return;
      }
      // ── пакетное нанесение фактов на графики ──
      if (msg.type === 'DARKSTORE_FACTS') {
        try {
          applyPatch(msg.patch, msg.notes);
          if (window.__dsFacts) window.__dsFacts.add(msg.snaps);
          if (typeof window.render === 'function') window.render(true);
          sendResponse({ ok: true });
        } catch (e) { sendResponse({ ok: false, error: e.message }); }
        return;
      }
    });
  }

  window.darkstoreBridge = {
    importSnapshot: importSnapshot, exportJSON: exportJSON, exportFile: exportFile,
    applyPatch: applyPatch, readSnap: readSnap, KEY: KEY
  };

  // ── рисование исторических фактов поверх графиков ──
  var FACT_COLORS = { orders: '#7a5af8', check: '#175cd3', slot: '#f79009' };

  function planWeeksFromState() {
    // состояние страницы (state.weeks['1'..'6']) либо из localStorage (если IIFE не экспортирует)
    try {
      var raw = localStorage.getItem('darkstore_profit_live_v5');
      if (raw) return JSON.parse(raw).weeks || {};
    } catch (e) {}
    return {};
  }

  function metricForChart(title, factRows) {
    // подбираем метрику факта по заголовку графика
    var t = String(title || '').toLowerCase();
    if (/опозд/.test(t)) return 'slot';          // прокси: доля вне слота
    if (/чек|ц/.test(t) && /₽|руб/.test(t)) return 'check';
    if (/прибыль|вклад|потер/.test(t)) return null; // прибыль/потери фактом не покрываем
    return 'orders';
  }

  function installFactsHooks() {
    if (!window.__dsHistory || !window.__dsHooks) return;
    window.__dsHooks.factLine = function (X, Y, fmtV, title) {
      var rows = window.__dsHistory.compareWithPlan(planWeeksFromState());
      if (!rows.length) return '';
      var key = metricForChart(title, rows);
      if (!key) return '';
      var svg = '', color = FACT_COLORS[key];
      rows.forEach(function (r, i) {
        var f = r[key === 'slot' ? 'lateness' : key] && r[key === 'slot' ? 'lateness' : key].fact;
        if (f == null) return;
        var cx = X(i), cy = Y(f);
        var p = r[key === 'slot' ? 'lateness' : key];
        svg += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="3.5" fill="none" stroke="' + color + '" stroke-width="2">' +
          '<title>Факт ' + r.week + ': ' + fmtV(f) + (p.plan != null ? ' · план ' + fmtV(p.plan) + ' · Δ ' + (p.diff > 0 ? '+' : '') + p.diff + (p.pct != null ? ' (' + p.pct + '%)' : '') : '') + '</title></circle>';
        if (i > 0) {
          var prev = rows[i - 1][key === 'slot' ? 'lateness' : key];
          if (prev && prev.fact != null) {
            svg += '<line x1="' + X(i - 1).toFixed(1) + '" y1="' + Y(prev.fact).toFixed(1) + '" x2="' + cx.toFixed(1) + '" y2="' + cy.toFixed(1) + '" stroke="' + color + '" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.7"/>';
          }
        }
      });
      return svg;
    };
  }

  function renderFactsPanel() {
    cssInject();
    var el = document.getElementById('dsFactsPanel');
    if (!el) {
      el = document.createElement('div');
      el.id = 'dsFactsPanel';
      el.className = 'card';
      var charts = document.getElementById('charts');
      if (charts && charts.parentNode) charts.parentNode.insertBefore(el, charts);
      else document.body.appendChild(el);
    }
    if (!window.__dsHistory) { el.innerHTML = ''; return; }
    var rows = window.__dsHistory.compareWithPlan(planWeeksFromState());
    if (!rows.length) { el.innerHTML = '<h2>Факт vs план</h2><div class="hint">Нет фактических данных — загрузите недели через расширение или «Импорт JSON…».</div>'; return; }
    function cell(c, unit) {
      if (c.fact == null) return '<td class="na">нет</td>';
      var d = c.diff == null ? '' : '<span style="color:' + (Math.abs(c.diff) < 0.05 ? '#667085' : (c.diff > 0 ? '#b42318' : '#0a6b3b')) + '">Δ ' + (c.diff > 0 ? '+' : '') + c.diff + (unit || '') + (c.pct != null ? ' (' + c.pct + '%)' : '') + '</span>';
      return '<td>' + c.fact + (unit || '') + (d ? '<br><small>' + d + '</small>' : '') + '</td>';
    }
    var h = '<h2>Факт vs план (Superset)</h2><div class="matrix-wrap"><table class="matrix">' +
      '<tr><th>Неделя</th><th>Заказы/день</th><th>Чек, ₽</th><th>Вне слота, %</th></tr>';
    rows.forEach(function (r) {
      h += '<tr><td class="m-name">' + r.week + (r.complete ? '' : ' <small>(' + r.days + ' дн.)</small>') + '</td>' +
        cell(r.orders) + cell(r.check) + cell(r.lateness) + '</tr>';
    });
    h += '</table></div><div class="hint">Пунктир на графиках — фактические заказы/день и чек по неделям Пн–Вс.</div>';
    el.innerHTML = h;
  }

  (function initFacts() {
    if (typeof SupersetCore === 'undefined') return;   // history работает без ядра только если SupersetCore загружен (mondayOf и т.п.)
    window.__dsFacts = {
      add: function (snaps) {
        snaps.forEach(function (s) { if (s) window.__dsHistory.addDay(s); });
        renderFactsPanel();
      },
      clear: function () { try { localStorage.removeItem(window.__dsHistory.KEY); } catch (e) {} renderFactsPanel(); }
    };
    installFactsHooks();
    setTimeout(renderFactsPanel, 300);   // после первого render страницы
  })();

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectUI);
  else injectUI();
})();
