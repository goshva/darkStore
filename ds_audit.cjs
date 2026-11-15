// ds_audit.cjs — аудит отчёта: полнота данных, разложение прибыли, воспроизводимость и регрессия находок
// из PLAN_STRATEGY2.md (Н-1, Н-3, Н-4, Н-6).
//
// Запуск:  node ds_audit.cjs [экспорт_проекта.json]
// Без аргумента берётся встроенный сценарий (полные 6 недель).
// Код возврата 1, если хотя бы одна проверка не прошла.
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) throw new Error('no <script> block');
let js = m[1];
const idx = js.lastIndexOf('})();');
if (idx < 0) throw new Error('no IIFE end');
js = js.slice(0, idx) + '\n  globalThis.__t = { buildFinalReport: buildFinalReport, state: state, buildState: function (w) { state.weeks = w; }, profitForWeek: profitForWeek, setWeek: function (x) { currentWeek = x; }, runs: runs, coverage: weekCoverage, readiness: reportReadiness, metricSource: metricSource, complete: weekComplete, validateStrategy: validateStrategy, validateEvaluation: validateEvaluation, expectedOf: expectedOf, normalizeBenchmarks: normalizeBenchmarks, applyBenchmarks: applyBenchmarks, benchmarkStatusOf: benchmarkStatusOf, benchmarkComparison: benchmarkComparison, weightedCost: calcWeightedCost, validateZiz: validateZiz, prompt: buildPrompt };\n' + js.slice(idx);

const store = {};
const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
const document = { addEventListener() {}, getElementById() { return null; } };
const t = new Function('document', 'window', 'navigator', 'localStorage', 'confirm', js + '\nreturn globalThis.__t;')(document, { scrollTo() {} }, {}, localStorage, () => true);

let failures = 0;
function check(cond, msg) { if (cond) { console.log('  ok: ' + msg); } else { console.error('  FAIL: ' + msg); failures++; } }
function info(msg) { console.log('     ' + msg); }
function section(title) { console.log('\n=== ' + title + ' ==='); }

// ---------- сценарий ----------
const BUILTIN = {
  1: {
    zonesCount: '6', ordersPerZoneDay: '220', cost: '1050', marginPct: '5', courierCost: '100',
    kL: '0.5', kA: '0.7', kT: '1', kE: '0.3', kC: '1', curatorThreshold: '90', curatorPenaltyPct: '5',
    lateness: '7', appeals: '9.5', tmc: '32', exits: '90',
    curatorProcess: '90', curatorAutonomy: '90', curatorKpi: '90', curatorTraining: '90', curatorInvolvement: '90'
  },
  2: { zoneOrders2: 220, zoneCouriers2: 5, lateness2: 26.5, appeals2: 15, exits2: 90, cost2: 100, tmc2: 76, tmc: '76' },
  3: { lateness3: 21, appeals3: 12, exits3: 97, tmc3: 32, cost3: 100 },
  4: { lateness4: 6.5, appeals4: 9.5, exits4: 98, tmc4: 90, cost4: 100 },
  5: { lateness5: 6.5, appeals5: 7, tmc5: 100, exits5: 100, cost5: 100, curatorAutonomy5: 59, curatorKpi5: 59, curatorTraining5: 59, curatorInvolvement5: 59 },
  6: { lateness6: 6, appeals6: 4.5, tmc6: 32, exits6: 100, cost6: 100, curatorAutonomy6: 59, curatorKpi6: 59, curatorTraining6: 59, curatorInvolvement6: 59 }
};

const file = process.argv[2];
let weeks = BUILTIN;
if (file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  weeks = data.weeks || data;
  console.log('Источник: ' + file);
} else {
  console.log('Источник: встроенный сценарий (6 недель)');
}
t.buildState(weeks);

// ---------- 1. Полнота данных ----------
section('1. Полнота данных');
const ready = t.readiness();
console.log('  Полных недель: ' + ready.completeWeeks + ' из ' + ready.totalWeeks + ', не хватает полей: ' + ready.missingTotal);
ready.incomplete.forEach(function (c) { info('Н' + c.week + ': ' + c.filled + '/' + c.required + ', нет: ' + c.missingLabels.join(', ')); });

