# Tasks: 001-tinvest-client

Формат id: `001-tc-NN`. Тикет = ветка `work/001/<slug>`, один коммит или
несколько мелких, дифф на judge. Отмечай выполненное `[x]` — это очередь
оркестратора.

## tc-01 каркас core
- [x] Vite-less tsconfig shared, strict; `packages/core` с `src/index.ts`
  (пустой публичный API), `vitest`, один smoke-тест сборки (срез 40cad51;
  зелёный снова в a815a29 после фиксации импортов SDK)
- [x] Нормы AGENTS.md соблюдены (без any, без лишних зависимостей)
- оценочно 20–40 LOC

## tc-02 доменные типы
- [x] `Candle { instrumentUid, interval, ts, open, high, low, close, volume }`
- [x] `NewsItem { id, title, body, url, ts, instrumentUids }`
- [x] `Share { ticker, name, instrumentUid, currency }`
- [x] `TInvestInterval` enum (1m..day) — маппится из настроек
- тест: типы статически проверяются, сериализация/десериализация JSON
  (07d854c, tests/dom/types.test.ts)

## tc-03 конфиг
- [x] `config.ts`: читает `T_INVEST_TOKEN`, `T_INVEST_TPS` (default 5),
  `T_INVEST_ENDPOINT` (default invest-public-api.tbank.ru:443)
- [x] ошибка конфига описана человеком (ссылаемся на .env.example) —
  у клиента без токена сообщение ведёт в .env.example
- тесты: парсинг и дефолты; env подменяется в тесте, не слит с production
  (d064211, tests/config.test.ts)

## tc-04 типизированные ошибки
- [x] `TInvestError` базовый + Auth/Rate/Transport
- тест: `is_unauthenticated`-аналог распознаёт 16 «unauthenticated»-коды
  (0921e9b, tests/tinvest/errors.test.ts, референс jump_news/api.py)

## tc-05 gRPC-транспорт
- [x] Пакет `tinkoff-invest-api` v7.1.0 (nice-grpc, токен в метаданных);
  транспорт выведен в структурный `TInvestBackend` с DI-подменой в тестах
  (выбор в commit 05dbe03: готовый SDK дешевле собственного gRPC-клиента,
  глубокие импорты энумов `dist/generated/{marketdata,common}.js`)
- [x] Retry/timeout: rate → backoff×(attempt+1) до 3 раз, transport → ×attempt
- тест: канал подменяется моком (recorder + fake timers); юнит без сети

## tc-06 listShares
- [x] instruments.shares → фильтр TQBR → Share[]
- тест на моке: 3 акции, из них 1 не-TQBR — отфильтрована

## tc-07 getCandles с пагинацией
- [x] Батчинг по чанкам (5 дней intraday / 240 дней дневки), сортировка по ts,
  дедуп по ts (граница чанка снята)
- тест: две страницы с overlap → склейка без дублей

## tc-08 getNews
- [x] Новости: курсорная лента API + фильтр по uid и времени (окно включительно)
- тест: фикстура с новостью, привязанной к двум uid — оба сохранены;
  since + [from..to] окно проверены

## tc-09 throttle (token bucket)
- [x] Ограничитель rps: очередь из promise-chain — параллельный burst видит
  актуальный lastCallMs (гонка нахождения прошлой версии исправлена)
- тест: burst из 20 запросов при tps=5 — межзапросные зазоры ≥190 мс (fake timers)

## tc-10 live-smoke (ручной)
- [ ] `scripts/smoke-tinvest.ts`: SBER, 3 дня, дневки; вывести
  `candles=N news=M`
- не в CI; запуск только с локальным .env

## Definition of done изменения 001
- [ ] все тикеты tc-01..tc-09 merged, tc-10 отмечен в docs/runs
- [ ] `pnpm -r test && pnpm -r build && pnpm -r lint` зелёные (да, для core+api)
- [ ] README: секция запуска дополнена по факту
