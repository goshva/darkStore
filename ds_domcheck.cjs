const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) throw new Error('no <script> block');
let js = m[1];
const idx = js.lastIndexOf('})();');
if (idx < 0) throw new Error('no IIFE end');
js = js.slice(0, idx) + '\n  globalThis.__t = { state: state, buildState: function (w) { state.weeks = w; }, setWeek: function (x) { currentWeek = x; }, readiness: reportReadiness, render: render, benchmarkEntries: benchmarkEntries, benchmarkStatusOf: benchmarkStatusOf, prefillZones: prefillZones, profitForWeek: profitForWeek };\n' + js.slice(idx);

const store = {};
const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };

const els = {};
function makeEl(id) {
  return {
    id: id, value: '', innerHTML: '', textContent: '', className: '', placeholder: '',
    style: {}, handlers: {}, files: null, offsetWidth: 0,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); },
    click() { (this.handlers.click || []).forEach(f => f.call(this)); },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    select() {}, focus() {},
    closest() { return null; },
    scrollIntoView() {},
    appendChild() {}, remove() {},
    getAttribute() { return null; },
    setAttribute() {}
  };
}
function getEl(id) { if (!els[id]) els[id] = makeEl(id); return els[id]; }

const document = {
  body: { appendChild() {} },
  handlers: {},
  addEventListener(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); },
  getElementById: getEl,
  querySelectorAll() { return []; },
  querySelector() { return null; },
  activeElement: null,
  createElement: id => makeEl('created:' + id),
  execCommand() { return true; }
};
const window = { scrollTo() {} };
const navigator = {};
const fn = new Function('document', 'window', 'navigator', 'localStorage', 'confirm', js + '\nreturn globalThis.__t;');
const t = fn(document, window, navigator, localStorage, () => true);

function assert(cond, msg) { if (!cond) { console.error('FAIL: ' + msg); process.exitCode = 1; } else { console.log('ok: ' + msg); } }

// --- миграция старого проекта (ключ v4) на входе приложения ---
store['darkstore_profit_live_v4'] = JSON.stringify({
  currentWeek: 1,
  weeks: { 1: { zonesCount: '6', ordersPerZoneDay: '220', cost: '1050', marginPct: '5', courierCost: '100', lateness: '7', appeals: '9.5', tmc: '32', exits: '90' } }
});

(document.handlers.DOMContentLoaded || []).forEach(f => f());

assert(getEl('migrationNotice').style.display === 'block', 'показан баннер о переносе проекта');
assert(getEl('migrationText').textContent.indexOf('1.3.0') !== -1, 'баннер объясняет смену версии формулы');
assert(getEl('migrationText').textContent.indexOf('проверить') !== -1, 'баннер объясняет пометку недель');
assert(!!store['darkstore_profit_live_v5'], 'проект сохранён под версионированным ключом v5');
assert(JSON.parse(store['darkstore_profit_live_v5']).state_version === 2, 'в сохранении есть схема состояния');
assert(Object.keys(store).some(k => k.indexOf('darkstore_backup_') === 0), 'создана резервная копия старого проекта');
assert(t.readiness().ready === false && t.readiness().reviewWeeks.length === 1, 'неделя помечена к проверке после переноса');
assert(getEl('liveBreakdown').innerHTML.includes('К проверке'), 'легенда показывает недели к проверке');

getEl('migrationOkBtn').click();
assert(getEl('promptWeek').textContent === '1', 'кнопка ведёт к первой неделе на проверке');
assert(getEl('aiApplyStatus').textContent.indexOf('Проверьте неделю') === 0, 'статус просит проверить неделю');

getEl('resetBtn').click();
assert(getEl('migrationNotice').style.display === 'none', 'после сброса баннер скрыт');
assert(t.readiness().reviewWeeks.length === 0, 'сброс очищает пометки проверки');

