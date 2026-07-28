"use client";

// =============================================================================
// Deploy orchestration: role detection and plan building.
// -----------------------------------------------------------------------------
// The honest bit is `checkDeployPermission`. `executeMarketDeployment` is
// `restricted` on the factory, so for any wallet without DEPLOYER_ROLE the
// transaction reverts. We read that BEFORE the user signs anything and say so,
// rather than letting them pay for a failure.
// =============================================================================

import {
  decodeAddressAt,
  decodeBoolAt,
  decodeUintAt,
  encodeCall,
  toWad,
} from "@/lib/pool-creator/chain/abi";
import {
  SELECTOR_ALLOWANCE,
  SELECTOR_APPROVE,
  SELECTOR_AUTHORITY,
  SELECTOR_BALANCE_OF,
  SELECTOR_CAN_CALL,
  SELECTOR_EXECUTE_MARKET_DEPLOYMENT,
  type DayDeployment,
} from "@/lib/pool-creator/chain/registry";
import { buildDeployCalldata, type DeployInputs } from "@/lib/pool-creator/chain/params";
import { selector } from "@/lib/pool-creator/chain/keccak";
import { ethCall, type Eip1193Provider } from "@/lib/pool-creator/chain/wallet";
import type { DeployPlan, DeployStep } from "@/lib/pool-creator/chain/tx-machine";

export type PermissionResult = {
  canDeploy: boolean;
  /** Plain English, shown before the user commits to anything. */
  reason?: string;
};

/**
 * Ask the factory's AccessManager whether this account may call
 * `executeMarketDeployment`. A read, not a guess.
 */
