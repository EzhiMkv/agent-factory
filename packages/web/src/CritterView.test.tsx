import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import CritterView from "./CritterView";

const { readContract } = vi.hoisted(() => ({ readContract: vi.fn() }));

vi.mock("viem", () => ({
  createPublicClient: () => ({ readContract }),
  http: () => ({}),
  parseAbi: () => [],
}));
vi.mock("viem/chains", () => ({ baseSepolia: { id: 84532 } }));

const ADDRESS = "0x0000000000000000000000000000000000000001";

function stubAddress(value: string) {
  vi.stubEnv("VITE_CRITTER_ADDRESS", value);
}

afterEach(() => {
  vi.unstubAllEnvs();
  readContract.mockReset();
});

describe("CritterView — сцена с нежными состояниями", () => {
  it("без адреса в .env показывает милый экран ожидания, не кричит", () => {
    stubAddress("");
    render(<CritterView />);
    expect(screen.getByText(/Ждём-ждем деплоя/)).toBeTruthy();
    expect(screen.getByRole("img", { name: "Пухлик-заглушка" })).toBeTruthy();
    expect(screen.queryByRole("img", { name: "Пухлик из он-чейн арта" })).toBeNull();
  });

  it("с адресом зовёт tokenURI и показывает пухлика из svg", async () => {
    stubAddress(ADDRESS);
    readContract.mockResolvedValue("data:image/svg+xml;base64,PHN2Zy8+");
    render(<CritterView />);
    const img = await screen.findByRole("img", { name: "Пухлик из он-чейн арта" });
    expect(img.getAttribute("src")).toBe("data:image/svg+xml;base64,PHN2Zy8+");
    expect(readContract).toHaveBeenCalledTimes(1);
  });

  it("сеть молчит — пухлик зазевался и предлагает попробовать ещё разочек", async () => {
    stubAddress(ADDRESS);
    readContract.mockRejectedValue(new Error("сеть спит"));
    render(<CritterView />);
    expect(await screen.findByText(/Пухлик зазевался/)).toBeTruthy();

    readContract.mockResolvedValue("data:image/svg+xml;base64,PHN2Zy8+");
    fireEvent.click(screen.getByRole("button", { name: "Попробовать ещё разочек" }));
    await screen.findByRole("img", { name: "Пухлик из он-чейн арта" });
  });

  it("не-svg ответ от контракта тоже встречаем нежно", async () => {
    stubAddress(ADDRESS);
    readContract.mockResolvedValue("ipfs://кто-это-тут");
    render(<CritterView />);
    expect(await screen.findByText(/Пухлик зазевался/)).toBeTruthy();
  });

  it("busy-состояние пыхтит: класс-анимация и заботливая реплика", async () => {
    stubAddress(ADDRESS);
    readContract.mockResolvedValue("data:image/svg+xml;base64,PHN2Zy8+");
    render(<CritterView busy />);
    expect(await screen.findByText(/Пыхтим… несем заботу в сеть/)).toBeTruthy();
    expect(document.querySelector(".critter-busy")).toBeTruthy();
  });

  it("без busy пухлик просто здоровается", async () => {
    stubAddress(ADDRESS);
    readContract.mockResolvedValue("data:image/svg+xml;base64,PHN2Zy8+");
    render(<CritterView />);
    expect(await screen.findByText("Привет! Я твой пухлик :3")).toBeTruthy();
    expect(document.querySelector(".critter-busy")).toBeNull();
  });
});
