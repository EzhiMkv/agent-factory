import { useCallback, useEffect, useState } from "react";
import { createPublicClient, formatEther, http, isAddress, parseAbi } from "viem";
import { baseSepolia } from "viem/chains";
import "./TbaCard.css";

// Геттеры Achievements (tc-08): предсказанный TBA-адрес пухлика и ачивки.
const tbaAbi = parseAbi([
  "function tbaOf(uint256 tokenId) view returns (address)",
  "function achievementsOf(uint256 tokenId) view returns (uint256[])",
  "function milestone(uint256 milestoneId) view returns (uint256 critterTokenId, uint8 stage)",
  "function highestAwarded(uint256 tokenId) view returns (uint8)",
]);

// MVP: у пухлика пока одно существо — tokenId 1
const TOKEN_ID = 1n;

const WAITING_NOTE = "Кошелёчек пухлика ещё не заселился в сеть — ждём деплой-волшебство :3";
const LOADING_NOTE = "Пыхтим… заглядываем в кошелёчек пухлика";
const SLEEPY_NOTE = "Пухлик зазевался — попробуем ещё разочек?";
const EMPTY_ACHIEVEMENTS_NOTE = "Ачивки ещё в пути — пухлик старается!";
const BALANCE_MISSING_NOTE = "В кармашке пока пустовато :3";

export const BASESCAN_ADDRESS_BASE = "https://sepolia.basescan.org/address/";

/** Полный адрес пухлика длинный — показываем 0x1234…abcd (целиком — в подсказке). */
export function shortenAddress(address: string): string {
  return `0x${address.slice(2, 6)}…${address.slice(-4)}`;
}

/** Scan-ссылка на кошелёк питомца в Base Sepolia. */
export function basescanAddressUrl(address: string): string {
  return `${BASESCAN_ADDRESS_BASE}${address}`;
}

/** ETH из wei через formatEther, без хвостов; ноль остаётся милым нулём. */
export function formatEth(wei: bigint): string {
  const eth = formatEther(wei);
  const trimmed = eth.includes(".") ? eth.replace(/0+$/, "").replace(/\.$/, "") : eth;
  return trimmed.length > 0 && trimmed !== "-" ? trimmed : "0";
}

const ACHIEVEMENT_NAMES: Record<number, string> = {
  1: "Первая эволюция",
  2: "Вторая эволюция",
};

/** Милое имя ачивки по стадии из milestone-логики контракта (stage 1 и 2). */
export function achievementName(stage: number): string {
  return ACHIEVEMENT_NAMES[stage] ?? `Эволюция стадии ${stage} — пухлик растёт!`;
}

export type TbaAchievement = { id: bigint; stage: number; name: string };

export type TbaCardData = {
  tba: `0x${string}`;
  balance: string | null; // форматированный ETH или null, если сеть промолчала
  achievements: TbaAchievement[];
  highestStage: number | null; // свежая ачивка подсвечивается празднично
};

function achievementsAddress(): `0x${string}` | null {
  const raw = import.meta.env.VITE_ACHIEVEMENTS_ADDRESS?.trim();
  return raw && raw.length > 0 ? (raw as `0x${string}`) : null;
}

/**
 * Читает карточку кошелька: tbaOf обязателен, остальное — по возможностям.
 * Тихий сбой части данных (баланс/ачивки) не валит карточку целиком.
 */
