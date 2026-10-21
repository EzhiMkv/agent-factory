import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPublicClient: vi.fn(),
  http: vi.fn(),
  readContract: vi.fn(),
  getBalance: vi.fn(),
}));

// formatEther/parseAbi/isAddress остаются настоящими — проверяем живое поведение,
// мокаем только сетевой слой (createPublicClient/http), как в CritterView.test.
vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: mocks.createPublicClient,
    http: mocks.http,
  };
});
vi.mock("viem/chains", () => ({ baseSepolia: { id: 84532 } }));

import TbaCard, { achievementName, formatEth, shortenAddress } from "./TbaCard";

const ACHIEVEMENTS = "0x00000000000000000000000000000000000000a1";
const TBA = "0x1111222233334444555566667777888899990000";
const RPC_URL = "https://rpc.example/baseSepolia";

type StubOptions = {
  tba?: string;
  ids?: bigint[];
  stageOf?: (id: bigint) => number;
  highest?: number;
};

function stubContractData({
  tba = TBA,
  ids = [1n, 2n],
  stageOf = (id: bigint) => (id === 1n ? 1 : 2),
  highest = 2,
}: StubOptions = {}) {
  mocks.readContract.mockImplementation(({ functionName, args }: {
    functionName: string;
    args?: readonly unknown[];
  }) => {
    switch (functionName) {
      case "tbaOf":
        return Promise.resolve(tba);
      case "achievementsOf":
        return Promise.resolve(ids);
      case "milestone": {
        const id = args?.[0];
        // viem декодирует мульти-возврат контракта массивом [critterTokenId, stage]
        return Promise.resolve([1n, typeof id === "bigint" ? stageOf(id) : 0]);
      }
      case "highestAwarded":
        return Promise.resolve(highest);
      default:
        return Promise.reject(new Error(`неожиданный вызов: ${functionName}`));
    }
  });
}

function stubEnv(address: string = ACHIEVEMENTS) {
  vi.stubEnv("VITE_ACHIEVEMENTS_ADDRESS", address);
  vi.stubEnv("VITE_RPC_URL", RPC_URL);
}

beforeEach(() => {
  mocks.createPublicClient.mockReset();
  mocks.createPublicClient.mockReturnValue({
    readContract: mocks.readContract,
    getBalance: mocks.getBalance,
  });
  mocks.http.mockReset();
  mocks.http.mockReturnValue({});
  mocks.readContract.mockReset();
  mocks.getBalance.mockReset();
  mocks.getBalance.mockResolvedValue(50_000_000_000_000_000n); // 0.05 ETH
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("TbaCard — кошелёчек пухлика с нежными состояниями", () => {
  it("без адресов в env карточка нежно ждёт деплоя и сеть не трогает", () => {
    stubEnv("");
    render(<TbaCard />);
    expect(screen.getByText(/Кошелёчек пухлика ещё не заселился/)).toBeTruthy();
    expect(mocks.createPublicClient).not.toHaveBeenCalled();
    expect(mocks.readContract).not.toHaveBeenCalled();
  });

  it("показывает сокращённый адрес со scan-ссылкой на basescan", async () => {
    stubEnv();
    stubContractData();
    render(<TbaCard />);
    expect(await screen.findByText("0x1111…0000")).toBeTruthy();
    const link = document.querySelector(".tba-scan-link") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(
      `https://sepolia.basescan.org/address/${TBA}`,
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.getByTitle(TBA)).toBeTruthy();
  });

  it("баланс кошелька приходит в ETH через formatEther", async () => {
    stubEnv();
    stubContractData();
    render(<TbaCard />);
    expect(await screen.findByText("В кармашке: 0.05 ETH")).toBeTruthy();
    expect(mocks.getBalance).toHaveBeenCalledWith({ address: TBA });
  });

  it("ачивки из геттеров с милыми названиями, свежая — праздничная", async () => {
    stubEnv();
    stubContractData();
    render(<TbaCard />);
    expect(await screen.findByText("Первая эволюция")).toBeTruthy();
    expect(screen.getByText("Вторая эволюция")).toBeTruthy();
    expect(screen.getByText("ачивка №1")).toBeTruthy();
    expect(screen.getByText("ачивка №2")).toBeTruthy();
    const festive = document.querySelector(".tba-achievement-festive");
    expect(festive).toBeTruthy();
    expect(festive?.textContent).toContain("Вторая эволюция");
  });

  it("пустые ачивки — пухлик старается, праздника пока нет", async () => {
    stubEnv();
    stubContractData({ ids: [] });
    render(<TbaCard />);
    expect(await screen.findByText(/Ачивки ещё в пути — пухлик старается/)).toBeTruthy();
    expect(document.querySelector(".tba-achievement")).toBeNull();
    expect(document.querySelector(".tba-achievement-festive")).toBeNull();
  });

  it("баланс не доехал — нежная записка, остальная карточка на месте", async () => {
    stubEnv();
    stubContractData();
    mocks.getBalance.mockRejectedValue(new Error("сеть спит"));
    render(<TbaCard />);
    expect(await screen.findByText("В кармашке пока пустовато :3")).toBeTruthy();
    expect(screen.getByText("0x1111…0000")).toBeTruthy();
  });

  it("сеть молчит — пухлик зазевался и предлагает ещё разочек", async () => {
    stubEnv();
    mocks.readContract.mockRejectedValue(new Error("сеть спит"));
    render(<TbaCard />);
    expect(await screen.findByText(/Пухлик зазевался/)).toBeTruthy();

    stubContractData();
    fireEvent.click(screen.getByRole("button", { name: "Попробовать ещё разочек" }));
    await screen.findByText("0x1111…0000");
  });
});

describe("хелперы карточки", () => {
  it("адрес сокращается, ссылка строится, форматEth бережёт нули", () => {
    expect(shortenAddress(TBA)).toBe("0x1111…0000");
    expect(formatEth(1_500_000_000_000_000_000n)).toBe("1.5");
    expect(formatEth(0n)).toBe("0");
    expect(achievementName(3)).toContain("пухлик растёт");
  });
});
