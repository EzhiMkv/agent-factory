import { useCallback, useRef, useState } from "react";

export type CareAction = "feed" | "play" | "sleep";

export const CARE_LINES: Record<CareAction, string> = {
  feed: "Ням-ням! Пухлик хрумкает :3",
  play: "Ура, играем! Пухлик прыг-скок!",
  sleep: "Споки-споки… ш-ш-ш, пухлик засыпает",
};

export type ToastItem = { id: number; text: string; tone: CareAction };

const TOAST_LIFETIME_MS = 2400;
const TOAST_MAX = 3;

export function useCareToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const pop = useCallback((action: CareAction) => {
    const id = ++nextId.current;
    setToasts((current) =>
      [...current, { id, text: CARE_LINES[action], tone: action }].slice(-TOAST_MAX),
    );
    window.setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, TOAST_LIFETIME_MS);
  }, []);

  return { toasts, pop };
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