assert(getEl('promptOut').value.includes('# ЗАПРОС К ИИ'), 'page rendered and prompt built');
assert(getEl('promptWeek').textContent === '1', 'prompt shows week 1');
assert(getEl('aiApplyStatus').textContent.length > 0, 'status initialised');
assert(getEl('liveBreakdown').innerHTML.includes('Полнота недели'), 'легенда показывает полноту недели');
assert(getEl('liveBreakdown').innerHTML.includes('Полных недель'), 'легенда показывает число полных недель');
assert(getEl('liveBreakdown').innerHTML.includes('Качество данных'), 'легенда показывает качество данных (унаследованные метрики)');
assert(getEl('liveBreakdown').innerHTML.includes('неточен'), 'легенда предупреждает, что анализ неточен');
assert(getEl('liveStatus').textContent.includes('не хватает'), 'статус сообщает, сколько обязательных полей не хватает');
assert(/id="evalJsonIn"/.test(html) && /id="checkEvalBtn"/.test(html), 'в интерфейсе есть блок проверки оценки ИИ (evaluation/2)');

// --- бенчмарки рынка: спрашиваем при старте ---
assert(/id="benchmarkCard"/.test(html) && /id="benchmarkOpenBtn"/.test(html), 'в интерфейсе есть карточка бенчмарков и кнопка её открытия');
assert(getEl('benchmarkCard').style.display === 'block', 'при старте показана карточка бенчмарков');
assert(getEl('benchmarkBadge').textContent === 'нет данных', 'бейдж бенчмарков: нет данных');
assert(getEl('benchmarkForm').innerHTML.includes('data-bm-value="margin_pct"') && getEl('benchmarkForm').innerHTML.includes('data-bm-source="courier_rate_rub"'), 'форма просит значение и источник по каждой метрике');
getEl('benchmarkSkipBtn').click();
assert(getEl('benchmarkCard').style.display === 'none', 'после «нет данных» карточка скрыта');
assert(t.state.benchmarkAsked === true && t.benchmarkEntries().length === 0, 'пропуск сохранён: бенчмарков нет');
assert(getEl('benchmarkStatus').textContent.includes('not_connected'), 'статус объясняет not_connected');
getEl('benchmarkOpenBtn').click();
assert(getEl('benchmarkCard').style.display === 'block', 'кнопка снова открывает карточку бенчмарков');
getEl('benchmarkSaveBtn').click();
assert(getEl('benchmarkStatus').textContent.includes('не заполнены'), 'пустая форма не создаёт бенчмарков');

const answer = {
  strategy_name: 'Слоты + ТМЦ',
  actions: [{ action: 'Закрыть дефицит ТМЦ', impact_profit_rub_day: 900, impact_metrics: { tmc: 10 }, risk: 'low', confidence: 0.8 }],
  expected_profit_rub_day: 2500,
  expected_delta_vs_baseline_pct: 10,
  data_sources_used: ['метрики недели 1'],
  assumptions: [],
  open_questions: [],
  week_plan: { zone_orders: 220, zone_couriers: 5, courier_cost_rub: 165, slots: ['8–20'], curator_actions: ['контроль слотов'] }
};
getEl('aiJsonIn').value = JSON.stringify(answer);
getEl('applyAiBtn').click();
assert(getEl('promptWeek').textContent === '2', 'after apply UI moved to week 2');
assert(getEl('aiApplyStatus').textContent.includes('применён к неделе 2'), 'apply status reported');
assert(JSON.parse(store['darkstore_profit_live_v5']).weeks['2'].zoneOrders2 === 220, 'answer persisted into week 2');

getEl('aiJsonIn').value = '{"strategy_name": "x"}';
getEl('applyAiBtn').click();
assert(getEl('aiApplyStatus').style.color === '#b42318', 'invalid answer rejected in red');
assert(getEl('promptWeek').textContent === '2', 'invalid answer does not move the week');

getEl('copyPromptBtn').click();
getEl('exportBtn').click();
assert(getEl('aiApplyStatus').textContent.includes('Экспорт готов'), 'export JSON reports success');

