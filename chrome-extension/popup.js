/* popup.js — интерфейс расширения: загрузка из Superset, предпросмотр, вставка в darkStoreBB, скачивание JSON. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var shopInput = $('shopno'), periodSel = $('period'), dateInput = $('date'), dateRow = $('dateRow');
  var pullBtn = $('pullBtn'), applyBtn = $('applyBtn'), jsonBtn = $('jsonBtn');
  var preview = $('preview'), status = $('status'), tabHint = $('tabHint');
  var current = null;   // {snapshot, mapped}

  periodSel.addEventListener('change', function () {
    dateRow.style.display = periodSel.value === 'custom' ? 'flex' : 'none';
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

  pullBtn.addEventListener('click', function () {
    pullBtn.disabled = true; pullBtn.textContent = '⋯ Загрузка…';
    status.hidden = true;
    var p = periodSel.value;
    var opts = { shopno: shopInput.value.trim() || null, days: parseInt(p, 10) || 0 };
    if (p === 'yesterday') opts.date = yesterdayISO();
    else if (p === 'today') opts.date = iso(new Date());
    else if (p === 'custom') { opts.date = dateInput.value.trim(); if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.date)) { fail('Дата в формате YYYY-MM-DD'); return; } }

    function fail(msg) { setStatus(msg, false); pullBtn.disabled = false; pullBtn.textContent = '1 · Загрузить данные'; }

    chrome.runtime.sendMessage({ type: 'DARKSTORE_PULL', opts: opts }, function (resp) {
      pullBtn.disabled = false; pullBtn.textContent = '1 · Загрузить данные';
      if (chrome.runtime.lastError) return fail(chrome.runtime.lastError.message);
      if (!resp || !resp.ok) return fail((resp && resp.error) || 'пустой ответ');
      current = resp.result;
      renderPreview(current);
      applyBtn.style.display = jsonBtn.style.display = 'block';
      setStatus('Данные загружены (' + current.snapshot.shopno + ', ' + current.snapshot.date + ').', true);
    });
  });

  applyBtn.addEventListener('click', function () {
    if (!current) return;
    chrome.runtime.sendMessage({ type: 'DARKSTORE_APPLY_TO_PAGE', patch: current.mapped.patch, notes: current.mapped.notes }, function (resp) {
      if (chrome.runtime.lastError) return setStatus(chrome.runtime.lastError.message, false);
      if (!resp || !resp.ok) return setStatus((resp && resp.error) || 'Ошибка вставки', false);
      setStatus('Патч применён в форме: ' + JSON.stringify(current.mapped.patch), true);
    });
  });

  jsonBtn.addEventListener('click', function () {
    if (!current) return;
    var blob = new Blob([JSON.stringify(current, null, 2)], { type: 'application/json;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ds_superset_' + (current.snapshot.shopno || 'all') + '_' + current.snapshot.date + '.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
  });

  chrome.runtime.sendMessage({ type: 'DARKSTORE_TABS' }, function (r) {
    if (!r || r.superset) return;
    tabHint.textContent = 'Вкладка Superset не открыта — откройте дашборд services_lite.';
  });
})();
