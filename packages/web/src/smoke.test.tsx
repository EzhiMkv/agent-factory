import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";

afterEach(() => {
  vi.useRealTimers();
});

describe("сцена «встреча с пухликом»", () => {
  it("показывает название полигона", () => {
    render(<App />);
    expect(screen.getByText("Пухляндия")).toBeTruthy();
  });

  it("до деплоя ждём нежно, без криков", () => {
    render(<App />);
    expect(screen.getByText(/Ждём-ждем деплоя/)).toBeTruthy();
  });

  it("кнопки заботы дают локальные реакции с милыми тостами", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Покормить" }));
    expect(screen.getByText(/Ням-ням/)).toBeTruthy();
  });

  it("тост уходит сам — сцена снова чистая", () => {
    vi.useFakeTimers();
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Поиграть" }));
    expect(screen.getByText(/прыг-скок/)).toBeTruthy();
    act(() => vi.advanceTimersByTime(2600));
    expect(screen.queryByText(/прыг-скок/)).toBeNull();
  });

  it("корм-реакция видна на пухлике (класс-анимация)", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Уложить спать" }));
    expect(document.querySelector(".critter.critter-action-sleep")).toBeTruthy();
  });
});
