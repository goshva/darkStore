/* background.js — service worker MV3: роутинг сообщений popup ⇄ вкладки Superset/darkStoreBB. */
'use strict';

var SUPERSET_MATCH = 'https://superset.svc.vkusvill.ru/*';
var DARKSTORE_GLOB = [
  'https://goshva.github.io/darkStore/*',
  'file:///*', 'http://localhost/*', 'http://127.0.0.1/*'
];

function findSupersetTab(cb) {
  chrome.tabs.query({ url: SUPERSET_MATCH }, function (tabs) { cb((tabs || [])[0] || null); });
}

// Матчинг URL вкладки с паттернами расширения. chrome.tabs.query({url:['file:///*']}) НЕ матчит
// file:///C:/... (Chrome трактует «file:///*» как host='*'), поэтому file:// и локальные пути
// проверяем руками по полному URL.
function isDarkstoreUrl(u) {
  u = u || '';
  if (/^https:\/\/goshva\.github\.io\/darkStore\//i.test(u)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(u)) return true;
  if (/^file:\/\/\/.*/i.test(u) && /darkstore|index\.html/i.test(u)) return true;
  return false;
}
function pickDarkstoreTab(list) {
  var best = null;
  (list || []).forEach(function (t) {
    var u = t.url || t.pendingUrl || '';
    if (!isDarkstoreUrl(u)) return;
    if (/goshva\.github\.io\/darkStore/i.test(u)) { best = t; return; }
    if (!best) best = t;
  });
  return best;
}
function findDarkstoreTab(cb) {
  // 1) обычный query по глобам (ловит http/https и корректные file://-вкладки)
  chrome.tabs.query({ url: DARKSTORE_GLOB }, function (tabs) {
    var best = pickDarkstoreTab(tabs);
    if (best) { cb(best); return; }
    // 2) fallback: все вкладки + ручной матчинг (спасает file:///C:/... без «Allow access to file URLs»)
    chrome.tabs.query({}, function (all) {
      var found = pickDarkstoreTab(all);
      if (found && /^file:\/\//i.test(found.url || '')) {
        // без разрешённого доступа к файлам scripting/sendMessage всё равно упадёт — подскажем как включить
        chrome.extension.isAllowedFileSchemeAccess(function (allowed) {
          if (allowed === false) {
            cb(null, 'Нет доступа к file:// — включите в chrome://extensions у «darkStoreBB · Superset bridge» переключатель «Allow access to file URLs» и обновите страницу графика (F5).');
            return;
          }
          cb(found);
        });
        return;
      }
      cb(found);
    });
  });
}

function ensureScripts(tabId, files, cb) {
  chrome.scripting.executeScript({ target: { tabId: tabId }, files: files }, function () {
    var err = chrome.runtime.lastError;
    cb(err ? err.message : null);
  });
}

function sendToTab(tabId, msg, cb) {
  chrome.tabs.sendMessage(tabId, msg, function (resp) {
    if (chrome.runtime.lastError) { cb({ ok: false, error: chrome.runtime.lastError.message }); return; }
    cb(resp || { ok: false, error: 'пустой ответ вкладки' });
  });
}

function pullOneDay(shopno, date, cb) {
  findSupersetTab(function (tab) {
    if (!tab) { cb({ ok: false, error: 'Нет вкладки Superset' }); return; }
    ensureScripts(tab.id, ['superset-core.js', 'inject.js'], function () {
      sendToTab(tab.id, { type: 'DARKSTORE_PULL', opts: { shopno: shopno, date: date } }, cb);
    });
  });
}

// Пакетное извлечение N недель (42 дня). Прогресс — сообщениями {type:'DARKSTORE_PROGRESS', done, total, date} в popup.
function pullWeeks(shopno, numWeeks, cb) {
  function isoLocal(dt) { return dt.getFullYear() + '-' + ('0' + (dt.getMonth() + 1)).slice(-2) + '-' + ('0' + dt.getDate()).slice(-2); }

  var ref = new Date();
  ref.setHours(0, 0, 0, 0);
  var dow = ref.getDay();
  var thisMon = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - (dow === 0 ? 6 : dow - 1));
  var todayStr = isoLocal(ref);
  var dates = [];
  for (var i = 1; i <= numWeeks; i++) {
    for (var d = 0; d < 7; d++) {
      var dd = new Date(thisMon.getFullYear(), thisMon.getMonth(), thisMon.getDate() - 7 * i + d);
      var dateStr = isoLocal(dd);
      if (dateStr < todayStr) dates.push(dateStr);   // без сегодняшнего и будущих
    }
  }
  dates.sort();                                      // от старой к новой

  var results = [];
  var idx = 0;
  var total = dates.length;

  function notify(done, date) {
    try { chrome.runtime.sendMessage({ type: 'DARKSTORE_PROGRESS', done: done, total: total, date: date }, function () { void chrome.runtime.lastError; }); } catch (e) {}
  }

  function pullNext() {
    if (idx >= total) { cb({ ok: true, result: { snaps: results } }); return; }
    var date = dates[idx];
    notify(idx, date);
    pullOneDay(shopno, date, function (resp) {
      idx++;
      if (resp.ok && resp.result) results.push(resp.result);   // пустые/праздничные дни просто пропускаем
      notify(idx, idx < total ? dates[idx] : null);
      pullNext();
    });
  }

  pullNext();
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || !msg.type) return;

  if (msg.type === 'DARKSTORE_PULL') {
    if (msg.opts && msg.opts.weeks) {
      // Режим «N недель»
      pullWeeks(msg.opts.shopno, msg.opts.weeks, sendResponse);
      return true;
    }
    // Обычный одиночный день
    pullOneDay(msg.opts.shopno, msg.opts.date, sendResponse);
    return true;
  }

  if (msg.type === 'DARKSTORE_PULL_ALL') {
    var tabId = sender.tab && sender.tab.id;
    findSupersetTab(function (tab) {
      if (!tab) { sendResponse({ ok: false, error: 'Откройте вкладку superset.svc.vkusvill.ru.' }); return; }
      ensureScripts(tab.id, ['superset-core.js', 'inject.js'], function () {
        sendToTab(tab.id, { type: 'DARKSTORE_PULL', opts: msg.opts || {} }, function (resp) {
          if (!resp.ok || !tabId) { sendResponse(resp); return; }
          sendToTab(tabId, { type: 'DARKSTORE_IMPORT_SNAP', snap: resp.result }, function (applyRes) {
            sendResponse(applyRes && applyRes.ok ? { ok: true, result: resp.result, applied: applyRes.result } : applyRes);
          });
        });
      });
    });
    return true;
  }

  if (msg.type === 'DARKSTORE_TABS') {
    findSupersetTab(function (ss) {
      findDarkstoreTab(function (ds, hint) {
        sendResponse({ superset: ss ? { id: ss.id, url: ss.url, title: ss.title } : null,
                       darkstore: ds ? { id: ds.id, url: ds.url, title: ds.title } : null,
                       darkstoreHint: ds ? null : (hint || null) });
      });
    });
    return true;
  }

  if (msg.type === 'DARKSTORE_APPLY_TO_PAGE') {
    findDarkstoreTab(function (ds, hint) {
      if (!ds) { sendResponse({ ok: false, error: 'Вкладка darkStoreBB (index.html) не найдена. ' + (hint || 'Откройте index.html в этой же вкладке Chrome.') }); return; }
      ensureScripts(ds.id, ['history.js', 'bridge.js'], function () {
        sendToTab(ds.id, { type: 'DARKSTORE_APPLY_PATCH', patch: msg.patch, notes: msg.notes }, sendResponse);
      });
    });
    return true;
  }

  // Пакет фактов: складываем дни в историю страницы и наносим на графики
  if (msg.type === 'DARKSTORE_FACTS') {
    findDarkstoreTab(function (ds, hint) {
      if (!ds) { sendResponse({ ok: false, error: 'Вкладка darkStoreBB (index.html) не найдена. ' + (hint || 'Откройте index.html в этой же вкладке Chrome.') }); return; }
      ensureScripts(ds.id, ['superset-core.js', 'history.js', 'bridge.js'], function (err) {
        if (err) { sendResponse({ ok: false, error: 'Инъекция скриптов: ' + err }); return; }
        sendToTab(ds.id, { type: 'DARKSTORE_FACTS', snaps: msg.snaps || [], patch: msg.patch, notes: msg.notes }, sendResponse);
      });
    });
    return true;
  }
});
