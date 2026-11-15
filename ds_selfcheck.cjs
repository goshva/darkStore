const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) throw new Error('no <script> block');
let js = m[1];
const idx = js.lastIndexOf('})();');
if (idx < 0) throw new Error('no IIFE end');
js = js.slice(0, idx) + '\n  globalThis.__t = { buildPrompt: buildPrompt, validateStrategy: validateStrategy, validateEvaluation: validateEvaluation, applyStrategy: applyStrategy, buildFinalReport: buildFinalReport, state: state, buildState: function (w) { state.weeks = w; }, runs: runs, evaluations: evaluations, expectedOf: expectedOf, profitForWeek: profitForWeek, norm: fieldValueNorm, quality: calcQualityScore, setWeek: function (x) { currentWeek = x; }, coverage: weekCoverage, readiness: reportReadiness, metricSource: metricSource, complete: weekComplete, curatorWeights: CURATOR_WEIGHTS, breakeven: breakevenOf, breakevenAtKpi: breakevenAtTargetKpi, dataQuality: dataQualityOf, projectQuality: projectDataQuality, gatesFor: gatesFor, load: load, save: save, migrateState: migrateState, detectStateVersion: detectStateVersion, modelOlderThan: modelOlderThan, applyState: applyState, markWeekReviewed: markWeekReviewed, weeksNeedingReview: weeksNeedingReview, normalizeBenchmarks: normalizeBenchmarks, benchmarkEntries: benchmarkEntries, benchmarkStatusOf: benchmarkStatusOf, benchmarkComparison: benchmarkComparison, applyBenchmarks: applyBenchmarks, benchmarkMetrics: BENCHMARK_METRICS, stateVersion: function () { return { STATE_VERSION: STATE_VERSION, KEY: KEY, LEGACY_KEYS: LEGACY_KEYS, BACKUP_PREFIX: BACKUP_PREFIX }; } };\n' + js.slice(idx);

const store = {};
const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
const document = { addEventListener() {}, getElementById() { return null; } };
const window = { scrollTo() {} };
const navigator = {};
const confirm = () => true;
const fn = new Function('document', 'window', 'navigator', 'localStorage', 'confirm', js + '\nreturn globalThis.__t;');
const t = fn(document, window, navigator, localStorage, confirm);

const weeks = {
  1: { zonesCount: 6, ordersPerZoneDay: 220, marginPct: 25, courierCost: 150, lateness: 9, appeals: 8, tmc: 80, exits: 88, curatorProcess: 60, curatorAutonomy: 55, curatorKpi: 50, zoneOrders: 260, zoneCouriers: 6, done: ['диагностика ДС', 'интервью с курьерами'] },
  2: { lateness2: 8, appeals2: 7, exits2: 91, tmc2: 90, zoneOrders2: 240, zoneCouriers2: 5 },
  3: { lateness3: 7, appeals3: 6, exits3: 93, tmc3: 95, cost3: 160 },
  4: { lateness4: 6.5, appeals4: 5.5, exits4: 94, tmc4: 97 },
  5: { lateness5: 6, appeals5: 5, tmc5: 98, curatorAutonomy5: 75, curatorKpi5: 70 },
  6: { lateness6: 6, appeals6: 4, tmc6: 100, curatorAutonomy6: 90, curatorKpi6: 90, exits6: 95, finalPlan: 'Держать KPI' }
};
t.buildState(weeks);

function assert(cond, msg) { if (!cond) { console.error('FAIL: ' + msg); process.exitCode = 1; } else { console.log('ok: ' + msg); } }

const p3 = t.buildPrompt(3);
assert(p3.includes('# ЗАПРОС К ИИ'), 'prompt header');
assert(p3.includes('Версия модели: 1.3.1'), 'prompt model version');
assert(p3.includes('## 3. Ограничения реальности'), 'prompt constraints');
assert(p3.includes('180–250') && p3.includes('максимум 5 курьеров'), 'prompt ZIS rules');
assert(p3.includes('15–30 мин — минус 1 заказ'), 'prompt lateness rule');
assert(p3.includes('## 6. Формат ответа (JSON'), 'prompt json section');
assert(p3.includes('"week_plan"') && p3.includes('courier_cost_rub'), 'prompt week_plan');
assert(p3.includes('| 3 | 7 | 6 | 95 | 93 |'), 'prompt metrics table row for week 3');
assert(p3.includes('план на неделю 4'), 'prompt targets next week');

const good = {
  strategy_name: 'Слоты + ТМЦ',
  actions: [{ action: 'Закрыть дефицит ТМЦ на 100%', impact_profit_rub_day: 1200, impact_metrics: { tmc: 10 }, risk: 'low', confidence: 0.8 }],
  expected_profit_rub_day: 2500,
  expected_delta_vs_baseline_pct: 12.5,
  data_sources_used: ['метрики недель 1-3'],
  assumptions: ['ставка не растёт'],
  open_questions: ['бюджет?'],
  week_plan: { courier_cost_rub: 165, zone_orders: 220, zone_couriers: 5, zones_count: 6, orders_per_zone_day: 220, tmc_target_pct: 100, slots: ['8–20'], curator_actions: ['контроль слотов'] }
};
const vg = t.validateStrategy(good);
assert(vg.ok === true, 'valid strategy accepted');
assert(vg.errors.length === 0, 'no errors on valid');
assert(vg.value.schema_version === 'strategy/2', 'ответ нормализован в strategy/2');
assert(vg.value.expected.profit_rub_day === 2500, 'плоские поля strategy/1 попали в expected.profit_rub_day');
assert(vg.value.expected_delta_vs_baseline_pct === 12.5, 'плоская дельта осталась доступной');
assert(vg.value.expected.delta_vs_baseline_pct === 12.5, 'дельта нормализована в expected');
assert(t.expectedOf(vg.value).profit_rub_day === 2500, 'expectedOf читает прогноз из strategy/2');
assert(t.expectedOf({ expected_profit_rub_day: 100 }).profit_rub_day === 100, 'expectedOf читает старый формат strategy/1');