// ---------- проверка оценки ИИ (evaluation/2) ----------
const goodEval = {
  schema_version: 'evaluation/2',
  verdict: 'Экономика заказа не сходится: вклад -47 ₽',
  mape_pct: null,
  mape_status: 'not_applicable_no_ai_runs',
  risk_score: 0.82,
  risk_scale: '0-1 (0 — низкий, 1 — критический)',
  confidence_in_verdict: 0.6,
  confidence_reason: 'куратор на Н2–Н4 унаследован',
  gaps_ranked: [
    { rank: 1, gap: 'структурная юнит-экономика', impact_rub_day: -62700, evidence: 'вклад -47 ₽ × 1320 заказов', fixability: 'high' },
    { rank: 2, gap: 'ТМЦ 32%', impact_rub_day: -47124, evidence: 'tmc_pct 32', fixability: 'high' }
  ],
  top_effect_action: 'Пересобрать экономику заказа',
  next_3_weeks: [
    { week: 7, leading: { contribution_rub_per_order: 0 }, lagging: { profit_rub_day: -150000 } },
    { week: 8, leading: { contribution_rub_per_order: 5 }, lagging: { profit_rub_day: -100000 } },
    { week: 9, leading: { contribution_rub_per_order: 10 }, lagging: { profit_rub_day: -50000 } }
  ],
  do_not_do: ['не масштабировать объём, пока вклад с заказа < 0'],
  benchmark_status: 'not_connected'
};
getEl('evalJsonIn').value = JSON.stringify(goodEval);
getEl('checkEvalBtn').click();
assert(getEl('evalStatus').textContent.includes('Оценка принята'), 'корректная оценка принята');
assert(getEl('evalStatus').style.color === '#0b8a4b', 'принятая оценка отмечена зелёным');
assert(JSON.parse(store['darkstore_profit_live_v5']).evaluations.length === 1, 'оценка сохранена в localStorage');

getEl('evalJsonIn').value = JSON.stringify({ verdict: 'x', mape_pct: 0, mape_status: 'ok', risk_score: 'высокий' });
getEl('checkEvalBtn').click();
assert(getEl('evalStatus').textContent.includes('не принята'), 'некорректная оценка отклонена');
assert(getEl('evalStatus').style.color === '#b42318', 'отклонённая оценка отмечена красным');
assert(JSON.parse(store['darkstore_profit_live_v5']).evaluations.length === 1, 'отклонённая оценка не сохраняется');

// ---------- строгий гейт: отчёт без полных данных не собирается ----------
getEl('finalBtn').click();
assert(getEl('aiApplyStatus').textContent.includes('Анализ заблокирован'), 'финальный отчёт заблокирован при неполных данных');
assert(getEl('aiApplyStatus').style.color === '#b42318', 'блокировка показана красным');
assert(getEl('finalOut').value === '', 'отчёт не собран, пока данные неполные');
assert(getEl('promptWeek').textContent === '1', 'интерфейс перешёл к первой неполной неделе');
assert(t.readiness().ready === false, 'готовность анализа = false');

