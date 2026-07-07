/**
 * parity.ts — Replays vectors.golden.json through engine.ts and asserts exact BigInt parity.
 *
 * Run: npx tsx lib/try/parity.ts
 *
 * Mirrors test/vectors/VectorGen.t.sol: same market config, same genesis seeding
 * (JT_DEPOSIT then ST_DEPOSIT), and the same per-group step sequences.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  createMarket,
  deposit,
  sync,
  ydmYieldShare,
  coverageUtilization,
  WAD,
  type MarketConfig,
  type YDMCurve,
  type MarketState_Internal,
} from "./engine";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- Golden vectors ----
interface Vector {
  group: string;
  label: string;
  inputs: { stRaw?: string; jtRaw?: string; priceWad?: string; dtSec?: string };
  outputs: {
    value?: string;
    stEff?: string;
    jtEff?: string;
    il?: string;
    coverageUtilWad?: string;
    marketState?: string;
  };
}

const vectors: Vector[] = JSON.parse(readFileSync(join(__dirname, "vectors.golden.json"), "utf8"));

// ---- Market config (mirrors VectorGen._deploy) ----
const jtYDM: YDMCurve = {
  yieldShareAtZeroUtilWAD: 530000000000000000n, // 0.53e18
  yieldShareAtTargetWAD: 530000000000000000n,
  yieldShareAtFullUtilWAD: 530000000000000000n,
  targetUtilizationWAD: 900000000000000000n, // 0.9e18
};
const ltYDM: YDMCurve = {
  yieldShareAtZeroUtilWAD: 1n,
  yieldShareAtTargetWAD: 1n,
  yieldShareAtFullUtilWAD: 1n,
  targetUtilizationWAD: 900000000000000000n,
};

function freshConfig(): MarketConfig {
  return {
    minCoverageWAD: 300000000000000000n, // 0.3e18
    coverageLiquidationUtilizationWAD: 2000000000000000000n, // 2e18
    minLiquidityWAD: 0n,
    jtCoinvested: true,
    jtYDM,
    ltYDM,
    maxJTYieldShareWAD: WAD, // 1e18
    maxLTYieldShareWAD: 0n,
    fixedTermDurationSeconds: 2592000n,
    stNAVDustTolerance: 0n,
    jtNAVDustTolerance: 0n,
    stProtocolFeeWAD: 0n,
    jtProtocolFeeWAD: 0n,
    jtYieldShareProtocolFeeWAD: 0n,
    ltYieldShareProtocolFeeWAD: 0n,
    startTimestamp: 1000000n, // vm.warp(1_000_000)
  };
}

// Genesis: JT deposit (0 -> 500e18), then ST deposit (0 -> 1000e18), both at price 1.0
function newGenesisMarket(): MarketState_Internal {
  const m = createMarket(freshConfig());
  const st = 1000000000000000000000n; // 1000e18
  const jt = 500000000000000000000n; // 500e18
  deposit(m, "JT", 0n, jt);
  deposit(m, "ST", st, jt);
  return m;
}

const DAY = 86400n;

// ---- Parity checking ----
interface Row {
  group: string;
  label: string;
  pass: boolean;
  fails: string[];
}
const rows: Row[] = [];
const byLabel = new Map<string, Vector>();
for (const v of vectors) byLabel.set(v.label, v);

function checkScalar(v: Vector, got: bigint): void {
  const want = BigInt(v.outputs.value!);
  const pass = got === want;
  rows.push({ group: v.group, label: v.label, pass, fails: pass ? [] : [`value: got ${got} want ${want}`] });
}

function checkSync(
  label: string,
  got: { stEff: bigint; jtEff: bigint; il: bigint; cov: bigint; state: string },
): void {
  const v = byLabel.get(label);
  if (!v) throw new Error(`missing golden vector: ${label}`);
  const fails: string[] = [];
  const cmp = (name: string, g: bigint, w: string) => {
    if (g !== BigInt(w)) fails.push(`${name}: got ${g} want ${w}`);
  };
  cmp("stEff", got.stEff, v.outputs.stEff!);
  cmp("jtEff", got.jtEff, v.outputs.jtEff!);
  cmp("il", got.il, v.outputs.il!);
  cmp("coverageUtilWad", got.cov, v.outputs.coverageUtilWad!);
  if (got.state !== v.outputs.marketState) fails.push(`marketState: got ${got.state} want ${v.outputs.marketState}`);
  rows.push({ group: v.group, label, pass: fails.length === 0, fails });
}

function priceToRaws(priceWad: bigint): { st: bigint; jt: bigint } {
  // _stRaw = 1000e18 * priceWad / 1e18 ; _jtRaw = 500e18 * priceWad / 1e18
  const st = (1000n * WAD * priceWad) / WAD;
  const jt = (500n * WAD * priceWad) / WAD;
  return { st, jt };
}

function step(m: MarketState_Internal, label: string, priceWad: bigint, dtSec: bigint): void {
  const { st, jt } = priceToRaws(priceWad);
  const r = sync(m, st, jt, dtSec);
  checkSync(label, { stEff: r.stEffectiveNAV, jtEff: r.jtEffectiveNAV, il: r.jtCoverageIL, cov: r.coverageUtilWad, state: r.marketState });
}

// ===================== GROUP A: YDM curve =====================
for (const u of [0n, 450000000000000000n, 900000000000000000n, 950000000000000000n, WAD, 1500000000000000000n]) {
  const label = `ydm_U_${u.toString()}`;
  const v = byLabel.get(label)!;
  checkScalar(v, ydmYieldShare(jtYDM, "PERPETUAL", u));
}

// ===================== GROUP B: coverage utilization =====================
const e18 = WAD;
checkScalar(byLabel.get("cov_1000_500_500")!, coverageUtilization(1000n * e18, 500n * e18, true, 300000000000000000n, 500n * e18));
checkScalar(byLabel.get("cov_700_300_300")!, coverageUtilization(700n * e18, 300n * e18, true, 300000000000000000n, 300n * e18));
checkScalar(byLabel.get("cov_minCov0")!, coverageUtilization(1000n * e18, 500n * e18, true, 0n, 500n * e18));
checkScalar(byLabel.get("cov_jtEff0_exposure")!, coverageUtilization(1000n * e18, 500n * e18, true, 300000000000000000n, 0n));
checkScalar(byLabel.get("cov_zero_exposure")!, coverageUtilization(0n, 0n, true, 300000000000000000n, 1n));

// ===================== GROUP C: single-sync waterfall =====================
// C0 genesis sanity
{
  const m = newGenesisMarket();
  step(m, "C0_genesis", WAD, 0n);
}
// C1 flat
{
  const m = newGenesisMarket();
  step(m, "C1_flat_30d", WAD, 30n * DAY);
}
// C2 up +10%
{
  const m = newGenesisMarket();
  step(m, "C2_up10_30d", 1100000000000000000n, 30n * DAY);
}
// C3 down -10%
{
  const m = newGenesisMarket();
  step(m, "C3_down10_30d", 900000000000000000n, 30n * DAY);
}
// C4 down then partial recover
{
  const m = newGenesisMarket();
  step(m, "C4_down10_30d", 900000000000000000n, 30n * DAY);
  step(m, "C4_recover95_5d", 950000000000000000n, 5n * DAY);
}
// C6 deep -60%
{
  const m = newGenesisMarket();
  step(m, "C6_down60_30d", 400000000000000000n, 30n * DAY);
}
// C7 term elapses
{
  const m = newGenesisMarket();
  step(m, "C7_down10_30d", 900000000000000000n, 30n * DAY);
  step(m, "C7_termElapsed_flat", 900000000000000000n, 31n * DAY);
}

// ===================== GROUP D: multi-sync backtest =====================
{
  const m = newGenesisMarket();
  const prices = [
    1000000000000000000n, 1020000000000000000n, 1050000000000000000n, 1030000000000000000n,
    1080000000000000000n, 980000000000000000n, 950000000000000000n, 1010000000000000000n,
    1060000000000000000n, 1100000000000000000n, 1040000000000000000n, 1120000000000000000n,
  ];
  // The harness now drives a single monotonically-increasing clock: each step advances +30d
  // (2_592_000s) on the same wall clock, so the fixed-term anchor set on a PERPETUAL->FIXED_TERM
  // entry genuinely elapses one full term later. Every step therefore advances dt=30d.
  for (let i = 0; i < prices.length; i++) {
    step(m, `D_step_${i + 1}`, prices[i], 30n * DAY);
  }
}

// ===================== C5 (deferred) =====================
{
  const m = newGenesisMarket();
  step(m, "C5_down10_30d", 900000000000000000n, 30n * DAY);
  step(m, "C5_recover105_5d", 1050000000000000000n, 5n * DAY);
}

// ===================== GROUP E: FIXED_TERM boundary adversarial =====================
const TERM = 2592000n;

// E1: enter FIXED_TERM (down -10%); then FIVE consecutive flat/underwater syncs, each dt=TERM.
{
  const m = newGenesisMarket();
  step(m, "E1_enter_down10", 900000000000000000n, TERM);
  for (let i = 1; i <= 5; i++) step(m, `E1_flat_${i}`, 900000000000000000n, TERM);
}
// E2: down -10%; then one sync at dt = TERM - 1 (one second BEFORE term end).
{
  const m = newGenesisMarket();
  step(m, "E2_enter_down10", 900000000000000000n, TERM);
  step(m, "E2_before_end", 900000000000000000n, TERM - 1n);
}
// E3: down -10%; then one sync at dt = TERM (EXACTLY term end).
{
  const m = newGenesisMarket();
  step(m, "E3_enter_down10", 900000000000000000n, TERM);
  step(m, "E3_at_end", 900000000000000000n, TERM);
}
// E4: down -10%; then one sync at dt = TERM + 1 (one second AFTER).
{
  const m = newGenesisMarket();
  step(m, "E4_enter_down10", 900000000000000000n, TERM);
  step(m, "E4_after_end", 900000000000000000n, TERM + 1n);
}
// E5: down -10%; partial dt=1e6; then dt=2e6 (cumulative > TERM from original entry).
{
  const m = newGenesisMarket();
  step(m, "E5_enter_down10", 900000000000000000n, TERM);
  step(m, "E5_partial_1e6", 900000000000000000n, 1000000n);
  step(m, "E5_partial_2e6", 900000000000000000n, 2000000n);
}
// E6: down -10%; recover fully to 1.10 at dt=TERM-1 (in-term, IL->0, goes PERPETUAL); then
// re-enter down -10% at dt=100 (a fresh PERPETUAL->FIXED_TERM entry, new term anchor). With the
// monotonic clock the recovery is a normal forward sync and does NOT revert.
{
  const m = newGenesisMarket();
  step(m, "E6_enter_down10", 900000000000000000n, TERM);
  step(m, "E6_recover110", 1100000000000000000n, TERM - 1n);
  step(m, "E6_reenter_down10", 900000000000000000n, 100n);
}

// ---- Report ----
let passCount = 0;
const total = rows.length;
const order = ["A", "B", "C", "D", "E"];
rows.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
for (const r of rows) {
  if (r.pass) {
    passCount++;
    console.log(`  PASS  ${r.group} / ${r.label}`);
  } else {
    console.log(`  FAIL  ${r.group} / ${r.label}`);
    for (const f of r.fails) console.log(`          ${f}`);
  }
}
console.log("");
console.log(`${passCount}/${total} PASS`);
if (passCount !== total) process.exit(1);
