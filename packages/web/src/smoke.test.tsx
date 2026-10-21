import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import App from "./App";

describe("сцена-заглушка «встреча с пухликом»", () => {
  it("показывает приветствие пухлика", () => {
    render(<App />);
    expect(screen.getByText(/Я твой пухлик/)).toBeTruthy();
  });

  it("показывает название полигона", () => {
    render(<App />);
    expect(screen.getByText("Пухляндия")).toBeTruthy();
  });
});
