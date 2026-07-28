// =============================================================================
// THE INTEGRATION SEAM.
// -----------------------------------------------------------------------------
// This is the only file that changes when the Day contracts are published.
// Everything else in `chain/` — the encoder, the params builder, the wallet
// layer, the state machine, the UI — is finished and tested against it.
//
// NOTHING IS INVENTED HERE. The four implementation addresses and the two YDM
// addresses are not in the public repo, so `DAY_DEPLOYMENTS` is empty and the
// deploy step says so plainly rather than shipping a placeholder that would
// send a user's transaction to address zero. `abi.test.ts`'s sibling check in
// `deploy.test.ts` asserts no 40-hex-character literal appears here beyond the
// documented public infrastructure below.
//
// Sources:
//   roycoprotocol/royco-day @ audit/remediations
//     src/factory/RoycoFactory.sol
//     src/factory/templates/RoycoDayBalancerV3MarketDeploymentTemplate.sol
//     script/config/MarketDeploymentConfig.sol
// =============================================================================

import { selector } from "@/lib/pool-creator/chain/keccak";

export type DayDeployment = {
  chainId: number;
  label: string;
  /** RoycoFactory. `executeMarketDeployment` is `restricted` to DEPLOYER_ROLE. */
  factory: `0x${string}`;
  /** The Balancer-V3 market deployment template, registered with the factory. */
  template: `0x${string}`;
  /** Implementation contracts the template clones. */
  impls: {
    jt: `0x${string}`;
    lpt: `0x${string}`;
    accountant: `0x${string}`;
    kernel: `0x${string}`;
  };
  /** YDM contracts. Production uses the adaptive V2 curve. */
  ydm: { staticCurve: `0x${string}`; adaptiveV2: `0x${string}` };
  /** Set once, then referenced per market. */
  gyroEclpPoolFactory: `0x${string}`;
  eclpLpOracleFactory: `0x${string}`;
  blacklist: `0x${string}`;
  protocolFeeRecipient: `0x${string}`;
  /** Chainlink sequencer uptime feed. Zero address on L1. */
  sequencerUptimeFeed: `0x${string}`;
  explorerBaseUrl: string;
  isTestnet: boolean;
};

/**
 * Public infrastructure addresses that ARE published, recorded here so they do
 * not have to be rediscovered. They are not enough to deploy on their own —
 * the implementation and YDM addresses are still required.
 */
export const PUBLISHED_INFRASTRUCTURE = {
  ethereum: {
    gyroEclpPoolFactory: "0x04d584195a96DFfc7F8B695aA3C9D3c1606b69d1",
    eclpLpOracleFactory: "0x301EDe5Fd4f9d7266B09c3A2E38F97776447154B",
    /** Chainalysis sanctions oracle. */
    blacklist: "0x40C57923924B5c5c5455c48D93317139ADDaC8fb",
    protocolFeeRecipient: "0x05ea95aE815809D77153Ed3500Ad6d936712b639",
  },
} as const;

/**
 * Empty until Royco publishes the implementation and YDM addresses.
 * See `deployAvailability()` for what the UI does in the meantime.
 */
export const DAY_DEPLOYMENTS: Record<number, DayDeployment> = {};

export type DeployAvailability =
  | { available: true; deployment: DayDeployment }
  | { available: false; reason: string; detail: string };

export function deployAvailability(chainId: number): DeployAvailability {
  const deployment = DAY_DEPLOYMENTS[chainId];
  if (deployment) return { available: true, deployment };
  return {
    available: false,
    reason: "The Day factory isn't wired up in this app yet.",
    detail:
      "Deploying a market needs the factory, template, four implementation contracts and two yield-curve " +
      "contracts. Those addresses haven't been published, so there is nothing to send a transaction to. " +
      "Your configuration is complete and ready — download it and Royco can deploy from it.",
  };
}

/**
 * `executeMarketDeployment` is `restricted whenNotPaused` on the factory, which
 * resolves through an OpenZeppelin AccessManager. Deployment is therefore
 * permissioned: an arbitrary wallet cannot create a Day market today.
 */
/** Reserved: needed once role granting is done from this app rather than by script. */
export const DEPLOYER_ROLE_ID = 1n;

/**
 * Selectors are DERIVED from their signatures, never pasted as hex. The keccak
 * implementation behind `selector()` is validated in `keccak.test.ts` against
 * the six selectors `scripts/data/extract-day-nav.mjs` already uses against
 * live chains, so a derived selector is as trustworthy as those.
 */
export const SELECTOR_EXECUTE_MARKET_DEPLOYMENT = selector(
  "executeMarketDeployment(address,bytes)",
);
/** OpenZeppelin AccessManager. */
export const SELECTOR_CAN_CALL = selector("canCall(address,address,bytes4)");
/** Reserved: a direct role read, for when canCall is not enough. */
export const SELECTOR_HAS_ROLE = selector("hasRole(uint64,address)");
/** AccessManaged. */
export const SELECTOR_AUTHORITY = selector("authority()");
/** ERC-20, for the seeding steps. */
export const SELECTOR_ALLOWANCE = selector("allowance(address,address)");
export const SELECTOR_APPROVE = selector("approve(address,uint256)");
export const SELECTOR_BALANCE_OF = selector("balanceOf(address)");

export const CHAIN_IDS = { ethereum: 1, arbitrum: 42161 } as const;
