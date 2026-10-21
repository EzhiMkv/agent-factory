import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Toasts, useCareToasts } from "./Toast";

afterEach(() => {
  vi.useRealTimers();
});

describe("useCareToasts — реакции по доктрине", () => {
  it("покормили — появляется мягкое «Ням-ням!»", () => {
    const { result } = renderHook(() => useCareToasts());
    act(() => result.current.pop("feed"));
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]).toMatchObject({ text: /Ням-ням/, tone: "feed" });
  });

  it("тост уходит сам, не задерживаясь навсегда", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCareToasts());
    act(() => result.current.pop("play"));
    expect(result.current.toasts).toHaveLength(1);
    act(() => vi.advanceTimersByTime(2500));
    expect(result.current.toasts).toHaveLength(0);
  });

  it("тосты копятся мягко (не больше трёх подряд)", () => {
    const { result } = renderHook(() => useCareToasts());
    act(() => {
      result.current.pop("feed");
      result.current.pop("play");
      result.current.pop("sleep");
      result.current.pop("feed");
    });
    expect(result.current.toasts).toHaveLength(3);
  });
});

describe("Toasts — виджет", () => {
  it("пусто — не рисует лишнего", () => {
    const { container } = render(<Toasts items={[]} />);
    expect(container.querySelector(".toasts")).toBeNull();
  });

  it("рисует тост с тональным классом", () => {
    render(<Toasts items={[{ id: 1, text: "Ням-ням!", tone: "feed" }]} />);
    expect(screen.getByText("Ням-ням!")).toBeTruthy();
    expect(document.querySelector(".toast-feed")).toBeTruthy();
  });

  it("тосты не мешают пользователю (pointer-events нет)", () => {
    render(<Toasts items={[{ id: 1, text: "Ням!", tone: "feed" }]} />);
    const toast = document.querySelector(".toast") as HTMLElement;
    fireEvent.click(toast);
    expect(screen.getByText("Ням!")).toBeTruthy();
  });
});
