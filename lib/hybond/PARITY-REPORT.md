# PARITY-REPORT.md — srHYBond: simulator inputs ⇄ real accountant, wei-exact

**Result: 61/61 HYBond vectors pass, wei-exact.** The srHYBond simulator's OWN NAV path, driven through the shared TypeScript engine (`lib/try/engine.ts`), reproduces the real `RoycoDayAccountant` exactly — every `stEff`, `jtEff`, `il`, `coverageUtilWad`, and `marketState`, to the wei.

Accountant ground truth: `~/royco-day` @ **`e6955e8`**, forge 1.7.1.

## Why this report exists (HYBond forks no math)

`/hybond-sim` contributes **fund data + UI copy only**. It imports `runBacktest` from `lib/try/backtest.ts` and `buildConfig` from `lib/try/scenarios.ts`, which bridge to `lib/try/engine.ts` — the port proven against the accountant in `lib/try/PARITY-REPORT.md` (52/52). Audit confirms **zero** duplicated accounting logic under `lib/hybond/` or `app/hybond-sim/`: no local sync, waterfall, coverage, YDM, or NAV math, and no WAD/BigInt arithmetic at all.

The existing 52 vectors prove the engine on **TRY-flavored** inputs. They do **not** exercise HYBond's actual NAV path (a 61-point monthly series with a different price scale, month-length `dt`s, and a different drawdown shape). This report closes that gap: HYBond's own inputs, through the real Solidity accountant, diffed wei-exact against the TS engine.

## Method (non-circular)

`lib/hybond/harness/HybondVectorGen.t.sol` (group **F**, labels `F_hybond_1..61`) drives the **real compiled** `RoycoDayAccountant` (behind an ERC1967 proxy) via `preOpSyncTrancheAccounting(stRaw, jtRaw)` pranked as the kernel, on a monotonic `vm.warp` clock, over:

- **Series:** `HYBOND_NAV_SERIES` from `lib/hybond/scenarios.ts` — 61 monthly points, 2020-06 = 100 → 2025-06 ≈ 142.20 (composite proxy, see "Data provenance and scope" below).
- **Params:** HYBond defaults (`HYBOND_DEFAULT_PARAMS`, which alias `TRY_DEFAULT_PARAMS`): depositST 1000, depositJT 500, seniorShareToJuniorPct 53, observationDays 30 (→ `fixedTermDurationSeconds` 2,592,000), minCoveragePct 30.
- **Genesis:** JT_DEPOSIT then ST_DEPOSIT at price 1.0, mirroring `runBacktest`'s `deposit(m,"JT",0,jtNav0); deposit(m,"ST",stNav0,jtNav0)`.
- **Driving (replicates `lib/try/backtest.ts` exactly):** Senior is fixed capital, `stRaw_i = floor(stNav0 * price_i / price_0)` (price indexed off the FIRST point, i.e. 100.0 → `priceWad0` = 100e18 — not 1.0). Junior is carried: `jtRaw_0 = jtNav0`, `jtRaw_i = floor(jtCarry * price_i / price_{i-1})` with `jtCarry` = the accountant's returned `jtRawNAV`. `dt` = real seconds between month starts (hence 2,419,200 / 2,505,600 / 2,592,000 / 2,678,400 — genuine calendar months, not uniform 30d).

The harness's price/`dt` literals are **emitted from `lib/hybond/scenarios.ts`** (same `toPriceWad` / month-delta logic), so the Solidity inputs are bit-identical to the TypeScript ones. Output → `lib/hybond/vectors.golden.json` (61 vectors, same schema as `lib/try/vectors.golden.json`). NAV conservation (`stRaw+jtRaw == stEff+jtEff`, dust tolerance 0) is asserted in-harness on every one of the 61 steps and holds.

`lib/hybond/parity.ts` replays the series through the SAME `lib/try/engine.ts`, building its config from the app's own `buildConfig(HYBOND_DEFAULT_PARAMS)` (not a hand-copied config), and **recomputes the inputs independently**, asserting them against the inputs recorded in the golden file — so a Solidity/TS driving drift fails loudly instead of silently comparing two different scenarios. A 1-wei perturbation of any golden output is caught (verified).