// ---------- 2. Отчёт и сводка ----------
section('2. Полнота JSON-сводки (входы модели)');
const rep = t.buildFinalReport();
const jsonStart = rep.indexOf('{\n  "model_version"');
const jsonEnd = rep.indexOf('\n\n## 7.');
check(jsonStart > 0 && jsonEnd > jsonStart, 'сводка найдена в отчёте');
const summary = JSON.parse(rep.slice(jsonStart, jsonEnd));

check(!!summary.calibration && summary.calibration.orders_per_day > 0, 'есть объём заказов/день: ' + (summary.calibration && summary.calibration.orders_per_day));
check(!!summary.calibration && summary.calibration.zones_count > 0 && summary.calibration.orders_per_zone_day > 0, 'есть калибровка (Зисы × заказы на Зис)');
check(!!summary.loss_weights && typeof summary.loss_weights.kT_pct_margin_per_1pct_tmc_gap === 'number', 'есть веса потерь kL/kA/kT/kE/kC');
check(summary.weeks.every(function (w) { return typeof w.orders_per_day === 'number' && typeof w.rate_rub === 'number'; }), 'по каждой неделе есть заказы/день и ставка');
check(summary.weeks.every(function (w) { return w.loss_breakdown_rub_day && typeof w.loss_breakdown_rub_day.residual === 'number'; }), 'по каждой неделе есть разложение потерь с остатком');
check(summary.analysis_ready === ready.ready, 'analysis_ready совпадает с расчётом готовности');
check(summary.coverage.complete_weeks === ready.completeWeeks, 'число полных недель в сводке совпадает');
check(!!summary.data_provenance && summary.data_provenance.state_version >= 2,
  'в сводке есть происхождение данных (схема состояния ' + (summary.data_provenance && summary.data_provenance.state_version) + ')');
check(Array.isArray(summary.data_provenance.needs_review_weeks), 'в сводке перечислены недели к проверке после переноса (' + summary.data_provenance.needs_review_weeks.length + ')');

// ---------- 3. Разложение прибыли ----------
section('3. Разложение прибыли сходится');
const KEYS = ['structural_unit_economics', 'lateness', 'appeals', 'tmc', 'exits', 'curator_multiplier', 'curator_penalty'];
let worst = 0;
summary.weeks.forEach(function (w) {
  const b = w.loss_breakdown_rub_day;
  let sum = b.residual;
  KEYS.forEach(function (k) { sum += b[k]; });
  const diff = Math.abs(sum - w.profit_rub_day);
  if (diff > worst) worst = diff;
  check(diff <= 4, 'неделя ' + w.week + ': компоненты дают прибыль (расхождение ' + diff + ' ₽, округление ≤ 4 ₽)');
  check(Math.abs(b.residual) <= 1, 'неделя ' + w.week + ': остаток ≈ 0 (' + b.residual + ' ₽)');
});
info('максимальное расхождение по неделям: ' + worst + ' ₽');
info('пример (неделя ' + summary.weeks[summary.weeks.length - 1].week + '): структурный вклад ' +
  summary.weeks[summary.weeks.length - 1].loss_breakdown_rub_day.structural_unit_economics + ' ₽, прибыль ' +
  summary.weeks[summary.weeks.length - 1].profit_rub_day + ' ₽');

// безубыточность: маржа × (1 − доля потерь) = ставка
summary.weeks.forEach(function (w) {
  if (typeof w.breakeven_margin_rub !== 'number') return;
  var lhs = w.breakeven_margin_rub * (1 - w.loss_share_pct / 100);
  check(Math.abs(lhs - w.rate_rub) <= Math.max(1, w.rate_rub * 0.01),
    'неделя ' + w.week + ': безубыточная маржа × (1 − доля потерь) = ставка (' + Math.round(lhs) + ' ≈ ' + w.rate_rub + ' ₽)');
});
if (summary.breakeven) {
  const be = summary.breakeven;
  check(typeof be.margin_gap_rub === 'number', 'в сводке есть дефицит/запас маржи до безубыточности (' + be.margin_gap_rub + ' ₽/заказ)');
  check(be.target_margin_rub == null || Math.abs(be.target_margin_rub - (be.breakeven_margin_rub + be.buffer_rub)) < 1,
    'целевая маржа = безубыточная + буфер (' + be.target_margin_rub + ' ₽)');
}
check(summary.breakeven_at_target_kpi && typeof summary.breakeven_at_target_kpi.breakeven_margin_rub === 'number',
  'есть безубыточность при целевых KPI: ' + (summary.breakeven_at_target_kpi && summary.breakeven_at_target_kpi.breakeven_margin_rub) + ' ₽/заказ');

