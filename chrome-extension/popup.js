/* popup.js — логика popup'а расширения DarkStore Superset Bridge. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var shopInput = $('shopno'), periodSel = $('period'), dateInput = $('date'), dateRow = $('dateRow');
  var weeksN = $('weeksN'), weeksRow = $('weeksRow');
  var pullBtn = $('pullBtn'), applyBtn = $('applyBtn'), jsonBtn = $('jsonBtn'), chartBtn = $('chartBtn');
  var preview = $('preview'), status = $('status'), tabHint = $('tabHint');
  var progressBox = $('progress'), pbarFill = $('pbarFill'), ptext = $('ptext');

  var currentResult = null;   // { snapshot, mapped, range }
  var historyResults = null;  // для режима «6 недель»: [{snapshot, mapped}, ...]
  var isDirty = false;

  /* ---------- прогресс выгрузки ---------- */
  var progStart = 0, progLastDone = 0, progTimer = null;

  function fmtLeft(sec) {
    if (sec < 60) return Math.max(1, Math.round(sec)) + ' с';
    var m = Math.floor(sec / 60), s = Math.round(sec % 60);
    return m + ' мин' + (s ? ' ' + s + ' с' : '');
  }

  function showProgress(done, total, date) {
    if (!total) return;
    progressBox.hidden = false;
    var pct = Math.min(100, Math.round(done / total * 100));
    pbarFill.style.width = pct + '%';
    var line = 'Загружено ' + done + ' из ' + total + ' дней (' + pct + '%)';
    if (date) line += '\nсейчас: ' + date;
    if (done > 0 && progStart) {
      var perDay = (Date.now() - progStart) / done;
      line += '\nосталось ~' + fmtLeft((total - done) * perDay / 1000);
    }
    ptext.textContent = line;
    // если сообщения о прогрессе замолчали (вкладка popup жива, background ждёт fetch) — тикаем сами по последней оценке
    progLastDone = done;
  }

  function resetProgress() {
    progStart = Date.now();
    progressBox.hidden = false;
    pbarFill.style.width = '0%';
    ptext.textContent = 'старт… 0%' + (periodSel.value === '6w' ? ' (42 дня)' : '');
  }

  function hideProgress() {
    if (progTimer) { clearInterval(progTimer); progTimer = null; }
    progressBox.hidden = true;
  }

  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg && msg.type === 'DARKSTORE_PROGRESS') showProgress(msg.done, msg.total, msg.date);
  });

  periodSel.addEventListener('change', function () {
    dateRow.style.display = periodSel.value === 'custom' ? 'flex' : 'none';
    weeksRow.style.display = periodSel.value === '6w' ? 'flex' : 'none';
  });

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function yesterdayISO() { var d = new Date(); d.setDate(d.getDate() - 1); return iso(d); }

  function setStatus(text, ok) {
    status.textContent = text;
    status.className = 'status ' + (ok ? 'ok' : 'err');
    status.hidden = false;
  }

  function fmtMoney(v) { return v == null ? '—' : Number(v).toLocaleString('ru-RU'); }

  function renderPreview(r) {
    var s = r.snapshot, m = r.mapped || {};
    var html = '<table class="kv">' +
      '<tr><td>Дата</td><td>' + s.date + '</td></tr>' +
      '<tr><td>Заказов/день</td><td>' + (s.orders_per_day == null ? '—' : s.orders_per_day) + '</td></tr>' +
      '<tr><td>Отказы</td><td>' + s.qty_orders_declined + ' (' + (s.decline_rate_pct == null ? '—' : s.decline_rate_pct + '%') + ')</td></tr>' +
      '<tr><td>Средний чек</td><td>' + fmtMoney(s.avg_check_rub) + ' ₽</td></tr>' +
      '<tr><td>Выручка</td><td>' + fmtMoney(s.revenue_rub) + ' ₽</td></tr>' +
      '<tr><td>Вне слота</td><td>' + (s.share_not_in_slot_pct == null ? '—' : s.share_not_in_slot_pct + '%') + '</td></tr>' +
      '</table>';
    if (m.notes && m.notes.length) {
      html += '<div style="margin-top:8px;font-size:12px;color:#667085">' + m.notes.map(function (n) { return '• ' + n; }).join('<br>') + '</div>';
    }
    preview.innerHTML = html;
  }

  function renderHistoryPreview(results) {
    var html = '<div style="font-size:12px;color:#667085;margin-bottom:4px;">Загружено дней: ' + results.length + '</div>';
    html += '<table class="kv">';
    results.forEach(function (r) {
      var s = r.snapshot;
      html += '<tr><td>' + s.date + '</td><td>' + (s.orders_per_day || '—') + ' заказ | ' + fmtMoney(s.avg_check_rub) + ' ₽ чек</td></tr>';
    });
    html += '</table>';
    preview.innerHTML = html;
  }

  pullBtn.addEventListener('click', function () {
    pullBtn.disabled = true; pullBtn.textContent = '⋯ Загрузка…';
    status.hidden = true;
    var p = periodSel.value;
    var opts = { shopno: shopInput.value.trim() || null, days: parseInt(p, 10) || 0 };
    if (p === 'yesterday') opts.date = yesterdayISO();
    else if (p === 'today') opts.date = iso(new Date());
    else if (p === 'custom') { opts.date = dateInput.value.trim(); if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.date)) { fail('Дата в формате YYYY-MM-DD'); return; } }
    else if (p === '6w') { opts.weeks = parseInt(weeksN.value, 10) || 6; resetProgress(); }

    function fail(msg) { setStatus(msg, false); pullBtn.disabled = false; pullBtn.textContent = '1 · Загрузить данные'; hideProgress(); }

    chrome.runtime.sendMessage({ type: 'DARKSTORE_PULL', opts: opts }, function (resp) {
      pullBtn.disabled = false; pullBtn.textContent = '1 · Загрузить данные';
      hideProgress();
      if (chrome.runtime.lastError) return fail(chrome.runtime.lastError.message);

      // Режим «6 недель»
      if (p === '6w' && resp && resp.result && resp.result.snaps) {
        historyResults = resp.result.snaps;
        pbarFill.style.width = '100%';
        renderHistoryPreview(historyResults);
        applyBtn.style.display = 'none';
        jsonBtn.style.display = 'block';
        chartBtn.style.display = 'block';
        setStatus('✓ Загружено ' + historyResults.length + ' дней (6 недель). Скачайте JSON или покажите на графиках.', true);
        return;
      }

      if (!resp || !resp.ok) return fail((resp && resp.error) || 'пустой ответ');
      currentResult = resp.result;
      renderPreview(currentResult);
      applyBtn.style.display = jsonBtn.style.display = 'block';
      chartBtn.style.display = 'none';
      setStatus('Данные загружены (' + currentResult.snapshot.shopno + ', ' + currentResult.snapshot.date + ').', true);
    });
  });

  applyBtn.addEventListener('click', function () {
    if (!currentResult) return;
    chrome.runtime.sendMessage({ type: 'DARKSTORE_APPLY_TO_PAGE', patch: currentResult.mapped.patch, notes: currentResult.mapped.notes }, function (resp) {
      if (chrome.runtime.lastError) return setStatus(chrome.runtime.lastError.message, false);
      if (!resp || !resp.ok) return setStatus((resp && resp.error) || 'Ошибка вставки', false);
      setStatus('Патч применён в форме: ' + JSON.stringify(currentResult.mapped.patch), true);
    });
  });

  jsonBtn.addEventListener('click', function () {
    var data = historyResults || [currentResult];
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    var a = document.createElement('a');
    var name = historyResults
      ? 'ds_superset_6weeks_' + shopInput.value.trim() + '.json'
      : 'ds_superset_' + (currentResult.snapshot.shopno || 'all') + '_' + currentResult.snapshot.date + '.json';
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
  });

  chartBtn.addEventListener('click', function () {
    if (!historyResults || historyResults.length === 0) return;
    // Сохраняем все снапшоты и шлём на darkStoreBB для отрисовки фактов на графиках
    chrome.runtime.sendMessage({
      type: 'DARKSTORE_FACTS',
      patch: historyResults[0].mapped.patch,
      notes: historyResults.map(function (r) { return r.snapshot.date + ': ' + r.snapshot.orders_per_day + ' заказ'; }).join(', '),
      snaps: historyResults.map(function (r) { return r.snapshot; })
    }, function (resp) {
      if (chrome.runtime.lastError) return setStatus(chrome.runtime.lastError.message, false);
      if (!resp || !resp.ok) return setStatus((resp && resp.error) || 'Ошибка вставки', false);
      setStatus('✓ Факты нанесены на графики. Обновите страницу (F5), чтобы увидеть пунктир.', true);
    });
  });

  chrome.runtime.sendMessage({ type: 'DARKSTORE_TABS' }, function (r) {
    if (!r || r.superset) return;
    tabHint.textContent = 'Вкладка Superset не открыта — откройте дашборд services_lite.';
  });
})();