export async function checkDeployPermission(
  provider: Eip1193Provider,
  deployment: DayDeployment,
  account: string,
): Promise<PermissionResult> {
  try {
    const authorityRaw = await ethCall(provider, deployment.factory, SELECTOR_AUTHORITY);
    const authority = decodeAddressAt(authorityRaw, 0);

    const canCallData = encodeCall(
      SELECTOR_CAN_CALL,
      [{ type: "address" }, { type: "address" }, { type: "bytes4" }],
      [account, deployment.factory, SELECTOR_EXECUTE_MARKET_DEPLOYMENT],
    );
    const result = await ethCall(provider, authority, canCallData);
    // canCall returns (bool immediate, uint32 delay).
    const immediate = decodeBoolAt(result, 0);
    const delay = result.length >= 2 + 128 ? decodeUintAt(result, 1) : 0n;

    if (immediate) return { canDeploy: true };
    if (delay > 0n) {
      return {
        canDeploy: false,
        reason:
          `This wallet holds the deployer role but with a ${Number(delay)}-second execution delay, ` +
          "so the transaction has to be scheduled rather than sent directly.",
      };
    }
    return {
      canDeploy: false,
      reason:
        "This wallet doesn't hold the deployer role, so the transaction would revert. " +
        "Day markets are deployed by Royco after review — your configuration is ready to hand over.",
    };
  } catch (error) {
    return {
      canDeploy: false,
      reason: `We couldn't check deploy permissions: ${(error as Error).message}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Plan building
// ---------------------------------------------------------------------------

const MAX_UINT256 = (1n << 256n) - 1n;

async function allowanceOf(
  provider: Eip1193Provider,
  token: string,
  owner: string,
  spender: string,
): Promise<bigint> {
  try {
    const data = encodeCall(SELECTOR_ALLOWANCE, [{ type: "address" }, { type: "address" }], [owner, spender]);
    return decodeUintAt(await ethCall(provider, token, data), 0);
  } catch {
    return 0n;
  }
}

export async function balanceOf(
  provider: Eip1193Provider,
  token: string,
  owner: string,
): Promise<bigint> {
  try {
    const data = encodeCall(SELECTOR_BALANCE_OF, [{ type: "address" }], [owner]);
    return decodeUintAt(await ethCall(provider, token, data), 0);
  } catch {
    return 0n;
  }
}

export type PlanInputs = DeployInputs & {
  account: string;
  /** Seed amounts in the quote asset's own decimals. */
  juniorSeed: bigint;
  liquiditySeed: bigint;
  quoteDecimals: number;
};

/**
 * Build the ordered transaction list.
 *
 * Approvals whose allowance already covers the seed are marked `skipped`, so a
 * returning user is not asked to re-approve. The state machine advances past
 * them without sending anything.
 */
export async function buildPlan(
  provider: Eip1193Provider,
  inputs: PlanInputs,
): Promise<DeployPlan> {
  const { deployment, account, quoteAsset } = inputs;
  const steps: DeployStep[] = [];

  const needed = inputs.juniorSeed + inputs.liquiditySeed;
  const current = await allowanceOf(provider, quoteAsset, account, deployment.factory);

  steps.push({
    id: "approve-junior",
    phase: "deploy",
    title: "Approve the seed capital",
    explanation:
      "Lets the factory move the Junior and exit-pool capital when the market opens. Nothing moves yet.",
    to: quoteAsset,
    data: encodeCall(
      SELECTOR_APPROVE,
      [{ type: "address" }, { type: "uint256" }],
      [deployment.factory, MAX_UINT256],
    ),
    skipped: current >= needed && needed > 0n,
  });

  steps.push({
    id: "deploy-market",
    phase: "deploy",
    title: "Deploy the market",
    explanation:
      "Creates the Senior, Junior and LP tranches, the accountant and the kernel in a single transaction.",
    to: deployment.factory,
    data: buildDeployCalldata(inputs),
  });

  // Seeding. The tranche addresses only exist once the market is deployed, so
  // these are built after the fact by `appendSeedSteps` rather than guessed at
  // here — a deposit encoded against a predicted address is a deposit sent
  // nowhere.
  return { chainId: deployment.chainId, steps };
}

/** `deposit(uint256 assets, address receiver)` — the ERC-4626 entry point. */
const SELECTOR_DEPOSIT = selector("deposit(uint256,address)");

/**
 * What each tranche is seeded with immediately after deployment.
 *
 * Small on purpose. This is not funding the pool — it mints the very first
 * shares in each vault at a known one-to-one price, which is what closes the
 * ERC-4626 inflation attack (an empty vault lets the first depositor donate
 * assets and skew the share price against everyone after them). It doubles as
 * a live check that all three tranches actually accept a deposit.
 */
export const SEED_PER_TRANCHE_USD = 10;

export type TrancheAddresses = {
  senior: `0x${string}`;
  junior: `0x${string}`;
  liquidity: `0x${string}`;
};

/**
 * The post-deployment sequence: seed every tranche with a token amount.
 *
 * ORDER IS LOAD-BEARING. Verified against the accountant: a Senior deposit into
 * a market with no Junior and no exit pool is rejected outright — the coverage
 * and liquidity gates in `postOpSyncTrancheAccounting` both fail. Seeding
 * Junior first is not enough either; Senior stays rejected until the exit pool
 * exists too. Junior → exit pool → Senior is the only order that completes, so
 * it is the only order we build.
 *
 * Each vault pulls with `transferFrom`, so each needs its own allowance. An
 * approval whose allowance already covers the seed is marked skipped rather
 * than re-sent.
 */
export function buildSeedSteps(
  tranches: TrancheAddresses,
  quoteAsset: `0x${string}`,
  quoteDecimals: number,
  receiver: string,
  existingAllowance: { senior: bigint; junior: bigint; liquidity: bigint } = {
    senior: 0n,
    junior: 0n,
    liquidity: 0n,
  },
): DeployStep[] {
  const amount = toTokenUnits(SEED_PER_TRANCHE_USD, quoteDecimals);

  const approve = (spender: `0x${string}`): `0x${string}` =>
    encodeCall(SELECTOR_APPROVE, [{ type: "address" }, { type: "uint256" }], [spender, amount]);
  const deposit = (): `0x${string}` =>
    encodeCall(SELECTOR_DEPOSIT, [{ type: "uint256" }, { type: "address" }], [amount, receiver]);

  const pair = (
    tranche: "junior" | "liquidity" | "senior",
    label: string,
    explanation: string,
  ): DeployStep[] => [
    {
      id: `approve-${tranche === "liquidity" ? "liquidity" : tranche}` as DeployStep["id"],
      phase: "seed",
      title: `Approve $${SEED_PER_TRANCHE_USD} for ${label}`,
      explanation: "Each tranche pulls its own deposit, so each needs its own approval.",
      to: quoteAsset,
      data: approve(tranches[tranche]),
      skipped: existingAllowance[tranche] >= amount,
    },
    {
      id: `seed-${tranche === "liquidity" ? "liquidity" : tranche}` as DeployStep["id"],
      phase: "seed",
      title: `Seed ${label} with $${SEED_PER_TRANCHE_USD}`,
      explanation,
      to: tranches[tranche],
      data: deposit(),
    },
  ];

  return [
    ...pair(
      "junior",
      "Junior",
      "Mints Junior's first shares. Junior goes first because Senior cannot be funded until a cushion exists.",
    ),
    ...pair(
      "liquidity",
      "the exit pool",
      "Mints the exit pool's first shares. Senior stays blocked until this exists too.",
    ),
    ...pair(
      "senior",
      "Senior",
      "Mints Senior's first shares. Last, because the accountant rejects a Senior deposit until the cushion and the exit pool are both in place.",
    ),
  ];
}

/**
 * Convert a display amount into the quote asset's smallest unit.
 * Used by the seeding steps once real token decimals are known.
 */
export function toTokenUnits(amount: number, decimals: number): bigint {
  if (!Number.isFinite(amount) || amount < 0) return 0n;
  if (decimals === 18) return toWad(amount);
  const scaled = Math.round(amount * 10 ** Math.min(decimals, 9));
  return BigInt(scaled) * 10n ** BigInt(Math.max(0, decimals - Math.min(decimals, 9)));
}