// strategy/2: вложенный expected, leading-индикаторы, «что не делать», evidence
const good2 = {
  schema_version: 'strategy/2',
  strategy_name: 'Экономика заказа + ТМЦ',
  actions: [{
    action: 'Поднять маржу с 5% до 14%', impact_profit_rub_day: 42000, impact_metrics: { tmc: 10 }, risk: 'mid', confidence: 0.6,
    evidence: ['неделя 6: ТМЦ 32%', 'вклад с заказа -47 ₽']
  }],
  expected: {
    profit_rub_day: -90000, delta_vs_baseline_pct: 24.5, orders_per_day: 1320, contribution_rub_per_order: 12,
    loss_breakdown_rub_day: { structural_unit_economics: 15840, lateness: -2000, appeals: -2000, tmc: -4000, exits: 0, curator_multiplier: -1000, curator_penalty: -500 }
  },
  leading_indicators: [{ week: 7, metric: 'contribution_rub_per_order', target: 0 }],
  do_not_do: ['не масштабировать объём, пока вклад с заказа < 0'],
  data_sources_used: ['метрики недель 1–6'],
  assumptions: [],
  open_questions: [],
  week_plan: { courier_cost_rub: 100 }
};
const v2 = t.validateStrategy(good2);
assert(v2.ok === true, 'strategy/2 без плоских полей принимается');
assert(v2.value.expected.profit_rub_day === -90000 && v2.value.expected.contribution_rub_per_order === 12, 'вложенный expected разобран');
assert(v2.value.actions[0].evidence.length === 2, 'evidence действия сохранено');
assert(v2.value.leading_indicators.length === 1 && v2.value.leading_indicators[0].metric === 'contribution_rub_per_order', 'leading-индикаторы разобраны');
assert(v2.value.do_not_do.length === 1, 'do_not_do разобран');
assert(v2.warnings.length === 0, 'корректный strategy/2 без замечаний (got: ' + v2.warnings.join('; ') + ')');

const noExpected = JSON.parse(JSON.stringify(good2));
delete noExpected.expected;
const vNoExp = t.validateStrategy(noExpected);
assert(vNoExp.ok === false && vNoExp.errors.some(e => e.includes('expected.profit_rub_day')), 'strategy/2 без прогноза отклоняется');

const flatOnly = JSON.parse(JSON.stringify(good2));
delete flatOnly.expected;
flatOnly.expected_profit_rub_day = -100000;
flatOnly.expected_delta_vs_baseline_pct = 20;
assert(t.validateStrategy(flatOnly).ok === true, 'strategy/1 с плоскими полями всё ещё принимается');

const weak2 = JSON.parse(JSON.stringify(good2));
delete weak2.leading_indicators;
delete weak2.do_not_do;
weak2.actions[0].evidence = undefined;
const vWeak = t.validateStrategy(weak2);
assert(vWeak.ok === true, 'неполный strategy/2 принимается с замечаниями');
assert(vWeak.warnings.some(w => w.includes('leading_indicators')), 'замечание: нет leading-показателей');
assert(vWeak.warnings.some(w => w.includes('do_not_do')), 'замечание: не сказано, что не делать');
assert(vWeak.warnings.some(w => w.includes('evidence')), 'замечание: нет основания действия');

// ---------- схема оценки ИИ: evaluation/2 ----------
const goodEval = {
  schema_version: 'evaluation/2',
  verdict: 'Экономика заказа не сходится: вклад -47 ₽ при марже 53 ₽ и ставке 100 ₽',
  mape_pct: null,
  mape_status: 'not_applicable_no_ai_runs',
  risk_score: 0.82,
  risk_scale: '0-1 (0 — низкий, 1 — критический)',
  confidence_in_verdict: 0.6,
  confidence_reason: '6 недель полные, но куратор на Н2–Н4 унаследован',
  loss_breakdown_rub_day: { structural_unit_economics: -62700, lateness: -2079, appeals: -2183, tmc: -47124, exits: 0, curator_multiplier: -12744, curator_penalty: -6341, residual: 0 },
  gaps_ranked: [
    { rank: 1, gap: 'структурная юнит-экономика', impact_rub_day: -62700, evidence: 'вклад -47 ₽ × 1320 заказов', fixability: 'high' },
    { rank: 2, gap: 'ТМЦ 32%', impact_rub_day: -47124, evidence: 'неделя 6: tmc_pct = 32', fixability: 'high' }
  ],
  top_effect_action: 'Пересобрать экономику заказа: маржа ≥ 118 ₽/заказ',
  next_3_weeks: [
    { week: 7, leading: { contribution_rub_per_order: 0 }, lagging: { profit_rub_day: -150000 } },
    { week: 8, leading: { contribution_rub_per_order: 5 }, lagging: { profit_rub_day: -100000 } },
    { week: 9, leading: { contribution_rub_per_order: 10 }, lagging: { profit_rub_day: -50000 } }
  ],
  do_not_do: ['не масштабировать объём, пока вклад с заказа < 0'],
  data_quality: { score: 0.7, issues: ['куратор Н2–Н4 унаследован из недели 1'] },
  benchmarks: [],
  benchmark_status: 'not_connected'
};
const ve = t.validateEvaluation(goodEval, { runsWithFact: 0 });
assert(ve.ok === true, 'корректная оценка evaluation/2 принята (' + ve.errors.join('; ') + ')');
assert(ve.value.mape_pct === null && ve.value.mape_status === 'not_applicable_no_ai_runs', 'MAPE null + статус сохранены');
assert(ve.value.risk_score === 0.82 && ve.value.risk_scale.length > 0, 'риск числом со шкалой сохранён');
assert(ve.value.gaps_ranked.length === 2 && ve.value.gaps_ranked[0].impact_rub_day === -62700, 'расхождения с влиянием в ₽/день сохранены');
assert(ve.value.next_3_weeks.length === 3, 'три недели плана сохранены');
assert(ve.value.benchmark_status === 'not_connected', 'статус бенчмарков сохранён');

const evalZero = JSON.parse(JSON.stringify(goodEval));
evalZero.mape_pct = 0;
evalZero.mape_status = 'ok';
const vz = t.validateEvaluation(evalZero, { runsWithFact: 0 });
assert(vz.ok === false && vz.errors.some(e => e.includes('mape_pct')), 'mape_pct = 0 без данных отклонён');
const vzOk = t.validateEvaluation(evalZero, { runsWithFact: 2 });
assert(vzOk.ok === true, 'mape_pct = 0 допустим при наличии прогонов с фактом');

const evalNoScale = JSON.parse(JSON.stringify(goodEval));
delete evalNoScale.risk_scale;
assert(t.validateEvaluation(evalNoScale, {}).ok === false, 'риск без шкалы отклонён');

const evalStrRisk = JSON.parse(JSON.stringify(goodEval));
evalStrRisk.risk_score = 'высокий';
assert(t.validateEvaluation(evalStrRisk, {}).ok === false, 'риск строкой («высокий») отклонён');

const evalNoStatus = JSON.parse(JSON.stringify(goodEval));
delete evalNoStatus.mape_status;
assert(t.validateEvaluation(evalNoStatus, {}).ok === false, 'mape_pct = null без mape_status отклонён');

const evalUnsorted = JSON.parse(JSON.stringify(goodEval));
evalUnsorted.gaps_ranked = [evalUnsorted.gaps_ranked[1], evalUnsorted.gaps_ranked[0]];
const vu = t.validateEvaluation(evalUnsorted, {});
assert(vu.ok === true && vu.warnings.some(w => w.includes('порядок')), 'несортированные расхождения — замечание, не ошибка');