// ---------- 4. Источник метрик и качество данных ----------
section('4. Источник метрик, measured и data_quality');
const SRC = ['entered', 'inherited_week_1', 'default'];
const KEY_METRICS = ['lateness', 'appeals', 'tmc', 'exits', 'curator'];
summary.weeks.forEach(function (w) {
  const bad = Object.keys(w.metric_source).filter(function (k) { return SRC.indexOf(w.metric_source[k]) === -1; });
  check(bad.length === 0, 'неделя ' + w.week + ': источники метрик корректны');

  check(w.measured && KEY_METRICS.every(function (k) { return typeof w.measured[k] === 'boolean'; }),
    'неделя ' + w.week + ': есть булевы measured по 5 ключевым метрикам');
  check(w.measured_key_metrics === Object.keys(w.measured).filter(function (k) { return w.measured[k]; }).length + '/' + KEY_METRICS.length,
    'неделя ' + w.week + ': measured_key_metrics = ' + w.measured_key_metrics);
  check(w.data_quality && w.data_quality.score >= 0 && w.data_quality.score <= 1,
    'неделя ' + w.week + ': quality score в диапазоне 0…1 (' + (w.data_quality && w.data_quality.score) + ')');

  // пересчёт score из источников метрик
  let expected = 0;
  ['lateness', 'appeals', 'tmc', 'exits'].forEach(function (k) {
    expected += w.metric_source[k] === 'entered' ? 1 : (w.metric_source[k] === 'inherited_week_1' ? 0.5 : 0);
  });
  const curEntered = typeof w.curator_components_entered === 'number' ? w.curator_components_entered : (w.measured.curator ? 5 : 0);
  expected += curEntered > 0 ? 0.5 + 0.5 * curEntered / 5 : (w.metric_source.curator === 'default' ? 0 : 0.5);
  expected = Math.round(expected / KEY_METRICS.length * 100) / 100;
  check(Math.abs(expected - w.data_quality.score) < 0.01,
    'неделя ' + w.week + ': quality score сходится с источниками (' + w.data_quality.score + ' = ' + expected + ')');
  check((w.data_quality.score < 1) === (w.data_quality.issues.length > 0),
    'неделя ' + w.week + ': score < 1 ровно тогда, когда есть замечания (' + w.data_quality.score + ', замечаний ' + w.data_quality.issues.length + ')');

  const inh = KEY_METRICS.filter(function (k) { return !w.measured[k]; });
  if (inh.length) info('Н' + w.week + ': не измерены — ' + inh.join(', ') + (w.data_quality.issues.length ? ' | ' + w.data_quality.issues[0] : ''));
});

check(summary.data_quality && summary.data_quality.score >= 0 && summary.data_quality.score <= 1,
  'в сводке есть качество данных проекта: ' + (summary.data_quality && summary.data_quality.score) + ' из 1');
const qWeeks = summary.weeks.filter(function (w) { return w.data_quality.score < 1; });
if (qWeeks.length) info('недели с унаследованными метриками: ' + qWeeks.map(function (w) { return 'Н' + w.week + ' (' + w.data_quality.score + ')'; }).join(', '));

// ---------- 4.1 Гейты: [Н/Д] не участвует в итоге ----------
section('4.1. Гейты и пометка [Н/Д]');
if (summary.gates && summary.gates.length) {
  check(summary.gates.every(function (g) { return typeof g.measured === 'boolean' && (g.measured ? typeof g.ok === 'boolean' : g.ok === null); }),
    'у каждого гейта есть measured, а у неизмеренных ok = null');
  const measured = summary.gates.filter(function (g) { return g.measured; });
  const expectedPassed = measured.length ? measured.every(function (g) { return g.ok; }) : false;
  check(summary.gates_passed === expectedPassed,
    'gates_passed считается только по измеренным гейтам (' + summary.gates_passed + ', измерено ' + summary.gates_measured + '/' + summary.gates_total + ')');
  const notMeasured = summary.gates.filter(function (g) { return !g.measured; });
  if (notMeasured.length) {
    check(rep.indexOf('[Н/Д]') !== -1, 'в тексте отчёта есть пометка [Н/Д] (' + notMeasured.map(function (g) { return g.name; }).join(', ') + ')');
  } else {
    check(summary.gates_measured === summary.gates_total, 'все гейты недели измерены (' + summary.gates_measured + '/' + summary.gates_total + ')');
  }
} else {
  info('гейты не считались: нет недели с полным набором обязательных полей');
}

