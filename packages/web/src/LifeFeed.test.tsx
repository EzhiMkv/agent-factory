import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import LifeFeed from "./LifeFeed";
import { resetCareClients } from "./wallet";
import type { LifeEventLog } from "./lifeFeed";

const TX = `0x${"ab".repeat(32)}` as const;
const CRITTER = "0x0000000000000000000000000000000000000001";
const DEMO_KEY = `0x${"cd".repeat(32)}`;
const UNWATCH = vi.fn();

function lastWatchConfig(): {
  address: string;
  onLogs: (logs: LifeEventLog[]) => void;
  onError: () => void;
} {
  const call = mocks.watchContractEvent.mock.calls.at(-1);
  if (!call) throw new Error("watchContractEvent не вызывался");
  return call[0] as {
    address: string;
    onLogs: (logs: LifeEventLog[]) => void;
    onError: () => void;
  };
}

function emitLogs(logs: LifeEventLog[]) {
  act(() => lastWatchConfig().onLogs(logs));
}

function stubEnv(address = CRITTER) {
  vi.stubEnv("VITE_DEMO_KEY", DEMO_KEY);
  vi.stubEnv("VITE_CRITTER_ADDRESS", address);
  vi.stubEnv("VITE_RPC_URL", "https://rpc.example/baseSepolia");
}

beforeEach(() => {
  resetCareClients();
  UNWATCH.mockReset();
  mocks.privateKeyToAccount.mockReset();
  mocks.privateKeyToAccount.mockReturnValue({ address: "0x00000000000000000000000000000000000000aa" });
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

describe("LifeFeed — лента жизни с нежными состояниями", () => {
  it("без адреса лента спит-досыпает и сеть не трогает", () => {
    stubEnv("");
    render(<LifeFeed />);
    expect(screen.getByText(/Лента спит-досыпает/)).toBeTruthy();
    expect(mocks.watchContractEvent).not.toHaveBeenCalled();
  });

  it("подписалась и пока тихо — пухлик отдыхает", () => {
    stubEnv();
    render(<LifeFeed />);
    expect(screen.getByText(/Пока тихо/)).toBeTruthy();
    expect(lastWatchConfig().address).toBe(CRITTER);
  });

  it("корм-событие прилетает с basescan-ссылкой", () => {
    stubEnv();
    render(<LifeFeed />);
    emitLogs([{ eventName: "Fed", args: { delta: 20 }, transactionHash: TX }]);
    expect(screen.getByText(/Пухлик поел на \+20/)).toBeTruthy();
    const link = document.querySelector(".feed-link") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(`https://sepolia.basescan.org/tx/${TX}`);
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("эволюция — праздничный баннер и тихий праздничный тост", () => {
    stubEnv();
    const note = vi.fn();
    render(<LifeFeed note={note} />);
    emitLogs([{ eventName: "Evolved", args: { stage: 1 }, transactionHash: TX }]);
    expect(screen.getByText(/Пухлик вырос/)).toBeTruthy();
    expect(document.querySelector(".feed-item-evolved")).toBeTruthy();
    expect(note).toHaveBeenCalledWith(expect.stringContaining("Пухлик вырос"), "quiet");
  });

  it("лента помнит только последние 10, новые сверху", () => {
    stubEnv();
    render(<LifeFeed />);
    emitLogs(
      Array.from({ length: 12 }, (_, i) => ({
        eventName: "Played",
        args: { delta: i + 1 },
        transactionHash: TX,
      })),
    );
    expect(document.querySelectorAll(".feed-item")).toHaveLength(10);
    const first = document.querySelector(".feed-text");
    expect(first?.textContent).toContain("+12");
  });

  it("сеть притихла — лента нежно ждёт, уже увиденное не прячет", () => {
    stubEnv();
    render(<LifeFeed />);
    emitLogs([{ eventName: "Slept", args: { delta: 30 }, transactionHash: TX }]);
    act(() => lastWatchConfig().onError());
    expect(screen.getByText(/Сеть притихла/)).toBeTruthy();
    expect(screen.getByText(/Пухлик отдохнул|Силы пухлика \+30/)).toBeTruthy();
  });
});