const evalNoEvidence = JSON.parse(JSON.stringify(goodEval));
delete evalNoEvidence.gaps_ranked[0].evidence;
assert(t.validateEvaluation(evalNoEvidence, {}).warnings.some(w => w.includes('evidence')), 'расхождение без доказательства — замечание');

const evalBench = JSON.parse(JSON.stringify(goodEval));
evalBench.benchmarks = [{ metric: 'маржа рынка', value: '12%', date: '2026-01-01' }];
assert(t.validateEvaluation(evalBench, {}).warnings.some(w => w.includes('бенчмарк')), 'бенчмарк без источника — замечание');

assert(t.validateEvaluation('не объект', {}).ok === false, 'не-объект отклонён');

const bad = JSON.parse(JSON.stringify(good));
bad.actions[0].confidence = 1.5;
bad.week_plan.zone_orders = 999;
bad.actions[0].risk = 'critical';
const vb = t.validateStrategy(bad);
assert(vb.ok === false, 'invalid strategy rejected');
assert(vb.errors.some(e => e.includes('confidence')), 'confidence range error');
assert(vb.errors.some(e => e.includes('zone_orders')), 'zone_orders range error');
assert(vb.errors.some(e => e.includes('risk')), 'risk enum error');

const before4 = t.profitForWeek(4);
const applied = t.applyStrategy(vg.value, 3, JSON.stringify(good));
const after4 = t.profitForWeek(4);
assert(applied.toWeek === 4, 'applied to week 4');
assert(t.state.weeks['4'].cost4 === 165, 'cost4 set from plan');
assert(after4.cost === 165, 'new rate reaches the profit model');
assert(before4.profit !== after4.profit, 'rate change moves profit');
assert(t.runs()['3'] && t.runs()['3'].strategy.strategy_name === 'Слоты + ТМЦ', 'run stored for week 3');
assert(store['darkstore_profit_live_v5'].includes('aiRuns'), 'run persisted to localStorage');

const applied2 = t.applyStrategy(vg.value, 6, JSON.stringify(good));
assert(applied2.toWeek === null, 'week 6 has no next week');

const app1 = t.applyStrategy(vg.value, 1, JSON.stringify(good));
assert(app1.applied.includes('zoneOrders2') && app1.applied.includes('zoneCouriers2'), 'week 2 fields prefilled');
assert(app1.applied.includes('cost2'), 'week 2 courier rate prefilled from plan (new cost2 field)');

const rep = t.buildFinalReport();
assert(rep.includes('# ИТОГОВЫЙ ОТЧЁТ'), 'final report header');
assert(rep.includes('MAPE'), 'final report MAPE');
assert(rep.includes('KPI-гейты'), 'final report gates');
assert(rep.includes('"gates_passed"'), 'final report json summary');
const jsonStart = rep.indexOf('{\n  "model_version"');
assert(jsonStart > 0, 'summary json parsed start');
const jsonEnd = rep.indexOf('\n\n## 7.', jsonStart);
assert(jsonEnd > jsonStart, 'summary json end marker');
const summary = JSON.parse(rep.slice(jsonStart, jsonEnd));
assert(summary.model_version === '1.3.1', 'summary model version');
assert(summary.ai_runs.length === 3, 'summary has 3 runs');
assert(summary.weeks.length === 6, 'summary 6 weeks');
assert(typeof summary.gates_passed === 'boolean', 'summary gates boolean');
assert(summary.analysis_ready === false, 'неполные данные -> analysis_ready = false');
assert(summary.coverage.complete_weeks < 6, 'в тестовом состоянии не все недели полные');
assert(summary.coverage.incomplete.length > 0 && summary.coverage.incomplete[0].missing_fields.length > 0, 'в сводке перечислены недостающие поля');
assert(summary.curator_model && summary.curator_model.kC_pct_loss_per_point === 1, 'в сводке есть модель куратора');
assert(rep.includes('## 0. Полнота данных'), 'в отчёте есть раздел полноты данных');
assert(summary.weeks[0].metric_source && 'exits' in summary.weeks[0].metric_source, 'у недели указан источник метрик');

assert(Math.abs(t.norm('courierCost', '150') - 0.3) < 1e-9, 'numeric string normalised by value (150/500)');
assert(Math.abs(t.norm('lateness', '7') - (1 - 7 / 30)) < 1e-9, 'lateness normalised inversely, not by text length');
assert(Math.abs(t.norm('exits', '95') - 0.95) < 1e-9, 'exits normalised by value');
assert(t.norm('date', '14.11.2026') === 0.5, 'date stays text-based');
assert(t.norm('done', ['a']) === 1, 'checkbox group = 100%');
assert(t.norm('gray', 'нет') === 0.2, 'radio "нет" = 20%');

// ---------- строгий режим полноты данных ----------
const FULL_W1 = {
  zonesCount: '6', ordersPerZoneDay: '220', cost: '600', marginPct: '30', courierCost: '150',
  kL: '0.5', kA: '0.7', kT: '1', kE: '0.3', kC: '1', curatorThreshold: '90', curatorPenaltyPct: '5',
  lateness: '7', appeals: '5', tmc: '100', exits: '95',
  curatorProcess: '90', curatorAutonomy: '90', curatorKpi: '90', curatorTraining: '90', curatorInvolvement: '90'
};
const FULL = {
  1: FULL_W1,
  2: { zoneOrders2: 220, zoneCouriers2: 5, lateness2: 8, appeals2: 7, exits2: 91, cost2: 160 },
  3: { lateness3: 7, appeals3: 6, exits3: 93, tmc3: 95, cost3: 160 },
  4: { lateness4: 6.5, appeals4: 5.5, exits4: 94, tmc4: 97, cost4: 165 },
  5: { lateness5: 6, appeals5: 5, tmc5: 98, exits5: 96, cost5: 165, curatorAutonomy5: 75, curatorKpi5: 70, curatorTraining5: 80, curatorInvolvement5: 70 },
  6: { lateness6: 6, appeals6: 4, tmc6: 100, exits6: 95, cost6: 165, curatorAutonomy6: 90, curatorKpi6: 90, curatorTraining6: 90, curatorInvolvement6: 90, finalPlan: 'Держать KPI' }
};

