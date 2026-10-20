// Тесты tc-04: типизированные ошибки; is_unauthenticated-аналог по референсу
// jump_news/api.py (UNAUTHENTICATED, gRPC-код 16, код 40003).
import { describe, expect, it } from "vitest";
import {
  isRateLimitError,
  isRetryableTransportError,
  isUnauthenticatedError,
  TInvestAuthError,
  TInvestError,
  TInvestRateError,
  TInvestTransportError,
} from "../../src/tinvest/errors.js";

describe("типизированные ошибки (tc-04)", () => {
  it("базовый класс связывает подклассы", () => {
    expect(new TInvestAuthError("x")).toBeInstanceOf(TInvestError);
    expect(new TInvestRateError("x")).toBeInstanceOf(TInvestError);
    expect(new TInvestTransportError("x")).toBeInstanceOf(TInvestError);
    expect(new TInvestAuthError("x").code).toBe("auth");
    expect(new TInvestRateError("x").code).toBe("rate");
    expect(new TInvestTransportError("x").code).toBe("transport");
  });

  it("unauthenticated: сообщения со статусом 16 и 40003 распознаются", () => {
    expect(isUnauthenticatedError("UNAUTHENTICATED: bad token")).toBe(true);
    expect(isUnauthenticatedError("AiError 16 UNAUTHENTICATED")).toBe(true);
    expect(isUnauthenticatedError(new Error("code 40003: token rejected"))).toBe(true);
    expect(isUnauthenticatedError("HTTP 401")).toBe(false);
    expect(isUnauthenticatedError("PERMISSION_DENIED")).toBe(false);
    expect(isUnauthenticatedError("UNAVAILABLE")).toBe(false);
  });

  it("rate-limit: RESOURCE_EXHAUSTED / 429 / Too Many Requests", () => {
    expect(isRateLimitError("8 RESOURCE_EXHAUSTED")).toBe(true);
    expect(isRateLimitError("HTTP 429")).toBe(true);
    expect(isRateLimitError("Too Many Requests")).toBe(true);
    expect(isRateLimitError("UNAVAILABLE")).toBe(false);
    expect(isRateLimitError("16 UNAUTHENTICATED")).toBe(false);
  });

  it("транспорт: ретраятся только сетевые причины", () => {
    expect(isRetryableTransportError("UNAVAILABLE")).toBe(true);
    expect(isRetryableTransportError("DEADLINE_EXCEEDED")).toBe(true);
    expect(isRetryableTransportError("ECONNRESET")).toBe(true);
    expect(isRetryableTransportError("INVALID_ARGUMENT")).toBe(false);
    expect(isRetryableTransportError("RESOURCE_EXHAUSTED")).toBe(false);
  });
});
