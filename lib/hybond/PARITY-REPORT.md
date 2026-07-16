# PARITY-REPORT.md — srHYBond: simulator inputs vs real accountant, wei-exact

**Result: 698/698 HYBond vectors pass, wei-exact.** The srHYBond simulator's OWN NAV path, driven through the shared TypeScript engine (`lib/try/engine.ts`), reproduces the real `RoycoDayAccountant` exactly at every sampled step: every `stEff`, `jtEff`, `il`, `coverageUtilWad`, `marketState`, and `ilErased`, to the wei.

Accountant ground truth: `~/royco-day` @ **`e6955e8`**, forge 1.7.1.

## Why this report exists (HYBond forks no math)

`/hybond-sim` contributes **fund data + UI copy only**. It imports `runBacktest` from `lib/try/backtest.ts` and `buildConfig` from `lib/try/scenarios.ts`, which bridge to `lib/try/engine.ts`, the port proven against the accountant in `lib/try/PARITY-REPORT.md` (52/52). Audit confirms **zero** duplicated accounting logic under `lib/hybond/` or `app/hybond-sim/`: no local sync, waterfall, coverage, YDM, or NAV math, and no WAD/BigInt arithmetic at all.

The existing 52 TRY vectors prove the engine on TRY-flavored inputs. They do **not** exercise HYBond's actual NAV path (a real daily series with a different price scale, variable day-gap `dt`s, and a different drawdown shape). This report closes that gap: HYBond's own inputs, through the real Solidity accountant, diffed wei-exact against the TS engine.

## Series (real daily NAV)

`HYBOND_NAV_SERIES` from `lib/hybond/scenarios.ts` is the **REAL daily NAV history of the BNY Global Short-Dated High Yield Bond Fund**, loaded verbatim from `lib/hybond/data/nav-daily.json`: **2,394 business-day points**, `{date:"YYYY-MM-DD", price:number}`, ascending, from inception 2016-11-30 (rebased to 1.0000) through 2026-07-02 (1.7318). Weekdays only; weekend/holiday gaps are handled as variable `dt` between points. The path reconciles with Insight's published composite June-to-June total returns to within 0.3% (2020->21 +9.67% vs +9.69%, 2021->22 -5.70% vs -5.68%, etc.), so it genuinely IS this fund's observed daily NAV, not a reconstruction. Real max drawdown -17.45% (2020-02-20 to 2020-03-24, COVID).

## Method (non-circular)

`lib/hybond/harness/HybondVectorGen.t.sol` (group **F**, labels `F_hybond_<i+1>`) drives the **real compiled** `RoycoDayAccountant` (behind an ERC1967 proxy) via `preOpSyncTrancheAccounting(stRaw, jtRaw)` pranked as the kernel, on a monotonic `vm.warp` clock, over the full 2,394-point daily series with HYBond's **DEFAULT (Balanced)** params:

- **Params** (`HYBOND_DEFAULT_PARAMS`): depositST 1000, depositJT 500 (derived from first-loss 30%), seniorShareToJuniorPct 62 (`jtYDM` 0.62e18), observationDays 45 (`fixedTermDurationSeconds` 3,888,000), minCoveragePct 30 (`minCoverageWAD` 0.3e18), `coverageLiquidationUtilizationWAD` 20e18. These are the **Balanced** preset's knobs; the page lands on that rung, so what is certified is the config the page actually runs on first paint.
- **Genesis:** JT_DEPOSIT then ST_DEPOSIT at price 1.0, mirroring `runBacktest`'s `deposit(m,"JT",0,jtNav0); deposit(m,"ST",stNav0,jtNav0)`.
- **Driving (replicates `lib/try/backtest.ts` exactly):** Senior is fixed capital, `stRaw_i = floor(stNav0 * price_i / price_0)` (price indexed off the FIRST point). Junior is carried: `jtRaw_0 = jtNav0`, `jtRaw_i = floor(jtCarry * price_i / price_{i-1})` with `jtCarry` = the accountant's returned `jtRawNAV`. `dt` is the **REAL per-step day gap in seconds** (1-day, 3-day weekends, holiday gaps), computed exactly like `backtest.ts`'s `secondsBetween(date_{i-1}, date_i)`, NOT a fixed step.

The harness's price/`dt` inputs are hex byte-blobs **emitted from `lib/hybond/scenarios.ts`** (same `toPriceWad` + day-delta logic), so the Solidity inputs are bit-identical to the TypeScript ones. NAV conservation (`stRaw+jtRaw == stEff+jtEff`, dust tolerance 0) is asserted in-harness on every one of the 2,394 steps and holds.

## Sampled emission (documented, not a silent cap)

Full per-step emission over 2,394 points would be a large golden and a heavy forge run (EVM memory is append-only within one call, so a 2,394-iteration string build hits `MemoryLimitOOG`). Instead the harness **syncs the accountant on ALL 2,394 daily steps** (so the path/state is bit-identical to the full daily backtest) but **EMITS a JSON vector only on a documented SAMPLE**:

- **every 8th business day** (`STRIDE = 8`, ~300 base samples, the ~200-400 target), PLUS
- **every step where an IL erasure occurs** (11 steps), PLUS
- **every step where the market state transitions** PERPETUAL<->FIXED_TERM (451 steps),