// ---------- 5. Регрессия находок ----------
section('5. Регрессия находок Н-1, Н-3, Н-4, Н-6');

// Н-1: наследование метрики недели 5 из недели 1 (в форме поле exits5 есть с 1.3.0, но модель обязана это помечать)
t.buildState({ 1: BUILTIN[1], 5: { lateness5: 6.5, appeals5: 7, tmc5: 100, cost5: 100, curatorAutonomy5: 59, curatorKpi5: 59, curatorTraining5: 59, curatorInvolvement5: 59 } });
check(t.metricSource(5, 'exits') === 'inherited_week_1', 'Н-1: выходы недели 5 без поля exits5 помечены как унаследованные');
check(t.profitForWeek(5).exits === Number(BUILTIN[1].exits), 'Н-1: в расчёт недели 5 уходит значение недели 1');
check(t.coverage(5).missing.indexOf('exits5') !== -1, 'Н-1: неделя 5 при этом неполная');

// Н-3: «неделя с данными» ≠ «неделя заполнена»
t.buildState({ 1: BUILTIN[1], 2: { dsName: 'Даркстор №7' } });
check(t.profitForWeek(2) !== null, 'Н-3: неделя с одним текстовым полем всё ещё считается в расчёте (модель)');
check(t.complete(2) === false, 'Н-3: но она не считается заполненной');
check(t.readiness().ready === false, 'Н-3: анализ помечен как неточный');

// Н-4: порог куратора берётся из калибровки
const gateW1 = Object.assign({}, BUILTIN[1], { curatorThreshold: '60', curatorProcess: '70', curatorAutonomy: '70', curatorKpi: '70', curatorTraining: '70', curatorInvolvement: '70' });
t.buildState({ 1: gateW1 });
const gateRep = t.buildFinalReport();
check(gateRep.indexOf('- [OK] куратор ≥ 60%: 70%') !== -1, 'Н-4: гейт куратора использует калиброванный порог 60%');
check(gateRep.indexOf('куратор ≥ 90%') === -1, 'Н-4: литерал 90% в гейте больше не используется');

// Гейт по унаследованной метрике не должен засчитываться: неделя 4 без полей куратора
t.buildState({
  1: BUILTIN[1],
  2: { zoneOrders2: 220, zoneCouriers2: 5, lateness2: 26.5, appeals2: 15, exits2: 90, cost2: 100, tmc: '76' },
  3: { lateness3: 21, appeals3: 12, exits3: 97, tmc3: 32, cost3: 100 },
  4: { lateness4: 6.5, appeals4: 9.5, exits4: 98, tmc4: 90, cost4: 100 }
});
const inhRep = t.buildFinalReport();
const inhSum = JSON.parse(inhRep.slice(inhRep.indexOf('{\n  "model_version"'), inhRep.indexOf('\n\n## 7.')));
const curGate = (inhSum.gates || []).find(function (g) { return g.name.indexOf('куратор') === 0; });
check(!!curGate && curGate.measured === false && curGate.ok === null, 'гейт куратора по неделе без полей куратора помечен как неизмеренный');
check(inhRep.indexOf('[Н/Д] куратор') !== -1, 'в тексте отчёта гейт куратора = [Н/Д]');
check(inhSum.gates_passed === (inhSum.gates.filter(function (g) { return g.measured; }).every(function (g) { return g.ok; })),
  'gates_passed не учитывает [Н/Д]');
check(inhSum.weeks.find(function (w) { return w.week === 4; }).measured.curator === false, 'неделя 4: measured.curator = false');
check(inhSum.weeks.find(function (w) { return w.week === 4; }).data_quality.score === 0.9, 'неделя 4: качество данных 0.9');

// Н-6: MAPE без данных — null, а не 0
check(rep.indexOf('"mape_pct": null') !== -1, 'Н-6: в задаче оценщику mape_pct = null');
check(rep.indexOf('"mape_status"') !== -1, 'Н-6: есть mape_status');

