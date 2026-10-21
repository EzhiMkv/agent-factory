import { parseAbi } from "viem";
import type { ToastTone } from "./Toast";
import { critterAddress, getCareClients } from "./wallet";

const lifeAbi = parseAbi([
  "event Fed(uint8 delta)",
  "event Played(uint8 delta)",
  "event Slept(uint8 delta)",
  "event Evolved(uint8 stage)",
]);

export type LifeEventKind = "fed" | "played" | "slept" | "evolved";

/** Запись ленты: что случилось, насколько, в какой транзакции и когда. */
export type ParsedLifeEvent = {
  kind: LifeEventKind;
  delta: number | null;
  stage: number | null;
  tx: `0x${string}`;
  at: number;
};

export type LifeFeedEntry = ParsedLifeEvent & { id: number };

/** Минимальный срез viem-лога, нужный для ленты (структурно совместим с Log). */
export type LifeEventLog = {
  eventName: string;
  args?: { delta?: number; stage?: number } | undefined;
  transactionHash?: `0x${string}` | null | undefined;
};

const EVENT_KINDS: Record<string, LifeEventKind> = {
  Fed: "fed",
  Played: "played",
  Slept: "slept",
  Evolved: "evolved",
};

/** Лента помнит только последние 10 событий — старые тихо уходят в basescan. */
export const FEED_MAX = 10;

/** Basescan Base Sepolia: каждая запись ленты ведёт в живую ленту транзакций. */
export const BASESCAN_TX_BASE = "https://sepolia.basescan.org/tx/";

export function basescanTxUrl(tx: `0x${string}`): string {
  return `${BASESCAN_TX_BASE}${tx}`;
}

/**
 * Чистый парсинг лога контракта в запись ленты.
 * Возвращает null для чужих событий и логов без tx-хеша — без ссылки
 * на basescan записи в ленте не бывает.
 */
export function parseLifeLog(log: LifeEventLog, nowMs: number): ParsedLifeEvent | null {
  const kind = EVENT_KINDS[log.eventName];
  const tx = log.transactionHash;
  if (!kind || !tx) return null;
  const args = log.args;
  return {
    kind,
    delta: typeof args?.delta === "number" ? args.delta : null,
    stage: typeof args?.stage === "number" ? args.stage : null,
    tx,
    at: nowMs,
  };
}

/** Новые события сверху, старше десяти — мягко забываются. */
export function appendFeed(
  current: LifeFeedEntry[],
  parsed: ParsedLifeEvent,
  id: number,
): LifeFeedEntry[] {
  return [{ ...parsed, id }, ...current].slice(0, FEED_MAX);
}

/** Няшный копирайт записи: события говорят голосом заботы, не логами. */
export function lifeEventLine(parsed: ParsedLifeEvent): string {
  switch (parsed.kind) {
    case "fed":
      return parsed.delta === null
        ? "Ням-ням! Пухлик поел!"
        : `Ням-ням! Пухлик поел на +${parsed.delta}`;
    case "played":
      return parsed.delta === null
        ? "Ура, играли! Пухлик прыг-скок!"
        : `Ура, играли! Радость пухлика +${parsed.delta}`;
    case "slept":
      return parsed.delta === null
        ? "Споки-споки… пухлик отдохнул!"
        : `Споки-споки… Силки пухлика +${parsed.delta}`;
    case "evolved":
      return parsed.stage === null
        ? "Пухлик вырос! Ура-ура!"
        : `Пухлик вырос! Теперь он стадии ${parsed.stage} — ура-ура!`;
  }
}

const FEED_TOAST_TONES: Record<Exclude<LifeEventKind, "evolved">, ToastTone> = {
  fed: "feed",
  played: "play",
  slept: "sleep",
};

/** Тон тоста-события: забота мапится в знакомые тона, эволюция — тихий праздник. */
export function feedToastTone(kind: LifeEventKind): ToastTone {
  return kind === "evolved" ? "quiet" : FEED_TOAST_TONES[kind];
}

/** Часы ленты: тихие ЧЧ:ММ:СС, чтобы не пугать пухлика датами. */
export function formatTime(atMs: number): string {
  const moment = new Date(atMs);
  const pad = (n: number): string => n.toString().padStart(2, "0");
  return `${pad(moment.getHours())}:${pad(moment.getMinutes())}:${pad(moment.getSeconds())}`;
}

export type LifeFeedWatch = { started: boolean; stop: () => void };

/**
 * Подписка на все события заботы одним watchContractEvent.
 * Без адреса контракта или burner-клиента не стартует — сеть не трогаем.
 */
export function watchLifeFeed(
  onEvent: (parsed: ParsedLifeEvent) => void,
  onError: () => void,
): LifeFeedWatch {
  const address = critterAddress();
  const clients = getCareClients();
  if (!address || !clients) return { started: false, stop: () => {} };

  const unwatch = clients.public.watchContractEvent({
    abi: lifeAbi,
    address,
    onLogs: (logs) => {
      for (const log of logs) {
        const parsed = parseLifeLog(log, Date.now());
        if (parsed) onEvent(parsed);
      }
    },
    onError: () => onError(),
  });

  return { started: true, stop: () => unwatch() };
}
