/* history.js — исторические факты Superset по дням + сравнение с планом модели.
   Хранилище: localStorage['darkstore_facts_v1'] = {
     days: { 'YYYY-MM-DD': snapshot },          // по одному снапшоту на день
     weeks: { 'YYYY-MM-DD': weekAgg }           // понедельники недель
   }
   Неделя = Пн..Вс. За неполные дни (сегодня) объём не считается средним — помечаем partial. */
(function () {
  'use strict';
  if (window.__dsHistory) return;

  var HKEY = 'darkstore_facts_v1';
  var C = window.SupersetCore;

  function load() {
    try { return JSON.parse(localStorage.getItem(HKEY)) || { days: {}, weeks: {} }; }
    catch (e) { return { days: {}, weeks: {} }; }
  }
  function save(h) { try { localStorage.setItem(HKEY, JSON.stringify(h)); } catch (e) {} return h; }

  function addDay(snap) {
    if (!snap || !snap.date) throw new Error('Снапшот без даты');
    var h = load();
    h.days[snap.date] = snap;
    rebuildWeeks(h);
    return save(h);
  }

  function addDays(snaps) {
    var h = load();
    snaps.forEach(function (s) { if (s && s.date) h.days[s.date] = s; });
    rebuildWeeks(h);
    return save(h);
  }

  function avg(a) { var n = a.filter(function (v) { return v != null && isFinite(v); }); return n.length ? n.reduce(function (s, v) { return s + v; }, 0) / n.length : null; }

  // Пересчёт недельных агрегатов из дней (взвешивание долей по заказам)
  function rebuildWeeks(h) {
    h.weeks = {};
    Object.keys(h.days).forEach(function (date) {
      var snap = h.days[date];
      var mon = C.mondayOf(date);
      var w = h.weeks[mon] || (h.weeks[mon] = { monday: mon, days: 0, orders: 0, revenue: 0, _chk: 0, _slot: 0, partial: false });
      w.days++;
      w.orders += snap.orders_per_day || 0;
      w.revenue += snap.revenue_rub || 0;
      w._chk += (snap.avg_check_rub || 0) * (snap.orders_per_day || 0);
      w._slot += (snap.share_not_in_slot_pct || 0) * (snap.orders_per_day || 0);
      if (snap.partial) w.partial = true;
    });
    Object.keys(h.weeks).forEach(function (mon) {
      var w = h.weeks[mon];
      w.orders_per_day = w.days ? Math.round(w.orders / w.days) : null;
      w.avg_check_rub = w.orders ? Math.round(w._chk / w.orders) : null;
      w.share_not_in_slot_pct = w.orders ? Math.round(w._slot / w.orders * 100) / 100 : null;
      w.revenue_rub = Math.round(w.revenue);
      w.complete = w.days >= 7 && !w.partial;
      delete w._chk; delete w._slot;
    });
  }

  // 6 последних полных понедельников (относительно сегодня) — для пакета «6 недель»
  function lastMondays(n, refDate) {
    var ref = refDate ? C.parseISO(refDate) : new Date();
    var thisMon = C.parseISO(C.mondayOf(C.iso(ref)));
    var out = [];
    for (var i = 1; i <= n; i++) out.push(C.iso(C.addDays(thisMon, -7 * i)));
    return out;
  }

  // Пакет: собрать дни для N недель (Пн..Вс, сегодняшние/будущие дни пропускаются)
  function datesForWeeks(mondays) {
    var today = C.iso(new Date());
    var out = [];
    mondays.forEach(function (mon) {
      C.weekDates(mon).forEach(function (d) { if (d < today) out.push(d); });
    });
    return out;
  }

  /* ---------- сравнение факта и плана модели ---------- */
  // planWeeks: объект weeks из состояния darkStoreBB (weeks['1'..'6'])
  // Возвращает для каждой недели: факт (из фактов) vs план (из модели) по сопоставимым метрикам.
  function compareWithPlan(planWeeks, mondays) {
    var h = load();
    var rows = [];
    (mondays || Object.keys(h.weeks).sort()).forEach(function (mon, i) {
      var w = h.weeks[mon];
      if (!w) return;
      var idx = i + 1;                                  // номер недели в проекте (Н1..)
      var d = (planWeeks && planWeeks[String(idx)]) || {};
      function num(v) { v = parseFloat(v); return isFinite(v) ? v : null; }
      var planOrders = num(d.ordersPerDay) != null ? num(d.ordersPerDay)
        : (num(d.zonesCount) && num(d.ordersPerZoneDay)) ? num(d.zonesCount) * num(d.ordersPerZoneDay) : null;
      var planLateness = num(d['lateness' + (idx === 1 ? '' : idx)]);
      var planCheck = num(d.cost);
      function cmp(fact, plan) {
        if (fact == null || plan == null) return { fact: fact, plan: plan, diff: null, pct: null };
        var diff = Math.round((fact - plan) * 100) / 100;
        return { fact: fact, plan: plan, diff: diff, pct: plan ? Math.round(diff / plan * 1000) / 10 : null };
      }
      rows.push({
        week: 'Н' + idx, monday: mon, days: w.days, complete: w.complete,
        orders: cmp(w.orders_per_day, planOrders),
        check: cmp(w.avg_check_rub, planCheck),
        lateness: cmp(w.share_not_in_slot_pct, planLateness)
      });
    });
    return rows;
  }

  window.__dsHistory = {
    KEY: HKEY, load: load, addDay: addDay, addDays: addDays,
    lastMondays: lastMondays, datesForWeeks: datesForWeeks,
    compareWithPlan: compareWithPlan, rebuildWeeks: rebuildWeeks
  };
})();
