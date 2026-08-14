/**
 * Differential replay of the current pinned Royco Day Solidity vector bundle.
 * The fixture is regenerated only from the exact commit, solc, Foundry version,
 * and harness recorded in vectors/contract-lock.json.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  adaptYTargetWadWithAverage,
  coverageUtilizationWad,
  liquidityUtilizationWad,
  ltRawNAVWad,
  newMarket,
  postOpAccountingWad,
  processFeeAndLiquidityPremiumWad,
  reconcile,
  selfLiquidationClaimWad,
  sharesForValueWad,
  valueForSharesWad,
  ydmShareWad,
} from './engine';
import { defaultConfig } from './runner';
import { type LiveState, type MarketConfig } from './types';

type Fields = Record<string, string | boolean>;
interface Vector { id: string; group: string; kind: string; inputs: Fields; outputs: Fields }
interface Bundle {
  schemaVersion: number;
  expectedVectorCount: number;
  expectedVectorIds: string[];
  provenance: {
    repository: string;
    commit: string;
    solc: string;
    foundry: string;
    harness: string;
    harnessSha256: string;
    generator: string;
  };
  requiredGroups: string[];
  vectors: Vector[];
}

const here = dirname(fileURLToPath(import.meta.url));
const lock = JSON.parse(readFileSync(join(here, 'vectors/contract-lock.json'), 'utf8')) as {
  repository: string; commit: string; solc: string; foundry: string; schemaVersion: number;
};
const bundle = JSON.parse(readFileSync(join(here, 'vectors/golden.json'), 'utf8')) as Bundle;
if (bundle.schemaVersion !== lock.schemaVersion) throw new Error('Day vector schema does not match contract lock');
for (const key of ['repository', 'commit', 'solc', 'foundry'] as const) {
  if (bundle.provenance[key] !== lock[key]) throw new Error(`Day vector ${key} does not match contract lock`);
}
const harnessHash = createHash('sha256')
  .update(readFileSync(join(here, 'harness/DayVectorGen.t.sol')))
  .digest('hex');
if (harnessHash !== bundle.provenance.harnessSha256) throw new Error('Day vector harness hash does not match provenance');
const groups = new Set(bundle.vectors.map((vector) => vector.group));
for (const group of bundle.requiredGroups) {
  if (!groups.has(group)) throw new Error(`missing required current-contract vector group: ${group}`);
}
if (!Number.isInteger(bundle.expectedVectorCount) || bundle.expectedVectorCount < 78) {
  throw new Error('current-contract vector inventory must require at least 78 rows');
}
if (bundle.vectors.length !== bundle.expectedVectorCount) {
  throw new Error(`current-contract vector count is ${bundle.vectors.length}; expected ${bundle.expectedVectorCount}`);
}
const actualInventory = bundle.vectors.map((vector) => vector.id);
if (new Set(actualInventory).size !== actualInventory.length) {
  throw new Error('current-contract vector inventory contains duplicate ids');
}
if (bundle.expectedVectorIds.length !== bundle.expectedVectorCount
  || bundle.expectedVectorIds.some((id, index) => id !== actualInventory[index])) {
  throw new Error('current-contract vector id inventory does not match the generated manifest');
}

const ids = new Set<string>();
const rows: Array<{ group: string; id: string; failures: string[] }> = [];
const u = (fields: Fields, name: string): bigint => {
  const value = fields[name];
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error(`${name} must be an unsigned decimal string`);
  return BigInt(value);
};
const uOr = (fields: Fields, name: string, fallback: bigint): bigint => (
  fields[name] === undefined ? fallback : u(fields, name)
);
const s = (fields: Fields, name: string): string => {
  const value = fields[name];
  if (typeof value !== 'string') throw new Error(`${name} must be a string`);
  return value;
};
const compare = (vector: Vector, actual: Record<string, bigint | string | boolean>) => {
  const failures: string[] = [];
  for (const [field, expected] of Object.entries(vector.outputs)) {
    const got = actual[field];
    if (got === undefined) failures.push(`${field} was not replayed`);
    else if (typeof got === 'bigint' ? got !== BigInt(String(expected)) : got !== expected) {
      failures.push(`${field} got ${String(got)}, expected ${String(expected)}`);
    }
  }
  rows.push({ group: vector.group, id: vector.id, failures });
};

const zeroFeeConfig = (vector: Vector): MarketConfig => defaultConfig({
  coverage: 0.1,
  // The pre-op vectors intentionally omit an E-CLP mark; liquidity is covered
  // independently by post-op vectors below.
  minLiquidity: 0,
  liquidationUtilization: 1.1,
  fixedTermDurationSec: Number(u(vector.inputs, 'fixedTermDurationSec')),
  fixedTermGracePeriodSec: Number(u(vector.inputs, 'graceSec')),
  stProtocolFee: 0,
  jtProtocolFee: 0,
  yieldShareProtocolFee: 0,
  ltYieldShareProtocolFee: 0,
  riskYDM: { mode: 'static', y0: 0, yTarget: 0, y100: 0 },
  liqYDM: { mode: 'static', y0: 0, yTarget: 0, y100: 0 },
  maxJTYieldShare: 0,
  maxLTYieldShare: 0,
  dustTolerance: 0,
});

const fromVectorWad = (value: bigint): number => Number(value) / 1e18;

/**
 * Initialize only the public engine state. All transitions below must flow
 * through `reconcile`; parity may not carry a second accountant implementation.
 */
