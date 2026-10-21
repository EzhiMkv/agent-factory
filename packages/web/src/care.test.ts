import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createPublicClient: vi.fn(),
  createWalletClient: vi.fn(),
  http: vi.fn(),
  parseAbi: vi.fn(),
  privateKeyToAccount: vi.fn(),
  writeContract: vi.fn(),
}));

vi.mock("viem", () => ({
  createPublicClient: mocks.createPublicClient,
  createWalletClient: mocks.createWalletClient,
  http: mocks.http,
  parseAbi: mocks.parseAbi,
}));
vi.mock("viem/accounts", () => ({ privateKeyToAccount: mocks.privateKeyToAccount }));
vi.mock("viem/chains", () => ({ baseSepolia: { id: 84532 } }));

import { QUIET_NOTE, sendCare } from "./care";
import { resetCareClients } from "./wallet";

const DEMO_KEY = `0x${"ab".repeat(32)}`;
const CRITTER = "0x0000000000000000000000000000000000000001";
const DEMO_WALLET = "0x00000000000000000000000000000000000000aa";
const SENT_HASH = `0x${"5f".repeat(32)}`;
const RPC_URL = "https://rpc.example/baseSepolia";

function stubEnv(key = DEMO_KEY, address = CRITTER, rpc = RPC_URL) {
  vi.stubEnv("VITE_DEMO_KEY", key);
  vi.stubEnv("VITE_CRITTER_ADDRESS", address);
  vi.stubEnv("VITE_RPC_URL", rpc);
}

beforeEach(() => {
  resetCareClients();
  mocks.writeContract.mockReset();
  mocks.privateKeyToAccount.mockReset();
  mocks.privateKeyToAccount.mockReturnValue({ address: DEMO_WALLET });
  mocks.createPublicClient.mockReset();
  mocks.createPublicClient.mockReturnValue({});
  mocks.createWalletClient.mockReset();
  mocks.createWalletClient.mockReturnValue({ writeContract: mocks.writeContract });
  mocks.writeContract.mockResolvedValue(SENT_HASH);
  mocks.parseAbi.mockReset();
  mocks.parseAbi.mockReturnValue([]);
  mocks.http.mockReset();
  mocks.http.mockReturnValue({});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  resetCareClients();
});

describe("sendCare — отправка заботы в демо-сеть", () => {
  it("без ключа забота остаётся локальной — сеть не трогаем", async () => {
    stubEnv("");
    await expect(sendCare("feed")).resolves.toEqual({ kind: "skipped" });
    expect(mocks.privateKeyToAccount).not.toHaveBeenCalled();
    expect(mocks.writeContract).not.toHaveBeenCalled();
  });

  it("кривой ключ мягко пропускает отправку, без криков", async () => {
    stubEnv("не-пухлик-ключ");
    await expect(sendCare("play")).resolves.toEqual({ kind: "skipped" });
    expect(mocks.writeContract).not.toHaveBeenCalled();
  });

  it("с ключом уходит транзакция ухода и возвращается хеш", async () => {
    stubEnv();
    await expect(sendCare("feed")).resolves.toEqual({ kind: "sent", tx: SENT_HASH });
    expect(mocks.privateKeyToAccount).toHaveBeenCalledWith(DEMO_KEY);
    expect(mocks.http).toHaveBeenCalledWith(RPC_URL);
    expect(mocks.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: CRITTER, functionName: "feed", args: [20] }),
    );
  });

  it("сеть притихла — таймаут отвечает той самой милой нотой", async () => {
    stubEnv();
    vi.useFakeTimers();
    mocks.writeContract.mockReturnValue(new Promise(() => {}));
    const pending = sendCare("sleep");
    vi.advanceTimersByTime(30_000);
    await expect(pending).resolves.toEqual({ kind: "quiet" });
    expect(QUIET_NOTE).toBe("Сеть притихла — попробуем ещё разочек?");
  });

  it("ошибка записи тоже переводится в мягкую ноту, а не в панику", async () => {
    stubEnv();
    mocks.writeContract.mockRejectedValue(new Error("что-то криво"));
    await expect(sendCare("feed")).resolves.toEqual({ kind: "quiet" });
    expect(QUIET_NOTE).toContain("Сеть притихла");
  });
});

describe("getCareClients — burner-кошелёк", () => {
  it("клиенты создаются лениво и кэшируются до сброса", async () => {
    stubEnv();
    expect(await sendCare("feed")).toEqual({ kind: "sent", tx: SENT_HASH });
    expect(mocks.createWalletClient).toHaveBeenCalledTimes(1);
    expect(mocks.privateKeyToAccount).toHaveBeenCalledTimes(1);
    expect(mocks.createWalletClient).toHaveBeenCalledWith(
      expect.objectContaining({
        account: { address: DEMO_WALLET },
        chain: { id: 84532 },
      }),
    );
  });
});