// Куратор влияет на маржу
const strongCur = Object.assign({}, BUILTIN[1]);
const weakCur = Object.assign({}, BUILTIN[1], { curatorTraining: '40', curatorInvolvement: '40' });
t.buildState({ 1: strongCur });
const pStrong = t.profitForWeek(1);
t.buildState({ 1: weakCur });
const pWeak = t.profitForWeek(1);
check(pStrong.lossCurator === 0, 'куратор: при индексе ≥ порога надбавки к потерям нет');
check(pWeak.lossCurator > 0 && pWeak.profit < pStrong.profit, 'куратор: слабое обучение/вовлечённость снижают прибыль');

// ---------- 6. Схемы ответов ----------
section('6. Схемы strategy/2 и evaluation/2');

const planV2 = {
  schema_version: 'strategy/2',
  strategy_name: 'Экономика заказа + ТМЦ',
  actions: [{ action: 'Поднять маржу', impact_profit_rub_day: 42000, impact_metrics: { tmc: 10 }, risk: 'mid', confidence: 0.6, evidence: ['вклад -47 ₽'] }],
  expected: {
    profit_rub_day: -90000, delta_vs_baseline_pct: 24.5, orders_per_day: 1320, contribution_rub_per_order: 12,
    loss_breakdown_rub_day: { structural_unit_economics: 15840, lateness: -2000, appeals: -2000, tmc: -4000, exits: 0, curator_multiplier: -1000, curator_penalty: -500 }
  },
  leading_indicators: [{ week: 7, metric: 'contribution_rub_per_order', target: 0 }],
  do_not_do: ['не масштабировать объём, пока вклад с заказа < 0'],
  data_sources_used: ['метрики недель 1–6'],
  assumptions: [], open_questions: [], week_plan: { courier_cost_rub: 120 }
};
const vPlan = t.validateStrategy(planV2);
check(vPlan.ok === true, 'strategy/2 принимается валидатором');
// В сценарии аудита маржа 5% от 1050 ₽ = 52.5 ₽, ставка 120 ₽ > маржи → ожидаем предупреждение про отрицательный вклад
check(vPlan.warnings.every(w => w.includes('вклад с заказа')), 'strategy/2: единственное замечание — ставка выше маржи (вклад ≤ 0)' + (vPlan.warnings.length ? ': ' + vPlan.warnings.join('; ') : ''));

const planV1 = { strategy_name: 'старый формат', actions: [{ action: 'x', impact_profit_rub_day: 1, impact_metrics: {}, risk: 'low', confidence: 0.5 }], expected_profit_rub_day: -100000, expected_delta_vs_baseline_pct: 20, data_sources_used: ['метрики'], week_plan: {} };
const vPlan1 = t.validateStrategy(planV1);
check(vPlan1.ok === true && t.expectedOf(vPlan1.value).profit_rub_day === -100000, 'strategy/1 совместим и нормализуется');

const evalOk = {
  schema_version: 'evaluation/2',
  verdict: 'Экономика заказа не сходится',
  mape_pct: null,
  mape_status: 'not_applicable_no_ai_runs',
  risk_score: 0.82,
  risk_scale: '0-1 (0 — низкий, 1 — критический)',
  confidence_in_verdict: 0.6,
  confidence_reason: '6 недель, куратор на Н2–Н4 унаследован',
  gaps_ranked: [{ rank: 1, gap: 'юнит-экономика', impact_rub_day: -62700, evidence: 'вклад -47 ₽ × 1320', fixability: 'high' }],
  top_effect_action: 'Пересобрать экономику заказа',
  next_3_weeks: [
    { week: 7, leading: { contribution_rub_per_order: 0 }, lagging: { profit_rub_day: -150000 } },
    { week: 8, leading: { contribution_rub_per_order: 5 }, lagging: { profit_rub_day: -100000 } },
    { week: 9, leading: { contribution_rub_per_order: 10 }, lagging: { profit_rub_day: -50000 } }
  ],
  do_not_do: ['не масштабировать объём, пока вклад с заказа < 0'],
  benchmark_status: 'not_connected'
};
const vEval = t.validateEvaluation(evalOk, { runsWithFact: 0 });
check(vEval.ok === true, 'evaluation/2 принимается валидатором' + (vEval.ok ? '' : ': ' + vEval.errors.join('; ')));

