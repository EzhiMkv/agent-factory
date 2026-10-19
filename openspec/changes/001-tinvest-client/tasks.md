# Tasks: 001-tinvest-client

Формат id: `001-tc-NN`. Тикет = ветка `work/001/<slug>`, один коммит или
несколько мелких, дифф на judge. Отмечай выполненное `[x]` — это очередь
оркестратора.

## tc-01 каркас core
- [ ] Vite-less tsconfig shared, strict; `packages/core` с `src/index.ts`
  (пустой публичный API), `vitest`, один smoke-тест сборки
- [ ] Нормы AGENTS.md соблюдены (без any, без лишних зависимостей)
- оценочно 20–40 LOC

## tc-02 доменные типы
- [ ] `Candle { instrumentUid, interval, ts, open, high, low, close, volume }`
- [ ] `NewsItem { id, title, body, url, ts, instrumentUids }`
- [ ] `Share { ticker, name, instrumentUid, currency }`
- [ ] `TInvestInterval` enum (1m..day) — маппится из настроек
- тест: типы статически проверяются, сериализация/десериализация JSON

## tc-03 конфиг
- [ ] `config.ts`: читает `T_INVEST_TOKEN`, `T_INVEST_TPS` (default 5),
  `T_INVEST_ENDPOINT` (default invest-public-api.tbank.ru:443)
- [ ] ошибка конфига описана человеком (ссылаемся на .env.example)
- тесты: парсинг и дефолты; env подменяется в тесте, не слит с production

## tc-04 типизированные ошибки
- [ ] `TInvestError` базовый + Auth/Rate/Transport
- тест: `is_unauthenticated`-аналог распознаёт 16 «unauthenticated»-коды
  (см. референс jump_news/api.py)

## tc-05 gRPC-транспорт
- [ ] Подключить пакет `tinkoff-invest-api` (Node SDK, токен в метаданных)
  либо собственный gRPC-клиент; выбор продиктован в PR-описании
- [ ] Retry/timeout политики на канале
- тест: канал подменяется моком; юнит без сети

## tc-06 listShares
- [ ] instruments.shares → фильтр TQBR → Share[]
- тест на фикстуре-моке: 3 акции, из них 1 не-TQBR — отфильтрована

## tc-07 getCandles с пагинацией
- [ ] Батчинг по страницам, сортировка по ts, дедуп по (ts, цена)
- тест: две страницы с overlap → склейка без дублей

## tc-08 getNews
- [ ] Новости инструмента: фильтр по uid и времени
- тест: фикстура с новостью, привязанной к двум uid

## tc-09 throttle (token bucket)
- [ ] Ограничитель rps на клиенте
- тест: промежутки отправки при burst из 20 запросов соответствуют 5 rps

## tc-10 live-smoke (ручной)
- [ ] `scripts/smoke-tinvest.ts`: SBER, 3 дня, дневки; вывести
  `candles=N news=M`
- не в CI; запуск только с локальным .env

## Definition of done изменения 001
- [ ] все тикеты tc-01..tc-09 merged, tc-10 отмечен в docs/runs
- [ ] `pnpm -r test && pnpm -r build && pnpm -r lint` зелёные
- [ ] README: секция запуска дополнена по факту
