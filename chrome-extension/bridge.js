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
    var mapped = snap.mapped || (window.SupersetCore && snap.snapshot ? SupersetCore.mapToForm(snap.snapshot) : null);
    if (!mapped) throw new Error('Нет данных для маппинга: передайте объект из ds_snapshot.cjs или результат pull()');
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
    var snap = j.result ? j : j.snapshot ? j : { snapshot: j };
    if (!snap.snapshot && !snap.orders_per_day) throw new Error('Не похоже на снапшот Superset (нет orders_per_day/snapshot)');
    return snap;
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
        '<textarea id="dsBJsonTa" placeholder=\'{"orders_per_day":1748,"avg_check_rub":1516,...}\' spellcheck="false"></textarea>',
        function (m) {
          var ta = m.querySelector('#dsBJsonTa');
          try {
            var snap = parseSnapText(ta.value);
            var r = importSnapshot(snap);
            setStatus('Импортировано: ' + (r.notes ? r.notes.join('; ') : ''));
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
    });
  }

  window.darkstoreBridge = {
    importSnapshot: importSnapshot, exportJSON: exportJSON, exportFile: exportFile,
    applyPatch: applyPatch, readSnap: readSnap, KEY: KEY
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectUI);
  else injectUI();
})();
