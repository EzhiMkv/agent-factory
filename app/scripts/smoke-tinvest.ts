// tc-10 live-smoke (ручной, НЕ в CI): T-Invest API → SBER, 3 дня дневок.
// Выдаёт `candles=N news=M` по ТЗ. Токен read-only из окружения
// (T_INVEST_TOKEN) — запуск только с локальным .env, никогда из коммита.
//
// TLS: gRPC-канал идёт через российский доверенный CA — до импорта SDK
// подставляем GRPC_DEFAULT_SSL_ROOTS_FILE_PATH (читается grpc-js на импорте).
// Путь можно переопределить T_INVEST_CA_FILE.
//
// Пример:
//   cd app && packages/api/node_modules/.bin/tsx \
//     --env-file=/home/e/projects/lfstl/.env scripts/smoke-tinvest.ts

import { mkdirSync } from "node:fs";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const tokenPre = process.env.T_INVEST_TOKEN ?? "";
if (!tokenPre.trim()) {
  console.error("T_INVEST_TOKEN не задан: read-only токен кладётся в .env, шаблон — .env.example");
  process.exit(2);
}

if (!process.env.GRPC_DEFAULT_SSL_ROOTS_FILE_PATH) {
  // app/scripts → app/packages/core/certs
  const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const caDefault = path.join(appRoot, "packages/core/certs/ca-bundle-russian.pem");
  try {
    process.env.GRPC_DEFAULT_SSL_ROOTS_FILE_PATH = realpathSync(
      process.env.T_INVEST_CA_FILE ?? caDefault,
    );
  } catch {
    mkdirSync(path.join(appRoot, "packages/core/certs"), { recursive: true });
    console.error("CA-бандл не найден: положи ca-bundle-russian.pem в packages/core/certs или задай T_INVEST_CA_FILE");
  }
}

// Динамический импорт после env-прокачки: grpc-js читает корневые CA на import.
const { TInvestAuthError, TInvestClient } = await import("@af/core");

const client = new TInvestClient({ token: tokenPre, tps: 2 });
try {
  const shares = await client.listShares();
  const sber = shares.find((s) => s.ticker === "SBER");
  if (!sber) throw new Error(`SBER не найден среди акций TQBR (получено ${shares.length})`);

  const to = new Date();
  const from = new Date(to.getTime() - 3 * 86_400_000);
  const candles = await client.getCandles(sber.instrumentUid, "1day", from, to);
  const news = await client.getNews(sber.instrumentUid, from, to);

  console.log(
    `candles=${candles.length} news=${news.length}` +
      ` (SBER, ${from.toISOString()} .. ${to.toISOString()})`,
  );
  const last = candles.at(-1);
  if (last) {
    console.log(
      `last close: ${last.ts} open=${last.open} high=${last.high} low=${last.low} close=${last.close} vol=${last.volume}`,
    );
  }
  const [freshNews] = news;
  if (freshNews) {
    console.log(`news[0]: ${freshNews.ts} «${freshNews.title}» uids=${freshNews.instrumentUids.length}`);
  }
} catch (err) {
  if (err instanceof TInvestAuthError) {
    console.error(`AUTH: ${err.message}`);
    process.exit(1);
  }
  console.error(`smoke failed: ${String(err)}`);
  process.exit(1);
} finally {
  client.close();
}
