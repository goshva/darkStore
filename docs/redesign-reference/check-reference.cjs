// check-reference.cjs — приёмочный чекер HTML-эталона (docs/redesign-reference/index.html)
// Сравнивает кандидата с рабочим index.html: ID, обработчики, динамические контейнеры, DEMO-маркировка.
//
// Запуск:  node docs/redesign-reference/check-reference.cjs [путь-к-эталону]
// По умолчанию проверяется docs/redesign-reference/index.html.
// Код возврата 1, если есть провалы.
//
// Только читает файлы. Ничего не меняет.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'index.html');
const REF = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, 'index.html');

let failures = 0;
function check(cond, msg, extra) {
  if (cond) console.log('  ok: ' + msg);
  else { console.error('  FAIL: ' + msg + (extra ? ' — ' + extra : '')); failures++; }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }
function readIds(html) {
  const out = [];
  const re = /<[a-zA-Z0-9]+[^>]*?\bid="([A-Za-z0-9_\-]+)"/g;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

if (!fs.existsSync(APP)) { console.error('Не найден рабочий index.html: ' + APP); process.exit(1); }
if (!fs.existsSync(REF)) {
  console.error('Нет файла эталона: ' + REF);
  console.error('Stage 0.5 не выполнен: HTML-эталон отсутствует, сравнивать не с чем.');
  process.exit(1);
}

const app = fs.readFileSync(APP, 'utf8');
const ref = fs.readFileSync(REF, 'utf8');
const appIds = readIds(app);
const refIds = readIds(ref);
const script = app.slice(app.indexOf('<script>'), app.lastIndexOf('</script>'));

// ID, которые логика создаёт сама (их не должно быть в разметке эталона как статика)
const DYNAMIC_IDS = ['profitBlock', 'zoneTableWrap', 'zoneSummary', 'addZoneBtn', 'prefillZonesBtn', 'confirmWeekBtn'];
// ID из разметки приложения, которые обязаны существовать в эталоне
const required = [...new Set(appIds)].filter(id => DYNAMIC_IDS.indexOf(id) === -1);
// Контейнеры, которые заполняет скрипт
const FILLED = ['weeks', 'questions', 'charts', 'result', 'aiReport', 'promptOut', 'finalOut', 'benchmarkForm', 'liveBreakdown', 'liveContrib'];

console.log('Приложение: ' + APP);
console.log('Эталон:     ' + REF);

section('1. Обязательные ID (по одному разу)');
const missing = [], dup = [];
required.forEach(function (id) {
  const n = refIds.filter(x => x === id).length;
  if (n === 0) missing.push(id);
  else if (n > 1) dup.push(id + ' ×' + n);
});
check(missing.length === 0, 'все обязательные ID есть (' + required.length + ')', 'нет: ' + missing.join(', '));
check(dup.length === 0, 'нет дублей ID', dup.join(', '));

section('2. Динамические ID не объявлены статикой');
const staticallyDeclared = DYNAMIC_IDS.filter(id => refIds.indexOf(id) !== -1);
check(staticallyDeclared.length === 0, 'динамические ID создаёт скрипт, а не разметка', staticallyDeclared.join(', '));

section('3. Обработчики');
const inline = ref.match(/\son[a-z]+="/g) || [];
check(inline.length === 0, 'нет inline-обработчиков (все слушатели вешает скрипт)', inline.join(', '));
const appHandlers = [...app.matchAll(/getElementById\('([A-Za-z0-9_\-]+)'\)\.addEventListener\('([a-z]+)'/g)].map(m => m[1] + ':' + m[2]);
const refMissingHandlers = appHandlers.filter(function (h) {
  const id = h.split(':')[0];
  return refIds.indexOf(id) === -1;
});
check(refMissingHandlers.length === 0, 'все элементы с обработчиками присутствуют (' + appHandlers.length + ')', refMissingHandlers.join(', '));

section('4. Динамические контейнеры и DEMO-маркировка');
const demoCount = (ref.match(/DEMO/g) || []).length;
check(demoCount > 0, 'демо-значения помечены словом DEMO (найдено ' + demoCount + ')');
// Контрактные data-атрибуты приложения не должны попадать в демо-разметку:
// иначе при переносе макета в index.html демо-поля станут «настоящими» и перепутают состояние.
const contracts = ref.match(/\sdata-(id|week|group|weight|delta|ziz|zfield|bm-value|bm-source|bm-date|q)="/g) || [];
check(contracts.length === 0, 'в макете нет контрактных data-атрибутов приложения', contracts.join(', '));
FILLED.forEach(function (id) {
  const open = new RegExp('<(\\w+)[^>]*id="' + id + '"', 'm').exec(ref);
  if (!open) return;
  const tag = open[1];
  const m = new RegExp('id="' + id + '"[^>]*>([\\s\\S]*?)</' + tag + '>', 'm').exec(ref);
  if (!m) return;
  const inner = m[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!inner) return;
  check(/DEMO/.test(inner), '#' + id + ': непустое содержимое помечено DEMO', inner.slice(0, 70));
});

section('5. Каркас и мобильные ограничения');
check(/<form[^>]*id="survey"/.test(ref), 'сохранена форма #survey (обёртка вопросов)');
check(/class="[^"]*sticky/.test(ref), 'сохранена нижняя панель .sticky');
check(/class="[^"]*chart-wrap/.test(ref), 'сохранён скролл-контейнер графиков');
check(/viewport/.test(ref), 'есть meta viewport');
// Шрифты <12px: у утверждённого дизайна плотные таблицы набраны 9–11px.
// Приложение (ds_mobilecheck) требует ≥12px, поэтому это предупреждение, а не провал.
const smallFonts = (ref.match(/font-size:\s*(9|10|11)px/g) || []);
if (smallFonts.length) {
  console.log('  warn: шрифтов меньше 12px — ' + smallFonts.length + ' шт. (' + [...new Set(smallFonts)].join(', ') + ')');
  console.log('        утверждённый дизайн использует 9–11px; ds_mobilecheck приложения требует ≥12px — нужно решение дизайнера (см. отчёт, риски)');
} else {
  console.log('  ok: нет шрифтов меньше 12px');
}

section('6. Что скрипт приложения ожидает найти');
const usedIds = [...new Set([...script.matchAll(/getElementById\('([A-Za-z0-9_\-]+)'\)/g)].map(m => m[1]))];
const appOnly = usedIds.filter(id => DYNAMIC_IDS.indexOf(id) === -1 && refIds.indexOf(id) === -1);
check(appOnly.length === 0, 'скрипт найдёт все элементы, которые запрашивает', appOnly.join(', '));

console.log('\n' + (failures ? 'ПРОВАЛЕНО проверок: ' + failures : 'ЭТАЛОН ПРОШЁЛ ПРИЁМКУ'));
process.exit(failures ? 1 : 0);
