const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const store = {};
const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };

const els = {};
function makeEl(id) {
  return {
    id, value: '', innerHTML: '', textContent: '', className: '', style: {}, handlers: {}, files: null,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); },
    click() { (this.handlers.click || []).forEach(f => f.call(this)); },
    querySelectorAll() { return []; }, querySelector() { return null; },
    select() {}, closest() { return null; }, scrollIntoView() {}, appendChild() {}, remove() {},
    getAttribute() { return null; }, setAttribute() {}
  };
}
function getEl(id) { if (!els[id]) els[id] = makeEl(id); return els[id]; }
const document = {
  body: { appendChild() {} }, handlers: {}, activeElement: null,
  addEventListener(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); },
  getElementById: getEl, querySelectorAll() { return []; }, querySelector() { return null; },
  createElement: id => makeEl('created:' + id), execCommand() { return true; }
};

const weeks = {
  1: { zonesCount: 6, ordersPerZoneDay: 220, marginPct: 25, courierCost: 150, lateness: 9, appeals: 8, tmc: 80, exits: 88, curatorProcess: 60, curatorAutonomy: 55, curatorKpi: 50, zoneOrders: 260, zoneCouriers: 6, done: ['диагностика ДС'] },
  2: { lateness2: 8, appeals2: 7, exits2: 91, tmc2: 90, zoneOrders2: 240, zoneCouriers2: 5 },
  3: { lateness3: 6, appeals3: 4, exits3: 93, tmc3: 95, cost3: 160 }
};
store['darkstore_profit_live_v5'] = JSON.stringify({ weeks, currentWeek: 1 });

const fn = new Function('document', 'window', 'navigator', 'localStorage', 'confirm', js + '\nreturn null;');
fn(document, { scrollTo() {} }, {}, localStorage, () => true);
(document.handlers.DOMContentLoaded || []).forEach(f => f());

function assert(cond, msg) { if (!cond) { console.error('FAIL: ' + msg); process.exitCode = 1; } else { console.log('ok: ' + msg); } }

const out = getEl('charts').innerHTML;
assert(out.includes('Прибыль в день, ₽'), 'profit bar chart rendered');
assert(out.includes('Из чего состоят потери'), 'stacked loss chart rendered');
assert(out.includes('Матрица статусов'), 'status matrix rendered');
assert((out.match(/viewBox="0 0 360 172"/g) || []).length === 7, 'seven charts have the new viewBox');
assert((out.match(/<tr>/g) || []).length === 8, 'matrix has header + 7 metric rows');
assert(out.includes('m-cell na'), 'matrix marks missing weeks as "—"');
assert(out.includes('chart-legend'), 'stacked chart has a legend');
assert(out.includes('opacity="0.08"'), 'target band drawn on metric charts');
assert(out.includes('stroke-dasharray="4 4"'), 'baseline/target dashed line drawn');
assert(out.includes('<title>'), 'tooltips present');
assert(out.includes('нет данных') || out.includes('нет<'), 'missing weeks marked');

const nums = [];
const re = /(?:^|[\s"])(y|y1|y2|cy)="(-?\d+(?:\.\d+)?)"/g;
let m;
while ((m = re.exec(out))) nums.push(parseFloat(m[2]));
assert(nums.length > 20, 'found chart coordinates (' + nums.length + ')');
const bad = nums.filter(v => v < -1 || v > 173);
assert(bad.length === 0, 'all points inside viewBox (offenders: ' + bad.slice(0, 5).join(', ') + ')');
assert(out.includes('fill="#f79009"'), 'lateness 9% point coloured amber (out of target)');
assert(out.includes('fill="#0b8a4b"'), 'green points present for in-target values');
assert(out.includes('#b42318" opacity="0.85"') || out.includes('#0b8a4b" opacity="0.85"'), 'profit bars drawn with status colour');

console.log('\nDONE');