const evalZero = JSON.parse(JSON.stringify(evalOk));
evalZero.mape_pct = 0;
evalZero.mape_status = 'ok';
check(t.validateEvaluation(evalZero, { runsWithFact: 0 }).ok === false, 'evaluation/2: mape_pct = 0 без данных отклоняется');
const evalBadRisk = JSON.parse(JSON.stringify(evalOk));
evalBadRisk.risk_score = 'высокий';
check(t.validateEvaluation(evalBadRisk, {}).ok === false, 'evaluation/2: риск строкой отклоняется');

// ---------- 7. Бенчмарки рынка ----------
section('7. Бенчмарки рынка');
const bmList = summary.benchmarks || [];
check(['connected', 'partial', 'not_connected'].indexOf(summary.benchmark_status) !== -1, 'benchmark_status корректен: ' + summary.benchmark_status);
check((bmList.length === 0) === (summary.benchmark_status === 'not_connected'), 'not_connected ровно тогда, когда бенчмарков нет');
check(bmList.every(function (b) { return typeof b.value === 'number' && b.source && b.date; }), 'у каждого бенчмарка есть значение, источник и дата');
bmList.forEach(function (b) {
  info(b.metric + ': рынок ' + b.value + b.unit + ', у нас ' + b.current_value + b.unit + ' — ' + b.verdict + ' (' + b.source + ', ' + b.date + ')');
});
if (!bmList.length) check(rep.indexOf('Бенчмарки не подключены') !== -1, 'отчёт честно сообщает, что бенчмарков нет');

const bmAudit = t.normalizeBenchmarks({
  margin_pct: { value: '12', source: 'Data Insight, отчёт 2025', date: '2025-11-01' },
  lateness_pct: { value: '8', source: 'публичный SLA', date: '2025-10-30' }
});
check(bmAudit.ok === true, 'корректные бенчмарки проходят проверку');
check(t.normalizeBenchmarks({ margin_pct: { value: '12', source: '', date: '2025-11-01' } }).ok === false, 'бенчмарк без источника отклонён');
check(t.normalizeBenchmarks({ margin_pct: { value: '12', source: 'X', date: '' } }).ok === false, 'бенчмарк без даты отклонён');
t.applyBenchmarks(bmAudit.value, true);
const repBm = t.buildFinalReport();
const sumBm = JSON.parse(repBm.slice(repBm.indexOf('{\n  "model_version"'), repBm.indexOf('\n\n## 7.')));
check(sumBm.benchmark_status === 'partial' && sumBm.benchmarks.length === 2, 'частичное заполнение -> partial (' + sumBm.benchmark_status + ')');
check(sumBm.benchmarks.every(function (b) { return b.source && b.date; }), 'источник и дата бенчмарков попадают в сводку');
check(repBm.indexOf('### 1.4. Сравнение с рынком') !== -1, 'в отчёте есть таблица сравнения с рынком');
check(repBm.indexOf('сравнение неполное') !== -1, 'отмечено неполное сравнение');
t.applyBenchmarks({}, true);
check(t.benchmarkStatusOf() === 'not_connected', 'пустой набор бенчмарков -> not_connected');

// ---------- 8. Тарифы по Зисам, комментарии куратора, цели Н7–Н9 ----------
section('8. Тарифы по Зисам, комментарии куратора, цели Н7–Н9');

// 8.1 средневзвешенная ставка: считается по заказам и доходит до расчёта прибыли
check(t.weightedCost([{ orders: 100, rate: 100 }, { orders: 200, rate: 150 }]) === 133.3, 'средневзвешенная ставка: 100×100 + 200×150 → 133.3 ₽');
check(t.weightedCost([]) === null, 'пустая таблица Зисов → null (используется ставка калибровки)');

