import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("health endpoint", () => {
  const app = buildApp();
  beforeAll(async () => app.ready());
  afterAll(async () => app.close());

  it("отвечает ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
  });
});