t.buildState({ 1: { done: ['a'], slots: ['8–20'], tmcMissing: ['сумка'], lateCauses: ['пробки'], appealCauses: ['опоздания'] } });
t.setWeek(1);
const qa = t.quality();
assert(qa.fill === 0, 'галочки не закрывают обязательные поля: полнота = 0 (got ' + qa.fill + ')');
assert(qa.coverage.required === 21, 'у недели 1 21 обязательное поле (got ' + qa.coverage.required + ')');
assert(qa.coverage.missing.includes('cost') && qa.coverage.missing.includes('curatorTraining'), 'в списке не хватает ключевых полей недели 1');
assert(t.readiness().ready === false, 'при пустых неделях анализ не готов');
assert(t.readiness().completeWeeks === 0, 'полных недель нет');

t.buildState(FULL);
t.setWeek(1);
const qFull = t.quality();
assert(qFull.fill === 100, 'полностью заполненная неделя 1 -> полнота 100 (got ' + qFull.fill + ')');
assert(t.readiness().ready === true, 'все 6 недель полные -> анализ готов');
assert(t.readiness().completeWeeks === 6, 'все 6 недель полные (got ' + t.readiness().completeWeeks + ')');

// наследование метрик: выходы недели 5 без поля exits5 берутся из недели 1
t.buildState({ 1: FULL_W1, 5: { lateness5: 6, appeals5: 5, tmc5: 98, curatorAutonomy5: 75, curatorKpi5: 70, curatorTraining5: 80, curatorInvolvement5: 70 } });
assert(t.coverage(5).missing.includes('exits5'), 'неделя 5 без exits5 неполная');
assert(t.metricSource(5, 'exits') === 'inherited_week_1', 'выходы недели 5 помечены как унаследованные из недели 1');
assert(t.profitForWeek(5).exits === 95, 'в расчёт уходит унаследованное значение недели 1');
t.buildState(FULL);
assert(t.metricSource(5, 'exits') === 'entered', 'после заполнения exits5 источник = entered');
assert(t.metricSource(5, 'lateness') === 'entered', 'lateness недели 5 источник = entered');

// ---------- куратор: обучение и вовлечённость влияют на маржу ----------
t.buildState(FULL);
t.setWeek(1);
const pHiCur = t.profitForWeek(1);
assert(pHiCur.lossCurator === 0, 'при индексе готовности ≥ порога влияние куратора на потери = 0');
assert(Math.abs(pHiCur.curatorIndex - 90) < 1e-9, 'индекс готовности куратора = 90 (got ' + pHiCur.curatorIndex + ')');

const lowCur = JSON.parse(JSON.stringify(FULL));
lowCur[1].curatorTraining = '40';
lowCur[1].curatorInvolvement = '40';
t.buildState(lowCur);
t.setWeek(1);
const pLoCur = t.profitForWeek(1);
assert(pLoCur.lossCurator > 0, 'дефицит обучения/вовлечённости добавляет потери');
assert(pLoCur.lossCurator > pHiCur.lossCurator, 'потери растут при слабом кураторе');
assert(pLoCur.profit < pHiCur.profit, 'прибыль падает при слабом обучении/вовлечённости куратора');
assert(pLoCur.curatorGap > 0 && pLoCur.loss === pLoCur.baseLoss + pLoCur.lossCurator, 'потери = базовые + вклад куратора');
const repCur = t.buildFinalReport();assert(repCur.includes('Обучение и вовлечённость куратора влияют на маржу через потери'), 'в отчёте объяснено влияние куратора на маржу');
assert(repCur.includes('"curator_model"'), 'в JSON есть модель куратора');
assert(repCur.includes('"curator_index_pct"'), 'в JSON есть индекс готовности куратора по неделям');

// штраф куратора всегда ухудшает результат (и при прибыли, и при убытке)
const weakFull = JSON.parse(JSON.stringify(FULL));
weakFull[1].curatorProcess = '50'; weakFull[1].curatorAutonomy = '50'; weakFull[1].curatorKpi = '50';
weakFull[1].curatorTraining = '50'; weakFull[1].curatorInvolvement = '50';
t.buildState(weakFull);
t.setWeek(1);
const pWeakPos = t.profitForWeek(1);
assert(pWeakPos.profitBefore > 0, 'тест: прибыль до штрафа положительная');
assert(pWeakPos.curatorPenaltyAmount > 0 && pWeakPos.profit < pWeakPos.profitBefore, 'при прибыли штраф уменьшает прибыль');
assert(Math.abs(pWeakPos.curatorPenaltyAmount - Math.abs(pWeakPos.profitBefore) * 0.05) < 1, 'размер штрафа = 5% от |прибыли до штрафа|');

const lossWeek = { 1: {
  zonesCount: '6', ordersPerZoneDay: '220', cost: '1050', marginPct: '5', courierCost: '100',
  kL: '0.5', kA: '0.7', kT: '1', kE: '0.3', kC: '1', curatorThreshold: '90', curatorPenaltyPct: '5',
  lateness: '7', appeals: '9.5', tmc: '32', exits: '90',
  curatorProcess: '59', curatorAutonomy: '59', curatorKpi: '59', curatorTraining: '59', curatorInvolvement: '59'
} };
t.buildState(lossWeek);
t.setWeek(1);
const pLoss = t.profitForWeek(1);
assert(pLoss.profitBefore < 0, 'тест: прибыль до штрафа отрицательная');
assert(pLoss.curatorPenaltyAmount > 0 && pLoss.profit < pLoss.profitBefore, 'при убытке штраф увеличивает убыток, а не уменьшает его');

// ---------- безубыточность и целевая маржа ----------
const beWeek = { 1: {
  zonesCount: '6', ordersPerZoneDay: '220', cost: '1050', marginPct: '5', courierCost: '100',
  kL: '0.5', kA: '0.7', kT: '1', kE: '0.3', kC: '1', curatorThreshold: '90', curatorPenaltyPct: '5',
  lateness: '7', appeals: '5', tmc: '100', exits: '100',
  curatorProcess: '90', curatorAutonomy: '90', curatorKpi: '90', curatorTraining: '90', curatorInvolvement: '90'
} };
t.buildState(beWeek);
t.setWeek(1);
const pBe = t.profitForWeek(1);
const be = t.breakeven(pBe);
assert(be.impossible === false, 'безубыточность считается, когда доля потерь < 100%');
assert(be.lossSharePct === 7, 'доля потерь 7% выручки (got ' + be.lossSharePct + ')');
assert(Math.abs(be.marginRub - 107.5) < 0.2, 'безубыточная маржа 107.5 ₽/заказ (got ' + be.marginRub + ')');
assert(be.marginRub > pBe.M, 'безубыточная маржа выше текущей (' + be.marginRub + ' > ' + pBe.M + ')');
assert(be.gapRub < 0, 'дефицит маржи отрицательный (' + be.gapRub + ')');
assert(Math.abs(be.marginRub * (1 - be.lossSharePct / 100) - pBe.rate) < 1, 'маржа × (1 − доля потерь) = ставка курьера');
assert(Math.abs(be.targetMarginRub - (be.marginRub + 20)) < 0.2, 'целевая маржа = безубыточная + буфер 20 ₽');
assert(Math.abs(be.priceRub - 2150) < 20, 'безубыточный чек при марже 5% ≈ 2 150 ₽ (got ' + be.priceRub + ')');

