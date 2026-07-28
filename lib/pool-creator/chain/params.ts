// =============================================================================
// MarketParams — the deployment payload.
// -----------------------------------------------------------------------------
// Mirrors `RoycoDayBalancerV3MarketDeploymentTemplate.MarketParams` from
// roycoprotocol/royco-day @ audit/remediations. The accountant half maps
// one-to-one onto what the wizard already solved, which is the whole point:
// what the user simulated is what gets deployed.
//
//   RoycoDayAccountantInitParams        MarketConfig (lib/day/engine/types.ts)
//     minCoverageWAD                 ←→   coverage
//     coverageLiquidationUtilizationWAD ←→ liquidationUtilization
//     minLiquidityWAD                ←→   minLiquidity
//     jtYDM / lptYDM + init data     ←→   riskYDM / liqYDM
//     maxJT/LPTYieldShareWAD         ←→   maxJTYieldShare / maxLTYieldShare
//     fixedTermDurationSeconds       ←→   fixedTermDurationSec
//     the four fee fields            ←→   the four protocol fees
//
// Deliberately NOT sent: stableYield, swapFeeBps, poolTurnoverPerYear and
// eclpBandWidth. Those shape the simulator's projections; they are not terms of
// the deployed market, and pretending otherwise would mislead.
// =============================================================================

import { buildPoolConfig, type PoolBase, type PoolTerms } from "@/lib/pool-creator/config";
import type { PoolDraft } from "@/lib/pool-creator/draft";
import { encodeCall, toWad, type AbiParam } from "@/lib/pool-creator/chain/abi";
import { keccak256Hex } from "@/lib/pool-creator/chain/keccak";
import {
  SELECTOR_EXECUTE_MARKET_DEPLOYMENT,
  type DayDeployment,
} from "@/lib/pool-creator/chain/registry";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

// ---------------------------------------------------------------------------
// ABI shape
// ---------------------------------------------------------------------------

const TRANCHE_INIT: AbiParam = {
  name: "tranche",
  type: "tuple",
  components: [
    { name: "name", type: "string" },
    { name: "symbol", type: "string" },
    { name: "initialAuthority", type: "address" },
  ],
};

const ACCOUNTANT_INIT: AbiParam = {
  name: "accountant",
  type: "tuple",
  components: [
    { name: "minCoverageWAD", type: "uint64" },
    // uint256 rather than uint64 because a 1% exit buffer means 100e18, which
    // overflows uint64 — the contract's own typing confirms the intent.
    { name: "coverageLiquidationUtilizationWAD", type: "uint256" },
    { name: "minLiquidityWAD", type: "uint64" },
    { name: "jtYDM", type: "address" },
    { name: "jtYDMInitializationData", type: "bytes" },
    { name: "lptYDM", type: "address" },
    { name: "lptYDMInitializationData", type: "bytes" },
    { name: "maxJTYieldShareWAD", type: "uint64" },
    { name: "maxLPTYieldShareWAD", type: "uint64" },
    { name: "fixedTermDurationSeconds", type: "uint24" },
    // NAV_UNIT is a user-defined value type; encoded as its uint256 underlying.
    // CONFIRM WITH ROYCO before a mainnet deployment.
    { name: "dustTolerance", type: "uint256" },
    { name: "stProtocolFeeWAD", type: "uint64" },
    { name: "jtProtocolFeeWAD", type: "uint64" },
    { name: "jtYieldShareProtocolFeeWAD", type: "uint64" },
    { name: "lptYieldShareProtocolFeeWAD", type: "uint64" },
  ],
};

const MARKET_CONTRACTS: AbiParam = {
  name: "marketContracts",
  type: "tuple",
  components: [
    { name: "jtImpl", type: "address" },
    { name: "lptImpl", type: "address" },
    { name: "accountantImpl", type: "address" },
    { name: "kernelImpl", type: "address" },
    { name: "jtYdm", type: "address" },
    { name: "lptYdm", type: "address" },
    { name: "balancerPool", type: "address" },
    { name: "bptOracle", type: "address" },
  ],
};

const TRANCHE_CONFIG: AbiParam = {
  type: "tuple",
  components: [
    { name: "enabled", type: "bool" },
    { name: "depositDelaySeconds", type: "uint24" },
    { name: "depositExpirySeconds", type: "uint32" },
    { name: "redemptionDelaySeconds", type: "uint24" },
    { name: "redemptionExpirySeconds", type: "uint32" },
    { name: "gateByOracleUpdate", type: "bool" },
  ],
};

