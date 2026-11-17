# DarkStore Superset Bridge

Расширение Chrome (MV3) + CLI для переноса фактических данных даркстора из Superset ВкусВилл
(дашборд 977, «Статистика по заказам… лёгкая версия») в форму `index.html` (darkStoreBB).

## Как это решает проблему авторизации

Programmatic-логин `POST /login/` в этом инстансе Superset не работает (CSRF-поле пустое,
`/api/v1/security/csrf_token/` требует Authorization). Расширение ходит в API **прямо со
страницы Superset**: браузер сам подставляет живую сессионную cookie, а CSRF-токен берётся
из куки `csrftoken` — ровно как это делает интерфейс Superset. Пароль нигде не хранится.

## Установка расширения

1. Откройте `chrome://extensions`.
2. Включите «Режим разработчика» (справа сверху).
3. «Загрузить распакованное расширение» → выберите папку `chrome-extension/`.
4. Откройте и авторизуйтесь на `https://superset.svc.vkusvill.ru` (дашборд `services_lite`).

## Использование

### Вариант A — прямо из формы darkStoreBB (главный)
1. Держите открытой вкладку Superset (авторизованную).
2. Откройте `index.html`.
3. Нажмите зелёную кнопку **«Superset»** в нижней панели — данные за вчера подтянутся
   и применятся к неделе 1 (зоны × заказов/день, средний чек, опоздания).

### Вариант B — через popup расширения
1. Клик по иконке расширения.
2. Номер даркстора (например `7745`, пусто = вся сеть) + период (вчера/сегодня/7 дней/дата).
3. **«1 · Загрузить данные»** → предпросмотр метрик.
4. **«2 · Вставить в darkStoreBB»** (нужна открытая вкладка с `index.html`)
   или **«3 · Скачать JSON»** — файл для анализа/архива.

### Вариант C — CLI (без браузера, по cookie из local.json)
```
node ds_snapshot.cjs 7745                      # вчера → JSON в stdout
node ds_snapshot.cjs 7745 2026-11-16 --out snap.json
node ds_snapshot.cjs all                       # вся сеть (калибровка)
```
В `local.json` поле `sessionCookie` = значение куки `session` из DevTools вкладки Superset
(Application → Cookies). Хватает на ~2 часа. `local.json` в git не попадает.

## Что маппится в форму (неделя 1)

| Superset                | поле index.html                                  |
|-------------------------|--------------------------------------------------|
| `qty_orders_delivered`  | `zonesCount` × `ordersPerZoneDay` (кап 400/зону) |
| средний чек (`sum_with_bonuses/delivered`) | `cost` (средний чек заказа)     |
| `share_not_in_slot_all` | `lateness` (опоздания, %) — прокси               |
| `qty_orders_declined`   | только в отчёт/JSON (поля в форме нет)           |

Не маппятся (только руками): маржа, ставка курьера, kL/kA/kT/kE.

## Формат JSON

```json
{
  "snapshot": {
    "source": "superset:dash977/slice20403",
    "shopno": "7745", "date": "2026-11-16", "pulled_at": "…",
    "orders_per_day": 1748, "qty_orders_declined": 38, "decline_rate_pct": 2.13,
    "avg_check_rub": 1516, "revenue_rub": 2649794, "share_not_in_slot_pct": 15.73,
    "by_service": [ { "service": "…", "orders": 1626, "revenue": 2598199 } ]
  },
  "mapped": { "week": 1, "patch": {…}, "notes": […], "missing": […] }
}
```

## Структура

```
superset-core.js        общее ядро: запрос, агрегация, mapToForm (Node + браузер)
ds_snapshot.cjs         CLI поверх ядра
ds_bridge.js            браузерная обёртка window.darkstoreBridge (legacy/ручной импорт)
chrome-extension/
  manifest.json         MV3: content_scripts на Superset и на локальные страницы
  inject.js             на Superset: fetch с cookies страницы + csrf из куки
  bridge.js             на darkStoreBB: кнопки, импорт/экспорт JSON, применение патча
  background.js         роутинг сообщений popup ⇄ вкладки
  popup.html/popup.js   UI расширения
```

## Ограничения

- «Сегодня» — неполный день, объём занижен; для расчётов берите «Вчера».
- Расширение требует host-прав на `file://` — включите галочку «Разрешить доступ к файловым URL»
  на карточке расширения в `chrome://extensions`, если `index.html` открыт как файл.
- Точность «опозданий»: `share_not_in_slot_all` — доля заказов вне слота, это прокси,
  а не классический OTD. При необходимости уточните метрику у владельцев дашборда.
