/**
 * parity.ts — Replays lib/hybond/vectors.golden.json through lib/try/engine.ts and asserts
 * exact BigInt parity for the srHYBond simulator's OWN inputs.
 *
 * Run: npx tsx lib/hybond/parity.ts
 *
 * The golden vectors are emitted by lib/hybond/harness/HybondVectorGen.t.sol, which drives the
 * REAL RoycoDayAccountant (~/royco-day, commit e6955e8) over HYBond's ACTUAL 61-point monthly
 * NAV series with HYBond's DEFAULT params. This runner mirrors that harness exactly: same
 * config (built from HYBOND_DEFAULT_PARAMS via the app's own buildConfig, not a hand-copy),
 * same genesis seeding (JT_DEPOSIT then ST_DEPOSIT), and the same raw-NAV driving as
 * lib/try/backtest.ts (Senior fixed capital indexed off price[0]; Junior carried and scaled
 * step-to-step), with maintainJuniorCoverage disabled so the RAW engine sync path is proven.
 *
 * Inputs are recomputed independently here from HYBOND_NAV_SERIES and asserted against the
 * inputs recorded in the golden file, so a driving drift between Solidity and TypeScript
 * fails loudly instead of silently comparing different scenarios.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createMarket, deposit, sync, mulDiv, Rounding, WAD, type MarketState_Internal } from "../try/engine";
import { buildConfig, HYBOND_DEFAULT_PARAMS, HYBOND_NAV_SERIES } from "./scenarios";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Vector {
  group: string;
  label: string;
  inputs: { stRaw: string; jtRaw: string; priceWad: string; dtSec: string };
  outputs: {
    stEff: string;
    jtEff: string;
    il: string;
    coverageUtilWad: string;
    marketState: string;
    /** Coverage IL the REAL accountant erased on this sync, captured from its
     *  JuniorTrancheCoverageImpermanentLossReset event (absent event == "0"). */
    ilErased: string;
  };
}

const vectors: Vector[] = JSON.parse(readFileSync(join(__dirname, "vectors.golden.json"), "utf8"));

// ---- Input helpers (identical to lib/try/backtest.ts) ----
const toNav = (dollars: number): bigint => (BigInt(Math.round(dollars * 1e6)) * WAD) / 1_000_000n;
const toPriceWad = (price: number): bigint => (BigInt(Math.round(price * 1e6)) * WAD) / 1_000_000n;

function secondsBetween(a: string, b: string): bigint {
  const pa = Date.parse(a.length === 7 ? a + "-01" : a);
  const pb = Date.parse(b.length === 7 ? b + "-01" : b);
  return BigInt(Math.max(0, Math.round((pb - pa) / 1000)));
}

// ---- Genesis (mirrors HybondVectorGen._genesis / runBacktest) ----
const stNav0 = toNav(HYBOND_DEFAULT_PARAMS.depositST);
const jtNav0 = toNav(HYBOND_DEFAULT_PARAMS.depositJT);

function newGenesisMarket(): MarketState_Internal {
  const m = createMarket(buildConfig(HYBOND_DEFAULT_PARAMS));
  deposit(m, "JT", 0n, jtNav0);
  deposit(m, "ST", stNav0, jtNav0);
  return m;
}

// ---- Replay ----
interface Row {
  label: string;
  pass: boolean;
  fails: string[];
}
const rows: Row[] = [];
const byLabel = new Map<string, Vector>();
for (const v of vectors) byLabel.set(v.label, v);

const series = HYBOND_NAV_SERIES;
if (series.length !== vectors.length) {
  throw new Error(`series/vector length mismatch: ${series.length} points vs ${vectors.length} vectors`);
}

const m = newGenesisMarket();
const priceWad0 = toPriceWad(series[0].price);
let jtRawCarry = jtNav0;
let prevPriceWad = priceWad0;

for (let i = 0; i < series.length; i++) {
  const label = `F_hybond_${i + 1}`;
  const v = byLabel.get(label);
  if (!v) throw new Error(`missing golden vector: ${label}`);

  const priceWad = toPriceWad(series[i].price);
  const stRaw = mulDiv(stNav0, priceWad, priceWad0, Rounding.Floor);
  const jtRaw = i === 0 ? jtNav0 : mulDiv(jtRawCarry, priceWad, prevPriceWad, Rounding.Floor);
  const dt = i === 0 ? 0n : secondsBetween(series[i - 1].date, series[i].date);

  const fails: string[] = [];
  const cmp = (name: string, got: bigint | string, want: string) => {
    if (String(got) !== want) fails.push(`${name}: got ${got} want ${want}`);
  };

  // Inputs must match what the Solidity harness actually fed the accountant.
  cmp("input.stRaw", stRaw, v.inputs.stRaw);
  cmp("input.jtRaw", jtRaw, v.inputs.jtRaw);
  cmp("input.priceWad", priceWad, v.inputs.priceWad);
  cmp("input.dtSec", dt, v.inputs.dtSec);

  const r = sync(m, stRaw, jtRaw, dt);

  cmp("stEff", r.stEffectiveNAV, v.outputs.stEff);
  cmp("jtEff", r.jtEffectiveNAV, v.outputs.jtEff);
  cmp("il", r.jtCoverageIL, v.outputs.il);
  // The junior-loss lock-in signal the simulator counts: must be wei-exact vs the contract.
  cmp("ilErased", r.jtCoverageILErased, v.outputs.ilErased);
  cmp("coverageUtilWad", r.coverageUtilWad, v.outputs.coverageUtilWad);
  cmp("marketState", r.marketState, v.outputs.marketState);

  rows.push({ label, pass: fails.length === 0, fails });

  jtRawCarry = r.jtRawNAV;
  prevPriceWad = priceWad;
}

// ---- Report ----
let passCount = 0;
for (const r of rows) {
  if (r.pass) {
    passCount++;
    console.log(`  PASS  F / ${r.label}`);
  } else {
    console.log(`  FAIL  F / ${r.label}`);
    for (const f of r.fails) console.log(`          ${f}`);
  }
}
console.log("");
console.log(`${passCount}/${rows.length} PASS`);
if (passCount !== rows.length) process.exit(1);
