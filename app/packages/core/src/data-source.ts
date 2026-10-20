// Единый источник данных для API: live (T-Invest) или offline (синтетика).
// Гибкость как слабая связка: выше API не знает, откуда данные.

import type { NewsItem, Share, TInvestInterval, Candle } from "./dom/types.js";
import { TInvestClient } from "./tinvest/client.js";
import { SYNTHETIC_SHARES, syntheticCandles, syntheticNews } from "./synthetic.js";
import { loadConfig, type CoreConfig } from "./config.js";

export interface DataSource {
  shares(): Promise<Share[]>;
  candles(
    share: Share,
    interval: TInvestInterval,
    days: number,
  ): Promise<Candle[]>;
  news(): Promise<NewsItem[]>;
  readonly mode: "offline" | "live";
}

export class LiveSource implements DataSource {
  readonly mode = "live" as const;
  private client: TInvestClient;

  constructor(cfg: CoreConfig) {
    this.client = new TInvestClient({
      token: cfg.tinvestToken,
      endpoint: cfg.tinvestEndpoint,
      tps: cfg.tinvestTps,
    });
  }

  async shares(): Promise<Share[]> {
    return this.client.listShares();
  }

  async candles(share: Share, interval: TInvestInterval, days: number): Promise<Candle[]> {
    const to = new Date();
    const from = new Date(to.getTime() - days * 86_400_000);
    return this.client.getCandles(share.instrumentUid, interval, from, to);
  }

  async news(): Promise<NewsItem[]> {
    const since = new Date(Date.now() - 3 * 86_400_000);
    return this.client.listNews({ since, maxPages: 5 });
  }

  close(): void {
    this.client.close();
  }
}

export class OfflineSource implements DataSource {
  readonly mode = "offline" as const;

  async shares(): Promise<Share[]> {
    return SYNTHETIC_SHARES;
  }

  async candles(share: Share, interval: TInvestInterval, days: number): Promise<Candle[]> {
    return syntheticCandles(share, days, interval);
  }

  async news(): Promise<NewsItem[]> {
    const shares = SYNTHETIC_SHARES;
    const candlesByShare = new Map<string, Candle[]>();
    for (const s of shares) {
      candlesByShare.set(s.ticker, syntheticCandles(s, 14));
    }
    return syntheticNews(shares, candlesByShare);
  }
}

export function makeSource(cfg = loadConfig()): DataSource {
  return cfg.dataMode === "live" ? new LiveSource(cfg) : new OfflineSource();
}