const zonesState = JSON.parse(JSON.stringify(BUILTIN));
zonesState[1].zones = [
  { km: 3, orders: 100, tripTime: 30, returnTime: 15, rate: 100, couriers: 3 },
  { km: 9, orders: 200, tripTime: 55, returnTime: 25, rate: 150, couriers: 5 }
];
t.buildState(zonesState);
const repZ = t.buildFinalReport();
const sumZ = JSON.parse(repZ.slice(repZ.indexOf('{\n  "model_version"'), repZ.indexOf('\n\n## 7.')));
const wRate = t.profitForWeek(1).rate;
check(Math.abs(wRate - 133.3) < 0.05, 'ставка недели 1 = средневзвешенная по Зисам (' + wRate + ' ₽)');
check(sumZ.tariff && sumZ.tariff.zones_filled === 2, 'в сводке 2 Зиса');
check(sumZ.tariff.range_rub[0] === 100 && sumZ.tariff.range_rub[1] === 180, 'диапазон ставки в сводке: 100–180 ₽');

// пересчёт weighted_rate из самих зон в сводке
let zOrders = 0, zCost = 0;
sumZ.tariff.zones.forEach(function (z) { zOrders += z.orders_per_day; zCost += z.orders_per_day * z.rate_rub; });
check(Math.abs(sumZ.tariff.weighted_rate_rub - Math.round(zCost / zOrders * 10) / 10) < 0.05,
  'weighted_rate_rub сходится с зонами (' + sumZ.tariff.weighted_rate_rub + ' = ' + Math.round(zCost / zOrders * 10) / 10 + ')');
check(repZ.indexOf('### 1.5. Тарифы по Зисам') !== -1, 'в отчёте есть раздел тарифов по Зисам');
check(repZ.indexOf('Диапазон ставки: 100–180') !== -1, 'в отчёте указан утверждённый диапазон ставки');

// 8.2 границы Зиса
check(t.validateZiz({ orders: 300, couriers: 3, rate: 120 }).some(function (x) { return x.indexOf('превышен лимит') === 0; }), 'Зис > 250 заказов → «превышен лимит»');
check(t.validateZiz({ orders: 200, couriers: 8, rate: 120 }).some(function (x) { return x.indexOf('лишние курьеры: 3') === 0; }), 'Зис > 5 курьеров → «лишние курьеры: 3 (отключить)»');
check(t.validateZiz({ orders: 150, couriers: 3, rate: 120 }).some(function (x) { return x.indexOf('сложная зона') === 0; }), 'Зис < 180 заказов → «сложная зона» (не нарушение)');
check(t.validateZiz({ orders: 200, couriers: 5, rate: 120 }).length === 0, 'Зис в норме → без предупреждений');

// 8.3 курьеры сверх нормы: счётчик есть, выдуманной экономии нет
const extraState = JSON.parse(JSON.stringify(zonesState));
extraState[1].zones[1].couriers = 8;
const pBase = t.profitForWeek(1);
t.buildState(extraState);
const pExtra = t.profitForWeek(1);
check(pExtra.extraCouriers === 3, 'лишних курьеров: 3');
check(pExtra.profit === pBase.profit, 'курьеры сверх нормы не меняют прибыль (оплата за заказ)');
check(pExtra.savingsRub === undefined, 'в модели нет выдуманной «экономии на отключённых курьерах»');
const sumExtra = JSON.parse(t.buildFinalReport().slice(t.buildFinalReport().indexOf('{\n  "model_version"'), t.buildFinalReport().indexOf('\n\n## 7.')));
check(sumExtra.tariff.extra_couriers === 3 && sumExtra.tariff.extra_couriers_note.indexOf('через метрики') !== -1,
  'в сводке есть счётчик лишних курьеров и пояснение, что эффект идёт через метрики');

// 8.4 явная ставка недели переопределяет средневзвешенную
const weekRateState = JSON.parse(JSON.stringify(zonesState));
delete weekRateState[5].cost5;
t.buildState(weekRateState);
check(Math.abs(t.profitForWeek(5).rate - 133.3) < 0.05, 'без cost5 неделя 5 берёт средневзвешенную ставку');
weekRateState[5].cost5 = 170;
t.buildState(weekRateState);
check(t.profitForWeek(5).rate === 170, 'cost5 переопределяет ставку недели 5');

