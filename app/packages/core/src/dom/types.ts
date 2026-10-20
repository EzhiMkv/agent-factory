// Доменные типы ядра (спека 001, tc-02).
export type TInvestInterval =
  | "1min"
  | "5min"
  | "10min"
  | "15min"
  | "30min"
  | "1hour"
  | "1day";

export interface Candle {
  instrumentUid: string;
  interval: TInvestInterval;
  /** Время закрывающей свечи, UTC ISO. */
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface NewsItem {
  id: string;
  title: string;
  body: string | null;
  url: string | null;
  ts: string;
  instrumentUids: string[];
}

export interface Share {
  ticker: string;
  name: string;
  instrumentUid: string;
  currency: string;
}

/** Скачок цены (parity-порт jumps.py). */
export interface Jump {
  ticker: string;
  instrumentUid: string;
  name: string;
  /** Время закрывающей свечи скачка (ISO UTC). */
  ts: string;
  /** Лог-доходность (0.01 = 1%). */
  ret: number;
  z: number;
  close: number;
  windowSigma: number;
  direction: "up" | "down";
}

export const INTERVAL_MS: Record<TInvestInterval, number> = {
  "1min": 60_000,
  "5min": 300_000,
  "10min": 600_000,
  "15min": 900_000,
  "30min": 1_800_000,
  "1hour": 3_600_000,
  "1day": 86_400_000,
};
