import { useEffect, useState } from "react";
import CritterView from "./CritterView";
import { QUIET_NOTE, SENT_NOTE, sendCare } from "./care";
import LifeFeed from "./LifeFeed";
import { Toasts, useCareToasts, type CareAction } from "./Toast";
import "./App.css";

const CARE_BUTTONS: { action: CareAction; label: string }[] = [
  { action: "feed", label: "Покормить" },
  { action: "play", label: "Поиграть" },
  { action: "sleep", label: "Уложить спать" },
];

const REACTION_MS = 900;

export default function App() {
  const { toasts, pop, note } = useCareToasts();
  const [reaction, setReaction] = useState<CareAction | null>(null);
  const [busy, setBusy] = useState(false);

  const react = (action: CareAction) => {
    pop(action);
    setReaction(action);
    void deliverCare(action);
  };

  const deliverCare = async (action: CareAction) => {
    setBusy(true);
    const result = await sendCare(action);
    setBusy(false);
    if (result.kind === "sent") note(SENT_NOTE);
    else if (result.kind === "quiet") note(QUIET_NOTE);
  };

  useEffect(() => {
    if (!reaction) return;
    const t = setTimeout(() => setReaction(null), REACTION_MS);
    return () => clearTimeout(t);
  }, [reaction]);

  return (
    <main className="scene">
      <h1 className="scene-title">Пухляндия</h1>
      <p className="scene-subtitle">Встреча с пухликом</p>

      <CritterView reaction={reaction} busy={busy} />

      <Toasts items={toasts} />

      <div className="care-buttons">
        {CARE_BUTTONS.map(({ action, label }) => (
          <button key={action} className="care-button" type="button" onClick={() => react(action)}>
            {label}
          </button>
        ))}
      </div>

      <LifeFeed note={note} />

      <p className="scene-hint">Сеть заглянет к нам чуть позже — пока реакции живут в сцене</p>
    </main>
  );
}
