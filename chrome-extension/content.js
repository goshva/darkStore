/* content.js — внедряется в darkStoreBB (file:// и http://).
   Предоставляет window.darkstoreBridge.* для кнопки «Superset» в index.html. */

(function () {
  'use strict';
  // window.darkstoreBridge определён в injected-скрипте (ds_bridge.js)
  // Здесь — обработчики chrome.runtime для связи с popup'ом

  function respond(sender, msg) {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try { chrome.runtime.sendMessage({ type: 'DARKSTORE_CONTENT_RESPONSE', from: location.href, payload: msg }); } catch (e) {}
    }
  }

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      if (!msg || !msg.type) return;
      if (msg.type === 'DARKSTORE_APPLY_PATCH') {
        // Применяет патч в форму darkStoreBB
        if (typeof window._dsApplyPatch === 'function') {
          var res = window._dsApplyPatch(msg.patch);
          sendResponse(res);
        } else {
          sendResponse({ error: 'darkStoreBB не найден на странице (window._dsApplyPatch отсутствует)' });
        }
        return true;
      }
      if (msg.type === 'DARKSTORE_GET_SNAPSHOT') {
        // Возвращает последний снапшот из localStorage
        var snap = null;
        try { var raw = localStorage.getItem('darkstore_superset_snap'); if (raw) snap = JSON.parse(raw); } catch (e) {}
        sendResponse({ snapshot: snap });
        return true;
      }
    });
  }

  // Инжектим кнопку в UI index.html при готовности
  function injectButton() {
    if (document.getElementById('dsSupersetBtn')) return;
    var sticky = document.querySelector('.sticky');
    if (!sticky) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'dsSupersetBtn';
    btn.className = 'secondary';
    btn.style.cssText = 'background:#0b8a4b;color:#fff;border-color:#0b8a4b;';
    btn.textContent = 'Superset';
    btn.title = 'Загрузить данные из Superset (нужна открытая вкладка superset.svc.vkusvill.ru)';
    btn.addEventListener('click', function () {
      // Отправляем сообщение popup'у через background
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        btn.textContent = '…';
        chrome.runtime.sendMessage({ type: 'DARKSTORE_OPEN_POPUP' }, function () { btn.textContent = 'Superset'; });
      } else {
        // Если расширения нет — просто показываем инструкцию
        alert('Для работы с Superset установите расширение DarkStore Superset Bridge.\n\nРучной вариант: node ds_snapshot.cjs 7745 > snap.json\nи импортируйте snap.json на странице.');
      }
    });
    sticky.insertBefore(btn, sticky.firstChild);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectButton);
  } else {
    injectButton();
  }
})();