// тяжёлые потери: доля потерь ≥ выручки -> безубыточность недостижима
t.buildState(lossWeek);
t.setWeek(1);
const beHeavy = t.breakeven(t.profitForWeek(1));
assert(beHeavy.impossible === true && beHeavy.marginRub === null, 'при потерях ≥ выручки безубыточность недостижима (потери ' + beHeavy.lossSharePct + '%)');

const noChance = { 1: {
  zonesCount: '6', ordersPerZoneDay: '220', cost: '1050', marginPct: '5', courierCost: '100',
  kL: '0.5', kA: '0.7', kT: '1', kE: '0.3', kC: '1', curatorThreshold: '90', curatorPenaltyPct: '5',
  lateness: '30', appeals: '30', tmc: '0', exits: '0',
  curatorProcess: '90', curatorAutonomy: '90', curatorKpi: '90', curatorTraining: '90', curatorInvolvement: '90'
} };
t.buildState(noChance);
t.setWeek(1);
const beImp = t.breakeven(t.profitForWeek(1));
assert(beImp.impossible === true && beImp.marginRub === null, 'при потерях ≥ выручки безубыточность недостижима (потери ' + beImp.lossSharePct + '%)');

t.buildState(lossWeek);
t.setWeek(1);
const beKpi = t.breakevenAtKpi();
assert(beKpi.loss_share_pct === 8.5, 'при целевых KPI доля потерь 8.5% (got ' + beKpi.loss_share_pct + ')');
assert(Math.abs(beKpi.breakeven_margin_rub - 109.3) < 0.2, 'при целевых KPI безубыточная маржа 109.3 ₽/заказ (got ' + beKpi.breakeven_margin_rub + ')');
assert(Math.abs(beKpi.required_margin_pct_at_current_price - 10.4) < 0.1, 'требуемая маржа 10.4% от чека 1050 ₽ (got ' + beKpi.required_margin_pct_at_current_price + ')');

// гейты: только по неделе с полными данными, порог куратора из калибровки
t.buildState(FULL);
t.setWeek(6);
const repFull = t.buildFinalReport();
const summaryFull = JSON.parse(repFull.slice(repFull.indexOf('{\n  "model_version"'), repFull.indexOf('\n\n## 7.')));
assert(summaryFull.analysis_ready === true, 'полные данные -> analysis_ready = true');
assert(summaryFull.gates_week === 6, 'гейты считаются по последней полной неделе');
assert(summaryFull.gates_passed === true, 'на полных данных все гейты проходят');
assert(repFull.includes('куратор ≥ 90%'), 'порог куратора берётся из калибровки');

// ---------- инкремент 2: сводка содержит входы модели и разложение прибыли ----------
assert(summaryFull.calibration && summaryFull.calibration.orders_per_day === 1320, 'в сводке есть объём заказов/день (6 Зисов × 220)');
assert(summaryFull.calibration.zones_count === 6 && summaryFull.calibration.orders_per_zone_day === 220, 'в сводке есть калибровка объёма');
assert(summaryFull.loss_weights && summaryFull.loss_weights.kL_pct_margin_per_1pct_lateness === 0.5, 'в сводке есть веса потерь (kL)');
assert(summaryFull.loss_weights.kC_pct_loss_per_curator_point === 1, 'в сводке есть вес влияния куратора (kC)');
assert(summaryFull.weeks.every(w => typeof w.orders_per_day === 'number' && typeof w.rate_rub === 'number'), 'по каждой неделе есть заказы и ставка');
assert(summaryFull.weeks.every(w => w.loss_breakdown_rub_day && typeof w.loss_breakdown_rub_day.residual === 'number'), 'по каждой неделе есть разложение потерь');

const DECOMP_KEYS = ['structural_unit_economics','lateness','appeals','tmc','exits','curator_multiplier','curator_penalty'];
let worstDiff = 0;
summaryFull.weeks.forEach(w => {
  const b = w.loss_breakdown_rub_day;
  let sum = b.residual;
  DECOMP_KEYS.forEach(k => { sum += b[k]; });
  worstDiff = Math.max(worstDiff, Math.abs(sum - w.profit_rub_day));
  assert(Math.abs(b.residual) <= 1, 'неделя ' + w.week + ': остаток разложения ≈ 0 (' + b.residual + ')');
});
assert(worstDiff <= 4, 'компоненты разложения дают прибыль с точностью округления (макс. расхождение ' + worstDiff + ' ₽)');
assert(summaryFull.weeks.find(w => w.week === 5).rate_rub === 165, 'ставка недели 5 берётся из cost5');
assert(summaryFull.weeks.find(w => w.week === 6).rate_rub === 165, 'ставка недели 6 берётся из cost6');
assert(repFull.includes('### 1.1. Юнит-экономика по неделям') && repFull.includes('### 1.2. Разложение прибыли по неделям'), 'в отчёте есть таблицы разложения');
assert(repFull.includes('### 1.3. Безубыточность по неделям'), 'в отчёте есть таблица безубыточности');
assert(repFull.includes('Безубыточность (последняя неделя)') || repFull.includes('Безубыточность при текущих потерях'), 'в шапке отчёта есть расчёт безубыточности');
assert(summaryFull.breakeven && typeof summaryFull.breakeven.breakeven_margin_rub === 'number', 'в сводке есть блок breakeven');
assert(summaryFull.breakeven_at_target_kpi && summaryFull.breakeven_at_target_kpi.breakeven_margin_rub > 0, 'в сводке есть безубыточность при целевых KPI');
assert(summaryFull.weeks.every(w => 'breakeven_margin_rub' in w && 'margin_gap_rub' in w), 'в каждой неделе есть безубыточная маржа и дефицит');
assert(t.buildPrompt(6).includes('Безубыточность недели 6'), 'в промпте есть безубыточность недели');
assert(t.buildPrompt(6).includes('Безубыточность при целевых KPI'), 'в промпте есть безубыточность при целевых KPI');
assert(t.buildPrompt(1).includes('не придумывай'), 'в промпте есть запрет придумывать целевые числа');

