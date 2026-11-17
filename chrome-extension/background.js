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

function findDarkstoreTab(cb) {
  chrome.tabs.query({ url: DARKSTORE_GLOB }, function (tabs) {
    var list = tabs || [];
    var best = null;
    for (var i = 0; i < list.length; i++) {
      if (/goshva\.github\.io\/darkStore/i.test(list[i].url || '')) { best = list[i]; break; }
      if (!best && /darkstore|index\.html/i.test(list[i].url || '')) best = list[i];
    }
    cb(best);
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

// Пакетное извлечение N дней (для режима «6 недель»)
function pullWeeks(shopno, numWeeks, cb) {
  var core = typeof SupersetCore !== 'undefined' ? SupersetCore : null;
  if (!core) {
    // fallback: генерируем понедельники через background
    var ref = new Date();
    ref.setHours(0, 0, 0, 0);
    var dow = ref.getDay();
    var thisMon = new Date(ref);
    thisMon.setDate(thisMon.getDate() - (dow === 0 ? 6 : dow - 1));
    var mondays = [];
    for (var i = 1; i <= numWeeks; i++) mondays.push(new Date(thisMon.getTime() - 7 * 1000 * 60 * 60 * 24 * 7 * i));
    var dates = [];
    mondays.forEach(function (mon) {
      for (var d = 0; d < 7; d++) {
        var dd = new Date(mon.getTime() + 1000 * 60 * 60 * 24 * d);
        var dateStr = dd.getFullYear() + '-' + ('0' + (dd.getMonth() + 1)).slice(-2) + '-' + ('0' + dd.getDate()).slice(-2);
        if (dateStr < (new Date().toISOString().slice(0, 10))) dates.push(dateStr);
      }
    });
    dates.sort(); // от старой к новой

    var results = [];
    var idx = 0;

    function pullNext() {
      if (idx >= dates.length) {
        cb({ ok: true, result: { snaps: results } });
        return;
      }
      var date = dates[idx++];
      pullOneDay(shopno, date, function (resp) {
        if (resp.ok && resp.result) {
          results.push(resp.result);
          pullNext();
        } else {
          // пропуск пустых дней (например, праздники)
          pullNext();
        }
      });
    }

    pullNext();
    return;
  }

  // Если core доступен (из Superset вкладка), используем его
  var ref = new Date();
  ref.setHours(0, 0, 0, 0);
  var dow = ref.getDay();
  var thisMon = new Date(ref);
  thisMon.setDate(thisMon.getDate() - (dow === 0 ? 6 : dow - 1));
  var mondays = [];
  for (var i = 1; i <= numWeeks; i++) mondays.push(new Date(thisMon.getTime() - 7 * 1000 * 60 * 60 * 24 * 7 * i));
  var allDates = [];
  mondays.forEach(function (mon) {
    for (var d = 0; d < 7; d++) {
      var dd = new Date(mon.getTime() + 1000 * 60 * 60 * 24 * d);
      var dateStr = dd.getFullYear() + '-' + ('0' + (dd.getMonth() + 1)).slice(-2) + '-' + ('0' + dd.getDate()).slice(-2);
      if (dateStr < (new Date().toISOString().slice(0, 10))) allDates.push(dateStr);
    }
  });

  var results = [];
  var idx = 0;
  function pullNext() {
    if (idx >= allDates.length) {
      cb({ ok: true, result: { snaps: results } });
      return;
    }
    var date = allDates[idx++];
    pullOneDay(shopno, date, function (resp) {
      if (resp.ok && resp.result) {
        results.push(resp.result);
        pullNext();
      } else {
        pullNext();
      }
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
      findDarkstoreTab(function (ds) {
        sendResponse({ superset: ss ? { id: ss.id, url: ss.url, title: ss.title } : null,
                       darkstore: ds ? { id: ds.id, url: ds.url, title: ds.title } : null });
      });
    });
    return true;
  }

  if (msg.type === 'DARKSTORE_APPLY_TO_PAGE') {
    findDarkstoreTab(function (ds) {
      if (!ds) { sendResponse({ ok: false, error: 'Вкладка darkStoreBB (index.html) не найдена.' }); return; }
      ensureScripts(ds.id, ['history.js', 'bridge.js'], function () {
        sendToTab(ds.id, { type: 'DARKSTORE_APPLY_PATCH', patch: msg.patch, notes: msg.notes }, sendResponse);
      });
    });
    return true;
  }
});
