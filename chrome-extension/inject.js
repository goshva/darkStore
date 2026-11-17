/* inject.js — работает внутри origin superset.svc.vkusvill.ru (content_scripts).
   SupersetCore уже загружен до этого файла. Запросы идут fetch() с credentials:'include',
   поэтому session-cookie и csrf берутся прямо со страницы — никакой парольной авторизации не нужно. */

(function () {
  'use strict';

  // CSRF-токен Superset лежит в cookie csrftoken (не httpOnly) — берём оттуда, как это делает сам UI Superset.
  function getCsrf() {
    var m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
    if (!m) return '';
    try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
  }

  function requestChart(filters) {
    var body = SupersetCore.buildQueryBody(filters);
    return fetch(SupersetCore.chartUrl(), {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'x-csrftoken': getCsrf()
      },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (res.status === 401 || res.status === 403) throw new Error('Не авторизованы в Superset. Откройте дашборд и войдите.');
      if (res.redirected && /login/.test(res.url)) throw new Error('Сессия Superset истекла — обновите страницу дашборда и войдите.');
      if (!res.ok) throw new Error('Superset HTTP ' + res.status);
      return res.text();
    }).then(function (txt) {
      try { return JSON.parse(txt); }
      catch (e) { throw new Error('Superset вернул не-JSON (см. консоль). Скорее всего, страница редирекнула на /login/.'); }
    });
  }

  function pull(opts) {
    var date = opts.date || SupersetCore.yesterdayISO();
    var filters = { shopno: opts.shopno ? String(opts.shopno) : null, time_range: date };
    return requestChart(filters).then(function (json) {
      var acc = SupersetCore.aggregateRows(json);
      var snap = SupersetCore.toSnapshot(acc, { shopno: filters.shopno, date: date });
      return { snapshot: snap, mapped: SupersetCore.mapToForm(snap), range: opts.days > 1 ? SupersetCore.lastDaysRange(opts.days) : null };
    });
  }

  window.__dsBridge = { pull: pull, ok: true };

  // Ответ popup'у.
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      if (!msg || !msg.type) return;
      if (msg.type === 'DARKSTORE_GUESS_SHOP') {
        sendResponse({ shopno: window.__dsGuessShop ? window.__dsGuessShop() : '' });
        return;   // синхронно
      }
      if (msg.type === 'DARKSTORE_PULL') {
        pull(msg.opts || {}).then(function (r) { sendResponse({ ok: true, result: r }); })
                            .catch(function (e) { sendResponse({ ok: false, error: e.message }); });
        return true;   // асинхронный sendResponse
      }
    });
  }

  // Автодетект номера даркстора из URL/фильтров дашборда (?shopno=7745) — удобно для popup.
  window.__dsGuessShop = function () {
    var m = location.search.match(/[?&](?:shopno|param_shopno)=([0-9]{3,6})/i);
    return m ? m[1] : '';
  };
})();
