import { describe, expect, it } from "vitest";
import { CORE_VERSION } from "../src/index.js";

describe("core smoke", () => {
  it("экспортирует версию", () => {
    expect(CORE_VERSION).toBe("0.0.1");
  });
});