// ---------- инкремент 5: measured, data_quality и [Н/Д] в гейтах ----------
assert(summaryFull.data_quality && summaryFull.data_quality.score === 0.93, 'качество данных проекта 0.93 (куратор на Н2–Н4 и ТМЦ на Н2 унаследованы), got ' + (summaryFull.data_quality && summaryFull.data_quality.score));
assert(summaryFull.data_quality.issues.length === 5, 'в качестве данных перечислены 5 недель с неполными измерениями (got ' + summaryFull.data_quality.issues.length + ')');
assert(summaryFull.data_quality.issues.some(x => x.indexOf('Н2') === 0 && x.indexOf('ТМЦ') !== -1), 'неделя 2: в причинах есть унаследованный ТМЦ');
const w3q = summaryFull.weeks.find(w => w.week === 3);
assert(w3q.measured && w3q.measured.curator === false && w3q.measured.lateness === true, 'неделя 3: опоздания измерены, куратор — нет');
assert(w3q.measured_key_metrics === '4/5', 'неделя 3: измерено 4 из 5 ключевых метрик (got ' + w3q.measured_key_metrics + ')');
assert(w3q.data_quality.score === 0.9 && w3q.data_quality.issues.some(x => x.indexOf('Куратор') === 0), 'неделя 3: качество 0.9 с причиной по куратору');
const w6q = summaryFull.weeks.find(w => w.week === 6);
assert(w6q.measured.curator === true, 'неделя 6: куратор считается измеренным (4 из 5 компонент)');
assert(w6q.curator_components_entered === 4 && w6q.data_quality.score === 0.98, 'неделя 6: 4 из 5 компонент куратора -> качество 0.98 (got ' + w6q.data_quality.score + ')');
assert(w6q.data_quality.issues.some(x => x.indexOf('Куратор: измерено 4 из 5') === 0), 'неделя 6: причина — процессы куратора из недели 1');
assert(summaryFull.gates.every(g => g.measured === true) && summaryFull.gates_measured === summaryFull.gates_total, 'на неделе 6 все гейты измерены (' + summaryFull.gates_measured + '/' + summaryFull.gates_total + ')');
assert(t.buildPrompt(3).includes('| Качество |'), 'в промпте есть колонка качества');
assert(t.buildPrompt(3).includes('Качество данных: введено = 1'), 'в промпте объяснена шкала качества');
assert(t.buildPrompt(3).includes('Недели с качеством < 0.8'), 'в промпте есть порог качества для тренда');

// гейты по неделе без полей куратора: строка [Н/Д] и не входит в итог
t.buildState(JSON.parse(JSON.stringify({ 1: FULL[1], 2: FULL[2], 3: FULL[3], 4: FULL[4] })));
t.setWeek(4);
const repW4 = t.buildFinalReport();
const sumW4 = JSON.parse(repW4.slice(repW4.indexOf('{\n  "model_version"'), repW4.indexOf('\n\n## 7.')));
const gCur = sumW4.gates.find(g => g.name.indexOf('куратор') === 0);
assert(gCur && gCur.measured === false && gCur.ok === null, 'гейт куратора на неделе 4 помечен неизмеренным');
assert(repW4.includes('[Н/Д] куратор'), 'в отчёте гейт куратора = [Н/Д]');
assert(sumW4.gates_measured < sumW4.gates_total, 'часть гейтов не измерена (' + sumW4.gates_measured + '/' + sumW4.gates_total + ')');
assert(sumW4.gates_passed === sumW4.gates.filter(g => g.measured).every(g => g.ok), 'gates_passed не учитывает [Н/Д]');
assert(sumW4.gates_note.length > 0, 'в сводке объяснено, почему [Н/Д] не входит в итог');
assert(repW4.includes('в итог не входит'), 'в тексте отчёта объяснена пометка [Н/Д]');
assert(sumW4.weeks.find(w => w.week === 4).data_quality.score === 0.9, 'неделя 4: качество данных 0.9 (got ' + sumW4.weeks.find(w => w.week === 4).data_quality.score + ')');

// пустая неделя: качество 0, отдельная причина
t.buildState({ 1: FULL[1] });
assert(t.dataQuality(3).score === 0, 'пустая неделя: качество данных 0 (got ' + t.dataQuality(3).score + ')');
assert(t.dataQuality(3).issues[0].indexOf('не заполнена') !== -1, 'пустая неделя: причина «не заполнена»');

// старое сохранение: метрика недели лежит без суффикса — полнота и качество трактуют одинаково
t.buildState({ 1: Object.assign({}, FULL[1], { tmc: '32' }), 2: { zoneOrders2: 220, zoneCouriers2: 5, lateness2: 8, appeals2: 7, exits2: 91, cost2: 160, tmc: '76' } });
assert(t.coverage(2).required === 7, 'при ТМЦ Н1 < 100 неделя 2 требует tmc2 (got ' + t.coverage(2).required + ')');
assert(t.metricSource(2, 'tmc') === 'entered' && t.complete(2) === true, 'метрика без суффикса считается измеренной и заполненной');
assert(t.dataQuality(2).score === 0.9, 'качество недели 2 = 0.9 (ТМЦ введён через старое поле, куратор унаследован), got ' + t.dataQuality(2).score);

// ---------- инкремент 6: миграция сохранений ----------
const V = t.stateVersion();
assert(V.KEY === 'darkstore_profit_live_v5' && V.LEGACY_KEYS.indexOf('darkstore_profit_live_v4') !== -1, 'версионированный ключ и список старых ключей');
assert(V.STATE_VERSION === 2, 'текущая схема состояния = 2');
assert(t.modelOlderThan('1.2.0', '1.3.1') === true, '1.2.0 старше 1.3.1');
assert(t.modelOlderThan('1.3.1', '1.2.0') === false, '1.3.1 не старше 1.2.0');
assert(t.modelOlderThan('1.3.1', '1.3.1') === false, 'равные версии не старше');
assert(t.detectStateVersion({}) === 1 && t.detectStateVersion({ state_version: 2 }) === 2, 'определение схемы состояния');

// старый проект под ключом v4: данные сохраняются, недели помечаются к проверке, есть бэкап
Object.keys(store).forEach(k => { delete store[k]; });
store['darkstore_profit_live_v4'] = JSON.stringify({ currentWeek: 3, weeks: JSON.parse(JSON.stringify(FULL)), aiRuns: { '1': { fromWeek: 1, toWeek: 2, strategy: { strategy_name: 'старый прогон', actions: [], data_sources_used: ['метрики'] } } } });
t.load();
assert(t.state.stateVersion === 2, 'состояние помечено текущей схемой (got ' + t.state.stateVersion + ')');
assert(Object.keys(t.state.weeks).length === 6, 'данные недель перенесены без потерь');
assert(t.weeksNeedingReview().length === 6, 'все недели с данными помечены к проверке (got ' + t.weeksNeedingReview().length + ')');
assert(t.state.migrationNotice.indexOf('1.3.0') !== -1 && t.state.migrationNotice.indexOf('куратора') !== -1, 'баннер объясняет смену формулы');
assert(!!store['darkstore_profit_live_v5'] && JSON.parse(store['darkstore_profit_live_v5']).state_version === 2, 'проект сохранён под новым ключом');
assert(Object.keys(store).some(k => k.indexOf(V.BACKUP_PREFIX) === 0), 'создана резервная копия старого проекта');
assert(t.readiness().ready === false && t.readiness().reviewWeeks.length === 6, 'до подтверждения анализ заблокирован');
assert(t.readiness().missingTotal === 0, 'недели полные — блокирует именно проверка после переноса');
const legacyRep = t.buildFinalReport();
assert(legacyRep.indexOf('Недели к проверке') !== -1, 'отчёт сообщает о неделях к проверке после переноса');
assert(legacyRep.indexOf('ИТОГОВЫЙ ОТЧЁТ') !== -1, 'отчёт по перенесённому проекту собирается без ошибок');
assert(JSON.parse(legacyRep.slice(legacyRep.indexOf('{\n  "model_version"'), legacyRep.indexOf('\n\n## 7.'))).data_provenance.needs_review_weeks.length === 6, 'в сводке перечислены недели к проверке');

