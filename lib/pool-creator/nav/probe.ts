// =============================================================================
// Contract identification. SERVER ONLY.
// -----------------------------------------------------------------------------
// The extractor script is *told* what each asset is (`kind: "erc4626"`) and
// asserts the answer matches. A user pasting an arbitrary address gives us no
// such hint, so this discovers the kind by trying calls in order and taking the
// first that answers coherently.
//
// It never guesses. If nothing answers, the result is `unknown` with the list
// of selectors tried — shown to the user behind a technical-details disclosure
// — rather than a plausible-looking fabrication.
// =============================================================================

import {
  SELECTORS,
  decodeAddress,
  decodeString,
  decodeUint,
  decodeWord,
  encodeUintCall,
  ethCall,
} from "@/lib/pool-creator/nav/rpc";
import type { ChainId, NavProbe } from "@/lib/pool-creator/nav/types";

/** The call whose return is the NAV, once we know what we are looking at. */
export type NavCall = { callData: string; outputDecimals: number; kind: NavProbe["kind"] };

async function readDecimals(chain: ChainId, address: string): Promise<number | null> {
  const raw = await ethCall(chain, address, SELECTORS.decimals);
  if (!raw) return null;
  const value = Number(decodeUint(raw));
  return Number.isSafeInteger(value) && value >= 0 && value <= 36 ? value : null;
}

async function readIdentity(
  chain: ChainId,
  address: string,
): Promise<{ symbol: string; name: string }> {
  const [symbolRaw, nameRaw] = await Promise.all([
    ethCall(chain, address, SELECTORS.symbol),
    ethCall(chain, address, SELECTORS.name),
  ]);
  return { symbol: decodeString(symbolRaw), name: decodeString(nameRaw) };
}

/**
 * `convertToAssets` is probed with 1e(18 + shareDec − assetDec) shares so the
 * answer lands in 18 decimals regardless of the token pair — the same
 * normalisation the extractor script uses, which is what makes the resulting
 * price series directly comparable to the committed ones.
 */
const probeShares = (shareDecimals: number, assetDecimals: number): bigint =>
  10n ** BigInt(18 + shareDecimals - assetDecimals);

export async function probeContract(
  chain: ChainId,
  address: `0x${string}`,
): Promise<{ probe: NavProbe; navCall: NavCall | null }> {
  const attempted: string[] = [];
  const identity = await readIdentity(chain, address);

  // 1. ERC-4626: has asset() and convertToAssets().
  attempted.push("asset()");
  const assetRaw = await ethCall(chain, address, SELECTORS.asset);
  if (assetRaw) {
    const baseAsset = decodeAddress(assetRaw);
    const shareDecimals = await readDecimals(chain, address);
    const assetDecimals = await readDecimals(chain, baseAsset);
    if (shareDecimals !== null && assetDecimals !== null) {
      const shares = probeShares(shareDecimals, assetDecimals);
      const callData = encodeUintCall(SELECTORS.convertToAssets, shares);
      attempted.push("convertToAssets(uint256)");
      const check = await ethCall(chain, address, callData);
      if (check && decodeUint(check) > 0n) {
        return {
          probe: {
            kind: "erc4626",
            symbol: identity.symbol,
            name: identity.name,
            shareDecimals,
            baseAsset,
            assetDecimals,
            probeShares: shares.toString(),
          },
          navCall: { callData, outputDecimals: 18, kind: "erc4626" },
        };
      }
    }
  }

  // 2. Makina-style machine: shareToken() + accountingToken().
  attempted.push("shareToken()", "accountingToken()");
  const [shareRaw, accountingRaw] = await Promise.all([
    ethCall(chain, address, SELECTORS.shareToken),
    ethCall(chain, address, SELECTORS.accountingToken),
  ]);
  if (shareRaw && accountingRaw) {
    const shareToken = decodeAddress(shareRaw);
    const accountingToken = decodeAddress(accountingRaw);
    const shareDecimals = await readDecimals(chain, shareToken);
    const accountingDecimals = await readDecimals(chain, accountingToken);
    if (shareDecimals !== null && accountingDecimals !== null) {
      const shares = probeShares(shareDecimals, accountingDecimals);
      const callData = encodeUintCall(SELECTORS.convertToAssets, shares);
      const check = await ethCall(chain, address, callData);
      if (check && decodeUint(check) > 0n) {
        const shareIdentity = await readIdentity(chain, shareToken);
        return {
          probe: {
            kind: "makina",
            symbol: shareIdentity.symbol || identity.symbol,
            name: shareIdentity.name || identity.name,
            shareToken,
            shareDecimals,
            accountingToken,
            accountingDecimals,
            probeShares: shares.toString(),
          },
          navCall: { callData, outputDecimals: 18, kind: "makina" },
        };
      }
    }
  }

  // 3. Chainlink-style feed: latestRoundData() + decimals().
  attempted.push("latestRoundData()");
  const roundRaw = await ethCall(chain, address, SELECTORS.latestRoundData);
  if (roundRaw && roundRaw.length >= 2 + 64 * 5) {
    const decimals = await readDecimals(chain, address);
    const answer = decodeWord(roundRaw, 1);
    const updatedAt = Number(decodeWord(roundRaw, 3));
    if (decimals !== null && answer > 0n && updatedAt > 0) {
      return {
        probe: { kind: "chainlink", symbol: identity.symbol, name: identity.name, decimals },
        navCall: { callData: SELECTORS.latestRoundData, outputDecimals: decimals, kind: "chainlink" },
      };
    }
  }

  // 4. A token, but nothing whose value per share moves.
  attempted.push("decimals()");
  const decimals = await readDecimals(chain, address);
  if (decimals !== null) {
    return {
      probe: {
        kind: "erc20-only",
        symbol: identity.symbol,
        name: identity.name,
        decimals,
      },
      navCall: null,
    };
  }

  return { probe: { kind: "unknown", attempted }, navCall: null };
}

/** One sentence describing the find, rendered to the user verbatim. */
export function describeProbe(probe: NavProbe): string {
  const named = (fallback: string) =>
    probe.kind === "unknown" ? fallback : probe.symbol || probe.name || fallback;

  switch (probe.kind) {
    case "erc4626":
      return `This is an ERC-4626 vault${probe.symbol ? ` (${probe.symbol})` : ""}. Its shares are ${probe.shareDecimals}-decimal and we can read its value per share directly on-chain.`;
    case "makina":
      return `This is a Makina-style machine${probe.symbol ? ` (${probe.symbol})` : ""}. We can read its value per share directly on-chain.`;
    case "chainlink":
      return `This is a price feed${probe.symbol || probe.name ? ` (${named("unnamed")})` : ""} reporting ${probe.decimals}-decimal values. We can read its history directly on-chain.`;
    case "erc20-only":
      return `This looks like a token${probe.symbol ? ` (${probe.symbol})` : ""}, not a yield vault. Day needs something whose value per share changes over time.`;
    case "unknown":
      return "We couldn't recognise this contract. It didn't respond to any of the calls we use to read a value per share.";
  }
}

export const isReadable = (probe: NavProbe): boolean =>
  probe.kind === "erc4626" || probe.kind === "makina" || probe.kind === "chainlink";
