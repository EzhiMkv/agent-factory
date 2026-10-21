import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createPublicClient: vi.fn(),
  createWalletClient: vi.fn(),
  http: vi.fn(),
  parseAbi: vi.fn(),
  privateKeyToAccount: vi.fn(),
  watchContractEvent: vi.fn(),
}));

vi.mock("viem", () => ({
  createPublicClient: mocks.createPublicClient,
  createWalletClient: mocks.createWalletClient,
  http: mocks.http,
  parseAbi: mocks.parseAbi,
}));
vi.mock("viem/accounts", () => ({ privateKeyToAccount: mocks.privateKeyToAccount }));
vi.mock("viem/chains", () => ({ baseSepolia: { id: 84532 } }));

import {
  FEED_MAX,
  appendFeed,
  basescanTxUrl,
  feedToastTone,
  formatTime,
  lifeEventLine,
  parseLifeLog,
  watchLifeFeed,
  type LifeEventLog,
  type ParsedLifeEvent,
} from "./lifeFeed";
import { resetCareClients } from "./wallet";

const TX = `0x${"ab".repeat(32)}` as const;
const CRITTER = "0x0000000000000000000000000000000000000001";
const DEMO_KEY = `0x${"cd".repeat(32)}`;
const DEMO_WALLET = "0x00000000000000000000000000000000000000aa";
const NOW = new Date(2026, 9, 21, 12, 0, 0).getTime();
const UNWATCH = vi.fn();

type WatchConfig = {
  address: string;
  onLogs: (logs: LifeEventLog[]) => void;
  onError: () => void;
};

function lastWatchConfig(): WatchConfig {
  const call = mocks.watchContractEvent.mock.calls.at(-1);
  if (!call) throw new Error("watchContractEvent не вызывался");
  return call[0] as WatchConfig;
}

function stubEnv(key = DEMO_KEY, address = CRITTER) {
  vi.stubEnv("VITE_DEMO_KEY", key);
  vi.stubEnv("VITE_CRITTER_ADDRESS", address);
  vi.stubEnv("VITE_RPC_URL", "https://rpc.example/baseSepolia");
}

beforeEach(() => {
  resetCareClients();
  UNWATCH.mockReset();
  mocks.privateKeyToAccount.mockReset();
  mocks.privateKeyToAccount.mockReturnValue({ address: DEMO_WALLET });
  mocks.createPublicClient.mockReset();
  mocks.createPublicClient.mockReturnValue({ watchContractEvent: mocks.watchContractEvent });
  mocks.createWalletClient.mockReset();
  mocks.createWalletClient.mockReturnValue({ writeContract: vi.fn() });
  mocks.watchContractEvent.mockReset();
  mocks.watchContractEvent.mockReturnValue(UNWATCH);
  mocks.parseAbi.mockReset();
  mocks.parseAbi.mockReturnValue([]);
  mocks.http.mockReset();
  mocks.http.mockReturnValue({});
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetCareClients();
});

describe("parseLifeLog — парсинг лога в запись ленты", () => {
  it("Fed превращается в милую запись: кушал +20, хеш помним", () => {
    const parsed = parseLifeLog(
      { eventName: "Fed", args: { delta: 20 }, transactionHash: TX },
      NOW,
    );
    expect(parsed).toEqual({ kind: "fed", delta: 20, stage: null, tx: TX, at: NOW });
  });

  it("Evolved несёт стадию роста — дельты у него нет", () => {
    const parsed = parseLifeLog(
      { eventName: "Evolved", args: { stage: 1 }, transactionHash: TX },
      NOW,
    );
    expect(parsed).toEqual({ kind: "evolved", delta: null, stage: 1, tx: TX, at: NOW });
  });

  it("чужое событие в ленту не попадает", () => {
    expect(parseLifeLog({ eventName: "Transfer", args: {}, transactionHash: TX }, NOW)).toBeNull();
  });

  it("лог без tx-хеша пропускаем — запись без basescan-ссылки не бывает", () => {
    expect(parseLifeLog({ eventName: "Played", args: { delta: 10 } }, NOW)).toBeNull();
    expect(
      parseLifeLog({ eventName: "Played", args: { delta: 10 }, transactionHash: null }, NOW),
    ).toBeNull();
  });
});

