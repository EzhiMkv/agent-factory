// Тесты tc-02: доменные типы — статическая проверка + JSON-сериализация.
import { describe, expect, it } from "vitest";
import {
  INTERVAL_MS,
  type Candle,
  type Jump,
  type NewsItem,
  type Share,
} from "../../src/dom/types.js";

const candle: Candle = {
  instrumentUid: "uid-1",
  interval: "5min",
  ts: "2026-10-20T10:05:00.000Z",
  open: 310.15,
  high: 311.9,
  low: 309.5,
  close: 311.2,
  volume: 12345,
};

describe("доменные типы (tc-02)", () => {
  it("свеча, новость и акция переживают JSON round-trip без изменений", () => {
    const item: NewsItem = {
      id: "42",
      title: "Заголовок",
      body: "Тело",
      url: null,
      ts: "2026-10-20T10:00:00.000Z",
      instrumentUids: ["uid-1", "uid-2"],
    };
    const share: Share = { ticker: "SBER", name: "Сбербанк", instrumentUid: "uid-1", currency: "rub" };
    for (const v of [candle, item, share]) {
      expect(JSON.parse(JSON.stringify(v))).toEqual(v);
    }
  });

  it("интервалы замаплены в миллисекунды (маппинг из настроек)", () => {
    expect(INTERVAL_MS["1min"]).toBe(60_000);
    expect(INTERVAL_MS["1hour"]).toBe(3_600_000);
    expect(INTERVAL_MS["1day"]).toBe(86_400_000);
  });

  it("тип скачка приводим к данным свечи (статическая гарантия)", () => {
    const jump: Jump = {
      ticker: "SBER",
      instrumentUid: candle.instrumentUid,
      name: "Сбербанк",
      ts: candle.ts,
      ret: 0.034,
      z: 4.2,
      close: candle.close,
      windowSigma: 0.008,
      direction: "up",
    };
    expect(jump.direction).toBe("up");
  });
});