const freshAccountingState = (vector: Vector, cfg: MarketConfig): LiveState => {
  const seedST = u(vector.inputs, 'seedST');
  const seedJT = u(vector.inputs, 'seedJT');
  const state = newMarket(cfg, {
    st: fromVectorWad(seedST),
    jt: fromVectorWad(seedJT),
    lt: 0,
  });
  if (state.stRawNAV + state.jtRawNAV !== u(vector.inputs, 'seedCollateral')) {
    throw new Error(`${vector.id} seed collateral is not representable by the shared engine initializer`);
  }
  return state;
};

let sequential: LiveState | undefined;
for (const vector of bundle.vectors) {
  if (ids.has(vector.id)) throw new Error(`duplicate Day vector id: ${vector.id}`);
  ids.add(vector.id);
  if (vector.kind === 'coverageUtilization') {
    compare(vector, { value: coverageUtilizationWad(u(vector.inputs, 'collateralNAV'), 0n, 1, u(vector.inputs, 'minCoverageWAD'), u(vector.inputs, 'jtEffectiveNAV')) });
  } else if (vector.kind === 'liquidityUtilization') {
    compare(vector, { value: liquidityUtilizationWad(u(vector.inputs, 'stEffectiveNAV'), u(vector.inputs, 'minLiquidityWAD'), u(vector.inputs, 'lptRawNAV')) });
  } else if (vector.kind === 'sharesForValue') {
    compare(vector, { shares: sharesForValueWad(u(vector.inputs, 'value'), u(vector.inputs, 'totalValue'), u(vector.inputs, 'supply')) });
  } else if (vector.kind === 'valueForShares') {
    compare(vector, { value: valueForSharesWad(u(vector.inputs, 'shares'), u(vector.inputs, 'totalValue'), u(vector.inputs, 'supply')) });
  } else if (vector.kind === 'feePremiumShares') {
    const supply = u(vector.inputs, 'supply');
    const processed = processFeeAndLiquidityPremiumWad({
      stEffective: u(vector.inputs, 'stEffective'), jtEffective: 0n,
      grossLiquidityPremium: u(vector.inputs, 'grossPremium'), stProtocolFee: u(vector.inputs, 'stFee'),
      jtProtocolFee: 0n, lptProtocolFee: u(vector.inputs, 'lptFee'),
      stSupply: supply, jtSupply: 0n, lptSupply: 0n, reinvestSucceeded: false,
    });
    compare(vector, {
      premiumShares: processed.premiumShares,
      feeShares: processed.stFeeShares,
      supplyAfter: processed.stSupplyAfter,
    });
  } else if (vector.kind === 'premiumAccounting') {
    const spotJT = fromVectorWad(u(vector.inputs, 'spotJT'));
    const spotLPT = fromVectorWad(u(vector.inputs, 'spotLPT'));
    const cfg = defaultConfig({
      coverage: 0.1,
      minLiquidity: 0.05,
      liquidationUtilization: 1.1,
      fixedTermDurationSec: Number(u(vector.inputs, 'fixedTermDurationSec')),
      fixedTermGracePeriodSec: Number(u(vector.inputs, 'graceSec')),
      stProtocolFee: fromVectorWad(u(vector.inputs, 'stProtocolFeeWAD')),
      jtProtocolFee: fromVectorWad(u(vector.inputs, 'jtProtocolFeeWAD')),
      yieldShareProtocolFee: fromVectorWad(u(vector.inputs, 'jtYieldShareProtocolFeeWAD')),
      ltYieldShareProtocolFee: fromVectorWad(u(vector.inputs, 'lptYieldShareProtocolFeeWAD')),
      riskYDM: { mode: 'static', y0: spotJT, yTarget: spotJT, y100: spotJT },
      liqYDM: { mode: 'static', y0: spotLPT, yTarget: spotLPT, y100: spotLPT },
      maxJTYieldShare: fromVectorWad(u(vector.inputs, 'maxJTYieldShareWAD')),
      maxLTYieldShare: fromVectorWad(u(vector.inputs, 'maxLPTYieldShareWAD')),
      dustTolerance: 0,
    });
    const state = newMarket(cfg, {
      st: fromVectorWad(u(vector.inputs, 'seedST')),
      jt: fromVectorWad(u(vector.inputs, 'seedJT')),
      lt: fromVectorWad(u(vector.inputs, 'seedLPT')),
    });
    const elapsedSincePremium = u(vector.inputs, 'elapsedSincePremium');
    state.t = elapsedSincePremium;
    state.lastPremiumPaymentSec = 0n;
    state.lastYDMUpdateSec = state.t;
    state.twRiskShareSeconds = u(vector.inputs, 'twJT');
    state.twLiqShareSeconds = u(vector.inputs, 'twLPT');
    state.yieldShareAccrualInitialized = true;
    const result = reconcile(state, cfg, u(vector.inputs, 'newCollateral'), 0n);
    const coverageUtilWAD = coverageUtilizationWad(
      state.stRawNAV,
      state.jtRawNAV,
      cfg.beta,
      100000000000000000n,
      state.jtEffectiveNAV,
    );
    compare(vector, {
      marketState: state.marketState,
      collateralNAV: state.stRawNAV + state.jtRawNAV,
      lptRawNAV: 0n,
      stEffective: state.stEffectiveNAV,
      jtEffective: state.jtEffectiveNAV,
      jtIL: state.jtImpermanentLoss,
      liquidityPremium: result.contractValues.liquidityPremium,
      stFee: result.contractValues.stProtocolFee,
      jtFee: result.contractValues.jtProtocolFee,
      lptFee: result.contractValues.ltProtocolFee,
      coverageUtilWAD,
      liquidityUtilWAD: 0n,
      fixedTermEndTimestamp: state.fixedTermEndSec,
    });
  } else if (vector.kind === 'accountantSync') {
    const cfg = zeroFeeConfig(vector);
    // Only these two vectors intentionally continue the preceding loss state;
    // every other accountant row is an independently seeded Solidity run.
    if (vector.id !== 'partial-recovery' && vector.id !== 'full-recovery') {
      sequential = freshAccountingState(vector, cfg);
    } else if (!sequential) throw new Error(`${vector.id} requires preceding accounting state`);
    sequential.t = vector.inputs.elapsed === undefined ? 1n : 1n + u(vector.inputs, 'elapsed');
    const result = reconcile(sequential, cfg, u(vector.inputs, 'newCollateral'), 0n);
    const coverageUtilWAD = coverageUtilizationWad(
      sequential.stRawNAV,
      sequential.jtRawNAV,
      cfg.beta,
      100000000000000000n,
      sequential.jtEffectiveNAV,
    );
    compare(vector, {
      marketState: sequential.marketState,
      collateralNAV: sequential.stRawNAV + sequential.jtRawNAV,
      lptRawNAV: ltRawNAVWad(sequential, cfg),
      stEffective: sequential.stEffectiveNAV,
      jtEffective: sequential.jtEffectiveNAV,
      jtIL: sequential.jtImpermanentLoss,
      liquidityPremium: result.contractValues.liquidityPremium,
      stFee: result.contractValues.stProtocolFee,
      jtFee: result.contractValues.jtProtocolFee,
      lptFee: result.contractValues.ltProtocolFee,
      coverageUtilWAD,
      liquidityUtilWAD: 0n,
      fixedTermEndTimestamp: sequential.fixedTermEndSec,
    });
  } else if (vector.kind === 'postOp') {
    const seedCollateral = u(vector.inputs, 'seedCollateral');
    const seedST = u(vector.inputs, 'seedST');
    const result = postOpAccountingWad(
      {
        stRawNAV: seedCollateral,
        jtRawNAV: 0n,
        stEffectiveNAV: seedST,
        jtEffectiveNAV: u(vector.inputs, 'seedJT'),
        jtImpermanentLoss: uOr(vector.inputs, 'seedJTIL', 0n),
      },
      { beta: 1, coverage: 0.1, minLiquidity: 0.05, liquidationUtilization: 1.1 },
      {
        operation: s(vector.inputs, 'operation').replace('REDEMPTION', 'REDEEM').replace('LPT_', 'LT_') as Parameters<typeof postOpAccountingWad>[2]['operation'],
        stRaw: u(vector.inputs, 'collateralNAV'),
        jtRaw: 0n,
        ltRaw: u(vector.inputs, 'lptRawNAV'),
        previousLTRaw: u(vector.inputs, 'seedLPTRaw'),
        bonus: u(vector.inputs, 'bonusNAV'),
        enforce: false,
      },
    );
    compare(vector, {
      marketState: vector.inputs.seedMarketState ?? 'PERPETUAL', collateralNAV: result.stRaw + result.jtRaw, lptRawNAV: result.ltRaw,
      stEffective: result.stEffective, jtEffective: result.jtEffective, jtIL: result.jtIL,
      liquidityPremium: 0n, stFee: 0n, jtFee: 0n, lptFee: 0n,
      coverageUtilWAD: result.coverageUtilWAD, liquidityUtilWAD: result.liquidityUtilWAD,
      fixedTermEndTimestamp: uOr(vector.inputs, 'seedFixedTermEndTimestamp', 0n),
    });
  } else if (vector.kind === 'feeProcessing') {
    const processed = processFeeAndLiquidityPremiumWad({
      stEffective: u(vector.inputs, 'stEffective'), jtEffective: u(vector.inputs, 'jtEffective'),
      grossLiquidityPremium: u(vector.inputs, 'grossPremium'), stProtocolFee: u(vector.inputs, 'stFee'),
      jtProtocolFee: u(vector.inputs, 'jtFee'), lptProtocolFee: u(vector.inputs, 'lptFee'),
      stSupply: u(vector.inputs, 'stSupply'), jtSupply: u(vector.inputs, 'jtSupply'),
      lptSupply: u(vector.inputs, 'lptSupply'), reinvestSucceeded: false,
    });
    compare(vector, { ...processed });
  } else if (vector.kind === 'selfLiquidation') {
    const result = selfLiquidationClaimWad({
      bonusWAD: u(vector.inputs, 'bonusWAD'), stRaw: u(vector.inputs, 'collateralNAV'), jtRaw: 0n,
      stEffective: u(vector.inputs, 'stEffective'), jtEffective: u(vector.inputs, 'jtEffective'),
      coverageUtilWAD: u(vector.inputs, 'coverageUtilWAD'), liquidationUtilWAD: u(vector.inputs, 'liquidationUtilWAD'),
      jtCoinvested: true, claimST: u(vector.inputs, 'claimCollateral'), claimJT: 0n, claimNAV: u(vector.inputs, 'claimNAV'),
    });
    compare(vector, { bonus: result.bonus, claimCollateral: result.claimST, claimNAV: result.claimNAV });
  } else if (vector.kind === 'adaptiveYDM') {
    const cfg = { mode: 'adaptive' as const, y0: 0.1, yTarget: 0.3, y100: 0.5, maxAdaptSpeedPerYear: 100, minYTarget: 0.0001, maxYTarget: 1 };
    const initial = u(vector.inputs, 'initialTarget');
    let target = initial;
    let average = initial;
    if (s(vector.inputs, 'marketState') === 'PERPETUAL' && u(vector.inputs, 'elapsed') > 0n) {
      const adapted = adaptYTargetWadWithAverage(
        cfg,
        initial,
        u(vector.inputs, 'utilizationWAD'),
        u(vector.inputs, 'elapsed'),
        900000000000000000n,
      );
      target = adapted.next;
      average = adapted.average;
    }
    const yieldShareWAD = ydmShareWad(cfg, average, u(vector.inputs, 'utilizationWAD'), 900000000000000000n);
    compare(vector, { yieldShareWAD, targetWAD: target });
  } else {
    throw new Error(`unsupported current-contract vector kind: ${vector.kind}`);
  }
}

const failed = rows.filter((row) => row.failures.length > 0);
if (failed.length) {
  for (const row of failed) console.error(`${row.group}/${row.id}: ${row.failures.join('; ')}`);
  throw new Error(`${failed.length}/${rows.length} current Royco Day vectors failed`);
}
console.log(`PASS: ${rows.length}/${rows.length} Royco Day vectors at ${lock.commit} (${lock.foundry}, solc ${lock.solc})`);