describe("basescanTxUrl — ссылка на живую ленту транзакций", () => {
  it("Base Sepolia sepolia.basescan.org, хеш на конце", () => {
    expect(basescanTxUrl(TX)).toBe(`https://sepolia.basescan.org/tx/${TX}`);
  });
});

describe("appendFeed — лента помнит последние 10", () => {
  it("новые события сверху, старше десяти тихо уходят", () => {
    let feed: ReturnType<typeof appendFeed> = [];
    for (let delta = 1; delta <= 12; delta++) {
      const parsed: ParsedLifeEvent = {
        kind: "fed",
        delta,
        stage: null,
        tx: TX,
        at: NOW + delta,
      };
      feed = appendFeed(feed, parsed, delta);
    }
    expect(FEED_MAX).toBe(10);
    expect(feed).toHaveLength(10);
    expect(feed[0]).toMatchObject({ delta: 12, id: 12 });
    expect(feed[9]).toMatchObject({ delta: 3, id: 3 });
  });
});

describe("lifeEventLine и feedToastTone — няшный копирайт ленты", () => {
  it("корм/игра/сон говорят голосом заботы с дельтой", () => {
    const fed = lifeEventLine({ kind: "fed", delta: 20, stage: null, tx: TX, at: NOW });
    expect(fed).toContain("Ням-ням");
    expect(fed).toContain("+20");
    expect(lifeEventLine({ kind: "played", delta: 15, stage: null, tx: TX, at: NOW })).toContain(
      "Радость пухлика +15",
    );
    expect(lifeEventLine({ kind: "slept", delta: 30, stage: null, tx: TX, at: NOW })).toContain(
      "Споки",
    );
  });

  it("эволюция — праздничная реплика про рост", () => {
    const line = lifeEventLine({ kind: "evolved", delta: null, stage: 1, tx: TX, at: NOW });
    expect(line).toContain("Пухлик вырос");
    expect(line).toContain("1");
  });

  it("тоны тостов переиспользуют знакомые тона заботы", () => {
    expect(feedToastTone("fed")).toBe("feed");
    expect(feedToastTone("played")).toBe("play");
    expect(feedToastTone("slept")).toBe("sleep");
    expect(feedToastTone("evolved")).toBe("quiet");
  });
});

describe("formatTime — тихие часы ленты", () => {
  it("ЧЧ:ММ:СС с ноликами", () => {
    expect(formatTime(new Date(2026, 9, 21, 7, 5, 9).getTime())).toBe("07:05:09");
  });
});

describe("watchLifeFeed — подписка на события контракта", () => {
  it("без адреса и ключа лента спит и сеть не трогает", () => {
    stubEnv(DEMO_KEY, "");
    const onEvent = vi.fn();
    const watch = watchLifeFeed(onEvent, vi.fn());
    expect(watch.started).toBe(false);
    expect(mocks.watchContractEvent).not.toHaveBeenCalled();
    watch.stop();
  });

  it("подписка идёт на адрес контракта, логи превращаются в записи", () => {
    stubEnv();
    const onEvent = vi.fn();
    const watch = watchLifeFeed(onEvent, vi.fn());
    expect(watch.started).toBe(true);
    expect(mocks.watchContractEvent).toHaveBeenCalledTimes(1);
    expect(lastWatchConfig().address).toBe(CRITTER);

    lastWatchConfig().onLogs([
      { eventName: "Fed", args: { delta: 20 }, transactionHash: TX },
      { eventName: "Evolved", args: { stage: 1 }, transactionHash: TX },
      { eventName: "Transfer", args: {}, transactionHash: TX },
    ]);
    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent).toHaveBeenNthCalledWith(1, {
      kind: "fed",
      delta: 20,
      stage: null,
      tx: TX,
      at: expect.any(Number),
    });
  });

  it("ошибка подписки доходит мягким onError, без паники", () => {
    stubEnv();
    const onError = vi.fn();
    watchLifeFeed(vi.fn(), onError);
    lastWatchConfig().onError();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("stop останавливает подписку — unwatch вызван", () => {
    stubEnv();
    const watch = watchLifeFeed(vi.fn(), vi.fn());
    watch.stop();
    expect(UNWATCH).toHaveBeenCalledTimes(1);
  });
});
