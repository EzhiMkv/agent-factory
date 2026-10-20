// Поиск скачков цены (parity-порт jump_news/jumps.py, tc-04/003).
//
// Метод: лог-доходность close-to-close сравнивается с rolling-окном
// предыдущих window доходностей. Скачок — если |z| >= zThreshold И
// |ret| >= minReturn, при ненулевом объёме. Совпадение с numpy-версией:
// выборочная дисперсия, минимум истории max(30, window // 3).

import type { Candle, Jump } from "./dom/types.js";

export interface JumpDetectorParams {
  window: number;
  zThreshold: number;
  minReturn: number;
}

export const DEFAULT_PARAMS: JumpDetectorParams = {
  window: 120,
  zThreshold: 3.5,
  minReturn: 0.005,
};

export function detectJumps(
  candles: Candle[],
  meta: { ticker: string; instrumentUid: string; name: string },
  params: JumpDetectorParams = DEFAULT_PARAMS,
): Jump[] {
  const n = candles.length;
  if (n < 2) return [];
  const { window, zThreshold, minReturn } = params;

  // лог-доходности: rets[i] = log(close[i]) - log(close[i-1]), i>=1
  const rets = new Float64Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    const c0 = candles[i - 1]!.close;
    const c1 = candles[i]!.close;
    if (c0 > 0 && c1 > 0) rets[i] = Math.log(c1) - Math.log(c0);
  }

  // Кумулятивные суммы индексов 0..n (включая i=0, где rets=NaN → invalid)
  const cs1 = new Float64Array(n + 1);
  const cs2 = new Float64Array(n + 1);
  // Счётчик валидных: целые < 2^53, точность Float64 достаточна (parity c numpy).
  const cv = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const v = rets[i] as number;
    const valid = Number.isFinite(v);
    const r = valid ? v : 0;
    cs1[i + 1] = cs1[i]! + r;
    cs2[i + 1] = cs2[i]! + r * r;
    cv[i + 1] = cv[i]! + (valid ? 1 : 0);
  }

  const minHist = Math.max(30, Math.trunc(window / 3));
  const jumps: Jump[] = [];

  for (let idx = 1; idx < n; idx++) {
    const lo = Math.max(0, idx - window);
    const cnt = Number(cv[idx]) - Number(cv[lo]);
    if (cnt < minHist || cnt <= 1) continue;

    const sum1 = cs1[idx]! - cs1[lo]!;
    const sum2 = cs2[idx]! - cs2[lo]!;
    const mean = sum1 / cnt;
    const varr = (sum2 - cnt * mean * mean) / (cnt - 1);
    const sigma = Math.sqrt(Math.max(varr, 0));
    if (sigma <= 1e-9) continue;

    const r = rets[idx]!;
    if (!Number.isFinite(r)) continue;
    const z = (r - mean) / sigma;
    if (Math.abs(z) < zThreshold || Math.abs(r) < minReturn) continue;
    if (candles[idx]!.volume <= 0) continue;

    const c = candles[idx]!;
    jumps.push({
      ticker: meta.ticker,
      instrumentUid: meta.instrumentUid,
      name: meta.name,
      ts: c.ts,
      ret: r,
      z,
      close: c.close,
      windowSigma: sigma,
      direction: r > 0 ? "up" : "down",
    });
  }
  return jumps;
}
