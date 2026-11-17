/* superset-core.js — общее ядро работы с Superset ВкусВилл (дашборд 977, datasource 3035).
   Используется и Chrome-расширением (window.SupersetCore), и Node-скриптом ds_snapshot.cjs (globalThis / module.exports).
   Здесь нет ни DOM, ни require(): только построение запроса, парсинг ответа и маппинг снапшота в поля модели darkStoreBB. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;   // Node
  root.SupersetCore = api;                                                   // Браузер / content-script
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var BASE = 'https://superset.svc.vkusvill.ru';
  var DASHBOARD_ID = 977;
  var DATASOURCE_ID = 3035;      // «Статистика по заказам … лёгкая версия» (__table)
  var SLICE_ID = 20403;          // Итоговая таблица за день по сервисам («Успешно завершён»)
  var METRICS = ['qty_orders_delivered', 'qty_orders_declined', 'qty_not_in_slot_all',
                 'share_not_in_slot_all', 'sum_with_bonuses', 'sum_without_bonuses'];

  /* ---------- request ---------- */
  // slice_id 20403 отдаёт строки по name_service. show_totals в этом инстансе не работает,
  // поэтому итоги считаются суммированием строк (см. aggregateRows).
  function buildQueryBody(filters) {
    var t = filters.time_range || todayISO();
    var tr = 'DATETIME("' + t + '") : DATEADD(DATETIME("' + t + '"), +1, day)';
    var qfilters = [];
    if (filters.shopno) qfilters.push({ col: 'shopno', op: 'IN', val: [String(filters.shopno)] });
    qfilters.push({ col: 'feature_tt', op: 'IN', val: ['ДаркСтор'] });
    qfilters.push({ col: 'date_supply', op: 'TEMPORAL_RANGE', val: tr });

    return {
      datasource: { id: DATASOURCE_ID, type: 'table' }, force: false,
      queries: [{
        time_range: tr, granularity: 'date_supply',
        filters: qfilters,
        extras: { time_grain_sqla: 'P1D', having: '', where: '' }, applied_time_extras: {},
        columns: ['name_service'],
        metrics: METRICS,
        orderby: [['qty_orders_delivered', false]], annotation_layers: [], row_limit: 1000,
        series_limit: 0, order_desc: true, url_params: {}, custom_params: {},
        custom_form_data: {}, post_processing: [], time_offsets: []
      }],
      form_data: {
        datasource: DATASOURCE_ID + '__table', viz_type: 'table', slice_id: SLICE_ID,
        query_mode: 'aggregate', groupby: ['name_service'], show_totals: false, row_limit: 1000,
        metrics: METRICS,
        adhoc_filters: [{ clause: 'WHERE', expressionType: 'SIMPLE', operator: 'TEMPORAL_RANGE', subject: 'date_supply', comparator: tr }],
        dashboards: [DASHBOARD_ID]
      },
      result_format: 'json', result_type: 'full'
    };
  }

  function chartUrl() {
    return BASE + '/api/v1/chart/data?form_data=' + encodeURIComponent(JSON.stringify({ slice_id: SLICE_ID })) +
           '&dashboard_id=' + DASHBOARD_ID;
  }

  /* ---------- response -> snapshot ---------- */
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }

  function aggregateRows(chartJson) {
    var rows = chartJson && chartJson.result && chartJson.result[0] && chartJson.result[0].data;
    if (!Array.isArray(rows) || !rows.length) throw new Error('Superset вернул пустой ответ (нет данных за выбранные фильтры)');
    var acc = { qty_orders_delivered: 0, qty_orders_declined: 0, qty_not_in_slot_all: 0, sum_with_bonuses: 0, sum_without_bonuses: 0, _w: 0 };
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      acc.qty_orders_delivered += num(r.qty_orders_delivered);
      acc.qty_orders_declined += num(r.qty_orders_declined);
      acc.qty_not_in_slot_all += num(r.qty_not_in_slot_all);
      acc.sum_with_bonuses += num(r.sum_with_bonuses);
      acc.sum_without_bonuses += num(r.sum_without_bonuses);
      // доля заказов вне слота — share по строке, усредняем взвешенно по доставленным
      if (r.share_not_in_slot_all != null) acc._w += num(r.share_not_in_slot_all) * num(r.qty_orders_delivered);
    }
    acc.orders = acc.qty_orders_delivered;
    acc.share_not_in_slot_weighted = acc.orders ? acc._w / acc.orders : null;
    acc.rows = rows;
    return acc;
  }

  function toSnapshot(acc, meta) {
    var delivered = Math.round(acc.qty_orders_delivered);
    var declined = Math.round(acc.qty_orders_declined);
    var avgCheck = delivered ? Math.round(acc.sum_with_bonuses / delivered) : null;
    var services = acc.rows.map(function (r) {
      return { service: String(r.name_service == null ? '' : r.name_service).trim(),
               orders: Math.round(num(r.qty_orders_delivered)), revenue: Math.round(num(r.sum_with_bonuses)) };
    }).filter(function (s) { return s.orders > 0; }).sort(function (a, b) { return b.orders - a.orders; });

    return {
      source: 'superset:dash' + DASHBOARD_ID + '/slice' + SLICE_ID,
      shopno: meta.shopno || 'all',
      date: meta.date,
      pulled_at: new Date().toISOString(),
      orders_per_day: delivered,
      qty_orders_declined: declined,
      decline_rate_pct: (delivered + declined) ? round2(100 * declined / (delivered + declined)) : null,
      avg_check_rub: avgCheck,
      revenue_rub: Math.round(acc.sum_with_bonuses),
      share_not_in_slot_pct: acc.share_not_in_slot_weighted == null ? null : round2(100 * acc.share_not_in_slot_weighted),
      by_service: services
    };
  }

  function round2(v) { return Math.round(v * 100) / 100; }

  /* ---------- mapping: snapshot -> поля модели darkStoreBB ----------
     Возвращает патч для недели 1 (базовая неделя) + пояснения, что откуда взялось и что осталось руками. */
  function mapToForm(snap) {
    var perZoneCap = 400;                       // слайдер ordersPerZoneDay ограничен 50..400
    var zones = snap.orders_per_day > perZoneCap
      ? Math.max(1, Math.round(snap.orders_per_day / perZoneCap))
      : 1;
    var patch = {
      ordersPerZoneDay: clamp(Math.round(snap.orders_per_day / zones), 50, perZoneCap),
      zonesCount: zones,
      cost: snap.avg_check_rub,                // средний чек -> цена заказа в расчёте
      lateness: snap.share_not_in_slot_pct     // доля вне слота как прокси опозданий
    };
    var notes = [
      'Заказов/день: ' + snap.orders_per_day + ' → ' + zones + ' зон × ' + patch.ordersPerZoneDay + '/день',
      'Средний чек: ' + fmtMoney(snap.avg_check_rub) + ' ₽',
      'Вне слота: ' + (snap.share_not_in_slot_pct == null ? '—' : snap.share_not_in_slot_pct + ' %') + ' → поле «Опоздания, %»',
      'Отказы: ' + snap.qty_orders_declined + ' (' + (snap.decline_rate_pct == null ? '—' : snap.decline_rate_pct) + ' %)'
    ];
    var missing = ['marginPct (маржа)', 'courierCost (ставка курьера)', 'kL/kA/kT/kE (коэффициенты)'];
    return { week: 1, patch: patch, notes: notes, missing: missing };
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function fmtMoney(v) { return v == null ? '—' : Number(v).toLocaleString('ru-RU'); }

  /* ---------- dates ---------- */
  function iso(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function todayISO() { return iso(new Date()); }
  function yesterdayISO() { var d = new Date(); d.setDate(d.getDate() - 1); return iso(d); }
  // Диапазон последних n полных дней (без сегодняшнего неполного)
  function lastDaysRange(n) {
    var end = new Date(); end.setDate(end.getDate() - 1);
    var start = new Date(end); start.setDate(start.getDate() - (n - 1));
    return { from: iso(start), to: iso(end) };
  }

  return {
    BASE: BASE, DASHBOARD_ID: DASHBOARD_ID, DATASOURCE_ID: DATASOURCE_ID, SLICE_ID: SLICE_ID, METRICS: METRICS,
    buildQueryBody: buildQueryBody, chartUrl: chartUrl,
    aggregateRows: aggregateRows, toSnapshot: toSnapshot, mapToForm: mapToForm,
    todayISO: todayISO, yesterdayISO: yesterdayISO, lastDaysRange: lastDaysRange, iso: iso
  };
});