const FULL_W1 = {
  zonesCount: '6', ordersPerZoneDay: '220', cost: '600', marginPct: '30', courierCost: '150',
  kL: '0.5', kA: '0.7', kT: '1', kE: '0.3', kC: '1', curatorThreshold: '90', curatorPenaltyPct: '5',
  lateness: '7', appeals: '5', tmc: '100', exits: '95',
  curatorProcess: '90', curatorAutonomy: '90', curatorKpi: '90', curatorTraining: '90', curatorInvolvement: '90'
};
t.buildState({
  1: FULL_W1,
  2: { zoneOrders2: 220, zoneCouriers2: 5, lateness2: 8, appeals2: 7, exits2: 91, cost2: 160, curatorProcess2: 90, curatorAutonomy2: 85, curatorKpi2: 80, curatorTraining2: 90, curatorInvolvement2: 85 },
  3: { lateness3: 7, appeals3: 6, exits3: 93, tmc3: 95, cost3: 160, curatorProcess3: 90, curatorAutonomy3: 88, curatorKpi3: 85, curatorTraining3: 90, curatorInvolvement3: 88 },
  4: { lateness4: 6.5, appeals4: 5.5, exits4: 94, tmc4: 97, cost4: 165, curatorProcess4: 90, curatorAutonomy4: 90, curatorKpi4: 88, curatorTraining4: 92, curatorInvolvement4: 90 },
  5: { lateness5: 6, appeals5: 5, tmc5: 98, exits5: 96, cost5: 165, curatorProcess5: 90, curatorAutonomy5: 75, curatorKpi5: 70, curatorTraining5: 80, curatorInvolvement5: 70 },
  6: { lateness6: 6, appeals6: 4, tmc6: 100, exits6: 95, cost6: 165, curatorProcess6: 90, curatorAutonomy6: 90, curatorKpi6: 90, curatorTraining6: 90, curatorInvolvement6: 90, finalPlan: 'Держать KPI' }
});
t.setWeek(6);
assert(t.readiness().ready === true, 'все недели заполнены -> готовность анализа = true');

getEl('finalBtn').click();
assert(getEl('finalOut').value.includes('# ИТОГОВЫЙ ОТЧЁТ'), 'final report rendered on complete data');
assert(getEl('finalBlock').style.display === 'block', 'final report block shown');
assert(getEl('finalOut').value.includes('MAPE'), 'final report has MAPE');
assert(getEl('finalOut').value.includes('"analysis_ready": true'), 'в отчёте флаг готовности анализа');
assert(getEl('finalOut').value.includes('"gates_passed": true'), 'на полных данных гейты проходят');
assert(getEl('finalOut').value.includes('evaluation/2'), 'в отчёте описана схема оценки evaluation/2');
assert(getEl('finalOut').value.includes('"evaluations"'), 'оценки ИИ попадают в сводку отчёта');
assert(getEl('finalOut').value.includes('Обучение и вовлечённость куратора влияют на маржу через потери'), 'в отчёте объяснено влияние куратора');
assert(store['darkstore_profit_live_v5'].includes('finalReport'), 'final report persisted');

// --- интерфейс: у каждого обязательного поля недели должен быть контрол в форме ---
const REQUIRED_CONTROLS = {
  1: ['zonesCount','ordersPerZoneDay','cost','marginPct','courierCost','kL','kA','kT','kE','kC','curatorThreshold','curatorPenaltyPct',
      'lateness','appeals','tmc','exits','curatorProcess','curatorAutonomy','curatorKpi','curatorTraining','curatorInvolvement'],
  2: ['zoneOrders2','zoneCouriers2','lateness2','appeals2','exits2','cost2','curatorProcess2','curatorAutonomy2','curatorKpi2','curatorTraining2','curatorInvolvement2'],
  3: ['lateness3','appeals3','exits3','tmc3','cost3','curatorProcess3','curatorAutonomy3','curatorKpi3','curatorTraining3','curatorInvolvement3'],
  4: ['lateness4','appeals4','exits4','tmc4','cost4','curatorProcess4','curatorAutonomy4','curatorKpi4','curatorTraining4','curatorInvolvement4'],
  5: ['lateness5','appeals5','tmc5','exits5','cost5','curatorProcess5','curatorAutonomy5','curatorKpi5','curatorTraining5','curatorInvolvement5'],
  6: ['lateness6','appeals6','tmc6','exits6','cost6','curatorProcess6','curatorAutonomy6','curatorKpi6','curatorTraining6','curatorInvolvement6']
};
for (let w = 1; w <= 6; w++) {
  t.setWeek(w);
  t.render(true);
  const formHtml = getEl('questions').innerHTML;
  const missing = REQUIRED_CONTROLS[w].filter(id => formHtml.indexOf('data-id="' + id + '"') === -1);
  assert(missing.length === 0, 'неделя ' + w + ': у всех обязательных полей есть контрол в форме (нет: ' + (missing.join(', ') || '—') + ')');
  assert(formHtml.indexOf('confirmWeekBtn') !== -1, 'неделя ' + w + ': есть кнопка подтверждения значений');
  assert(formHtml.indexOf('Полнота данных') !== -1, 'неделя ' + w + ': видна карточка полноты данных');
}

