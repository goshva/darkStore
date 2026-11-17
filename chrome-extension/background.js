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
    // предпочитаем вкладки с darkStoreBB/index.html
    var list = tabs || [];
    var best = null;
    for (var i = 0; i < list.length; i++) {
      if (/goshva\.github\.io\/darkStore/i.test(list[i].url || '')) { best = list[i]; break; }
      if (!best && /darkstore|index\.html/i.test(list[i].url || '')) best = list[i];
    }
    cb(best);
  });
}

// Гарантирует, что inject.js/bridge.js загружены во вкладке (для старых вкладок без content-script).
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

function pullFromSuperset(opts, cb) {
  findSupersetTab(function (tab) {
    if (!tab) { cb({ ok: false, error: 'Откройте вкладку superset.svc.vkusvill.ru (дашборд services_lite) и авторизуйтесь.' }); return; }
    ensureScripts(tab.id, ['superset-core.js', 'inject.js'], function (err) {
      if (err) { cb({ ok: false, error: 'Не удалось внедрить скрипт в Superset: ' + err }); return; }
      sendToTab(tab.id, { type: 'DARKSTORE_PULL', opts: opts || {} }, cb);
    });
  });
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || !msg.type) return;

  if (msg.type === 'DARKSTORE_PULL') {
    pullFromSuperset(msg.opts, sendResponse);
    return true;
  }

  // Запрос из страницы darkStoreBB (кнопка «⚡ Из Superset»): тянем и сразу вставляем.
  if (msg.type === 'DARKSTORE_PULL_ALL') {
    var tabId = sender.tab && sender.tab.id;
    pullFromSuperset(msg.opts || {}, function (resp) {
      if (!resp.ok || !tabId) { sendResponse(resp); return; }
      sendToTab(tabId, { type: 'DARKSTORE_IMPORT_SNAP', snap: resp.result }, function (applyRes) {
        sendResponse(applyRes && applyRes.ok ? { ok: true, result: resp.result, applied: applyRes.result } : applyRes);
      });
    });
    return true;
  }

  // Popup: какие вкладки открыты /状态
  if (msg.type === 'DARKSTORE_TABS') {
    findSupersetTab(function (ss) {
      findDarkstoreTab(function (ds) {
        sendResponse({ superset: ss ? { id: ss.id, url: ss.url, title: ss.title } : null,
                       darkstore: ds ? { id: ds.id, url: ds.url, title: ds.title } : null });
      });
    });
    return true;
  }

  // Popup «Вставить в darkStoreBB»: находим вкладку проекта и шлём патч.
  if (msg.type === 'DARKSTORE_APPLY_TO_PAGE') {
    findDarkstoreTab(function (ds) {
      if (!ds) { sendResponse({ ok: false, error: 'Вкладка darkStoreBB (index.html) не найдена.' }); return; }
      ensureScripts(ds.id, ['bridge.js'], function () {
        sendToTab(ds.id, { type: 'DARKSTORE_APPLY_PATCH', patch: msg.patch, notes: msg.notes }, sendResponse);
      });
    });
    return true;
  }
});
