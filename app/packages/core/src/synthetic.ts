// Детерминированная синтетика для офлайн-режима: свечи со встроенными
// событиями (скачками) и новости с привязкой к инструментам.
// Сид по тикеру → на датах демо картинка стабильна.

import type { Candle, NewsItem, Share, TInvestInterval } from "./dom/types.js";

export const SYNTHETIC_SHARES: Share[] = [
  { ticker: "SBER", name: "Сбербанк (синтетика)", instrumentUid: "synth-SBER", currency: "rub" },
  { ticker: "GAZP", name: "Газпром (синтетика)", instrumentUid: "synth-GAZP", currency: "rub" },
  { ticker: "LKOH", name: "ЛУКОЙЛ (синтетика)", instrumentUid: "synth-LKOH", currency: "rub" },
  { ticker: "GMKN", name: "Норникель (синтетика)", instrumentUid: "synth-GMKN", currency: "rub" },
  { ticker: "ROSN", name: "Роснефть (синтетика)", instrumentUid: "synth-ROSN", currency: "rub" },
];

const POS_TEMPLATE = [
  ["Аналитики повысили целевой уровень по {t} на 20%", 1.0],
  ["Акционеры {t}: компания планирует рекордные дивиденды", 1.0],
  ["{t} выиграла крупный контракт — бумаги получают импульс", 0.8],
  ["{t} тормозит: квартальная выручка недотягивает", -0.7],
  ["Поток новостей в {t}: менеджмент подтверждает позитивный тренд", 0.6],
  ["Инвестдом поставил {t} в список на снижение рейтинга", -1.0],
] as const;

/** Генератор с сидом: mulberry32. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (const ch of s) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Свечи за days дней по 5 минут, геометрическое блуждание + события. */
export function syntheticCandles(
  share: Share,
  days: number,
  interval: TInvestInterval = "5min",
  now = new Date(),
): Candle[] {
  const rng = seededRandom(hashString(share.ticker));
  const step = interval === "1day" ? 86_400_000 : Math.min(3_600_000, INTERVAL_MS_FALLBACK[interval]);
  const perDay = interval === "1day" ? 1 : Math.max(1, Math.trunc((19.5 * 3_600_000) / step));
  const n = Math.max(2, days * perDay + perDay / 2);
  const out: Candle[] = [];
  let price = 100 + (hashString(share.ticker) % 400); // базовые 100..499
  const end = now.getTime();
  const start = end - Math.ceil(n) * step;

  // события: раз в четверть дня в среднем (75% срабатывание)
  const eventStep = Math.max(perDay, Math.trunc(perDay / 4));
  const events = new Set<number>();
  const er = seededRandom(hashString(share.ticker + "_ev"));
  for (let i = perDay; i < n; i += eventStep) {
    if (er() < 0.75) events.add(i + Math.floor(er() * eventStep));
  }

  for (let i = 0; i < Math.ceil(n); i++) {
    const ts = start + i * step;
    const d = new Date(ts);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue; // выходные, как на бирже
    const drift = (rng() - 0.5) * 0.0015;
    let ret = drift;
    if (events.has(i)) ret += (rng() > 0.5 ? 1 : -1) * (0.012 + rng() * 0.02); // скачок 1.2–3.2%
    const open = price;
    price = Math.max(1, price * Math.exp(ret));
    const high = Math.max(open, price) * (1 + rng() * 0.002);
    const low = Math.min(open, price) * (1 - rng() * 0.002);
    const volume = Math.round((1000 + rng() * 9000) * (events.has(i) ? 6 : 1));
    out.push({
      instrumentUid: share.instrumentUid,
      interval,
      ts: d.toISOString(),
      open,
      high,
      low,
      close: price,
      volume,
    });
  }
  return out;
}

const INTERVAL_MS_FALLBACK: Record<TInvestInterval, number> = {
  "1min": 60_000,
  "5min": 300_000,
  "10min": 600_000,
  "15min": 900_000,
  "30min": 1_800_000,
  "1hour": 3_600_000,
  "1day": 86_400_000,
};

/** Новости, привязанные к синтетическим инструментам: публикуем за ~2 минуты
 * до событий (по сиду от candleIndex), как в реальном рынке. */
export function syntheticNews(
  shares: Share[],
  candlesByShare: Map<string, Candle[]>,
): NewsItem[] {
  const out: NewsItem[] = [];
  for (const share of shares) {
    const candles = candlesByShare.get(share.ticker) ?? [];
    const jumps = detectTemplateIndices(candles);
    for (const [i, dir] of jumps) {
      const rng = seededRandom(hashString(`${share.ticker}:${i}`));
      const tmpl = POS_TEMPLATE[Math.floor(rng() * POS_TEMPLATE.length)] as readonly [string, number];
      const title = tmpl[0].replaceAll("{t}", share.ticker);
      out.push({
        id: `synth-${share.ticker}-${i}`,
        title,
        body: `Синтетическая новость (офлайн-режим), направление ${dir > 0 ? "вверх" : "вниз"}.`,
        url: null,
        ts: new Date(new Date(candles[i]!.ts).getTime() - 3 * 60_000).toISOString(),
        instrumentUids: [share.instrumentUid],
      });
    }
  }
  return out;
}

function detectTemplateIndices(candles: Candle[]): Array<[number, number]> {
  const res: Array<[number, number]> = [];
  for (let i = 1; i < candles.length; i++) {
    const a = candles[i - 1]!.close;
    const b = candles[i]!.close;
    if (a > 0 && Math.abs(Math.log(b / a)) > 0.01) {
      res.push([i, b > a ? 1 : -1]);
    }
  }
  return res.slice(0, 24); // не засоряем ленту
}
