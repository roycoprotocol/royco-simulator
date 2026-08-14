// =============================================================================
// Engine invariant tests = audit verification.
// Each test asserts a property the Dawn contracts enforce. Run: npm test
// =============================================================================

import { MarketState } from "./types";
import { Sim, defaultConfig, steadyYear, type StepInput } from "./runner";
import { adaptYTargetWadWithAverage, jtRedeem, newMarket, postOpAccountingWad, sharesForValueWad, valueForSharesWad, ydmShareWad } from "./engine";
import { toWad } from "./wad";
import { YEAR_SEC, ydmShare } from "./ydm";
import { eclpParamsForWeight, eclpSellValue, eclpInvariant, eclpTVL, reservesPerL } from "./eclp";
import "./secondary-exit-fee.test";

let passed = 0;
let failed = 0;
const approx = (a: number, b: number, eps = 1e-4) => Math.abs(a - b) <= eps;

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗ ${name}\x1b[0m ${detail}`);
  }
}

function assertConservation(sim: Sim, label: string) {
  let worst = 0;
  for (const s of sim.history) worst = Math.max(worst, Math.abs(s.conservationResidual));
  check(`NAV conservation holds across ${label} (worst residual ${worst.toExponential(2)})`, worst < 1e-3, `residual=${worst}`);
}

// helper: one instantaneous step (no time, pure collateral PnL). jtReturn is
// retained by StepInput only for compatibility and no longer changes math.
const shock = (stReturn: number, jtReturn = stReturn): StepInput => ({ dtSec: 0, stReturn, jtReturn });
const hold = (dtSec: number, stReturn: number, jtReturn: number): StepInput => ({ dtSec, stReturn, jtReturn });

console.log("\n\x1b[1mRoyco Day engine — invariant audit\x1b[0m\n");

// ---------------------------------------------------------------------------
console.log("1. NAV conservation (stRaw+jtRaw == stEff+jtEff; premiums and fees are share claims)");
{
  const sim = new Sim(defaultConfig(), { st: 1000, jt: 250, lt: 150 });
  steadyYear(0.12, 0).forEach((s) => sim.step(s));
  sim.step({ ...shock(-0.05), op: { type: "none" } }); // 5% ST loss
  sim.step(hold(YEAR_SEC / 12, 0.02, 0)); // recovery
  sim.step({ dtSec: 0, stReturn: 0, jtReturn: 0, op: { type: "stDeposit", amount: 100 } });
  sim.step({ dtSec: 0, stReturn: 0, jtReturn: 0, op: { type: "jtRedeem", shares: 10 } });
  sim.step({ dtSec: 0, stReturn: 0, jtReturn: 0, op: { type: "ltDeposit", amount: 50 } });
  assertConservation(sim, "yield + loss + recovery + ops");
}

// ---------------------------------------------------------------------------
console.log("\n2. Loss waterfall: JT covers first, ST IL only after JT exhausted");
{
  const cfg = defaultConfig();
  const sim = new Sim(cfg, { st: 1000, jt: 250, lt: 150 });
  const jtEff0 = sim.last().jtEffectiveNAV;
  // One coinvested collateral ledger: 5% of 1,250 = 62.5.
  sim.step(shock(-0.05));
  const a = sim.last();
  check("JT absorbs the full collateral loss (jtEff drops by ~62.5)", approx(jtEff0 - a.jtEffectiveNAV, 62.5), `Δ=${jtEff0 - a.jtEffectiveNAV}`);
  check("ST effective NAV untouched (fully protected)", approx(a.stEffectiveNAV, 1000), `stEff=${a.stEffectiveNAV}`);
  check("JT IL includes every absorbed collateral-loss wei (~62.5)", approx(a.jtIL, 62.5), `jtIL=${a.jtIL}`);
  check("no ST IL while JT buffer remains", a.stIL < 1e-6, `stIL=${a.stIL}`);
  check("market entered FIXED_TERM", a.state === MarketState.FIXED_TERM);
}
{
  // loss exceeding JT buffer -> ST IL, distressed, forced perpetual + erase
  const sim = new Sim(defaultConfig({ fixedTermDurationSec: 30 * 86400 }), { st: 1000, jt: 300, lt: 150 });
  sim.step(shock(-0.3)); // 30% of 1,300 = 390 loss > 300 JT buffer
  const a = sim.last();
  check("JT buffer fully exhausted (jtEff ~ 0)", a.jtEffectiveNAV < 1e-3, `jtEff=${a.jtEffectiveNAV}`);
  check("residual loss becomes ST IL (~90)", approx(a.stIL, 90), `stIL=${a.stIL}`);
  check("distressed market forced to PERPETUAL", a.state === MarketState.PERPETUAL);
  check("JT coverage claim erased on forced perpetual", a.jtIL < 1e-6, `jtIL=${a.jtIL}`);
}

// ---------------------------------------------------------------------------
console.log("\n3. Claim-based PnL attribution replaces the legacy ST-IL repayment bucket");
{
  // distressed market: stIL>0, jtIL erased (they provably never coexist post-sync)
  const sim = new Sim(defaultConfig({ fixedTermDurationSec: 365 * 86400, liquidationUtilization: 5 }), { st: 1000, jt: 300, lt: 150 });
  sim.step(shock(-0.3)); // exhaust JT (300), 90 -> ST IL, distressed -> perpetual, jtIL erased
  const before = sim.last();
  check("distressed state carries ST IL (~90)", approx(before.stIL, 90), `stIL=${before.stIL}`);
  sim.step(shock(+0.05));
  const a = sim.last();
  const collateralGain = (before.stRawNAV + before.jtRawNAV) * 0.05;
  check("visual Senior-loss diagnostic declines without driving accounting", approx(a.stIL, 90 - collateralGain, 1e-2), `stIL=${a.stIL}`);
  check("contract pays JT premium on Senior-attributed gain", a.jtEffectiveNAV > before.jtEffectiveNAV, `ΔjtEff=${a.jtEffectiveNAV - before.jtEffectiveNAV}`);
  check("Senior and Junior effective gains sum to the attributed gain", approx(
    (a.stEffectiveNAV - before.stEffectiveNAV) + (a.jtEffectiveNAV - before.jtEffectiveNAV),
    collateralGain,
    1e-2,
  ));
}

// ---------------------------------------------------------------------------
console.log("\n4. Fixed-term lifecycle: enter on covered drawdown, natural recovery exits clean");
{
  const sim = new Sim(defaultConfig({ fixedTermDurationSec: 365 * 86400 }), { st: 1000, jt: 250, lt: 150 });
  sim.step(shock(-0.05)); // covered -> fixed term, jtIL=62.5
  check("entered FIXED_TERM", sim.last().state === MarketState.FIXED_TERM);
  check("jtIL recorded (~62.5)", approx(sim.last().jtIL, 62.5));
  sim.step(shock(+0.06)); // +6% of collateral repays IL, then distributes residual
  const a = sim.last();
  check("jtIL fully repaid on recovery", a.jtIL < 1e-6, `jtIL=${a.jtIL}`);
  check("natural exit back to PERPETUAL", a.state === MarketState.PERPETUAL);
  check(
    "natural exit exposes a structured recovered reason",
    sim.events.some((event) => event.kind === "exit-fixed-term" && event.observationExitReason === "recovered"),
  );
  check("JT made whole then earns premium (jtEff >= 250)", a.jtEffectiveNAV >= 250 - 1e-2, `jtEff=${a.jtEffectiveNAV}`);
}
{
  // term expiry forces perpetual + erases jtIL (JT eats the loss)
  const sim = new Sim(defaultConfig({ fixedTermDurationSec: 10 * 86400 }), { st: 1000, jt: 250, lt: 150 });
  sim.step(shock(-0.05)); // fixed term, jtIL=62.5
  sim.step(hold(20 * 86400, 0, 0)); // 20 days pass > 10 day term, no recovery
  const a = sim.last();
  check("term expiry forces PERPETUAL", a.state === MarketState.PERPETUAL);
  check(
    "term expiry exposes a structured period-ended reason",
    sim.events.some((event) => event.kind === "exit-fixed-term" && event.observationExitReason === "period-ended"),
  );
  check("jtIL erased on expiry (JT realizes the loss)", a.jtIL < 1e-6, `jtIL=${a.jtIL}`);
  check("jtEff stays reduced (~187.5) — loss is now permanent for JT", approx(a.jtEffectiveNAV, 187.5, 1), `jtEff=${a.jtEffectiveNAV}`);
}

// ---------------------------------------------------------------------------
console.log("\n5. Coverage gating blocks under-collateralizing operations");
{
  // make JT thin so a further ST deposit would push utilization > 100%
  const cfg = defaultConfig({ coverage: 0.5 });
  const sim = new Sim(cfg, { st: 1000, jt: 1200, lt: 150 });
  // U now = 0.5*2200/1200 = 0.917. A 400 ST deposit breaches 100%.
  const before = sim.last().stEffectiveNAV;
  sim.step({ dtSec: 0, stReturn: 0, jtReturn: 0, op: { type: "stDeposit", amount: 400 } });
  const blocked = sim.events.some((e) => e.kind === "blocked");
  check("ST deposit that breaks coverage is blocked", blocked);
  check("blocked ST deposit left state unchanged", approx(sim.last().stEffectiveNAV, before), `stEff=${sim.last().stEffectiveNAV}`);
  // JT redeem that breaks coverage is blocked
  sim.step({ dtSec: 0, stReturn: 0, jtReturn: 0, op: { type: "jtRedeem", shares: 400 } });
  const u = sim.last().utilization;
  check("post-state still collateralized (util <= 1)", u <= 1 + 1e-9, `util=${u}`);
}

// ---------------------------------------------------------------------------
console.log("\n6. ST self-liquidation bonus: only above liq threshold, utilization-neutral");
{
  // drive utilization above liquidation threshold via a loss, then ST redeems
  const cfg = defaultConfig({ coverage: 0.4, liquidationUtilization: 1.2, fixedTermDurationSec: 0 });
  const sim = new Sim(cfg, { st: 1000, jt: 800, lt: 150 });
  sim.step(shock(-0.2));
  // push further
  sim.step(shock(-0.1));
  const preU = sim.last().utilization;
  check("utilization above liquidation threshold before redeem", preU > cfg.liquidationUtilization, `util=${preU}`);
  sim.step({ dtSec: 0, stReturn: 0, jtReturn: 0, op: { type: "stRedeem", shares: 100 } });
  const bonusEvent = sim.events.some((e) => e.kind === "self-liq-bonus");
  check("self-liquidation bonus paid when breached", bonusEvent);
  const postU = sim.last().utilization;
  check("redemption did not increase utilization (delevering)", postU <= preU + 1e-6, `pre=${preU} post=${postU}`);
  assertConservation(sim, "self-liquidation bonus path");
}
{
  // healthy market: NO bonus
  const sim = new Sim(defaultConfig(), { st: 1000, jt: 250, lt: 150 });
  sim.step({ dtSec: 0, stReturn: 0, jtReturn: 0, op: { type: "stRedeem", shares: 100 } });
  check("no self-liq bonus in a healthy market", !sim.events.some((e) => e.kind === "self-liq-bonus"));
}

// ---------------------------------------------------------------------------
console.log("\n7. Dual YDM yield split: ST keeps residual, JT gets risk premium, LT gets liquidity premium");
{
  const cfg = defaultConfig({
    riskYDM: { mode: "static", y0: 0.3, yTarget: 0.3, y100: 0.3 },
    liqYDM: { mode: "static", y0: 0.1, yTarget: 0.1, y100: 0.1 },
  });
  const sim = new Sim(cfg, { st: 1000, jt: 250, lt: 150 });
  const b = sim.last();
  const poolSeniorSharesBefore = sim.state.pool.stShares;
  sim.step(hold(YEAR_SEC, 0.1, 0.1)); // +10% on the coinvested collateral
  const a = sim.last();
  const dST = a.stEffectiveNAV - b.stEffectiveNAV;
  const dJT = a.jtEffectiveNAV - b.jtEffectiveNAV;
  const reinvestedPremiumShares = sim.state.pool.stShares - poolSeniorSharesBefore;
  const dLiq = reinvestedPremiumShares * a.stPrice;
  const plainSeniorGain = (a.stPrice - b.stPrice) * 1000;
  check("JT received its collateral gain plus the risk premium (~55)", approx(dJT, 55, 0.75), `dJT=${dJT}`);
  check("LT received ~10% of ST yield as reinvested Senior shares", approx(dLiq, 10, 0.5), `dLiq=${dLiq}`);
  check("liquidity premium is deployed into the ECLP Senior leg", reinvestedPremiumShares > 0);
  check("successful reinvestment leaves no idle premium Senior shares", sim.state.ltOwnedSTShares === 0);
  check("Senior effective NAV includes its retained yield and the LT-owned premium", approx(dST, 70, 0.5), `dST=${dST}`);
  check("pre-existing Senior shares kept ~60% of yield after the LT share mint", approx(plainSeniorGain, 60, 0.5), `gain=${plainSeniorGain}`);
  check("economic split sums to the full collateral yield", approx(plainSeniorGain + dJT + dLiq, 125, 1e-2));
}

// ---------------------------------------------------------------------------
console.log("\n8. Liquidity utilization & pool: secondary selling drains stable, fills with ST");
{
  const sim = new Sim(defaultConfig(), { st: 1000, jt: 250, lt: 150 });
  const pctST0 = sim.last().poolPctST;
  for (let i = 0; i < 5; i++) sim.step({ dtSec: 0, stReturn: 0, jtReturn: 0, op: { type: "secondarySell", amount: 20 } });
  const a = sim.last();
  check("pool became more ST-heavy after secondary selling", a.poolPctST > pctST0, `${pctST0.toFixed(2)} -> ${a.poolPctST.toFixed(2)}`);
  check("liquidity utilization rose (less stable backing senior)", a.liquidityUtilization > 0, `liqUtil=${a.liquidityUtilization}`);
  assertConservation(sim, "secondary selling");
}

// ---------------------------------------------------------------------------
console.log("\n9. Adaptive YDM drifts the kink toward utilization pressure");
{
  const cfg = defaultConfig({
    riskYDM: { mode: "adaptive", y0: 0.2, yTarget: 0.3, y100: 0.5, maxAdaptSpeedPerYear: 2, minYTarget: 0.01, maxYTarget: 0.9 },
    coverage: 0.5, // pushes utilization high
  });
  const sim = new Sim(cfg, { st: 1000, jt: 1200, lt: 150 });
  const y0 = sim.state.riskYTarget;
  // hold a high-utilization regime with yield flowing
  for (let i = 0; i < 12; i++) sim.step(hold(YEAR_SEC / 12, 0.01, 0));
  const y1 = sim.state.riskYTarget;
  check("Y_T adapts over time under sustained utilization", Math.abs(y1 - y0) > 1e-4, `${y0.toFixed(4)} -> ${y1.toFixed(4)}`);
}

// ---------------------------------------------------------------------------
console.log("\n10. E-CLP swap (eclpSellValue): slippage >= 0 and grows; oracle TVL swap-invariant");
{
  const p = eclpParamsForWeight(0.1, 1, 0.1); // 10% ST peg, λ=1, band 0.1
  const rPeg = reservesPerL(p, 1);
  check("reserves >= 0 at peg", rPeg.x >= 0 && rPeg.y >= 0, `rx=${rPeg.x} ry=${rPeg.y}`);
  check("peg composition ~10% ST", approx(rPeg.x / (rPeg.x + rPeg.y), 0.1, 1e-3), `w=${rPeg.x / (rPeg.x + rPeg.y)}`);
  let X = 70, Y = 630; // 10/90 of 700
  const L0 = eclpInvariant(p, X, Y);
  check("oracle TVL == spot sum at peg", approx(eclpTVL(p, L0, 1, 1), X + Y, 1e-4), `tvl=${eclpTVL(p, L0, 1, 1)}`);
  let prevSlip = -1, slipOK = true, tvlOK = true, monoOK = true;
  for (const sell of [5, 10, 20, 40, 60]) {
    const { stableOut, filled } = eclpSellValue(p, X, Y, sell);
    const slip = filled > 0 ? 1 - stableOut / filled : 1;
    if (slip < -1e-9) slipOK = false; // seller must NOT be paid more than sold
    if (slip < prevSlip - 1e-9) monoOK = false; // slippage grows as pool drains
    prevSlip = slip;
    X += filled; Y -= stableOut;
    if (!approx(eclpInvariant(p, X, Y), L0, 1e-4)) tvlOK = false; // invariant immovable
  }
  check("selling ST never pays out MORE than sold (slippage >= 0)", slipOK);
  check("slippage grows monotonically as the pool drains", monoOK);
  check("invariant L (hence EclpLPOracle TVL) conserved across swaps", tvlOK);
}

// ---------------------------------------------------------------------------
console.log("\n11. YDM caps utilization at 100% before evaluating the curve (matches Solidity)");
{
  const cfg = { mode: "static" as const, y0: 0.25, yTarget: 0.35, y100: 0.55 };
  check("at U=0.9 (kink) share == yTarget (0.35)", approx(ydmShare(cfg, cfg.yTarget, 0.9, 0.9), 0.35), `${ydmShare(cfg, cfg.yTarget, 0.9, 0.9)}`);
  check("at U=1.0 share == y100 (0.55)", approx(ydmShare(cfg, cfg.yTarget, 1.0, 0.9), 0.55), `${ydmShare(cfg, cfg.yTarget, 1.0, 0.9)}`);
  check("at U=1.5 share STILL == y100 (0.55), not extrapolated to 1.0", approx(ydmShare(cfg, cfg.yTarget, 1.5, 0.9), 0.55), `${ydmShare(cfg, cfg.yTarget, 1.5, 0.9)}`);
  check("at U=5 share clamped at y100 (0.55)", approx(ydmShare(cfg, cfg.yTarget, 5, 0.9), 0.55), `${ydmShare(cfg, cfg.yTarget, 5, 0.9)}`);
}

// ---------------------------------------------------------------------------
console.log("\n12. LT redeem blocked when post-op liquidityUtilization > 100% (Day spec)");
{
  const sim = new Sim(defaultConfig({ minLiquidity: 0.12 }), { st: 1000, jt: 250, lt: 150 });
  const before = sim.last();
  // liqUtil now ~ 1000*0.12/150 = 0.8; redeeming half the LT halves ltRawNAV -> liqUtil ~1.6 > 1 -> block
  sim.step({ dtSec: 0, stReturn: 0, jtReturn: 0, op: { type: "ltRedeem", shares: sim.state.ltShares * 0.5 } });
  const blocked = sim.events.some((e) => e.kind === "blocked" && /liquidity would fall below/.test(e.msg));
  check("oversized LT redeem blocked on post-op liqUtil > 100%", blocked);
  check("blocked LT redeem left LT shares unchanged", approx(sim.last().ltNAV, before.ltNAV, 1e-6), `ltNAV ${before.ltNAV} -> ${sim.last().ltNAV}`);
  // a small redeem that keeps liqUtil <= 1 should succeed
  const sim2 = new Sim(defaultConfig({ minLiquidity: 0.05 }), { st: 1000, jt: 250, lt: 150 });
  const sh = sim2.state.ltShares * 0.1;
  sim2.step({ dtSec: 0, stReturn: 0, jtReturn: 0, op: { type: "ltRedeem", shares: sh } });
  check("small LT redeem within min-liquidity succeeds", sim2.events.some((e) => e.kind === "lt-redeem" && !/blocked/.test(e.msg)) && sim2.last().liquidityUtilization <= 1 + 1e-9, `liqUtil=${sim2.last().liquidityUtilization}`);
  assertConservation(sim2, "LT redeem");
}

// ---------------------------------------------------------------------------
console.log("\n13. Self-liquidation uses the current single-collateral utilization-neutral cap");
{
  const cfg = defaultConfig({ coverage: 0.4, liquidationUtilization: 1.2, fixedTermDurationSec: 0, stSelfLiquidationBonus: 0.5 });
  const sim = new Sim(cfg, { st: 1000, jt: 1000, lt: 150 });
  sim.step(shock(-0.3));
  const preU = sim.last().utilization;
  check("utilization above liquidation threshold", preU > cfg.liquidationUtilization && isFinite(preU), `U=${preU}`);
  sim.step({ dtSec: 0, stReturn: 0, jtReturn: 0, op: { type: "stRedeem", shares: 100 } });
  const postU = sim.last().utilization;
  check("self-liq bonus paid", sim.events.some((e) => e.kind === "self-liq-bonus"));
  check("current cap makes the redemption utilization-neutral", approx(postU, preU, 2e-3), `pre=${preU} post=${postU}`);
  assertConservation(sim, "current self-liq cap");
}

// ---------------------------------------------------------------------------
console.log("\n14. Protocol fees taken on a FIXED_TERM -> PERPETUAL recovery (gated on resulting state)");
{
  const cfg = defaultConfig({ fixedTermDurationSec: 365 * 86400, stProtocolFee: 0.1, jtProtocolFee: 0.1, yieldShareProtocolFee: 0.1,
    riskYDM: { mode: "static", y0: 0.3, yTarget: 0.3, y100: 0.3 } });
  const sim = new Sim(cfg, { st: 1000, jt: 250, lt: 150 });
  sim.step(shock(-0.05)); // -> FIXED_TERM, jtIL=50
  check("entered FIXED_TERM", sim.last().state === MarketState.FIXED_TERM);
  const feeBefore = sim.protocolFeeNAV;
  sim.step(shock(+0.2)); // +200: recover stIL(0)+jtIL(50), distribute 150 residual -> PERPETUAL, fees taken
  check("recovered to PERPETUAL", sim.last().state === MarketState.PERPETUAL);
  check("protocol fee WAS taken on the recovery distribution (resulting-state gating)", sim.protocolFeeNAV > feeBefore + 1, `Δfee=${sim.protocolFeeNAV - feeBefore}`);
  assertConservation(sim, "fee on FT->PERPETUAL recovery");
}

// ---------------------------------------------------------------------------
console.log("\n15. LT deposit prices shares via the oracle: ltPrice invariant even off-peg");
{
  const sim = new Sim(defaultConfig(), { st: 1000, jt: 250, lt: 150 });
  // imbalance the pool off-peg with secondary sells
  for (let i = 0; i < 4; i++) sim.step({ dtSec: 0, stReturn: 0, jtReturn: 0, op: { type: "secondarySell", amount: 10 } });
  const pxBefore = sim.last().ltPrice;
  sim.step({ dtSec: 0, stReturn: 0, jtReturn: 0, op: { type: "ltDeposit", amount: 100 } });
  const pxAfter = sim.last().ltPrice;
  check("off-peg LT deposit does not move ltPrice (oracle-consistent, no cohort transfer)", approx(pxBefore, pxAfter, 1e-6), `${pxBefore} -> ${pxAfter}`);
  assertConservation(sim, "off-peg LT deposit");
}

// ---------------------------------------------------------------------------
console.log("\n16. Single-collateral recovery clears the recovery claim at the same checkpoint");
{
  const cfg = defaultConfig({
    coverage: 0.03,
    beta: 1,
    minLiquidity: 0.15,
    fixedTermDurationSec: 7 * 86400,
    liquidationUtilization: 100,
    riskYDM: { mode: "static", y0: 0, yTarget: 0, y100: 0 },
    liqYDM: { mode: "static", y0: 0, yTarget: 0, y100: 0 },
  });
  const sim = new Sim(cfg, { st: 1000, jt: 34.48275862068966, lt: 166.66666666666666 });
  for (const sourceReturn of [-0.01, 0.004, 0.0061]) {
    sim.step({ dtSec: 86400, stReturn: sourceReturn, jtReturn: sourceReturn });
  }
  check("collateral recovery clears JT coverage IL", sim.last().jtIL < 1e-9, `jtIL=${sim.last().jtIL}`);
  check("collateral recovery returns the market to PERPETUAL", sim.last().state === MarketState.PERPETUAL);
  assertConservation(sim, "single-collateral recovery replay");
}

// ---------------------------------------------------------------------------
console.log("\n17. Fixed-term gates and Senior-deposit liquidity requirement match the kernel");
{
  const sim = new Sim(defaultConfig({ fixedTermDurationSec: 365 * 86400 }), { st: 1000, jt: 250, lt: 150 });
  sim.step(shock(-0.05));
  const stBefore = sim.state.stShares;
  const jtBefore = sim.state.jtShares;
  sim.step({ dtSec: 0, stReturn: 0, jtReturn: 0, op: { type: "stDeposit", amount: 1 } });
  sim.step({ dtSec: 0, stReturn: 0, jtReturn: 0, op: { type: "jtRedeem", shares: 1 } });
  check("Senior deposit is blocked in FIXED_TERM", sim.state.stShares === stBefore);
  check("Junior redemption is blocked in FIXED_TERM", sim.state.jtShares === jtBefore);
}
{
  const sim = new Sim(defaultConfig({ coverage: 0.2, minLiquidity: 0.12 }), { st: 1000, jt: 500, lt: 120 });
  const before = sim.state.stShares;
  sim.step({ dtSec: 0, stReturn: 0, jtReturn: 0, op: { type: "stDeposit", amount: 1 } });
  check("Senior deposit that breaches minimum liquidity is blocked", sim.state.stShares === before);
}

// ---------------------------------------------------------------------------
console.log("\n18. Wiped Junior refills stay finite under the contract dilution clamp");
{
  const sim = new Sim(defaultConfig({ fixedTermDurationSec: 0 }), { st: 1000, jt: 250, lt: 150 });
  sim.step(shock(-1));
  sim.step({ dtSec: 0, stReturn: 0, jtReturn: 0, op: { type: "jtDeposit", amount: 10 } });
  check("wiped-Junior refill mints a finite share count", Number.isFinite(sim.state.jtShares));
  check("wiped-Junior refill restores a positive finite price", Number.isFinite(sim.last().jtPrice) && sim.last().jtPrice > 0, `jtPrice=${sim.last().jtPrice}`);
  assertConservation(sim, "wiped-Junior refill");
}

// ---------------------------------------------------------------------------
console.log("\n19. LPT redemption always enforces minimum liquidity, including liquidation");
{
  const cfg = defaultConfig({ coverage: 0.4, liquidationUtilization: 1.2, fixedTermDurationSec: 0 });
  const sim = new Sim(cfg, { st: 1000, jt: 800, lt: 150 });
  sim.step(shock(-0.2));
  sim.step(shock(-0.1));
  check("coverage liquidation threshold is breached", sim.last().utilization >= cfg.liquidationUtilization);
  sim.step({ dtSec: 0, stReturn: 0, jtReturn: 0, op: { type: "ltRedeem", shares: sim.state.ltShares } });
  check("full LPT redemption remains blocked by minimum liquidity", sim.state.ltShares > 1);
}

// ---------------------------------------------------------------------------
console.log("\n20. Time-weighted premium uses the checkpoint utilizations since last payment");
{
  const cfg = defaultConfig({
    coverage: 0.2,
    riskYDM: { mode: "static", y0: 0, yTarget: 0.9, y100: 1 },
    liqYDM: { mode: "static", y0: 0, yTarget: 0, y100: 0 },
  });
  const sim = new Sim(cfg, { st: 1000, jt: 250, lt: 150 });
  sim.step({ dtSec: 0, stReturn: 0, jtReturn: 0 });
  sim.step({ dtSec: 10, stReturn: 0, jtReturn: 0 });
  sim.step({ dtSec: 0, stReturn: 0, jtReturn: 0, op: { type: "jtDeposit", amount: 250 } });
  sim.step({ dtSec: 10, stReturn: 0, jtReturn: 0 });
  sim.step({ dtSec: 0, stReturn: 0.01, jtReturn: 0 });
  check("premium share is the 20-second average of 100% and 60% utilization", approx(sim.last().riskShare, 0.8, 1e-6), `share=${sim.last().riskShare}`);
}

// ---------------------------------------------------------------------------
console.log("\n21. Public explainer metrics are exact accountant ratios and executable quotes");
{
  const cfg = defaultConfig({ coverage: 0.03, beta: 1, minLiquidity: 0.15 });
  const sim = new Sim(cfg, { st: 1000, jt: 34.48275862068966, lt: 166.66666666666666 });
  const snapshot = sim.last();
  check(
    "coverage panel requirement reproduces accountant utilization",
    approx(snapshot.coverageRequiredNAV / snapshot.jtEffectiveNAV, snapshot.utilization, 1e-12),
    `panel=${snapshot.coverageRequiredNAV / snapshot.jtEffectiveNAV} accountant=${snapshot.utilization}`,
  );
  check(
    "liquidity panel requirement reproduces accountant utilization",
    approx(snapshot.liquidityRequiredNAV / snapshot.ltRawNAV, snapshot.liquidityUtilization, 1e-12),
    `panel=${snapshot.liquidityRequiredNAV / snapshot.ltRawNAV} accountant=${snapshot.liquidityUtilization}`,
  );
  check(
    "pool composition values sum to spot pool NAV",
    approx(snapshot.poolSeniorNAV + snapshot.poolStableNAV, snapshot.poolValue, 1e-9),
  );

  const stateBefore = sim.state;
  const quote = sim.previewSecondarySell(snapshot.stEffectiveNAV * 0.01);
  const stateAfterPreview = sim.state;
  check(
    "1% secondary quote is read-only",
    approx(stateAfterPreview.pool.stShares, stateBefore.pool.stShares, 1e-12) &&
      approx(stateAfterPreview.pool.stable, stateBefore.pool.stable, 1e-12),
  );
  sim.step({
    dtSec: 0,
    stReturn: 0,
    jtReturn: 0,
    op: { type: "secondarySell", amount: snapshot.stEffectiveNAV * 0.01 },
  });
  const stateAfterSell = sim.state;
  const actualStableOut = stateBefore.pool.stable - stateAfterSell.pool.stable;
  const actualFilledNAV =
    (stateAfterSell.pool.stShares - stateBefore.pool.stShares) * snapshot.stPrice;
  check("previewed stable output equals the executed sale", approx(quote.stableOutNAV, actualStableOut, 1e-9));
  check("previewed filled NAV equals the executed sale", approx(quote.filledNAV, actualFilledNAV, 1e-9));
  check("previewed post-sale pool mix equals the executed state", approx(quote.poolPctSTAfter, sim.last().poolPctST, 1e-12));
}

// ---------------------------------------------------------------------------
console.log("\n22. Post-deployment fixed-term grace realizes early Junior losses immediately");
{
  const cfg = defaultConfig({
    fixedTermDurationSec: 30 * 86400,
    fixedTermGracePeriodSec: 7 * 86400,
  });
  const sim = new Sim(cfg, { st: 1000, jt: 250, lt: 150 });
  sim.step({ dtSec: 86400, stReturn: -0.05, jtReturn: 0 });
  check("drawdown inside launch grace remains PERPETUAL", sim.last().state === MarketState.PERPETUAL);
  check("drawdown inside launch grace erases the recovery ledger", sim.last().jtIL === 0);
  check("launch-grace loss is still economically borne by Junior", sim.last().jtEffectiveNAV < 250);
  sim.step({ dtSec: 6 * 86400, stReturn: 0, jtReturn: 0 });
  sim.step({ dtSec: 0, stReturn: -0.01, jtReturn: 0 });
  check("a later drawdown may enter FIXED_TERM once grace ends", sim.last().state === MarketState.FIXED_TERM);
}

// ---------------------------------------------------------------------------
console.log("\n23. LPT yield-share protocol fee is carved out as Senior shares");
{
  const cfg = defaultConfig({
    riskYDM: { mode: "static", y0: 0, yTarget: 0, y100: 0 },
    liqYDM: { mode: "static", y0: 0.1, yTarget: 0.1, y100: 0.1 },
    ltYieldShareProtocolFee: 0.5,
  });
  const sim = new Sim(cfg, { st: 1000, jt: 250, lt: 150 });
  sim.step(hold(YEAR_SEC, 0.1, 0));
  check("LPT fee mints protocol-owned Senior shares", sim.state.protocolSTShares > 0);
  check("current contracts mint no protocol-owned LPT shares", sim.state.protocolLTShares === 0);
  check("the carved-out LPT fee remains visible in protocol NAV", sim.protocolFeeNAV > 4.9);
}

// ---------------------------------------------------------------------------
console.log("\n24. Legacy Junior-return and beta inputs cannot fork collateral accounting");
{
  const a = new Sim(defaultConfig({ beta: 0 }), { st: 1000, jt: 250, lt: 150 });
  const b = new Sim(defaultConfig({ beta: 1 }), { st: 1000, jt: 250, lt: 150 });
  a.step({ dtSec: 1, stReturn: -0.05, jtReturn: 0.5 });
  b.step({ dtSec: 1, stReturn: -0.05, jtReturn: -0.9 });
  check("deprecated beta is normalized to coinvestment", a.cfg.beta === 1 && b.cfg.beta === 1);
  check("deprecated Junior return is ignored", approx(a.last().jtEffectiveNAV, b.last().jtEffectiveNAV, 1e-12));
}

// ---------------------------------------------------------------------------
console.log("\n25. Share mint and redemption pricing carry the one-wei virtual offsets");
{
  check("mint uses (supply + 1) / (NAV + 1)", sharesForValueWad(10n, 90n, 100n) === 11n);
  check("redeem uses (NAV + 1) / (supply + 1)", valueForSharesWad(10n, 90n, 100n) === 9n);
}

// ---------------------------------------------------------------------------
console.log("\n26. Adaptive YDM evolution matches Solady expWad below the clamp");
{
  const cfg = {
    mode: "adaptive" as const,
    y0: 0.1,
    yTarget: 0.3,
    y100: 0.5,
    maxAdaptSpeedPerYear: 100,
    minYTarget: 0.0001,
    maxYTarget: 1,
  };
  const adapted = adaptYTargetWadWithAverage(
    cfg,
    300000000000000000n,
    910000000000000000n,
    86400n,
    900000000000000000n,
  );
  check("unsaturated target adapts to the exact Solidity wei", adapted.next === 308332804876908591n);
  check(
    "time-averaged adaptive output matches the exact Solidity wei",
    ydmShareWad(cfg, adapted.average, 910000000000000000n, 900000000000000000n) === 324152134160075207n,
  );
}

// ---------------------------------------------------------------------------
console.log("\n27. Junior redemption preserves the accountant recovery ledger");
{
  const result = postOpAccountingWad(
    {
      stRawNAV: toWad(1000),
      jtRawNAV: toWad(200),
      stEffectiveNAV: toWad(1000),
      jtEffectiveNAV: toWad(200),
      jtImpermanentLoss: toWad(100),
    },
    {
      beta: 1,
      coverage: 0,
      minLiquidity: 0,
    },
    {
      operation: "JT_REDEEM",
      stRaw: toWad(1000),
      jtRaw: toWad(150),
      ltRaw: toWad(100),
      previousLTRaw: toWad(100),
      bonus: 0n,
      enforce: false,
    },
  );
  check(
    "post-op JT redemption carries the pre-existing IL unchanged",
    result.jtIL === toWad(100),
    `jtIL=${result.jtIL}`,
  );

  const cfg = defaultConfig({ coverage: 0, minLiquidity: 0 });
  const state = newMarket(cfg, { st: 1000, jt: 200, lt: 100 });
  state.jtImpermanentLoss = toWad(100);
  const operation = jtRedeem(state, cfg, 50, true);
  check("public JT redemption succeeds in the seeded audit state", operation.ok);
  check(
    "public JT redemption also carries the pre-existing IL unchanged",
    state.jtImpermanentLoss === toWad(100),
    `jtIL=${state.jtImpermanentLoss}`,
  );
}

// ---------------------------------------------------------------------------
console.log(`\n\x1b[1mResult: ${passed} passed, ${failed} failed\x1b[0m\n`);
if (failed > 0) process.exit(1);
