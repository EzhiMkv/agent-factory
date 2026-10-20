# Прогон 2026-10-20 — спека 001-tinvest-client, тикеты tc-02..tc-09

## Что делал

Довидёл до зелёного незавершённый срез спеки 001 (клиент T-Invest в
`packages/core`) и разложил по тикетам: типы (tc-02), конфиг (tc-03),
ошибки (tc-04), транспорт + клиент + throttle (tc-05..09).

## План

1. Починить падающий smoke: сессия до меня импортировала `CandleInterval`
   из корня SDK — по факту SDK v7.1.0 отдаёт энумы только глубокими путями
   (`dist/generated/marketdata.js`, `dist/generated/common.js`), зафиксировать.
2. Вынести tc-04 в `src/tinvest/errors.ts` (база `TInvestError` + коды),
   распознавание по референсу `jump_news/api.py` (UNAUTHENTICATED / 16 / 40003).
3. Транспорт — структурный `TInvestBackend` (shares/getCandles/news) с
   подменой в тестах: юниты без сети; проверка «говно-моки не соврут про
   реальный API» — покрывается sdkBackend-адаптером и наличием SDK-типов.
4. Тесты: TQBR-фильтр, склейка страниц с overlap, uid-фильтр + окно,
   ретраи, burst-троттлинг на fake timers.
5. Коммиты по тикетам + отметки в tasks.md + этот отчёт.

## Что застряло в процессе (полезное для judge-метрики)

- **SDK-энумы вне корня пакета.** Vitest падал
  «Cannot read properties of undefined (reading 'CANDLE_INTERVAL_1_MIN')».
  Причина: `tinkoff-invest-api` экспортирует только `TinkoffInvestApi`,
  `Helpers` и т.п.; энумы лежат в сгенерированных модулях (README SDK
  подтверждает). Лечение: импорты из глубоких путей.
- **Сервис называется `marketdata`, а не `marketData`.** tsc в strict
  поймало сразу (`Did you mean 'marketdata'?`). Заодно выяснилась
  фактура: у `TinkoffInvestApi` из SDK v7 **нет** `close()`/`shutdown()` —
  жизненный цикл канала делегирован процессу; наш `close()` просто
  сбрасывает кэш клиента.
- **Гонка в throttle.** Наивный «порядок по lastCallMs» при 20 параллельных
  вызовах схлопывал burst в один момент (все видели один lastCallMs).
  Лечение: promise-chain очередь в `throttle()`; burst-тест на fake timers
  подтверждает зазоры ≥190 мс при tps=5.
- **`Int64Array` не существует** в DOM-либах TS — счётчик кумулятивных валидных
  значений переведён на `Float64Array` (целые < 2^53, точность ок).

## Результат

- Коммиты: 07d854c (tc-02), d064211 (tc-03), 0921e9b (tc-04),
  05dbe03 (tc-05..09), a815a29 (wiring/индексная точка).
- `pnpm -r build && pnpm -r test && pnpm -r lint` — все зелёные:
  core 24 теста (домен, конфиг, ошибки, клиент, smoke) + api health.
- Из спеки остались: tc-10 (live-smoke, ручной) и DoD-пункты
  (README-секция запуска, отметка tc-10 в docs/runs).

## tc-10: live-smoke (дополнение прогона)

Проблемы, которые вскрыл живой прогон против SDK v7.1.0 (все кончены в
коммитах fix):

1. **`endpoint: undefined` перетирает дефолт SDK.** `{...defaults, ...opts}`
   в конструкторе SDK: явное `endpoint: undefined` → `dns:undefined:443` →
   UNAVAILABLE → «3 ретрая». Лечение: ключ в init-объект передаём только
   если задан.
2. **d.ts врёт про поля.** `SharesResponse.instruments[*]` в рантайме
   отдаёт `uid`, а не `instrumentUid` (в d.ts наоборот). Клиент мапит оба
   (`instrumentUid ?? uid`), структурный тип TInvestBackend доведён.
3. **TLS: российский доверенный CA.** Без трастовой цепочки grpc-js падает
   «self-signed certificate in certificate chain» (MITM.getMinistry).
   Лечение: `GRPC_DEFAULT_SSL_ROOTS_FILE_PATH` на бандл
   `packages/core/certs/ca-bundle-russian.pem` (реквизит скопирован из
   Python-референса `~/projects/lfstl/jump_news`) — env читается grpc-js
   на импорте, поэтому в smoke-скрипте бандл подключается ДО
   динамического `import("@af/core")`.
4. Уточнены исходы ошибок: финальные Transport/Rate-обёртки теперь несут
   с собой базовое сообщение (диагностика без отдельного дебага).

Результат tc-10 (`pnpm smoke:tinvest` с read-only токеном из локального
.env, вне CI):

```
candles=4 news=12 (SBER, 2026-10-17T12:14:11.496Z .. 2026-10-20T12:14:11.496Z)
last close: 2026-10-20T00:00:00.000Z open=290.9 high=294 low=289.53 close=292.92 vol=17178353
news[0]: 2026-10-20T11:48:02.027Z «Облачная "дочка" МТС...» uids=4
```

Спека 001 закрыта: tc-01..tc-10 + DoD (tasks.md). Прогон judge на диффы
не подключён (следующий шаг конвейера — спека 002-ingest и связка judge
в orchestrator).
