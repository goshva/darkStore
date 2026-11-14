const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) throw new Error('no <script> block');
let js = m[1];
const idx = js.lastIndexOf('})();');
if (idx < 0) throw new Error('no IIFE end');
js = js.slice(0, idx) + '\n  globalThis.__t = { buildPrompt: buildPrompt, validateStrategy: validateStrategy, applyStrategy: applyStrategy, buildFinalReport: buildFinalReport, state: state, buildState: function (w) { state.weeks = w; }, runs: runs, profitForWeek: profitForWeek, norm: fieldValueNorm, quality: calcQualityScore, setWeek: function (x) { currentWeek = x; } };\n' + js.slice(idx);

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
assert(p3.includes('Версия модели: 1.2.0'), 'prompt model version');
assert(p3.includes('## 3. Ограничения реальности'), 'prompt constraints');
assert(p3.includes('180–250') && p3.includes('максимум 5 курьеров'), 'prompt ZIS rules');
assert(p3.includes('15–30 мин — минус 1 заказ'), 'prompt lateness rule');
assert(p3.includes('## 6. Формат ответа (JSON)'), 'prompt json section');
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
assert(store['darkstore_profit_live_v4'].includes('aiRuns'), 'run persisted to localStorage');

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
assert(summary.model_version === '1.2.0', 'summary model version');
assert(summary.ai_runs.length === 3, 'summary has 3 runs');
assert(summary.weeks.length === 6, 'summary 6 weeks');
assert(typeof summary.gates_passed === 'boolean', 'summary gates boolean');

assert(Math.abs(t.norm('courierCost', '150') - 0.3) < 1e-9, 'numeric string normalised by value (150/500)');
assert(Math.abs(t.norm('lateness', '7') - (1 - 7 / 30)) < 1e-9, 'lateness normalised inversely, not by text length');
assert(Math.abs(t.norm('exits', '95') - 0.95) < 1e-9, 'exits normalised by value');
assert(t.norm('date', '14.11.2026') === 0.5, 'date stays text-based');
assert(t.norm('done', ['a']) === 1, 'checkbox group = 100%');
assert(t.norm('gray', 'нет') === 0.2, 'radio "нет" = 20%');

t.buildState({ 1: { done: ['a'], slots: ['8–20'], tmcMissing: ['сумка'], lateCauses: ['пробки'], appealCauses: ['опоздания'] } });
t.setWeek(1);
const qa = t.quality();
assert(qa.fill === 100, 'week 1 with only checkboxes: fill = 100');
assert(qa.profitScore === 100, 'week 1 profit score = 100 (baseline itself)');
assert(qa.score === 100, 'week 1 score = 100');

const w1real = { done: ['a'], slots: ['8–20'], tmcMissing: ['сумка'], lateCauses: ['пробки'], appealCauses: ['опоздания'], courierCost: '150', cost: '150', lateness: '7', appeals: '5', exits: '95', tmc: '100' };
t.buildState({ 1: w1real });
t.setWeek(1);
const qb = t.quality();
assert(qb.fill >= 70 && qb.fill <= 95, 'realistic week 1 fill in 70..95 (got ' + qb.fill + ')');
assert(qb.profitScore === 100, 'baseline profit score stays 100');
assert(qb.score >= 85, 'realistic week 1 score >= 85 (got ' + qb.score + ')');

t.buildState({ 1: w1real, 2: { lateness2: '20', appeals2: '20', exits2: '60', tmc2: '50' } });
t.setWeek(2);
const q2 = t.quality();
assert(q2.profitScore < 100, 'worse week 2 scores below baseline (got ' + q2.profitScore + ')');
assert(q2.profitScore > 0, 'worse week 2 is not floored to 0 (got ' + q2.profitScore + ')');

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

console.log('\nDONE');