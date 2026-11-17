/* ds_bridge.js — мост между Superset ВкусВилл и darkStoreBB.
   В браузере (Chrome extension / iframe): fetch() с cookies страницы Superset.
   В Node (ds_snapshot.cjs): http/https.request.
   Обёртка SupersetCore уже содержит всю логику агрегации и маппинга.
   Здесь — транспорт + API window.darkstoreBridge. */
(function (root, factory) {
  var api = factory(typeof globalThis !== 'undefined' ? globalThis : root);
  root.SupersetTransport = api;
  root.darkstoreBridge = api;   // глобальное API для index.html и popup
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var core = typeof SupersetCore !== 'undefined' ? SupersetCore : null;

  /* ---------- transport ---------- */
  // fetch() — работает в Chrome extension content-script (same-origin Superset).
  // Cookies/Authorization извлекаются автоматически (включая httpOnly cookies Superset).
  function fetchChart(filters) {
    if (!core) throw new Error('SupersetCore не загружен');
    var url = core.chartUrl();
    var body = JSON.stringify(core.buildQueryBody(filters));
    return fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept': 'application/json', 'origin': core.BASE, 'referer': core.BASE + '/superset/dashboard/services_lite/' },
      body: body,
      credentials: 'include'   // отправляет все cookies текущей страницы (Superset session)
    }).then(function (r) {
      if (r.status === 401 || r.status === 302) {
        throw new Error('Superset: сессия истекла (401/302). Обновите страницу.');
      }
      if (!r.ok) throw new Error('Superset: HTTP ' + r.status);
      return r.json();
    });
  }

  // Node-транспорт (для ds_snapshot.cjs)
  var _nodeRequest = null;  // устанавливается из ds_snapshot.cjs
  function nodeFetchChart(filters) {
    if (!_nodeRequest) throw new Error('Node-транспорт не инициализирован');
    return _nodeRequest(core.chartUrl(), core.buildQueryBody(filters));
  }

  /* ---------- main API ---------- */
  function pull(shopno, date) {
    var filters = { shopno: shopno || null, time_range: date || core.yesterdayISO() };
    return fetchChart(filters).then(function (json) {
      var acc = core.aggregateRows(json);
      var snap = core.toSnapshot(acc, { shopno: shopno, date: filters.time_range });
      var mapped = core.mapToForm(snap);
      return { snapshot: snap, mapped: mapped, raw: json };
    });
  }

  // Выгрузить JSON в localStorage (для скачивания / анализа)
  function exportSnapshot(snap, key) {
    key = key || 'darkstore_superset_snap';
    try { localStorage.setItem(key, JSON.stringify(snap, null, 2)); } catch (e) {}
    return snap;
  }

  // Загрузить JSON из localStorage
  function importSnapshot(key) {
    key = key || 'darkstore_superset_snap';
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }

  /* ---------- apply to darkStoreBB (window API) ----------
     Когда загружено в index.html — применяет patch прямо в state.weeks[1].
     Вызывает save() и render(), если они доступны. */
  function applyToForm(patch, applyAndSave) {
    if (applyAndSave && typeof window._dsApplyPatch === 'function') {
      return window._dsApplyPatch(patch);
    }
    return patch;
  }

  return {
    // transport
    fetchChart: fetchChart,
    // API
    pull: pull,
    exportSnapshot: exportSnapshot,
    importSnapshot: importSnapshot,
    applyToForm: applyToForm,
    // debug
    core: core
  };
});
