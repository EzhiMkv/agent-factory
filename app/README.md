# app — stub

См. README.md и TZ.md в корне репозитория.

## Запуск

```bash
pnpm install && pnpm -r build && pnpm -r test   # core/api, всё без сети
```

Дашборд-заглушка API: `pnpm --filter @af/api dev` → `http://localhost:3001/health`.

## Live-smoke T-Invest (ручной, не CI, tc-10)

Положи read-only токен в `.env` (шаблон — `.env.example`), затем:

```bash
cd app && pnpm smoke:tinvest          # возьмёт T_INVEST_TOKEN из app/.env
# ← candles=4 news=12 (SBER, 3 дня, дневки)
```

Скрипт сам подставляет российский CA-бандл (`packages/core/certs/`,
`GRPC_DEFAULT_SSL_ROOTS_FILE_PATH`) до импорта gRPC. В офлайне загрузка
исключена: юнит-тесты гоняются на мок-транспорте.

## Структура

- `packages/core` — домен, конфиг, типизированные ошибки и клиент
  T-Invest (спека `openspec/changes/001-tinvest-client`), детект скачков
  и синтетика — заготовки под спеки 002/003 (parity-порт `jump_news`)
- `packages/api` — Fastify, пока только `/health`