// ---------- инкремент 8: таблица зизов, комментарий куратора ----------
t.setWeek(1);
t.render(true);
const w1html = getEl('questions').innerHTML;
assert(w1html.indexOf('zoneTableWrap') !== -1, 'неделя 1: есть контейнер таблицы зизов');
assert(w1html.indexOf('addZoneBtn') !== -1, 'неделя 1: есть кнопка «+ Добавить Зис»');
assert(w1html.indexOf('Тарифы по Зисам') !== -1, 'неделя 1: карточка «Тарифы по Зисам»');
assert(w1html.indexOf('100–180') !== -1, 'неделя 1: указан утверждённый диапазон ставки 100–180 ₽');
assert(w1html.indexOf('Используется, если таблица Зисов пуста') !== -1, 'неделя 1: слайдеры количества помечены как запасные');
assert(w1html.indexOf('curatorNotes1') !== -1, 'неделя 1: комментарий куратора по выходам (свой id)');

t.setWeek(2);
t.render(true);
assert(getEl('questions').innerHTML.indexOf('curatorNotes2') !== -1, 'неделя 2: комментарий куратора по выходам');
t.setWeek(3);
t.render(true);
assert(getEl('questions').innerHTML.indexOf('curatorNotes3') !== -1, 'неделя 3: комментарий куратора по выходам');
t.setWeek(4);
t.render(true);
assert(getEl('questions').innerHTML.indexOf('curatorNotes4') !== -1, 'неделя 4: комментарий куратора по выходам');
t.setWeek(5);
t.render(true);
assert(getEl('questions').innerHTML.indexOf('curatorNotes5') !== -1, 'неделя 5: комментарий куратора по выходам');
t.setWeek(6);
t.render(true);
assert(getEl('questions').innerHTML.indexOf('curatorNotes6') !== -1, 'неделя 6: комментарий куратора по выходам');

// --- предзаполнение таблицы Зисов из калибровки (шаг 4 плана) ---
t.buildState({
  1: {
    zonesCount: '6', ordersPerZoneDay: '220', cost: '1050', marginPct: '13', courierCost: '150',
    kL: '0.5', kA: '0.7', kT: '1', kE: '0.3', kC: '1', curatorThreshold: '90', curatorPenaltyPct: '5',
    lateness: '7', appeals: '5', tmc: '100', exits: '95',
    curatorProcess: '90', curatorAutonomy: '90', curatorKpi: '90', curatorTraining: '90', curatorInvolvement: '90'
  }
});
t.setWeek(1);
t.render(true);
t.prefillZones();
const zPref = t.state.weeks['1'].zones;
assert(Array.isArray(zPref) && zPref.length === 6, 'предзаполнение создало 6 Зисов по калибровке (got ' + (zPref && zPref.length) + ')');
assert(zPref.every(z => z.orders === 220 && z.rate === 150), 'в строках заказы 220 и ставка 150 из калибровки');
assert(t.profitForWeek(1).Q === 1320, 'объём из таблицы Зисов = 6 × 220 = 1320 (got ' + t.profitForWeek(1).Q + ')');
assert(t.profitForWeek(1).rate === 150, 'средневзвешенная ставка = 150 ₽ (got ' + t.profitForWeek(1).rate + ')');
assert(getEl('aiApplyStatus').textContent.indexOf('заполнена по калибровке') !== -1, 'статус сообщает о предзаполнении');

console.log('\nDONE');