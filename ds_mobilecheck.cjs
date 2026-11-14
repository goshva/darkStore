// Mobile audit (v2) for the darkstore survey: layout, tap targets, input behaviour, screenshots.
// Chrome DevTools Protocol via Node's built-in WebSocket/fetch. No dependencies.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = process.argv[2] || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PAGE = process.argv[3] || path.resolve('index.html');
const PORT = 9334;
const OUT = path.resolve('mobile-shots');
const W = Number(process.argv[4] || 390);
const H = Number(process.argv[5] || 844);

fs.mkdirSync(OUT, { recursive: true });
const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-mobile2-'));
const url = 'file:///' + PAGE.replace(/\\/g, '/');

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--allow-file-access-from-files', '--disable-extensions', '--mute-audio',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + userDir,
  '--window-size=' + W + ',' + H, 'about:blank'
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const AUDIT = `(function(){
  var vw = window.innerWidth, vh = window.innerHeight;
  function inScroller(el){
    for (var p = el.parentElement; p; p = p.parentElement) {
      var cs = getComputedStyle(p);
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return p.id || p.className || p.tagName;
    }
    return null;
  }
  var pageOverflow = [], innerScrollers = {};
  Array.prototype.forEach.call(document.querySelectorAll('*'), function(el){
    var r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;
    if (r.right > vw + 1 || r.left < -1) {
      var sc = inScroller(el);
      if (sc) { innerScrollers[sc] = (innerScrollers[sc] || 0) + 1; }
      else pageOverflow.push({tag: el.tagName, id: el.id, cls: String(el.className||'').slice(0,30), left: Math.round(r.left), right: Math.round(r.right)});
    }
  });
  var targets = [];
  Array.prototype.forEach.call(document.querySelectorAll('button, label.opt, label.chk, .mini-btn, .file-btn, input[type=text], textarea, input[type=range], input[type=checkbox], input[type=radio]'), function(el){
    var r = el.getBoundingClientRect();
    if (!r.height) return;
    var wrapped = el.closest && el.closest('label.opt, label.chk');
    if (wrapped && wrapped !== el) return;
    targets.push({tag: el.tagName, id: el.id, cls: String(el.className||'').slice(0,20), h: Math.round(r.height), w: Math.round(r.width)});
  });
  var small = targets.filter(function(t){ return t.h < 40; });
  var tiny = [];
  Array.prototype.forEach.call(document.querySelectorAll('*'), function(el){
    if (!el.textContent || el.children.length) return;
    var fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs && fs < 11.5) tiny.push({cls: String(el.className || el.tagName).slice(0,20), fs: fs, text: el.textContent.trim().slice(0,18)});
  });
  var st = document.querySelector('.sticky');
  var stR = st ? st.getBoundingClientRect() : null;
  var lastCard = document.querySelector('#questions .card:last-of-type');
  var clipped = [];
  Array.prototype.forEach.call(document.querySelectorAll('.hint, .kpi .v, .kpi .name, .reason .sol, .reason .t, .q > .label, .slider-val, td, th, .nm, .v, .chart-title, #liveLegend .score, #liveLegend .status'), function(el){
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
      clipped.push({ cls: String(el.className||el.tagName).slice(0,24), text: el.textContent.trim().slice(0,20), scrollW: el.scrollWidth, clientW: el.clientWidth });
    }
  });
  var svgScale = [];
  Array.prototype.forEach.call(document.querySelectorAll('svg.chart'), function(svg){
    var r = svg.getBoundingClientRect();
    var scale = r.width / 360;
    var t = svg.querySelector('text');
    var usedFs = t ? parseFloat(getComputedStyle(t).fontSize) : null;
    svgScale.push({ w: Math.round(r.width), scale: Math.round(scale*100)/100, axisPx: usedFs ? Math.round(usedFs*10)/10 : null, title: svg.closest('.chart-block') ? svg.closest('.chart-block').querySelector('.chart-title').textContent.trim().slice(0,22) : '' });
  });
  var stickyOverlap = [];
  if (stR) {
    Array.prototype.forEach.call(document.querySelectorAll('button, input, label.opt, label.chk, .mini-btn, .file-btn, textarea'), function(el){
      var r = el.getBoundingClientRect();
      if (!r.height || r.bottom < vh - 400) return;
      if (r.bottom > stR.top + 2 && r.top < stR.bottom) stickyOverlap.push({ tag: el.tagName, id: el.id, cls: String(el.className||'').slice(0,18), bottom: Math.round(r.bottom), stickyTop: Math.round(stR.top) });
    });
  }
  var smallTap = [];
  Array.prototype.forEach.call(document.querySelectorAll('button, .mini-btn, .file-btn, label.opt, label.chk, input[type=text], textarea'), function(el){
    var r = el.getBoundingClientRect();
    if (r.height && r.height < 44) smallTap.push({ tag: el.tagName, id: el.id, cls: String(el.className||'').slice(0,16), h: Math.round(r.height) });
  });
  var minFont = 99, minFontEl = '';
  Array.prototype.forEach.call(document.querySelectorAll('#questions *, #liveLegend *, .sticky *'), function(el){
    if (!el.textContent || el.children.length) return;
    if (el.closest('svg')) return;
    var fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs && fs < minFont) { minFont = fs; minFontEl = String(el.className || el.tagName).slice(0,20); }
  });
  var svgClipped = [];
  Array.prototype.forEach.call(document.querySelectorAll('svg.chart text'), function(t){
    var b = t.getBBox();
    if (b.x < -0.5 || b.x + b.width > 360.5 || b.y < -0.5 || b.y + b.height > 172.5) {
      svgClipped.push({ text: t.textContent.slice(0,10), x: Math.round(b.x), right: Math.round(b.x + b.width), y: Math.round(b.y), bottom: Math.round(b.y + b.height) });
    }
  });
  var labelOverlaps = [];
  Array.prototype.forEach.call(document.querySelectorAll('svg.chart'), function(svg){
    var texts = Array.prototype.slice.call(svg.querySelectorAll('text'));
    var boxes = texts.map(function(t){ var b = t.getBBox(); return { t: t.textContent.slice(0,8), x: b.x, y: b.y, w: b.width, h: b.height }; });
    for (var i = 0; i < boxes.length; i++) {
      for (var j = i + 1; j < boxes.length; j++) {
        var a = boxes[i], b2 = boxes[j];
        var ox = Math.min(a.x + a.w, b2.x + b2.w) - Math.max(a.x, b2.x);
        var oy = Math.min(a.y + a.h, b2.y + b2.h) - Math.max(a.y, b2.y);
        if (ox > 2 && oy > 2) labelOverlaps.push({ a: a.t, b: b2.t, ox: Math.round(ox), oy: Math.round(oy) });
      }
    }
  });
  return JSON.stringify({
    vw: vw, vh: vh,
    docScrollWidth: document.documentElement.scrollWidth,
    docScrollHeight: document.documentElement.scrollHeight,
    hasHorizontalOverflow: document.documentElement.scrollWidth > vw + 1,
    pageOverflow: pageOverflow.slice(0, 10),
    innerScrollers: innerScrollers,
    svgClippedCount: svgClipped.length,
    svgClipped: svgClipped.slice(0, 6),
    labelOverlapCount: labelOverlaps.length,
    labelOverlaps: labelOverlaps.slice(0, 6),
    targets: targets.length,
    smallTargets: small.slice(0, 10),
    smallTargetsCount: small.length,
    smallTap: smallTap.slice(0, 10),
    smallTapCount: smallTap.length,
    clippedText: clipped.slice(0, 10),
    clippedTextCount: clipped.length,
    svgScale: svgScale,
    stickyOverlap: stickyOverlap.slice(0, 6),
    minFont: minFont,
    minFontEl: minFontEl,
    tinyFonts: tiny.slice(0, 8),
    counts: {
      ranges: document.querySelectorAll('input[type=range]').length,
      texts: document.querySelectorAll('input[type=text]').length,
      checkboxes: document.querySelectorAll('input[type=checkbox]').length,
      radios: document.querySelectorAll('input[type=radio]').length,
      buttons: document.querySelectorAll('button').length,
      charts: document.querySelectorAll('svg.chart').length,
      matrixRows: document.querySelectorAll('table.matrix tr').length
    },
    sticky: stR ? {top: Math.round(stR.top), height: Math.round(stR.height), width: Math.round(stR.width)} : null,
    bodyPadBottom: getComputedStyle(document.body).paddingBottom,
    lastCardBottom: lastCard ? Math.round(lastCard.getBoundingClientRect().bottom) : null
  });
})()`;

