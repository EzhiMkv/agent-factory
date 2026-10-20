// Клиент T-Invest API (tc-05..08): акции TQBR, свечи с пагинацией, новости.
// Транспорт: tinkoff-invest-api (nice-grpc, токен в метаданных). Ошибки —
// из errors.ts (tc-04), throttling — token bucket-подобный интервал (tc-09).
// Энумы SDK экспортируются не из корня пакета, а из сгенерированных модулей
// (см. README SDK): CandleInterval — marketdata, InstrumentStatus — common.

import {
  TinkoffInvestApi,
  type TinkoffInvestApiOptions,
} from "tinkoff-invest-api";
import {
  CandleInterval,
  type GetCandlesRequest,
} from "tinkoff-invest-api/dist/generated/marketdata.js";
import { InstrumentStatus } from "tinkoff-invest-api/dist/generated/common.js";
import type { Candle, NewsItem, Share, TInvestInterval } from "../dom/types.js";
import {
  isRateLimitError,
  isRetryableTransportError,
  isUnauthenticatedError,
  TInvestAuthError,
  TInvestError,
  TInvestRateError,
  TInvestTransportError,
} from "./errors.js";

export { TInvestAuthError, TInvestRateError, TInvestTransportError, TInvestError };

/** Цена факультативных ответов API: units = целая часть, nano = 1e-9. */
export interface QuotationLike {
  units?: string | number;
  nano?: string | number;
}

interface BackendCandle {
  time?: Date;
  open?: QuotationLike;
  high?: QuotationLike;
  low?: QuotationLike;
  close?: QuotationLike;
  volume?: string | number;
}

interface BackendNewsItem {
  id: string | number;
  title?: string;
  content?: string;
  summary?: string;
  ts?: Date | string;
  instrumentId?: ReadonlyArray<{ instrument?: { instrumentUid?: string } }>;
}

/** Структурный дубль среза SDK, который реально читает клиент. */
export interface TInvestBackend {
  shares(req: { instrumentStatus: InstrumentStatus }): Promise<{
    instruments?: ReadonlyArray<{
      classCode?: string;
      ticker?: string;
      name?: string;
      /** SDK v7: в d.ts поле названо instrumentUid, в рантайме придёт uid. */
      instrumentUid?: string;
      uid?: string;
      currency?: string;
    }>;
  }>;
  getCandles(req: Partial<GetCandlesRequest> & { interval: CandleInterval }): Promise<{
    candles?: ReadonlyArray<BackendCandle>;
  }>;
  news(req: { cursor?: number; limit: number }): Promise<{
    hasNext?: boolean;
    nextCursor?: number;
    items?: ReadonlyArray<BackendNewsItem>;
  }>;
}

function sdkBackend(api: TinkoffInvestApi): TInvestBackend {
  return {
    shares: (req) => api.instruments.shares({ instrumentStatus: req.instrumentStatus }),
    getCandles: (req) => api.marketdata.getCandles(req),
    news: (req) => api.instruments.news({ cursor: req.cursor, limit: req.limit }),
  };
}

export interface TInvestClientOptions {
  /** Read-only токен; без него любой вызов — TInvestAuthError (спека 001). */
  token: string;
  endpoint?: string;
  /** Запросов в секунду (tc-09). */
  tps: number;
  /** Минимальная база backoff между ретраями, мс (тесты ставят 1). */
  retryBaseDelayMs?: number;
  /** Подмена транспорта моком в тестах (tc-05, без сети). */
  backend?: TInvestBackend;
}

const INTERVAL_MAP: Record<TInvestInterval, CandleInterval> = {
  "1min": CandleInterval.CANDLE_INTERVAL_1_MIN,
  "5min": CandleInterval.CANDLE_INTERVAL_5_MIN,
  "10min": CandleInterval.CANDLE_INTERVAL_10_MIN,
  "15min": CandleInterval.CANDLE_INTERVAL_15_MIN,
  "30min": CandleInterval.CANDLE_INTERVAL_30_MIN,
  "1hour": CandleInterval.CANDLE_INTERVAL_HOUR,
  "1day": CandleInterval.CANDLE_INTERVAL_DAY,
};

