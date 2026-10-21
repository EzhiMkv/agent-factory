import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/;

function buildClients(key: `0x${string}`) {
  const account = privateKeyToAccount(key);
  const rpc = import.meta.env.VITE_RPC_URL?.trim();
  const transport = http(rpc && rpc.length > 0 ? rpc : undefined);
  return {
    account: account.address,
    public: createPublicClient({ chain: baseSepolia, transport }),
    wallet: createWalletClient({ account, chain: baseSepolia, transport }),
  };
}

export type CareClients = ReturnType<typeof buildClients>;

export function demoPrivateKey(): `0x${string}` | null {
  const raw = import.meta.env.VITE_DEMO_KEY?.trim();
  return raw && KEY_PATTERN.test(raw) ? (raw as `0x${string}`) : null;
}

export function critterAddress(): `0x${string}` | null {
  const raw = import.meta.env.VITE_CRITTER_ADDRESS?.trim();
  return raw && raw.length > 0 ? (raw as `0x${string}`) : null;
}

let cached: CareClients | null | undefined;

export function getCareClients(): CareClients | null {
  if (cached === undefined) {
    const key = demoPrivateKey();
    cached = key ? buildClients(key) : null;
  }
  return cached;
}

export function resetCareClients(): void {
  cached = undefined;
}