async function targetsList() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/list');
      const list = await r.json();
      const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch (e) {}
    await sleep(250);
  }
  throw new Error('Chrome did not expose a page target');
}

(async () => {
  const target = await targetsList();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map(), events = [];
  let id = 0;
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else if (msg.method) events.push(msg);
  };
  const send = (method, params) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const evaluate = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  const shot = async name => {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    if (r.result && r.result.data) fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.result.data, 'base64'));
  };
  const scrollTo = async src => { await evaluate(`(function(){ var el = ${src}; if (el && el.scrollIntoView) el.scrollIntoView({block:'start'}); return !!el; })()`); await sleep(350); };
  const audit = async () => JSON.parse(await evaluate(AUDIT));

  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true, screenWidth: W, screenHeight: H });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url });
  await sleep(1500);

  const layoutEmpty = await audit();
  await scrollTo('document.getElementById("liveLegend")'); await shot('01-top');
  await scrollTo('document.querySelector("#questions .card")'); await shot('02-form-empty');
  await scrollTo('document.querySelector("input[data-id=\'courierCost\']")'); await shot('03-sliders');

  // --- fill week 1 like a user ---
  const fill = JSON.parse(await evaluate(`(function(){
    function set(id, v){ var el = document.querySelector('input[data-id="'+id+'"]'); if (!el) return false; el.value = v; el.dispatchEvent(new Event('input', {bubbles:true})); return true; }
    var out = { set: [] };
    ['zonesCount:6','ordersPerZoneDay:220','cost:600','marginPct:30','courierCost:150','lateness:9','appeals:8','tmc:80','exits:88','zoneOrders:250','zoneCouriers:5','curatorProcess:60'].forEach(function(pair){ var p = pair.split(':'); if (set(p[0], p[1])) out.set.push(p[0]); });
    var text = document.querySelector('input[data-id="dsName"]'); text.value = 'ДС Тестовый'; text.dispatchEvent(new Event('input', {bubbles:true}));
    document.querySelector('input[data-group="done"]').click();
    document.querySelector('input[data-group="lateCauses"]').click();
    var other = document.querySelector('input[data-id="blocker"][value="другое"]');
    if (other) { other.checked = true; other.dispatchEvent(new Event('change', {bubbles:true})); }
    out.otherVisible = (function(){ var el = document.querySelector('input[data-id="blocker_other"]'); return el ? getComputedStyle(el).display : 'missing'; })();
    var saved = JSON.parse(localStorage.getItem('darkstore_profit_live_v4') || '{}');
    out.saved = { cost: saved.weeks['1'].cost, courierCost: saved.weeks['1'].courierCost, lateness: saved.weeks['1'].lateness, dsName: saved.weeks['1'].dsName, done: saved.weeks['1'].done, blocker: saved.weeks['1'].blocker };
    out.score = document.getElementById('liveScore').textContent;
    out.status = document.getElementById('liveStatus').textContent;
    out.breakdown = document.getElementById('liveBreakdown').textContent;
    return JSON.stringify(out);
  })()`));

  await scrollTo('window.scrollTo(0,0) || document.body'); await shot('04-week1-filled-top');
  await scrollTo('document.getElementById("profitBlock")'); await shot('05-profit');
  await scrollTo('document.getElementById("charts")'); await shot('06-charts');
  await scrollTo('document.querySelector("table.matrix")'); await shot('07-matrix');
  const layoutFilled = await audit();

  // --- week 2: new rate field + plan/fact ---
  await evaluate('document.getElementById("nextBtn").click()');
  await sleep(400);
  const week2 = JSON.parse(await evaluate(`(function(){
    var el = document.querySelector('input[data-id="cost2"]');
    var r = el ? el.getBoundingClientRect() : null;
    return JSON.stringify({ hasCost2: !!el, cost2Value: el ? el.value : null, cost2Width: r ? Math.round(r.width) : 0, hint: document.getElementById('weekHint').textContent });
  })()`));
  await scrollTo('document.querySelector("input[data-id=\'cost2\']")'); await shot('08-week2-rate');

  // --- AI cycle ---
  const ai = JSON.parse(await evaluate(`(function(){
    var answer = { strategy_name: 'Слоты + ТМЦ', actions: [{action:'Ввести слоты 8–20 и закрыть ТМЦ', impact_profit_rub_day: 900, impact_metrics:{lateness:-2, tmc:20}, risk:'low', confidence:0.7}], expected_profit_rub_day: 30000, expected_delta_vs_baseline_pct: 10, data_sources_used:['метрики Н1'], assumptions:['ставка не растёт'], open_questions:[], week_plan:{ courier_cost_rub:160, zone_orders:220, zone_couriers:5 } };
    document.getElementById('aiJsonIn').value = JSON.stringify(answer);
    document.getElementById('applyAiBtn').click();
    return JSON.stringify({ week: document.getElementById('promptWeek').textContent, status: document.getElementById('aiApplyStatus').textContent });
  })()`));
  await sleep(400);
  await scrollTo('document.getElementById("aiJsonIn")'); await shot('09-ai-cycle');

  const finalReport = JSON.parse(await evaluate(`(function(){
    document.getElementById('finalBtn').click();
    var out = document.getElementById('finalOut');
    return JSON.stringify({ len: out.value.length, hasHeader: out.value.indexOf('ИТОГОВЫЙ ОТЧЁТ') !== -1, shown: document.getElementById('finalBlock').style.display });
  })()`));
  await sleep(400);
  await scrollTo('document.getElementById("finalBlock")'); await shot('10-final');

  // --- persistence across week switch ---
  const persist = JSON.parse(await evaluate(`(function(){
    document.getElementById('prevBtn').click(); document.getElementById('prevBtn').click(); document.getElementById('prevBtn').click();
    var el = document.querySelector('input[data-id="cost"]');
    return JSON.stringify({ week: document.getElementById('promptWeek').textContent, costBack: el ? el.value : null, lateness: (document.querySelector('input[data-id="lateness"]')||{}).value });
  })()`));

  const layoutAfter = await audit();
  const errors = events.filter(e => e.method === 'Runtime.exceptionThrown' || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error'))
    .map(e => e.method === 'Runtime.exceptionThrown' ? e.params.exceptionDetails.text : e.params.entry.text);

  console.log(JSON.stringify({ viewport: { W, H }, layoutEmpty, layoutFilled, layoutAfter, fill, week2, ai, finalReport, persist, errors }, null, 1));
  ws.close(); chrome.kill(); process.exit(0);
})().catch(e => { console.error('AUDIT FAILED: ' + e.message); try { chrome.kill(); } catch (_) {} process.exit(1); });