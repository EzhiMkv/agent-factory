// Тесты tc-05..09: клиент T-Invest на подменяемом бэкенде, юниты без сети.
import { describe, expect, it, vi } from "vitest";
import {
  TInvestAuthError,
  TInvestClient,
  TInvestRateError,
  TInvestTransportError,
  type TInvestBackend,
} from "../../src/tinvest/client.js";

const DAY = 86_400_000;
const T0 = new Date("2026-10-01T10:00:00.000Z").getTime();

/** Мок-транспорт: тайминги каждого gRPC-вызова + подменяемое поведение. */
function recorder(behaviour: Partial<TInvestBackend> = {}) {
  const timestamps: number[] = [];
  const timed = <T, R>(fn: (req: T) => Promise<R>) => async (req: T): Promise<R> => {
    timestamps.push(Date.now());
    return fn(req);
  };
  const backend: TInvestBackend = {
    shares: async () => ({
      instruments: [
        { classCode: "TQBR", ticker: "SBER", name: "Сбербанк", instrumentUid: "u1", currency: "rub" },
        { classCode: "TQBR", ticker: "GAZP", name: "Газпром", instrumentUid: "u2", currency: "rub" },
        { classCode: "SNDX", ticker: "IMOEX", name: "Индекс", instrumentUid: "u3", currency: "rub" },
      ],
    }),
    getCandles: async () => ({ candles: [] }),
    news: async () => ({ hasNext: false, items: [] }),
    ...behaviour,
  } as TInvestBackend;
  const wrap: TInvestBackend = {
    shares: timed(backend.shares),
    getCandles: timed(backend.getCandles),
    news: timed(backend.news),
  };
  return { timestamps, backend, wrap };
}

function client(rec: { wrap: TInvestBackend }, opts: { token?: string; tps?: number } = {}) {
  return new TInvestClient({
    token: opts.token ?? "test-token",
    tps: opts.tps ?? 20,
    retryBaseDelayMs: 1,
    backend: rec.wrap,
  });
}

describe("listShares (tc-06)", () => {
  it("фильтрует не-TQBR", async () => {
    const rec = recorder();
    const shares = await client(rec).listShares();
    expect(shares.map((s) => s.ticker)).toEqual(["SBER", "GAZP"]);
    expect(shares[0]!.instrumentUid).toBe("u1");
    expect(rec.timestamps).toHaveLength(1);
  });
});

describe("getCandles (tc-07)", () => {
  it("две страницы с overlap → склейка без дублей, сортировка по ts", async () => {
    const calls: number[] = [];
    const boundaryS = new Date(T0 + 5 * DAY).toISOString();
    const rec = recorder({
      getCandles: async (req) => {
        calls.push(req.from.getTime());
        return {
          candles: [
            { time: new Date(T0 + 2 * DAY), open: { units: "300" }, volume: 10 },
            { time: new Date(T0 + 4 * DAY), close: { units: "305", nano: 500000000 }, volume: 20 },
            { time: new Date(boundaryS), volume: 30 },
          ],
        };
      },
    });
    const candles = await client(rec).getCandles("u1", "5min", new Date(T0), new Date(T0 + 6 * DAY));
    expect(calls.sort((a, b) => a - b)).toEqual([T0, T0 + 5 * DAY]);
    // свеча на границе пришла из обеих страниц → задублирована и снята
    expect(candles).toHaveLength(3);
    const stamps = candles.map((x) => new Date(x.ts).getTime());
    expect(stamps).toEqual([...stamps].sort((a, b) => a - b));
    expect(stamps).toHaveLength(new Set(stamps).size);
    expect(candles.find((x) => x.ts === boundaryS)!.open).toBe(0);
    expect(candles.find((x) => x.ts === new Date(T0 + 4 * DAY).toISOString())!.close).toBeCloseTo(305.5, 9);
  });

  it("пустой период: [] без ретраев", async () => {
    const rec = recorder();
    const candles = await client(rec).getCandles("u1", "1day", new Date(T0), new Date(T0 + DAY));
    expect(candles).toEqual([]);
    expect(rec.timestamps).toHaveLength(1);
  });
});