const ENTRY_POINT_CONFIGS: AbiParam = {
  name: "entryPointTrancheConfigs",
  type: "tuple",
  components: [
    { ...TRANCHE_CONFIG, name: "st" },
    { ...TRANCHE_CONFIG, name: "jt" },
    { ...TRANCHE_CONFIG, name: "lt" },
  ],
};

export const MARKET_PARAMS: AbiParam = {
  name: "params",
  type: "tuple",
  components: [
    { name: "marketId", type: "bytes32" },
    { ...TRANCHE_INIT, name: "jtTranche" },
    { ...TRANCHE_INIT, name: "lptTranche" },
    { name: "collateralAsset", type: "address" },
    { name: "quoteAsset", type: "address" },
    ACCOUNTANT_INIT,
    MARKET_CONTRACTS,
    { name: "protocolFeeRecipient", type: "address" },
    { name: "stSelfLiquidationBonusWAD", type: "uint64" },
    { name: "roycoBlacklist", type: "address" },
    { name: "collateralAssetOracle", type: "address" },
    { name: "stalenessThresholdSeconds", type: "uint48" },
    { name: "sequencerUptimeFeed", type: "address" },
    { name: "gracePeriodSeconds", type: "uint48" },
    { name: "collateralAssetOracleBindingSelectors", type: "bytes4[]" },
    { name: "collateralAssetOracleBindingRoleIds", type: "uint64[]" },
    { name: "kernelSpecificParams", type: "bytes" },
    { name: "enforceVaultSharesTransferWhitelist", type: "bool" },
    ENTRY_POINT_CONFIGS,
    { name: "deployPoolHook", type: "bool" },
  ],
};

// ---------------------------------------------------------------------------
// Building the payload
// ---------------------------------------------------------------------------

export type DeployInputs = {
  draft: PoolDraft;
  base: PoolBase;
  terms: PoolTerms;
  deployment: DayDeployment;
  /** The yield-bearing contract the pool sits on. */
  collateralAsset: `0x${string}`;
  /** What the market accounts in — usually the vault's underlying. */
  quoteAsset: `0x${string}`;
  /** Price feed for the collateral asset. */
  collateralAssetOracle: `0x${string}`;
  /** Deployed Gyro E-CLP pool and its BPT oracle. */
  balancerPool: `0x${string}`;
  bptOracle: `0x${string}`;
  /** Who holds the tranche admin roles. Should be a multisig. */
  initialAuthority: `0x${string}`;
  /** Override the derived id when the team has mined a specific one. */
  marketId?: `0x${string}`;
  stalenessThresholdSeconds?: number;
  gracePeriodSeconds?: number;
};

/**
 * A deterministic market id from the pool's slug.
 *
 * The contracts repo ships `script/mine-market-id/`, so the team may want an id
 * with particular properties. This derivation is a sane default, not a
 * substitute for that tool — the caller can pass `marketId` to override it.
 */
export const deriveMarketId = (slug: string): `0x${string}` =>
  keccak256Hex(`royco.day.market.${slug}`);

/** Values in the order `MARKET_PARAMS` declares them. */
export function buildMarketParamsValues(inputs: DeployInputs): unknown[] {
  const { draft, base, terms, deployment } = inputs;
  const cfg = buildPoolConfig(base, terms);
  const identity = draft.identity;

  const ydm = base.ydmMode === "adaptive" ? deployment.ydm.adaptiveV2 : deployment.ydm.staticCurve;

  // The YDM contracts take their curve anchors as constructor-style init data.
  const ydmInit = (curve: { y0: number; yTarget: number; y100: number }): `0x${string}` =>
    encodeCall(
      "0x",
      [{ type: "uint64" }, { type: "uint64" }, { type: "uint64" }],
      [toWad(curve.y0), toWad(curve.yTarget), toWad(curve.y100)],
    );

  const trancheConfig = [true, 0n, 0n, 0n, 0n, false];

  return [
    inputs.marketId ?? deriveMarketId(identity.slug || identity.marketName),
    [identity.juniorName, identity.juniorSymbol, inputs.initialAuthority],
    [`LP ${identity.marketName}`, `lp${identity.juniorSymbol.slice(2)}`, inputs.initialAuthority],
    inputs.collateralAsset,
    inputs.quoteAsset,
    [
      toWad(cfg.coverage),
      toWad(cfg.liquidationUtilization),
      toWad(cfg.minLiquidity),
      ydm,
      ydmInit(cfg.riskYDM),
      ydm,
      ydmInit(cfg.liqYDM),
      toWad(cfg.maxJTYieldShare),
      toWad(cfg.maxLTYieldShare),
      BigInt(Math.round(cfg.fixedTermDurationSec)),
      toWad(cfg.dustTolerance),
      toWad(cfg.stProtocolFee),
      toWad(cfg.jtProtocolFee),
      toWad(cfg.yieldShareProtocolFee),
      toWad(cfg.ltYieldShareProtocolFee),
    ],
    [
      deployment.impls.jt,
      deployment.impls.lpt,
      deployment.impls.accountant,
      deployment.impls.kernel,
      ydm,
      ydm,
      inputs.balancerPool,
      inputs.bptOracle,
    ],
    deployment.protocolFeeRecipient,
    toWad(cfg.stSelfLiquidationBonus),
    deployment.blacklist,
    inputs.collateralAssetOracle,
    BigInt(inputs.stalenessThresholdSeconds ?? 86_400),
    deployment.sequencerUptimeFeed ?? ZERO_ADDRESS,
    BigInt(inputs.gracePeriodSeconds ?? 3_600),
    // Oracle role bindings are configured post-deployment by the team.
    [],
    [],
    "0x",
    false,
    [trancheConfig, trancheConfig, trancheConfig],
    true,
  ];
}

