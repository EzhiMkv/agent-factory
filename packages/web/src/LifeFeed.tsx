import { useEffect, useRef, useState } from "react";
import type { ToastTone } from "./Toast";
import {
  appendFeed,
  basescanTxUrl,
  feedToastTone,
  formatTime,
  lifeEventLine,
  watchLifeFeed,
  type LifeFeedEntry,
  type ParsedLifeEvent,
} from "./lifeFeed";
import "./LifeFeed.css";

/** Реплика тоста-события — тот же нежный канал, что и у кнопок заботы. */
export type LifeFeedNote = (text: string, tone?: ToastTone) => void;

type FeedStatus = { kind: "off" } | { kind: "listening" } | { kind: "quiet" };

const OFF_NOTE = "Лента спит-досыпает: пухлик ещё не поселился в сети :3";
const EMPTY_NOTE = "Пока тихо… пухлик хорошенько отдыхает :3";
const QUIET_NOTE = "Сеть притихла — лента тихонько подождёт :3";

export default function LifeFeed({ note }: { note?: LifeFeedNote }) {
  const [entries, setEntries] = useState<LifeFeedEntry[]>([]);
  const [status, setStatus] = useState<FeedStatus>({ kind: "listening" });
  const nextId = useRef(0);

  useEffect(() => {
    let live = true;
    const watch = watchLifeFeed(
      (parsed: ParsedLifeEvent) => {
        if (!live) return;
        const id = ++nextId.current;
        setEntries((current) => appendFeed(current, parsed, id));
        note?.(lifeEventLine(parsed), feedToastTone(parsed.kind));
      },
      () => {
        if (live) setStatus({ kind: "quiet" });
      },
    );
    if (!watch.started) setStatus({ kind: "off" });
    return () => {
      live = false;
      watch.stop();
    };
  }, [note]);

  return (
    <section className="life-feed" aria-label="Лента жизни пухлика">
      <h2 className="life-feed-title">Лента жизни</h2>
      {status.kind === "off" ? (
        <p className="feed-note">{OFF_NOTE}</p>
      ) : (
        <>
          {entries.length === 0 ? (
            <p className="feed-note">{status.kind === "quiet" ? QUIET_NOTE : EMPTY_NOTE}</p>
          ) : (
            <ul className="feed-list">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className={entry.kind === "evolved" ? "feed-item feed-item-evolved" : "feed-item"}
                >
                  <span className="feed-text">{lifeEventLine(entry)}</span>
                  <span className="feed-time">{formatTime(entry.at)}</span>
                  <a
                    className="feed-link"
                    href={basescanTxUrl(entry.tx)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    basescan
                  </a>
                </li>
              ))}
            </ul>
          )}
          {status.kind === "quiet" && entries.length > 0 && <p className="feed-note">{QUIET_NOTE}</p>}
        </>
      )}
    </section>
  );
}