## What the path exercises

Not a happy path: the 2022 high-yield selloff drives Senior underwater and Junior into coverage. **6 of 61 steps** book non-zero JT coverage IL and sit in **FIXED_TERM** (steps 18, 20, 22, 24, 28 — the 2021-11 → 2022-09 drawdown — and step 59, 2025-04), with PERPETUAL↔FIXED_TERM transitions, term elapse, and IL erasure in between. The remaining steps exercise the gain waterfall (Senior keeps 47%, Junior takes the 53% yield share) and time-weighted JT premium accrual across real calendar-month `dt`s.

## Scope boundary — what IS and ISN'T covered

**Covered (wei-exact, on HYBond's own inputs):** the full accountant sync path — PnL attribution, loss coverage, IL booking/recovery/erasure, YDM yield share, coverage utilization, time-weighted JT premium, NAV conservation, and all market-state transitions, over 61 real steps.

**NOT covered — `maintainJuniorCoverage`:** the Junior replenishment policy in `backtest.ts` (default ON in the UI, and the basis of the headline srHYBond numbers) is a **simulator-level product assumption, not accountant math**. It decides *when fresh Junior capital arrives*; the accountant has no opinion on it. This proof deliberately runs the **raw sync path with replenishment disabled**, so what is certified is that *given* a raw-NAV sequence, the engine's accounting matches the contract to the wei. The plausibility of the replenishment assumption itself (whether Junior capital would really show up on demand at those moments) is a product question, unproven and unprovable here.

**Also not covered** (same as `lib/try/PARITY-REPORT.md`): kernel-level NAV quoting (the sim supplies the price path), the kernel deposit/redeem freeze during FIXED_TERM, and the still-open parameter *values* (YDM curve shape, fees, `coverageLiquidationUtilization`). Separately, the HYBond NAV series itself is **reconstructed** from published rolling 12-month returns (see `lib/hybond/scenarios.ts`), not a vendor-supplied monthly NAV file — parity proves the math on that series, not the series' provenance.

## Data provenance and scope

This report proves accounting math only, not the provenance or realism of the input series.

The 61-point `HYBOND_NAV_SERIES` used above is a proxy, not HYBOND's own history and not the
NAV of any BNY Mellon / Insight share class. It is built from Insight's "Global short dated
high yield bond composite" published rolling 12-month (Jun to Jun) total returns, income
reinvested, gross of fees, per Insight as at 30 June 2025 (five checkpoints: +9.69%, -5.68%,
+12.22%, +12.03%, +9.33%). Only those five checkpoints are real; the monthly path between them
is synthetic, invented monthly returns geometrically corrected so each window compounds to the
published checkpoint. Every drawdown date, coverage-IL step, and market-state transition
exercised in Group F above is therefore an artifact of that sequencing choice, not observed
history.

HYBOND itself launched 1 April 2026 and has no multi-year NAV history to compare against. No
Royco market over HYBOND has been announced; `/hybond-sim` is an illustration of the tranche
mechanism applied to a HYBOND-like underlying, not a real or announced product. None of this
affects the wei-exact accounting parity claimed above, which holds for any input series,
including this one.

## Reproduce

```
# regenerate the HYBond golden from the real contracts (needs ~/royco-day @ e6955e8 + forge):
cp lib/hybond/harness/HybondVectorGen.t.sol ~/royco-day/test/vectors/ && \
  (cd ~/royco-day && ~/.foundry/bin/forge test --match-contract HybondVectorGen) && \
  cp ~/royco-day/output/hybond-vectors-out.json lib/hybond/vectors.golden.json
# prove the shared TS engine against it:
npx tsx lib/hybond/parity.ts       # → 61/61 PASS
# and confirm the shared engine is unregressed for TRY:
npx tsx lib/try/parity.ts        # → 52/52 PASS
```
