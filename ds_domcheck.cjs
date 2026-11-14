const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) throw new Error('no <script> block');
const js = m[1];

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
const fn = new Function('document', 'window', 'navigator', 'localStorage', 'confirm', js + '\nreturn null;');
fn(document, window, navigator, localStorage, () => true);

function assert(cond, msg) { if (!cond) { console.error('FAIL: ' + msg); process.exitCode = 1; } else { console.log('ok: ' + msg); } }

(document.handlers.DOMContentLoaded || []).forEach(f => f());
assert(getEl('promptOut').value.includes('# ЗАПРОС К ИИ'), 'page rendered and prompt built');
assert(getEl('promptWeek').textContent === '1', 'prompt shows week 1');
assert(getEl('aiApplyStatus').textContent.length > 0, 'status initialised');
assert(getEl('liveBreakdown').innerHTML.includes('Заполненность'), 'legend shows fill component');
assert(getEl('liveBreakdown').innerHTML.includes('Прибыль к baseline'), 'legend shows profit component');
assert(getEl('liveBreakdown').innerHTML.includes('топ-5'), 'legend explains the bars');

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
assert(JSON.parse(store['darkstore_profit_live_v4']).weeks['2'].zoneOrders2 === 220, 'answer persisted into week 2');

getEl('finalBtn').click();
assert(getEl('finalOut').value.includes('# ИТОГОВЫЙ ОТЧЁТ'), 'final report rendered');
assert(getEl('finalBlock').style.display === 'block', 'final report block shown');
assert(getEl('finalOut').value.includes('MAPE'), 'final report has MAPE');
assert(store['darkstore_profit_live_v4'].includes('finalReport'), 'final report persisted');

getEl('aiJsonIn').value = '{"strategy_name": "x"}';
getEl('applyAiBtn').click();
assert(getEl('aiApplyStatus').style.color === '#b42318', 'invalid answer rejected in red');
assert(getEl('promptWeek').textContent === '2', 'invalid answer does not move the week');

getEl('copyPromptBtn').click();
getEl('exportBtn').click();
assert(getEl('aiApplyStatus').textContent.includes('Экспорт готов'), 'export JSON reports success');

console.log('\nDONE');