t.markWeekReviewed(1);
assert(t.weeksNeedingReview().length === 5, 'подтверждение недели снимает пометку (got ' + t.weeksNeedingReview().length + ')');
[2, 3, 4, 5, 6].forEach(w => t.markWeekReviewed(w));
assert(t.readiness().ready === true, 'после подтверждения всех недель анализ готов');
assert(t.state.migrationNotice === '', 'баннер исчезает, когда проверены все недели');

// повторная загрузка уже мигрированного проекта ничего не помечает заново
t.load();
assert(t.weeksNeedingReview().length === 0, 'повторная загрузка не возвращает пометки');
assert(t.state.migrationNotice === '', 'повторная загрузка не показывает баннер');

// экспорт старого формата: ai_runs/final_report/current_week и пометки
const legacyExport = {
  model_version: '1.2.0', exported_at: '2026-01-01T00:00:00Z', current_week: 2,
  weeks: { 1: JSON.parse(JSON.stringify(FULL[1])) },
  ai_runs: { '1': { fromWeek: 1, toWeek: 2 } }, evaluations: [{ at: '2026-01-01', value: {} }], final_report: 'старый отчёт'
};
const mig = t.migrateState(legacyExport, 'import');
assert(mig.from === 1 && mig.changed.length === 1, 'старый экспорт распознан как схема 1');
assert(mig.state.currentWeek === 2 && mig.state.finalReport === 'старый отчёт', 'скаляры и отчёт перенесены');
assert(Object.keys(mig.state.aiRuns).length === 1 && mig.state.evaluations.length === 1, 'прогоны и оценки перенесены');
assert(mig.state.needsReview['1'] === true, 'неделя из старого экспорта помечена к проверке');

// повреждённое сохранение не роняет приложение
Object.keys(store).forEach(k => { delete store[k]; });
store['darkstore_profit_live_v5'] = '{битый json';
let loadFailed = false;
try { t.load(); } catch (e) { loadFailed = true; }
assert(loadFailed === false, 'битое сохранение не бросает исключение');

// ---------- инкремент 3: strategy/2 в цикле и comparison ожидание/факт ----------
t.buildState(JSON.parse(JSON.stringify(FULL)));
t.setWeek(1);
const planV2 = JSON.parse(JSON.stringify(good2));
planV2.week_plan = { courier_cost_rub: 165 };
const v2Applied = t.applyStrategy(t.validateStrategy(planV2).value, 2, JSON.stringify(planV2));
assert(v2Applied.toWeek === 3, 'strategy/2: план после недели 2 применён к неделе 3');
const repV2 = t.buildFinalReport();
const sumV2 = JSON.parse(repV2.slice(repV2.indexOf('{\n  "model_version"'), repV2.indexOf('\n\n## 7.')));
const runV2 = sumV2.ai_runs.find(r => r.after_week === 2);
assert(runV2 && runV2.schema_version === 'strategy/2', 'в прогоне зафиксирована схема strategy/2');
assert(runV2.expected_profit_rub_day === -90000, 'прогноз взят из блока expected');
assert(typeof runV2.error_rub_day === 'number' && typeof runV2.error_pct_abs === 'number', 'ошибка прогноза посчитана в ₽/день и в %');
assert(runV2.expected_breakdown_rub_day && typeof runV2.breakdown_abs_error_rub_day === 'number', 'есть сравнение разложения ожидание/факт');
assert(runV2.leading_indicators === 1 && runV2.do_not_do === 1, 'в прогоне видны leading-индикаторы и «что не делать»');
assert(sumV2.forecast_error && sumV2.forecast_error.runs_with_fact >= 1, 'в сводке есть блок ошибки прогноза');
assert(repV2.includes('## 7. Задача ИИ-оценщику (схема evaluation/2)'), 'в отчёте описана схема evaluation/2');
assert(repV2.includes('"mape_status"'), 'в шаблоне оценки есть mape_status');
assert(repFull.includes('Остаток должен быть 0'), 'в отчёте объяснён смысл остатка');

const lowThreshold = JSON.parse(JSON.stringify(FULL));
lowThreshold[1].curatorThreshold = '60';
lowThreshold[1].curatorProcess = '70'; lowThreshold[1].curatorAutonomy = '70'; lowThreshold[1].curatorKpi = '70';
lowThreshold[1].curatorTraining = '70'; lowThreshold[1].curatorInvolvement = '70';
lowThreshold[6].curatorAutonomy6 = 70; lowThreshold[6].curatorKpi6 = 70; lowThreshold[6].curatorTraining6 = 70; lowThreshold[6].curatorInvolvement6 = 70;
t.buildState(lowThreshold);
t.setWeek(6);
const repLow = t.buildFinalReport();
assert(repLow.includes('- [OK] куратор ≥ 60%: 70%'), 'гейт куратора использует калиброванный порог 60% (got: ' + (repLow.split('\n').find(l => l.includes('куратор ≥')) || '') + ')');

const healthyW1 = { 1: { zonesCount: '6', ordersPerZoneDay: '220', cost: '600', marginPct: '30', courierCost: '150', lateness: '7', appeals: '5', tmc: '100', exits: '95' } };
t.buildState(healthyW1);
t.setWeek(1);
const pGood = t.profitForWeek(1);
assert(pGood.price === 600 && pGood.rate === 150, 'price and courier rate are separate inputs');
assert(pGood.M === 180 && pGood.contribution === 30, 'margin per order 180, contribution 30');
assert(pGood.profit > 0, 'healthy unit economics gives positive profit (got ' + pGood.profit + ')');

