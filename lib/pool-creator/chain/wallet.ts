"use client";

// =============================================================================
// EIP-1193 / EIP-6963 wallet access, hand-rolled.
// -----------------------------------------------------------------------------
// No wallet library, for the same reason there is no ABI library: `package.json`
// is SHA-locked. The surface used here is small and stable — `eth_requestAccounts`,
// `eth_chainId`, `eth_call`, `eth_sendTransaction`, `eth_getTransactionReceipt`,
// `wallet_switchEthereumChain` — and it is the same interface every wallet
// library sits on top of.
// =============================================================================

import { decodeRevertReason } from "@/lib/pool-creator/chain/abi";

export type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
};

export type DiscoveredWallet = {
  id: string;
  name: string;
  icon?: string;
  provider: Eip1193Provider;
};

type Eip6963Detail = {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: Eip1193Provider;
};

/**
 * EIP-6963 announces providers via an event, which is how multiple installed
 * wallets coexist. Falls back to `window.ethereum` for older wallets.
 */
export function discoverWallets(timeoutMs = 300): Promise<DiscoveredWallet[]> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve([]);
      return;
    }
    const found = new Map<string, DiscoveredWallet>();

    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<Eip6963Detail>).detail;
      if (!detail?.info || !detail.provider) return;
      found.set(detail.info.uuid, {
        id: detail.info.rdns || detail.info.uuid,
        name: detail.info.name,
        icon: detail.info.icon,
        provider: detail.provider,
      });
    };

    window.addEventListener("eip6963:announceProvider", onAnnounce as EventListener);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce as EventListener);
      if (found.size === 0) {
        const injected = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
        if (injected) {
          found.set("injected", { id: "injected", name: "Browser wallet", provider: injected });
        }
      }
      resolve([...found.values()]);
    }, timeoutMs);
  });
}

export class WalletError extends Error {
  constructor(
    message: string,
    readonly code: number | undefined,
    /** True when the user dismissed the wallet prompt — not a failure. */
    readonly rejected: boolean,
  ) {
    super(message);
    this.name = "WalletError";
  }
}

const USER_REJECTED = 4001;

function toWalletError(error: unknown): WalletError {
  const code = (error as { code?: number })?.code;
  const message = (error as { message?: string })?.message ?? "The wallet request failed.";
  return new WalletError(message, code, code === USER_REJECTED);
}

async function request<T>(provider: Eip1193Provider, method: string, params?: unknown[]): Promise<T> {
  try {
    return (await provider.request({ method, params })) as T;
  } catch (error) {
    throw toWalletError(error);
  }
}

export const requestAccounts = (provider: Eip1193Provider) =>
  request<string[]>(provider, "eth_requestAccounts");

export const getChainId = async (provider: Eip1193Provider): Promise<number> =>
  Number(await request<string>(provider, "eth_chainId"));

export const ethCall = (
  provider: Eip1193Provider,
  to: string,
  data: string,
  from?: string,
): Promise<string> =>
  request<string>(provider, "eth_call", [{ to, data, ...(from ? { from } : null) }, "latest"]);

export const sendTransaction = (
  provider: Eip1193Provider,
  tx: { from: string; to: string; data: string; value?: string },
): Promise<string> => request<string>(provider, "eth_sendTransaction", [tx]);

export type Receipt = { blockNumber: number; status: "success" | "reverted"; hash: string };

export async function getReceipt(
  provider: Eip1193Provider,
  hash: string,
): Promise<Receipt | null> {
  const raw = await request<{ blockNumber?: string; status?: string } | null>(
    provider,
    "eth_getTransactionReceipt",
    [hash],
  );
  if (!raw || !raw.blockNumber) return null;
  return {
    hash,
    blockNumber: Number(raw.blockNumber),
    status: raw.status === "0x1" ? "success" : "reverted",
  };
}

export async function switchChain(provider: Eip1193Provider, chainId: number): Promise<void> {
  await request(provider, "wallet_switchEthereumChain", [
    { chainId: `0x${chainId.toString(16)}` },
  ]);
}

/**
 * Simulate a call and translate a revert into English.
 *
 * Every write is simulated before it is signed, so a failure surfaces as a
 * sentence rather than as a transaction the user paid for.
 */
export async function simulate(
  provider: Eip1193Provider,
  tx: { from: string; to: string; data: string },
): Promise<{ ok: true; returnData: string } | { ok: false; reason: string }> {
  try {
    const returnData = await ethCall(provider, tx.to, tx.data, tx.from);
    return { ok: true, returnData };
  } catch (error) {
    const walletError = toWalletError(error);
    // Wallets surface revert payloads inconsistently; dig for one.
    const raw = (error as { data?: string | { data?: string } })?.data;
    const payload = typeof raw === "string" ? raw : raw?.data;
    const decoded = payload ? decodeRevertReason(payload) : null;
    return { ok: false, reason: decoded ?? walletError.message };
  }
}