describe("listNews/getNews (tc-08)", () => {
  it("новость с двумя uid сохраняет привязку; страницы по курсору; since-фильтр", async () => {
    const t = new Date("2026-10-20T09:00:00.000Z");
    const pages = [
      {
        next: true,
        items: [
          {
            id: 7,
            title: "Событие",
            content: "Тело события",
            summary: "Кратко",
            ts: t,
            instrumentId: [{ instrument: { instrumentUid: "u1" } }, { instrument: { instrumentUid: "u2" } }],
          },
        ],
      },
      {
        next: false,
        items: [
          {
            id: "8",
            title: "Поздняя",
            summary: "Старое",
            ts: "2026-10-19T00:00:00.000Z",
            instrumentId: [{ instrument: { instrumentUid: "u1" } }],
          },
        ],
      },
    ];
    let page = 0;
    const rec = recorder({
      news: async (req) => {
        expect(req.limit).toBe(100);
        const p = pages[page]!;
        page++;
        return { hasNext: p.next, nextCursor: p.next ? page * 100 : undefined, items: p.items };
      },
    });
    const feed = await client(rec).listNews({ since: new Date("2026-10-20T00:00:00.000Z") });
    expect(page).toBe(2);
    expect(feed).toHaveLength(1);
    expect(feed[0]!.id).toBe("7");
    expect(feed[0]!.body).toBe("Тело события");
    expect(feed[0]!.instrumentUids).toEqual(["u1", "u2"]);
  });

  it("getNews: фильтр по uid и времени", async () => {
    const early = new Date("2026-10-20T10:00:00.000Z");
    const mid = new Date("2026-10-20T12:00:00.000Z");
    const late = new Date("2026-10-20T15:00:00.000Z");
    const rec = recorder({
      news: async () => ({
        hasNext: false,
        items: [
          { id: 1, title: "A", ts: mid, instrumentId: [{ instrument: { instrumentUid: "u1" } }] },
          { id: 2, title: "B", ts: mid, instrumentId: [{ instrument: { instrumentUid: "u2" } }] },
          { id: 3, title: "C", ts: early, instrumentId: [{ instrument: { instrumentUid: "u1" } }] },
        ],
      }),
    });
    const news = await client(rec).getNews("u1", early, new Date("2026-10-20T13:00:00.000Z"));
    expect(news.map((n) => n.title)).toEqual(["A", "C"]); // окно [from..to] включительно

    const recLate = recorder({
      news: async () => ({
        hasNext: false,
        items: [{ id: 5, title: "L", ts: late, instrumentId: [{ instrument: { instrumentUid: "u1" } }] }],
      }),
    });
    expect(await client(recLate).getNews("u1", early, mid)).toEqual([]);
  });
});

describe("ошибки и ретраи (tc-04/tc-05)", () => {
  it("без токена любой вызов — TInvestAuthError с подсказкой про .env.example", async () => {
    const rec = recorder();
    await expect(client(rec, { token: "  " }).listShares()).rejects.toBeInstanceOf(TInvestAuthError);
    expect(rec.timestamps).toHaveLength(0);
  });

  it("RESOURCE_EXHAUSTED → два ретрая → успех", async () => {
    let attempt = 0;
    const rec = recorder({
      getCandles: async () => {
        attempt++;
        if (attempt < 3) throw new Error("3 RESOURCE_EXHAUSTED: Too Many Requests");
        return { candles: [{ time: new Date(T0), volume: 1 }] };
      },
    });
    const candles = await client(rec).getCandles("u1", "1day", new Date(T0), new Date(T0 + DAY));
    expect(attempt).toBe(3);
    expect(candles).toHaveLength(1);
  });

  it("RESOURCE_EXHAUSTED трижды → TInvestRateError", async () => {
    const rec = recorder({
      shares: async () => {
        throw new Error("8 RESOURCE_EXHAUSTED: rate limit");
      },
    });
    await expect(client(rec).listShares()).rejects.toBeInstanceOf(TInvestRateError);
    expect(rec.timestamps).toHaveLength(3);
  });

  it("UNAVAILABLE → ретраи → TInvestTransportError; INVALID_ARGUMENT — сразу без ретря", async () => {
    const rec = recorder({
      shares: async () => {
        throw new Error("14 UNAVAILABLE: channel down");
      },
    });
    await expect(client(rec).listShares()).rejects.toBeInstanceOf(TInvestTransportError);
    expect(rec.timestamps).toHaveLength(3);

    const bad = recorder({
      shares: async () => {
        throw new Error("3 INVALID_ARGUMENT: bad request");
      },
    });
    await expect(client(bad).listShares()).rejects.toThrow(/INVALID_ARGUMENT/);
    expect(bad.timestamps).toHaveLength(1);
  });
});

describe("throttle (tc-09)", () => {
  it("burst 20 при 5 rps: не чаще 200 мс между запросами (fake timers)", async () => {
    vi.useFakeTimers();
    try {
      const rec = recorder();
      const c = client(rec, { tps: 5 });
      const pending = Array.from({ length: 20 }, () => c.listShares());
      await vi.advanceTimersByTimeAsync(5_000);
      await Promise.all(pending);
      expect(rec.timestamps).toHaveLength(20);
      const gaps = rec.timestamps.slice(1).map((t, i) => t - rec.timestamps[i]!);
      expect(gaps.length).toBe(19);
      for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(190);
    } finally {
      vi.useRealTimers();
    }
  });
});