// 8.5 комментарии куратора по выходам
const noteState = JSON.parse(JSON.stringify(BUILTIN));
noteState[1].curatorNotes1 = 'Иванов не доработал слот 18–20';
noteState[4].curatorNotes4 = 'снято 4 заказа за опоздание 15–30 мин';
noteState[1].curatorComment = 'план: наставник';
t.buildState(noteState);
const repNotes = t.buildFinalReport();
check(repNotes.indexOf('## 4.1. Комментарии куратора по выходам') !== -1, 'в отчёте есть раздел комментариев куратора');
check(repNotes.indexOf('Иванов не доработал слот') !== -1 && repNotes.indexOf('снято 4 заказа') !== -1, 'комментарии недель 1 и 4 попали в отчёт');
check(repNotes.indexOf('план: наставник') === -1, 'план по куратору не смешивается с комментариями по выходам');

// 8.6 цели недель 7–9 (без формы, только ориентиры)
t.buildState(JSON.parse(JSON.stringify(BUILTIN)));
const rep79 = t.buildFinalReport();
check(rep79.indexOf('## 4.2. Цели стабильной работы (недели 7–9') !== -1, 'в отчёте есть цели Н7–Н9');
check(rep79.indexOf('Опоздания ≤7%') !== -1 && rep79.indexOf('Обращения не растут') !== -1, 'цели по опозданиям и обращениям зафиксированы');
check(rep79.indexOf('Опора на факт недели') !== -1, 'цели Н7–Н9 привязаны к факту последней недели');
const pr79 = t.prompt(6);
check(pr79.indexOf('## 5.1. Цели стабильной работы (недели 7–9') !== -1, 'в промпте есть цели Н7–Н9');
check(pr79.indexOf('100–180') !== -1, 'в промпте диапазон ставки 100–180 ₽');

// 8.7 план ИИ: ставка вне утверждённого диапазона — ошибка
const planOutRange = JSON.parse(JSON.stringify(planV2));
planOutRange.week_plan = { courier_cost_rub: 250 };
check(t.validateStrategy(planOutRange).ok === false, 'план ИИ со ставкой 250 ₽ отклоняется (вне 100–180 ₽)');
const planInRange = JSON.parse(JSON.stringify(planV2));
planInRange.week_plan = { courier_cost_rub: 120 };
check(t.validateStrategy(planInRange).ok === true, 'план ИИ со ставкой 120 ₽ принимается');

// 8.8 объём заказов берётся из таблицы Зисов, а не из слайдеров калибровки
check(sumZ.calibration.orders_per_day === 300 && sumZ.calibration.orders_from_zones === true,
  'объём заказов из таблицы Зисов: 100 + 200 = 300 (got ' + sumZ.calibration.orders_per_day + ')');
check(sumZ.weeks[0].orders_per_day === 300, 'неделя 1 считает тот же объём (' + sumZ.weeks[0].orders_per_day + ')');
check(Math.abs(sumZ.weeks[0].rate_rub * 300 - sumZ.weeks[0].orders_per_day * sumZ.weeks[0].rate_rub) < 1,
  'ставка × объём согласованы внутри недели');
t.buildState(JSON.parse(JSON.stringify(BUILTIN)));
check(t.profitForWeek(1).Q === 1320, 'без таблицы Зисов объём считается по слайдерам (6 × 220)');

// 8.9 объём недели: явное поле недели → таблица Зисов → слайдеры
const weekVol = JSON.parse(JSON.stringify(zonesState));
weekVol[2].zoneOrders2 = 300;
t.buildState(weekVol);
check(t.profitForWeek(2).Q === 600 && t.profitForWeek(2).ordersSource === 'week_override',
  'объём недели 2: 2 Зиса × 300 заказов = 600, источник — поле недели (got ' + t.profitForWeek(2).Q + ', ' + t.profitForWeek(2).ordersSource + ')');
check(t.profitForWeek(1).Q === 300 && t.profitForWeek(1).ordersSource === 'zones',
  'объём недели 1 берётся из таблицы Зисов (got ' + t.profitForWeek(1).Q + ', ' + t.profitForWeek(1).ordersSource + ')');
const sumVol2 = JSON.parse(t.buildFinalReport().slice(t.buildFinalReport().indexOf('{\n  "model_version"'), t.buildFinalReport().indexOf('\n\n## 7.')));
check(sumVol2.weeks.find(function (w) { return w.week === 2; }).orders_source === 'week_override',
  'в сводке указан источник объёма по неделе');

// ---------- итог ----------
console.log('\n' + (failures ? 'ПРОВАЛЕНО проверок: ' + failures : 'ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ'));
process.exit(failures ? 1 : 0);