/**
 * Addresses a deployment cannot be built without.
 *
 * The UI carries zero-address placeholders for the fields the user has not
 * supplied yet, which is fine while nothing can be sent — but a zero address
 * encoded into a real transaction is a market wired to nowhere. Nothing gets
 * past this.
 */
export function missingDeployAddresses(inputs: DeployInputs): string[] {
  const required: Array<[string, string]> = [
    ["the yield-bearing asset", inputs.collateralAsset],
    ["the accounting asset", inputs.quoteAsset],
    ["the collateral price feed", inputs.collateralAssetOracle],
    ["the exit pool", inputs.balancerPool],
    ["the exit pool's price oracle", inputs.bptOracle],
    ["the admin address", inputs.initialAuthority],
    ["the factory", inputs.deployment.factory],
    ["the deployment template", inputs.deployment.template],
    ["the Junior implementation", inputs.deployment.impls.jt],
    ["the LP implementation", inputs.deployment.impls.lpt],
    ["the accountant implementation", inputs.deployment.impls.accountant],
    ["the kernel implementation", inputs.deployment.impls.kernel],
  ];
  return required
    .filter(([, address]) => !address || /^0x0{40}$/i.test(address))
    .map(([label]) => label);
}

/** The full calldata for `RoycoFactory.executeMarketDeployment`. */
export function buildDeployCalldata(inputs: DeployInputs): `0x${string}` {
  const missing = missingDeployAddresses(inputs);
  if (missing.length > 0) {
    throw new Error(
      `Can't build the deployment: we still need ${missing.join(", ")}.`,
    );
  }

  const params = buildMarketParamsValues(inputs);
  return encodeCall(
    SELECTOR_EXECUTE_MARKET_DEPLOYMENT,
    [{ type: "address" }, { type: "bytes" }],
    [
      inputs.deployment.template,
      // The template takes `bytes calldata _params`, so MarketParams is
      // abi.encode'd and passed as an opaque blob.
      encodeCall("0x", [MARKET_PARAMS], [params]),
    ],
  );
}

/**
 * A human-readable summary of what would be sent, so the user can check the
 * important values without reading calldata. Surfaced by the deploy panel once
 * a plan can actually be built.
 */
export function describeDeployment(inputs: DeployInputs): Array<{ label: string; value: string }> {
  const cfg = buildPoolConfig(inputs.base, inputs.terms);
  return [
    { label: "Market id", value: inputs.marketId ?? deriveMarketId(inputs.draft.identity.slug) },
    { label: "Collateral asset", value: inputs.collateralAsset },
    { label: "Quote asset", value: inputs.quoteAsset },
    { label: "Minimum coverage", value: `${(cfg.coverage * 100).toFixed(3)}%` },
    { label: "Minimum liquidity", value: `${(cfg.minLiquidity * 100).toFixed(3)}%` },
    {
      label: "Recovery window",
      value: cfg.fixedTermDurationSec === 0 ? "none (perpetual)" : `${cfg.fixedTermDurationSec / 86_400} days`,
    },
    { label: "Junior yield curve", value: `${inputs.base.ydmMode}, target ${(cfg.riskYDM.yTarget * 100).toFixed(3)}%` },
    { label: "LP yield curve", value: `${inputs.base.ydmMode}, target ${(cfg.liqYDM.yTarget * 100).toFixed(3)}%` },
    { label: "Senior protocol fee", value: `${(cfg.stProtocolFee * 100).toFixed(2)}%` },
    { label: "Risk-premium protocol fee", value: `${(cfg.yieldShareProtocolFee * 100).toFixed(2)}%` },
  ];
}
