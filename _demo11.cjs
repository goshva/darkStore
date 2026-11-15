// Временная демонстрация новых блоков на данных проекта (удаляется)
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
let js = m[1];
const idx = js.lastIndexOf('})();');
js = js.slice(0, idx) + '\n  globalThis.__t = { buildFinalReport: buildFinalReport, buildPrompt: buildPrompt, state: state, buildState: function (w) { state.weeks = w; }, setWeek: function (x) { currentWeek = x; }, profitForWeek: profitForWeek, metricJumps: metricJumps, lossWeights: lossWeightsCheck };\n' + js.slice(idx);
const store = {};
const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
const t = new Function('document', 'window', 'navigator', 'localStorage', 'confirm', js + '\nreturn globalThis.__t;')({ addEventListener() {}, getElementById() { return null; } }, { scrollTo() {} }, {}, localStorage, () => true);

const K = { process: 100, autonomy: 0, kpi: 100, training: 0, involvement: 0 }; // даёт min 0 и индекс ~40, как в отчёте Н1
const S = {
  1: {
    zonesCount: '9', ordersPerZoneDay: '210', cost: '1050', marginPct: '13', courierCost: '100',
    kL: '5', kA: '5', kT: '3.6', kE: '5', kC: '2', curatorThreshold: '57', curatorPenaltyPct: '5',
    lateness: '16.5', appeals: '15.5', tmc: '32', exits: '49',
    curatorProcess: '100', curatorAutonomy: '0', curatorKpi: '100', curatorTraining: '0', curatorInvolvement: '0',
    curatorNotes1: 'Иванов 2зз'
  },
  2: { zoneOrders2: 238, zoneCouriers2: 5, lateness2: 18, appeals2: 30, exits2: 76, cost2: 110, tmc2: 76,
       curatorAutonomy2: 43, curatorKpi2: 43, curatorTraining2: 100, curatorInvolvement2: 100, curatorNotes2: 'Зисы перезапущены' },
  3: { lateness3: 11.5, appeals3: 9, exits3: 97, tmc3: 88, cost3: 110,
       curatorAutonomy3: 43, curatorKpi3: 43, curatorTraining3: 100, curatorInvolvement3: 100 },
  4: { lateness4: 6.5, appeals4: 7.5, exits4: 80, tmc4: 90, cost4: 110,
       curatorAutonomy4: 43, curatorKpi4: 43, curatorTraining4: 100, curatorInvolvement4: 100, curatorNotes4: 'Снял Курапов\nИванову за обращение' },
  5: { lateness5: 5.5, appeals5: 4, tmc5: 86, exits5: 100, cost5: 110,
       curatorAutonomy5: 43, curatorKpi5: 100, curatorTraining5: 100, curatorInvolvement5: 100, curatorNotes5: 'наказания в пуле' },
  6: { lateness6: 30, appeals6: 4.5, tmc6: 100, exits6: 100, cost6: 110,
       curatorAutonomy6: 43, curatorKpi6: 100, curatorTraining6: 100, curatorInvolvement6: 100 }
};
t.buildState(S);
t.setWeek(6);

const rep = t.buildFinalReport().split('\n');
function block(start, end) {
  const a = rep.findIndex(l => l.startsWith(start));
  const b = rep.findIndex((l, i) => i > a && l.startsWith(end));
  return rep.slice(a, b).join('\n');
}
console.log('=== 4.3 ПРОВЕРКА КАЛИБРОВКИ И ДАННЫХ ===');
console.log(block('## 4.3.', '## 4.4.'));
console.log('\n=== 4.4 ЧТО ДЕРЖИМ ===');
console.log(block('## 4.4.', '## 5.'));
console.log('\n=== ПРОМПТ 4.3–4.5 ===');
const pr = t.buildPrompt(6).split('\n');
const a = pr.findIndex(l => l.startsWith('### 4.3.'));
const b = pr.findIndex(l => l.startsWith('## 6.'));
console.log(pr.slice(a, b).join('\n'));
const s = JSON.parse(t.buildFinalReport().slice(t.buildFinalReport().indexOf('{\n  "model_version"'), t.buildFinalReport().indexOf('\n\n## 7.')));
console.log('\n=== СВОДКА ===');
console.log(JSON.stringify({ loss_weights_check: s.loss_weights_check, metric_jumps: s.metric_jumps, fill_plan: s.fill_plan, keep_targets: s.keep_targets }, null, 1));