so **all transitions and all erasures are covered**. The union is **698 vectors of 2,394** (~29%). The emit set is carried as an LSB-first bitmap (`EMIT_BM`) in the harness, and the harness logs the daily-step count, emitted-vector count, and stride so the sampling is visible in the forge output. Output -> `lib/hybond/vectors.golden.json` (698 vectors, ~232 KB, same schema as `lib/try/vectors.golden.json`).

`lib/hybond/parity.ts` replays the **FULL daily series** through the SAME `lib/try/engine.ts`, building its config from the app's own `buildConfig(HYBOND_DEFAULT_PARAMS)` (not a hand-copied config), and compares **only at the sampled indices** (matched by the `F_hybond_<i+1>` label), like-for-like against the contract. It **recomputes the inputs independently** and asserts them against the inputs recorded in the golden file, so a Solidity/TS driving drift fails loudly instead of silently comparing two different scenarios, and it errors unless every one of the 698 emitted vectors is hit. A 1-wei perturbation of any golden output is caught (verified: corrupting one `stEff` by +1 wei drops parity to 697/698 and exits non-zero).

## What the path exercises

Not a happy path. Over the real 9.6-year daily history the mechanism repeatedly enters coverage: **451 PERPETUAL<->FIXED_TERM transitions** and **11 IL-erasure steps** (2020-03 COVID, the 2022 selloff, and later single-day dips), all captured in the sample. The remaining steps exercise the gain waterfall (Senior keeps 38%, Junior takes the 62% yield share) and time-weighted JT premium accrual across real, variable day-gap `dt`s.

## Scope boundary: what IS and ISN'T covered

**Covered (wei-exact, on HYBond's own inputs):** the full accountant sync path, PnL attribution, loss coverage, IL booking/recovery/erasure, YDM yield share, coverage utilization, time-weighted JT premium, NAV conservation, and all market-state transitions, sampled over the real 2,394-step daily path.

**NOT covered, `maintainJuniorCoverage`:** the Junior replenishment policy in `backtest.ts` (default ON in the UI, and the basis of the headline srHYBond numbers) is a **simulator-level product assumption, not accountant math**. It decides *when fresh Junior capital arrives*; the accountant has no opinion on it. This proof deliberately runs the **raw sync path with replenishment disabled**, so what is certified is that *given* a raw-NAV sequence, the engine's accounting matches the contract to the wei. The plausibility of the replenishment assumption itself is a product question, unproven here.

**Also not covered** (same as `lib/try/PARITY-REPORT.md`): kernel-level NAV quoting (the sim supplies the price path), the kernel deposit/redeem freeze during FIXED_TERM, and the still-open parameter *values* (YDM curve shape, fees, `coverageLiquidationUtilization`).

## Data provenance and scope

This report proves accounting math only. The realism of the input series is a separate question, but the series is now genuinely this fund's observed history:

The 2,394-point `HYBOND_NAV_SERIES` is the **REAL daily NAV history of the BNY Global Short-Dated High Yield Bond Fund** (business days, November 2016 to July 2026), rebased to 1.0000 at inception, sourced from the fund's daily price history and reconciled with Insight's published composite June-to-June total returns to within 0.3%. Drawdown dates, coverage-IL steps, and market-state transitions exercised in Group F are therefore driven by **real history**, including the COVID February-March 2020 drawdown (-17.45%) and the 2022 rate and high-yield selloff.

No management-fee figure is quoted in this repo. An earlier "1.00% management fee" claim (single-sourced, uncorroborated) was removed rather than cited; the qualitative statement that HYBOND's own management fee and the fund's charges would reduce returns stands without a specific number attached.

HYBOND the token launched 1 April 2026 and has no multi-year NAV history of its own, so applying a multi-year backtest to it is illustrative. No Royco market over HYBOND has been announced; `/hybond-sim` is an illustration of the tranche mechanism applied to a HYBOND-like underlying, not a real or announced product. None of this affects the wei-exact accounting parity claimed above, which holds for any input series, including this one.

## Reproduce

```
# regenerate the HYBond golden from the real contracts (needs ~/royco-day @ e6955e8 + forge).
# The full daily loop needs raised gas + EVM memory limits (append-only EVM memory over 2,394
# iterations), so pass FOUNDRY_GAS_LIMIT and FOUNDRY_MEMORY_LIMIT:
cp lib/hybond/harness/HybondVectorGen.t.sol ~/royco-day/test/vectors/ && \
  (cd ~/royco-day && FOUNDRY_GAS_LIMIT=9000000000000000 FOUNDRY_MEMORY_LIMIT=8589934592 \
     ~/.foundry/bin/forge test --match-contract HybondVectorGen) && \
  cp ~/royco-day/output/hybond-vectors-out.json lib/hybond/vectors.golden.json
# the harness prices/dts/emit-bitmap are regenerated from lib/hybond/scenarios.ts by the
# repo-local generator when the series changes; the committed .t.sol already embeds them.
# prove the shared TS engine against it:
npx tsx lib/hybond/parity.ts       # -> 698/698 PASS
# and confirm the shared engine is unregressed for TRY:
npx tsx lib/try/parity.ts          # -> 52/52 PASS
```
