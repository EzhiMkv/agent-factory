import { useCallback, useRef, useState } from "react";

export type CareAction = "feed" | "play" | "sleep";

export type ToastTone = CareAction | "quiet";

export const CARE_LINES: Record<CareAction, string> = {
  feed: "Ням-ням! Пухлик хрумкает :3",
  play: "Ура, играем! Пухлик прыг-скок!",
  sleep: "Споки-споки… ш-ш-ш, пухлик засыпает",
};

export type ToastItem = { id: number; text: string; tone: ToastTone };

const TOAST_LIFETIME_MS = 2400;
const TOAST_MAX = 3;

export function useCareToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const add = useCallback((text: string, tone: ToastTone) => {
    const id = ++nextId.current;
    setToasts((current) => [...current, { id, text, tone }].slice(-TOAST_MAX));
    window.setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, TOAST_LIFETIME_MS);
  }, []);

  const pop = useCallback(
    (action: CareAction) => add(CARE_LINES[action], action),
    [add],
  );

  const note = useCallback(
    (text: string, tone: ToastTone = "quiet") => add(text, tone),
    [add],
  );

  return { toasts, pop, note };
}

export function Toasts({ items }: { items: ToastItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
