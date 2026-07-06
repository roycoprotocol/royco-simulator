# OPEN-QUESTIONS.md — TRY/wiTRY simulator (running list)

Questions the accountants / protocol eng must confirm before the reference model can claim wei-parity. Ordered by parity impact. Each cites where the gap is.

## Blocking (change the numbers materially)

**Q1 — RESOLVED (2026-07-06, product owner ACK).** The accountant's mechanism is accepted as correct for TRY, and the divergence from the Excel HWM/rolling-window is understood. Confirmed intended behavior:
- The observation period = `FIXED_TERM`. **Senior only net-earns OUTSIDE it**; while in it, Senior gains repay Junior's coverage IL first (`RoycoDayAccountant.sol:585`).
- The observation period **begins the instant Junior covers any Senior loss (first cent down), not after a 30% drawdown threshold.** Junior's 30% coverage is its *size* (absorption depth before exhaustion), not a trigger.
- IL entry is **mark-to-last-sync** (vs prior checkpoint, no high-water mark); Senior resumes earning when Junior's covered loss is fully repaid (not when price exceeds a prior peak).
- Deliverable is **accountant-accurate, not Excel-accurate** where they diverge (the Excel "Real Simulator" HWM tab is NOT a parity target).

---
_Original framing (retained for context):_

**Q1 — The Excel's HWM + 30-day/30% rolling-drawdown window have no on-chain counterpart.** ⚠️ NEEDS EXPLICIT ACK
Confirmed: the accountant is **mark-to-last-sync**, no high-water mark, no rolling lookback, no discrete realization (`RoycoDayAccountant.sol:505-516,557,288-292`). Junior covers Senior on *any* down-sync vs the prior checkpoint.
Product owner chose "Mode B, 30-day" — but that maps to `fixedTermDurationSeconds` (a post-loss recovery/freeze term), which is **not** the Excel's rolling observation window. The 30-day term does give a recovery window *after* a loss (if price recovers within 30 days, Junior is repaid and the market reopens as if unharmed — loosely analogous to "a drawdown that recovers in-window doesn't stick"), but Senior gains/losses are still measured continuously mark-to-last-sync, and there is no HWM for Senior's earning.
→ **Consequence to ACK:** the sim will reproduce the *accountant's* numbers, which will NOT match the Excel "Real Simulator" tab (that tab is built on HWM). Since "code is truth," the HWM + rolling-window are dropped. Confirm this is understood — the deliverable is accountant-accurate, not Excel-accurate, wherever they diverge.

**RESOLVED (2026-07-06):**
- ~~Q3~~ **Mode B**, `fixedTermDurationSeconds = 2_592_000` (30-day recovery term; ops freeze during it; IL recoverable then erased at term end if unrecovered).
- ~~Q4~~ implied by Mode B: **no mid-drawdown redemptions** while in the 30-day term (frozen). Redemptions resume on return to PERPETUAL.
- ~~Q5~~ **`minCoverageWAD = 0.30e18` (30%)**; Junior 33%-of-pool ⇒ U=90% start; 30%-of-pool ⇒ U=100%. **β `JT_COINVESTED = true`.**

**Q3 — Fixed term vs permanently-perpetual, and the IL-erasure consequence.**
If `fixedTermDurationSeconds == 0`, JT coverage IL is **erased every sync** (never recovered) and the market is always PERPETUAL (`:660-665`). If it's > 0, coverage IL persists and is recoverable, but **all deposits and redemptions freeze during the term** (`RoycoDayKernel.sol:223,257,293,327`). These produce very different Senior/Junior paths.
→ **Confirm** the TRY market's `fixedTermDurationSeconds` (and `coverageLiquidationUtilizationWAD`). The Excel's "Junior wiped once exhausted, Senior keeps going" reads like the `==0` / erasure case — needs sign-off.

**Q4 — Does the Excel assume mid-drawdown redemptions?**
Code freezes ALL user ops in FIXED_TERM (`DISABLED_IN_FIXED_TERM_STATE`). If BD has shown counterparties a "redeem mid-drawdown at NAV" story, that only holds in PERPETUAL. Confirm the intended redemption availability during stress.

**Q5 — Junior "3× leverage" → exact `minCoverageWAD`.**
No leverage scalar in code; junior leverage is emergent from `minCoverage` + conservation (`:648`; `UtilsLib.sol:52`). Excel implies coverage = Junior is 33% of pool (5/15) and "~3×".
→ **Confirm** the exact `minCoverageWAD` for TRY (candidate: does "3×" mean `1/minCoverage = 3` → `minCoverage = 0.3333e18`? Excel's 30% buffer suggests `0.30e18`; the two differ). Also confirm `JT_COINVESTED` (β) = true/false for wiTRY.

## Parameter confirmations (won't change mechanism, will change outputs)

**Q2 — "47% senior share" → which YDM knob(s).**
47% is a curve parameter, not code logic. Confirm it maps to a flat `StaticCurveYDM` (all three anchor points = 53% junior share, i.e. senior keeps 47%) vs. an adaptive curve keyed on utilization; and confirm `maxJTYieldShareWAD`. Note the code applies the share to *realized senior gain*, not to a yield rate — confirm BD's "47% of yield" means "47% of senior's mark-to-market appreciation."

**Q6 — Fees.** Excel appears to model **zero** fees; code DAY_DEMO defaults are `stProtocolFeeWAD = 10%`, `jtProtocolFeeWAD = 0`, `jtYieldShareProtocolFeeWAD = ?`. Confirm the TRY fee set (likely all 0 for a clean model, but must be explicit).

**Q7 — YDM curve type.** StaticCurveYDM vs AdaptiveCurveYDM_V1/V2 for TRY. Real deployed markets use adaptive curves with `maxAdaptationSpeed = 40 days⁻¹` (`SetYDM.s.sol:70-100`). A flat static curve is simplest and matches a fixed 47%; adaptive would make the share drift with utilization. Confirm.

## Data / infra (Phase 4)

**Q8 — Live-mode data source.** For a live (not backtest) TRY market: subgraph vs direct contract reads vs oracle? Which endpoint returns real-time tranche NAVs / TVL / APY? (Stub adapter in Phase 4; needs the deployed market address + chain.)

**Q9 — wiTRY price series provenance.** The backtest needs the historical wiTRY (CBRT MMF index × USD/TRY FX) series and its cadence (daily per Excel "Real Simulator" sheet). Confirm the canonical source so the sim isn't hard-coded to the workbook's cells.
