import { useCallback, useEffect, useState } from "react";
import { createPublicClient, http, parseAbi } from "viem";
import { baseSepolia } from "viem/chains";
import type { CareAction } from "./Toast";
import { critterAddress } from "./wallet";

type Phase =
  | { kind: "waiting" }
  | { kind: "loading" }
  | { kind: "ready"; svgUri: string }
  | { kind: "sleepy"; message: string };

const critterAbi = parseAbi(["function tokenURI(uint256) view returns (string)"]);

const DEPLOY_NOTE = "Ждём-ждем деплоя… Пухлик пока гостит в заглушке сцены :3";
const LOADING_NOTE = "Пыхтим… зовём пухлика из сети";
const BUSY_NOTE = "Пыхтим… несем заботу в сеть";
const SLEEPY_NOTE = "Пухлик зазевался — попробуем ещё разочек?";

async function fetchTokenUri(address: `0x${string}`, rpcUrl: string | undefined): Promise<string> {
  const client = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  const uri = await client.readContract({
    abi: critterAbi,
    address,
    args: [1n],
    functionName: "tokenURI",
  });
  if (typeof uri !== "string" || !uri.startsWith("data:image/svg+xml")) {
    throw new Error("tokenURI без svg-картинки");
  }
  return uri;
}

function DemoJelly({ reaction, busy }: { reaction?: CareAction | null; busy: boolean }) {
  const actionClass = reaction ? ` critter-action-${reaction}` : "";
  const busyClass = busy ? " critter-busy" : "";
  return (
    <svg className={`critter${actionClass}${busyClass}`} viewBox="0 0 240 240" role="img" aria-label="Пухлик-заглушка">
      <defs>
        <radialGradient id="jelly" cx="35%" cy="25%" r="80%">
          <stop offset="0%" stopColor="#d8fbff" />
          <stop offset="55%" stopColor="#b3ecff" />
          <stop offset="100%" stopColor="#9adcf7" />
        </radialGradient>
      </defs>
      <ellipse className="critter-shadow" cx="120" cy="205" rx="62" ry="12" fill="#e3d5f0" opacity="0.6" />
      <g className="critter-body">
        <path
          d="M120 40 C 168 40 196 74 196 120 C 196 176 160 196 120 196 C 80 196 44 176 44 120 C 44 74 72 40 120 40 Z"
          fill="url(#jelly)"
        />
        <ellipse cx="86" cy="70" rx="22" ry="12" fill="#ffffff" opacity="0.55" transform="rotate(-18 86 70)" />
        <g className="critter-eyes">
          <circle cx="92" cy="112" r="20" fill="#ffffff" stroke="#7f95c8" strokeWidth="2.5" />
          <circle cx="148" cy="112" r="20" fill="#ffffff" stroke="#7f95c8" strokeWidth="2.5" />
          <circle cx="94" cy="114" r="9" fill="#31355e" />
          <circle cx="150" cy="114" r="9" fill="#31355e" />
          <circle cx="97" cy="110" r="3" fill="#ffffff" />
          <circle cx="153" cy="110" r="3" fill="#ffffff" />
        </g>
        <ellipse cx="70" cy="136" rx="9" ry="5" fill="#ffc9de" opacity="0.9" />
        <ellipse cx="170" cy="136" rx="9" ry="5" fill="#ffc9de" opacity="0.9" />
        <path d="M109 148 Q 120 156 131 148" fill="none" stroke="#31355e" strokeWidth="3" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export default function CritterView({
  reaction,
  busy = false,
}: {
  reaction?: CareAction | null;
  busy?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>(() =>
    critterAddress() === null ? { kind: "waiting" } : { kind: "loading" },
  );

  const load = useCallback(async () => {
    const address = critterAddress();
    if (!address) {
      setPhase({ kind: "waiting" });
      return;
    }
    setPhase({ kind: "loading" });
    try {
      const svgUri = await fetchTokenUri(address, import.meta.env.VITE_RPC_URL);
      setPhase({ kind: "ready", svgUri });
    } catch {
      setPhase({ kind: "sleepy", message: SLEEPY_NOTE });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const note =
    phase.kind === "waiting" ? DEPLOY_NOTE
    : phase.kind === "loading" ? LOADING_NOTE
    : phase.kind === "sleepy" ? phase.message
    : null;

  return (
    <div className="critter-stage" data-reaction={reaction ?? undefined}>
      {phase.kind === "ready" ? (
        <img
          className={`critter${reaction ? ` critter-action-${reaction}` : ""}${busy ? " critter-busy" : ""}`}
          src={phase.svgUri}
          alt="Пухлик из он-чейн арта"
        />
      ) : (
        <DemoJelly reaction={reaction} busy={busy} />
      )}
      {phase.kind === "ready" ? (
        <p className="critter-speech">{busy ? BUSY_NOTE : "Привет! Я твой пухлик :3"}</p>
      ) : (
        <div className="critter-waiting">
          <p className="waiting-note">{note}</p>
          {phase.kind === "sleepy" && (
            <button className="care-button" type="button" onClick={() => void load()}>
              Попробовать ещё разочек
            </button>
          )}
        </div>
      )}
    </div>
  );
}
