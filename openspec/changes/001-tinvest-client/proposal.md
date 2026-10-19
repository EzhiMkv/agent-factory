# Proposal 001: клиент T-Invest (инструменты, свечи, новости)

## Зачем

Продукту нужны три вида данных из T-Invest API: список акций TQBR,
свечи по инструменту (вплоть до 1 минуты), лента новостей с привязкой
к инструментам. Это входные данные детекции скачков (ядро) и дашборда.
Уже есть Python-референс (`~/projects/lfstl/jump_news/api.py`) с протоколом
gRPC и есть заметки по лимитам (`~/projects/lfstl/x402-research/tinvest-playbook.md`).

Токен — read-only, читается из `.env` (`T_INVEST_TOKEN`), в код не вшивается.

## Что добавляем (spec-delta)

- `packages/core/src/clients/tinvest/`: типы и клиент
  - `listShares()` → акции class_code TQBR (ticker, name, instrument_uid)
  - `getCandles(uid, interval, from, to)` → OHLCV пачками с пагинацией
  - `getNews(instrumentUid, from, to)` → новости (id, title, body, url, ts, uids)
- Rate-лимит чтения: аккуратный throttle (по умолчанию запасной,
  конфигурируемый), ретраи с backoff на поток/лимит превышения
- Ошибки: типизированные (`TInvestAuthError`, `TInvestRateError`, `TInvestTransportError`),
  без выпадения наружу сырых полей протокола
- Конфиг: `packages/core/src/config.ts` — единственное место,
  читающее `process.env`

## Что НЕ добавляем в это изменение

- Запись в БД (отдельное изменение 002-ingest)
- Ядро детекции (003-parity-port)
- REST-эндпоинты API (004-)
- Тонкая кастомизация под MOEX/RSS коннекторы

## Как проверяем

- Юнит-тесты клиента на фикс-ответах моков (без сети)
- `pnpm -r test` зелёный
- Live-смоук (ручной, тикет 001-tc-07): скачать SBER за 3 дня, получить
  ≥1 свечу и ≥0 новостей; live-тесты не попадают в CI (нет ключа в runner)
