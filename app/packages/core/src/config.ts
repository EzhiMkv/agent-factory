// Конфиг ядра — единственное место чтения process.env (AGENTS.md, tc-03).

export interface CoreConfig {
  tinvestToken: string;
  tinvestTps: number;
  tinvestEndpoint: string;
  /** offline = синтетика, live = реальный T-Invest API. */
  dataMode: "offline" | "live";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): CoreConfig {
  const token = (env.T_INVEST_TOKEN ?? "").trim();
  const tpsRaw = Number(env.T_INVEST_TPS ?? "5");
  const dataMode = (env.DATA_MODE ?? (token ? "live" : "offline")) === "live" && token
    ? "live"
    : "offline";
  return {
    tinvestToken: token,
    tinvestTps: Number.isFinite(tpsRaw) && tpsRaw > 0 && tpsRaw <= 50 ? tpsRaw : 5,
    tinvestEndpoint: (env.T_INVEST_ENDPOINT ?? "invest-public-api.tbank.ru:443").trim(),
    dataMode,
  };
}
