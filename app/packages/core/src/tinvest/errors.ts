// Типизированные ошибки T-Invest (tc-04). Референс распознавания —
// jump_news/api.py: is_unauthenticated ловит "UNAUTHENTICATED" и код 40003;
// gRPC статус-код UNAUTHENTICATED = 16.

export type TInvestErrorCode = "auth" | "rate" | "transport";

export class TInvestError extends Error {
  readonly code: TInvestErrorCode;

  constructor(code: TInvestErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = `TInvest${{ auth: "Auth", rate: "Rate", transport: "Transport" }[code]}Error`;
  }
}

export class TInvestAuthError extends TInvestError {
  constructor(message: string) {
    super("auth", message);
  }
}

export class TInvestRateError extends TInvestError {
  constructor(message: string) {
    super("rate", message);
  }
}

export class TInvestTransportError extends TInvestError {
  constructor(message: string) {
    super("transport", message);
  }
}

/** Невалидный/просроченный токен: UNAUTHENTICATED, gRPC-статус 16, код 40003. */
export function isUnauthenticatedError(err: unknown): boolean {
  const s = String(err).toUpperCase();
  return /\bUNAUTHENTICATED\b/.test(s) || /\b16\b/.test(s) || s.includes("40003");
}

/** Лимит чтения: RESOURCE_EXHAUSTED = 8, 429, "Too Many Requests". */
export function isRateLimitError(err: unknown): boolean {
  const s = String(err).toUpperCase();
  return /RESOURCE_EXHAUSTED/.test(s) || /\b429\b/.test(s) || s.includes("TOO MANY REQUESTS");
}

/** Транспорт: UNAVAILABLE = 14, DEADLINE_EXCEEDED = 4, сетевые причины. */
export function isRetryableTransportError(err: unknown): boolean {
  const s = String(err).toUpperCase();
  return /UNAVAILABLE|DEADLINE|ECONN|ETIMEDOUT/.test(s);
}
