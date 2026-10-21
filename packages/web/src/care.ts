import { parseAbi } from "viem";
import type { CareAction } from "./Toast";
import { critterAddress, getCareClients } from "./wallet";

const careAbi = parseAbi([
  "function feed(uint8 amount)",
  "function play(uint8 amount)",
  "function sleep(uint8 amount)",
]);

const CARE_MORSEL = 20;
const DEFAULT_TIMEOUT_MS = 30_000;

export const QUIET_NOTE = "Сеть притихла — попробуем ещё разочек?";
export const SENT_NOTE = "Пых! Забота улетела в сеть :3";

export type CareResult =
  | { kind: "sent"; tx: `0x${string}` }
  | { kind: "skipped" }
  | { kind: "quiet" };

export class CareTimeoutError extends Error {
  constructor() {
    super(QUIET_NOTE);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: number | undefined;
  const quietBomb = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new CareTimeoutError()), ms);
  });
  return Promise.race([promise, quietBomb]).finally(() => {
    if (timer !== undefined) window.clearTimeout(timer);
  });
}

export async function sendCare(
  action: CareAction,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<CareResult> {
  const clients = getCareClients();
  const address = critterAddress();
  if (!clients || !address) return { kind: "skipped" };
  try {
    const tx = await withTimeout(
      clients.wallet.writeContract({
        abi: careAbi,
        address,
        functionName: action,
        args: [CARE_MORSEL],
      }),
      timeoutMs,
    );
    return { kind: "sent", tx };
  } catch {
    return { kind: "quiet" };
  }
}