const badEcon = { 1: { zonesCount: '6', ordersPerZoneDay: '220', cost: '150', marginPct: '25', courierCost: '150', lateness: '7', appeals: '5', tmc: '100', exits: '95' } };
t.buildState(badEcon);
t.setWeek(1);
const pBad = t.profitForWeek(1);
assert(pBad.contribution < 0 && pBad.negativeUnit === true, 'loss-making unit economics flagged');
assert(t.buildPrompt(1).includes('вклад -'), 'prompt warns about negative per-order contribution');

const risky = JSON.parse(JSON.stringify(vg.value));
risky.week_plan = { zone_couriers: 8, courier_cost_rub: 400, zone_orders: 290 };
const vr = t.validateStrategy(risky);
assert(vr.ok === true, 'risky plan still parses');
assert(vr.warnings.some(w => w.includes('максимум 5 курьеров')), 'warning: more than 5 couriers per ZIS');
assert(vr.warnings.some(w => w.includes('цель 180–250')), 'warning: ZIS over 250 orders');
assert(vr.warnings.some(w => w.includes('вклад с заказа')), 'warning: rate above per-order margin');

// ---------- инкремент 7: бенчмарки рынка ----------
assert(t.benchmarkMetrics.length === 4, 'четыре метрики для сравнения с рынком (маржа, чек, ставка, опоздания)');
assert(t.benchmarkMetrics.map(m => m.key).join(',') === 'margin_pct,avg_check_rub,courier_rate_rub,lateness_pct', 'набор метрик бенчмарков');

const bmBadSource = t.normalizeBenchmarks({ margin_pct: { value: '12', source: '', date: '2025-11-01' } });
assert(bmBadSource.ok === false && bmBadSource.errors.some(e => e.includes('источник')), 'бенчмарк без источника отклонён');
const bmBadDate = t.normalizeBenchmarks({ avg_check_rub: { value: '1200', source: 'Data Insight', date: '' } });
assert(bmBadDate.ok === false && bmBadDate.errors.some(e => e.includes('дату')), 'бенчмарк без даты отклонён');
const bmBadNum = t.normalizeBenchmarks({ lateness_pct: { value: 'много', source: 'X', date: '2026-01-01' } });
assert(bmBadNum.ok === false && bmBadNum.errors.some(e => e.includes('числом')), 'нечисловое значение отклонено');
const bmOk = t.normalizeBenchmarks({
  margin_pct: { value: '12', source: 'Data Insight, отчёт 2025', date: '2025-11-01' },
  avg_check_rub: { value: '1200', source: 'открытые тарифы, ноябрь 2025', date: '2025-11-05' },
  courier_rate_rub: { value: '90', source: 'hh.ru, вакансии курьеров', date: '2025-11-07' },
  lateness_pct: { value: '8', source: 'публичный SLA агрегатора', date: '2025-10-30' }
});
assert(bmOk.ok === true && Object.keys(bmOk.value).length === 4, 'корректные бенчмарки приняты');
assert(bmOk.value.margin_pct.value === 12 && bmOk.value.avg_check_rub.value === 1200, 'значения приведены к числам');
assert(t.normalizeBenchmarks({ margin_pct: { value: '12,5', source: 'X', date: '2026-01-01' } }).value.margin_pct.value === 12.5, 'запятая как разделитель');

// пустой набор — это «нет данных», а не ошибка
const bmEmpty = t.normalizeBenchmarks({ margin_pct: { value: '', source: '', date: '' } });
assert(bmEmpty.ok === true && Object.keys(bmEmpty.value).length === 0, 'пустая форма сохраняется как «нет бенчмарков»');

t.buildState(JSON.parse(JSON.stringify(FULL)));
t.setWeek(6);
t.applyBenchmarks(bmOk.value, true);
assert(t.benchmarkStatusOf() === 'connected', 'статус бенчмарков: connected');
const cmp = t.benchmarkComparison();
assert(cmp.length === 4, 'в сравнении 4 метрики');
const cmpMargin = cmp.find(x => x.metric_key === 'margin_pct');
assert(cmpMargin.market_value === 12 && cmpMargin.current_value === 30 && cmpMargin.delta === 18 && cmpMargin.verdict === 'лучше рынка', 'маржа 30% против рынка 12% → лучше (got ' + JSON.stringify(cmpMargin) + ')');
const cmpLate = cmp.find(x => x.metric_key === 'lateness_pct');
assert(cmpLate.current_value === 6 && cmpLate.delta === -2 && cmpLate.verdict === 'лучше рынка', 'опоздания 6% против рынка 8% → лучше (меньше — лучше)');
const cmpRate = cmp.find(x => x.metric_key === 'courier_rate_rub');
assert(cmpRate.current_value === 150 && cmpRate.delta === 60 && cmpRate.verdict === 'хуже рынка', 'ставка 150 ₽ против рынка 90 ₽ → хуже (больше — хуже)');
assert(cmpMargin.source === 'Data Insight, отчёт 2025' && cmpMargin.date === '2025-11-01', 'источник и дата сохранены');

const repBm = t.buildFinalReport();
assert(repBm.includes('### 1.4. Сравнение с рынком'), 'в отчёте есть таблица сравнения с рынком');
assert(repBm.includes('Data Insight, отчёт 2025'), 'источник бенчмарка попал в отчёт');
const sumBm = JSON.parse(repBm.slice(repBm.indexOf('{\n  "model_version"'), repBm.indexOf('\n\n## 7.')));
assert(sumBm.benchmark_status === 'connected' && sumBm.benchmarks.length === 4, 'в сводке 4 бенчмарка со статусом connected');
assert(sumBm.benchmarks.every(b => b.source && b.date), 'у каждого бенчмарка в сводке есть источник и дата');
assert(t.buildPrompt(6).includes('Бенчмарки рынка (используй только эти числа'), 'в промпте есть блок бенчмарков');
assert(t.buildPrompt(6).includes('Data Insight, отчёт 2025'), 'в промпте есть источник бенчмарка');

// частичный набор
t.applyBenchmarks({ margin_pct: bmOk.value.margin_pct }, true);
assert(t.benchmarkStatusOf() === 'partial', 'неполный набор — статус partial');
assert(t.buildFinalReport().includes('сравнение неполное'), 'в отчёте отмечено неполное сравнение');

// без бенчмарков
t.applyBenchmarks({}, true);
assert(t.benchmarkStatusOf() === 'not_connected', 'пустой набор — статус not_connected');
assert(t.buildFinalReport().includes('Бенчмарки не подключены'), 'в отчёте честно сказано, что бенчмарков нет');
assert(t.buildPrompt(6).includes('Бенчмарки рынка не подключены'), 'в промпте сказано, что рыночных чисел нет');
assert(t.buildPrompt(6).includes('benchmark_status = "not_connected"'), 'в промпте указано, как помечать отсутствие бенчмарков');

console.log('\nDONE');