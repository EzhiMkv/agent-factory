// Тесты tc-03: конфиг — парсинг env с дефолтами, env подменяется в тесте.
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("конфиг ядра (tc-03)", () => {
  it("дефолты без env: TPS 5, endpoint T-банка, режим offline", () => {
    const cfg = loadConfig({});
    expect(cfg.tinvestToken).toBe("");
    expect(cfg.tinvestTps).toBe(5);
    expect(cfg.tinvestEndpoint).toBe("invest-public-api.tbank.ru:443");
    expect(cfg.dataMode).toBe("offline");
  });

  it("токен есть → live, TPS принимается из env", () => {
    const cfg = loadConfig({ T_INVEST_TOKEN: " secret-token ", T_INVEST_TPS: "12" });
    expect(cfg.tinvestToken).toBe("secret-token");
    expect(cfg.tinvestTps).toBe(12);
    expect(cfg.dataMode).toBe("live");
  });

  it("DATA_MODE=offline форсирует офлайн даже с токеном", () => {
    const cfg = loadConfig({ T_INVEST_TOKEN: "t", DATA_MODE: "offline" });
    expect(cfg.dataMode).toBe("offline");
  });

  it("DATA_MODE=live без токена не поднимает live", () => {
    const cfg = loadConfig({ DATA_MODE: "live" });
    expect(cfg.dataMode).toBe("offline");
  });

  it(" мусорный TPS и допустимая верхняя граница", () => {
    expect(loadConfig({ T_INVEST_TPS: "abc" }).tinvestTps).toBe(5);
    expect(loadConfig({ T_INVEST_TPS: "-1" }).tinvestTps).toBe(5);
    expect(loadConfig({ T_INVEST_TPS: "50" }).tinvestTps).toBe(50);
    expect(loadConfig({ T_INVEST_TPS: "999" }).tinvestTps).toBe(5);
  });

  it("endpoint переопределяется", () => {
    expect(loadConfig({ T_INVEST_ENDPOINT: "grpc.example:443" }).tinvestEndpoint).toBe(
      "grpc.example:443",
    );
  });
});