export async function fetchTbaCardData(
  address: `0x${string}`,
  rpcUrl: string | undefined,
): Promise<TbaCardData> {
  const client = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  const tba = await client.readContract({
    abi: tbaAbi,
    address,
    functionName: "tbaOf",
    args: [TOKEN_ID],
  });
  if (typeof tba !== "string" || !isAddress(tba)) {
    throw new Error("tbaOf вернул не адрес");
  }

  const [balanceSettled, idsSettled, highestSettled] = await Promise.allSettled([
    client.getBalance({ address: tba }),
    client.readContract({ abi: tbaAbi, address, functionName: "achievementsOf", args: [TOKEN_ID] }),
    client.readContract({ abi: tbaAbi, address, functionName: "highestAwarded", args: [TOKEN_ID] }),
  ]);

  const achievements: TbaAchievement[] = [];
  if (idsSettled.status === "fulfilled") {
    const stageSettled = await Promise.allSettled(
      idsSettled.value.map((id) =>
        client.readContract({ abi: tbaAbi, address, functionName: "milestone", args: [id] }),
      ),
    );
    stageSettled.forEach((settled, i) => {
      if (settled.status !== "fulfilled") return;
      // viem декодирует мульти-возврат (uint256 critterTokenId, uint8 stage) массивом
      const [, stage] = settled.value;
      if (typeof stage === "number") {
        achievements.push({ id: idsSettled.value[i], stage, name: achievementName(stage) });
      }
    });
  }

  return {
    tba,
    balance:
      balanceSettled.status === "fulfilled" && typeof balanceSettled.value === "bigint"
        ? formatEth(balanceSettled.value)
        : null,
    achievements,
    highestStage:
      highestSettled.status === "fulfilled" && typeof highestSettled.value === "number"
        ? highestSettled.value
        : null,
  };
}

type Phase =
  | { kind: "waiting" }
  | { kind: "loading" }
  | { kind: "ready"; data: TbaCardData }
  | { kind: "sleepy"; message: string };

function TbaReady({ data }: { data: TbaCardData }) {
  return (
    <>
      <p className="tba-card-subtitle">Тут живут сокровища и ачивки :3</p>
      <div className="tba-wallet">
        <span className="tba-address" title={data.tba}>
          {shortenAddress(data.tba)}
        </span>
        <a
          className="tba-scan-link"
          href={basescanAddressUrl(data.tba)}
          target="_blank"
          rel="noreferrer"
        >
          basescan
        </a>
      </div>
      <p className="tba-balance">
        {data.balance === null ? BALANCE_MISSING_NOTE : `В кармашке: ${data.balance} ETH`}
      </p>
      <h3 className="tba-achievements-title">Ачивки</h3>
      {data.achievements.length === 0 ? (
        <p className="tba-note">{EMPTY_ACHIEVEMENTS_NOTE}</p>
      ) : (
        <ul className="tba-achievement-list">
          {data.achievements.map((achievement) => (
            <li
              key={achievement.id.toString()}
              className={
                achievement.stage === data.highestStage
                  ? "tba-achievement tba-achievement-festive"
                  : "tba-achievement"
              }
            >
              <span className="tba-achievement-name">{achievement.name}</span>
              <span className="tba-achievement-id">ачивка №{achievement.id.toString()}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function TbaCard() {
  const [phase, setPhase] = useState<Phase>(() =>
    achievementsAddress() === null ? { kind: "waiting" } : { kind: "loading" },
  );

  const load = useCallback(async () => {
    const address = achievementsAddress();
    if (!address) {
      setPhase({ kind: "waiting" });
      return;
    }
    setPhase({ kind: "loading" });
    try {
      const data = await fetchTbaCardData(address, import.meta.env.VITE_RPC_URL);
      setPhase({ kind: "ready", data });
    } catch {
      setPhase({ kind: "sleepy", message: SLEEPY_NOTE });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const note =
    phase.kind === "waiting" ? WAITING_NOTE
    : phase.kind === "loading" ? LOADING_NOTE
    : phase.kind === "sleepy" ? phase.message
    : null;

  return (
    <section className="tba-card" aria-label="Кошелёк пухлика">
      <h2 className="tba-card-title">Кошелёчек пухлика</h2>
      {phase.kind === "ready" ? (
        <TbaReady data={phase.data} />
      ) : (
        <div className="tba-waiting">
          <p className="tba-note">{note}</p>
          {phase.kind === "sleepy" && (
            <button className="care-button" type="button" onClick={() => void load()}>
              Попробовать ещё разочек
            </button>
          )}
        </div>
      )}
    </section>
  );
}