function q2f(q: QuotationLike | undefined): number {
  if (!q) return 0;
  return Number(q.units ?? "0") + Number(q.nano ?? 0) / 1e9;
}

const MAX_PAGES = 50;

export class TInvestClient {
  private api: TinkoffInvestApi | null = null;
  private backend: TInvestBackend | null = null;
  private lastCallMs = Date.now();
  /** Очередь throttle: параллельные вызовы выстраиваются, а не видят stale lastCallMs. */
  private gate: Promise<void> = Promise.resolve();
  private readonly minIntervalMs: number;
  private readonly retryBaseDelayMs: number;

  constructor(private opts: TInvestClientOptions) {
    this.minIntervalMs = 1000 / Math.max(0.1, opts.tps);
    this.retryBaseDelayMs = opts.retryBaseDelayMs ?? 1000;
    if (opts.backend) this.backend = opts.backend;
  }

  /** Подмена транспорта в тестах; в проде — SDK-бэкенд. */
  setBackend(backend: TInvestBackend): void {
    this.backend = backend;
  }

  private get transport(): TInvestBackend {
    if (!this.backend) {
      // endpoint ключом не передаём даже при undefined: {...defaults, ...opts}
      // SDK перетирает дефолтный endpoint значением undefined → dns:undefined:443.
      const init: TinkoffInvestApiOptions = { token: this.opts.token };
      if (this.opts.endpoint) init.endpoint = this.opts.endpoint;
      this.api = new TinkoffInvestApi(init);
      this.backend = sdkBackend(this.api);
    }
    return this.backend;
  }

  /** Token bucket одного слота: держим расстояние >= 1000/tps между запросами.
   * Очередь гарантирует, что параллельный burst не схлопнется в один момент. */
  throttle(): Promise<void> {
    const next = this.gate.then(async () => {
      const wait = this.minIntervalMs - (Date.now() - this.lastCallMs);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastCallMs = Date.now();
    });
    this.gate = next;
    return next;
  }

  private async call<T>(fn: (t: TInvestBackend) => Promise<T>, what: string): Promise<T> {
    if (!this.opts.token.trim()) {
      throw new TInvestAuthError(
        `T-Invest ${what}: T_INVEST_TOKEN не задан. Read-only токен кладётся в .env — шаблон в .env.example`,
      );
    }
    for (let attempt = 1; attempt <= 3; attempt++) {
      await this.throttle();
      try {
        return await fn(this.transport);
      } catch (err) {
        const base = String(err).slice(0, 260);
        if (isUnauthenticatedError(err)) {
          throw new TInvestAuthError(
            `T-Invest ${what}: токен отклонён (${base}). Проверь T_INVEST_TOKEN (read-only) — шаблон .env.example`,
          );
        }
        if (isRateLimitError(err)) {
          if (attempt === 3) throw new TInvestRateError(`T-Invest ${what}: лимит, 3 ретрая исчерпаны — ${base}`);
          await sleep(this.retryBaseDelayMs * (attempt + 1));
          continue;
        }
        if (isRetryableTransportError(err)) {
          if (attempt === 3) {
            throw new TInvestTransportError(`T-Invest ${what}: транспорт, 3 ретрая исчерпаны — ${base}`);
          }
          await sleep(this.retryBaseDelayMs * attempt);
          continue;
        }
        throw new TInvestTransportError(`T-Invest ${what}: ${base}`);
      }
    }
    throw new TInvestTransportError(`T-Invest ${what}: недостижимо`);
  }

  /** Акции Мосбиржи (class_code TQBR). Спека 001: фильтрация не-TQBR. */
  async listShares(): Promise<Share[]> {
    const resp = await this.call(
      (t) => t.shares({ instrumentStatus: InstrumentStatus.INSTRUMENT_STATUS_BASE }),
      "instruments.shares",
    );
    return (resp.instruments ?? [])
      .filter((i) => i.classCode === "TQBR" && i.ticker)
      .map((i) => ({
        ticker: i.ticker ?? "",
        name: i.name ?? "",
        instrumentUid: i.instrumentUid ?? i.uid ?? "",
        currency: i.currency ?? "rub",
      }))
      .filter((s) => s.instrumentUid !== "");
  }

  /** Свечи за период. Период длиннее лимита API — чанками; единый вывод
   * по возрастанию ts, дубликаты по ts сняты (tc-07). */
  async getCandles(
    instrumentUid: string,
    interval: TInvestInterval,
    from: Date,
    to: Date,
  ): Promise<Candle[]> {
    const intervalEnum = INTERVAL_MAP[interval];
    const stepMs = interval === "1day" ? 240 * 86_400_000 : 5 * 86_400_000;
    const out: Candle[] = [];
    for (let cur = from.getTime(); cur < to.getTime(); cur += stepMs) {
      const next = Math.min(cur + stepMs, to.getTime());
      const resp = await this.call(
        (t) =>
          t.getCandles({
            instrumentId: instrumentUid,
            interval: intervalEnum,
            from: new Date(cur),
            to: new Date(next),
          }),
        "marketData.getCandles",
      );
      for (const c of resp.candles ?? []) {
        if (!c.time) continue;
        out.push({
          instrumentUid,
          interval,
          ts: c.time.toISOString(),
          open: q2f(c.open),
          high: q2f(c.high),
          low: q2f(c.low),
          close: q2f(c.close),
          volume: Number(c.volume ?? 0),
        });
      }
    }
    return sortDedup(out);
  }

  /** Сырая лента новостей API (глобальная, страницы по курсору). */
  async listNews(
    opts: { since?: Date; maxPages?: number; pageSize?: number } = {},
  ): Promise<NewsItem[]> {
    const pageSize = opts.pageSize ?? 100;
    const streak = Math.min(opts.maxPages ?? 10, MAX_PAGES);
    const out: NewsItem[] = [];
    let cursor: number | undefined;
    for (let page = 0; page < streak; page++) {
      const resp = await this.call((t) => t.news({ cursor, limit: pageSize }), "instruments.news");
      for (const n of resp.items ?? []) {
        const ts = (n.ts instanceof Date ? n.ts.toISOString() : n.ts) ?? new Date().toISOString();
        if (opts.since && ts !== undefined && new Date(ts) < opts.since) continue;
        const uids = (n.instrumentId ?? [])
          .map((i) => i.instrument?.instrumentUid ?? "")
          .filter((u) => u !== "");
        out.push({
          id: String(n.id),
          title: n.title ?? "",
          body: n.content ?? n.summary ?? null,
          url: null,
          ts,
          instrumentUids: uids,
        });
      }
      if (!resp.hasNext) break;
      const next = resp.nextCursor;
      if (next === undefined || next === cursor) break;
      cursor = next;
    }
    return out;
  }

  /** Новости инструмента (tc-08): фильтр по uid и времени поверх ленты. */
  async getNews(instrumentUid: string, from: Date, to: Date): Promise<NewsItem[]> {
    const between = await this.listNews({ since: from });
    return between.filter(
      (n) => n.instrumentUids.includes(instrumentUid) && new Date(n.ts) <= to,
    );
  }

  close(): void {
    // SDK v7 не публикует close/shutdown канала — клиенты nice-grpc живут
    // до конца процесса; здесь только сброс кэша: torch агентов пересоздаст.
    this.api = null;
    this.backend = null;
  }
}

function sortDedup(list: Candle[]): Candle[] {
  const seen = new Set<string>();
  const out = list
    .filter((c) => {
      if (seen.has(c.ts)) return false;
      seen.add(c.ts);
      return true;
    })
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
