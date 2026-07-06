# MECHANISM-SPEC.md — Royco Day two-tranche (Senior + Junior) accountant

**Source of truth:** the Solidity at `~/royco-day` (github.com/roycoprotocol/royco-day). Every rule/constant below carries a `file:line` (or `file:function:line`) citation. Anything not determinable from code is flagged **OPEN QUESTION** (see also `OPEN-QUESTIONS.md`). Fixed-point base is **WAD = 1e18** (`src/libraries/Constants.sol:19`).

**Scope — 2 tranches only.** The TRY/wiTRY market is Senior (ST) + Junior (JT). The Liquidity Tranche (LT) is disabled: `minLiquidity = 0`, `maxLTYieldShareWAD = 0`, LT YDM uninitialized. Wherever an LT term appears in a shared formula it is shown and then set to 0. One JT risk-premium YDM at `$.jtYDM` (the interface `IYDM` is pluggable; `StaticCurveYDM` assumed unless a market wires an adaptive curve). Paths below are relative to `~/royco-day`.

> **Headline finding:** the accountant realizes PnL **continuously per sync**, mark-to-market, path-independent. It has **no high-water mark, no rolling observation window, and no discrete realization trigger.** The Excel model's HWM + 30-day/30%-drawdown machinery has *no on-chain counterpart*; its only code-side "memory" is JT coverage impermanent-loss (IL) recovery. This is the central reconciliation issue for parity (§2, §8, OPEN-QUESTIONS #1).

## RESOLVED PARAMETERS (product owner, 2026-07-06)
Confirmed for the TRY/wiTRY market — feed these into the reference model:
- **`minCoverageWAD = 0.30e18` (30%).** With Junior = 33% of pool and β=1, this starts the market at U=90% (the YDM target); Junior eroding to 30% of pool ⇒ U=100% (liquidation edge). (See §3, §6.)
- **`JT_COINVESTED (β) = true`** — Junior takes the same market stress as Senior (leveraged residual of the same pool).
- **`fixedTermDurationSeconds = 2_592_000` (30 days) — "Mode B."** On a covered Senior loss the market enters `FIXED_TERM` for 30 days: Junior's coverage is a *recoverable* IL claim (future Senior gains repay it first), and **all deposits + redemptions freeze** until the term expires or the market recovers. If not recovered by term end, Junior's IL is erased (Junior permanently eats the covered loss) and the market reopens PERPETUAL. (See §3.)
- **IL entry = mark-to-last-sync** (confirmed): Junior covers, and IL is booked, whenever Senior's effective NAV falls versus the *previous sync checkpoint* — not versus a peak. `RoycoDayAccountant.sol:505-516,557-570,288-292`. **The Excel's HWM + 30-day rolling observation window are NOT this** and are dropped as non-code mechanisms (OPEN-QUESTIONS #1).
- Still to confirm: `coverageLiquidationUtilizationWAD` (candidate = WAD, i.e. force-liquidate at U=100%); fee set (Q6); YDM curve shape realizing the 47% share (Q2/Q7).

---

## 1. Yield distribution — how Senior's share is computed

**Answer: the YDM `yieldShare` is a WAD fraction of the realized positive senior *effective-NAV delta* (`stGain`), i.e. a mark-to-market gain — NOT a fraction of a yield rate.** ST keeps `(1 − share)`; JT is credited `share`.

Order inside `_previewSyncTrancheAccounting` (`src/accountant/RoycoDayAccountant.sol:475`):

1. **PnL attribution → per-tranche effective delta** (proportional-to-claim, floor-rounded): `deltaSTEffectiveNAV = deltaSTClaimOnSTRawNAV + deltaSTClaimOnJTRawNAV` (`:528`); `deltaJTEffectiveNAV = (deltaSTRawNAV + deltaJTRawNAV) − deltaSTEffectiveNAV` (`:529`). Attribution helper `_attributeDeltaToClaimOnRawNAV` (`:957-974`), magnitude `mulDiv(absDelta, claim, lastRawNAV, Floor)`.
2. **Senior gain:** `stGain = toNAVUnits(deltaSTEffectiveNAV)` when `deltaSTEffectiveNAV > 0` (`:576-577`).
3. **IL recovery consumes senior gain first** (see §2): `stGain -= jtCoverageImpermanentLossRecovery` (`:585`).
4. **JT risk premium on the residual gain** (`:588-630`):
   - `jtRiskPremium = stGain.mulDiv(_twJTYieldShareAccruedWAD, elapsedSinceLastPremiumPayments * WAD, Floor)` (`:618`).
   - JT credited: `jtEffectiveNAV += jtRiskPremium` (`:628`); Senior keeps residual: `stGain -= jtRiskPremium` (`:629`); then `stEffectiveNAV += stGain + ltLiquidityPremium` (`:643`, `ltLiquidityPremium = 0`). Retention semantics: `(WAD − yieldShareWAD)` stays with the paying tranche (`src/interfaces/IYDM.sol:29`).

**Accrual / sync trigger:** lazy, event-driven, **time-weighted since last premium payment**. On every sync `_accruePremiumYieldShares` (`:733`) advances `twJTYieldShareAccruedWAD += jtYieldShareWAD * elapsed` (`:757`), where `jtYieldShareWAD = min(IYDM.yieldShare(state, coverageUtilization), maxJTYieldShareWAD)` (`:753`). Accumulator resets only when premiums are paid: `delete $.twJTYieldShareAccruedWAD` (`:165`), `lastPremiumPaymentTimestamp = block.timestamp` (`:167`). So the multiplier in `:618` is the **time-weighted mean share** over the interval. **Same-block edge case** (`elapsed == 0`): uses instantaneous `previewYieldShare` on last-checkpoint utilizations, capped at `maxJTYieldShareWAD`, with `elapsed` forced to `1s` (`:596-616`).

**StaticCurveYDM `yieldShare(U)`** (`src/ydm/StaticCurveYDM.sol:102-139`), `U` = coverage utilization capped at WAD (`:125`):
- `U < U_T`: `Y = yieldShareAtZeroUtilWAD + slopeLtTargetUtilWAD.mulDiv(U, WAD, Floor)` (`:134`).
- `U ≥ U_T`: `Y = yieldShareAtTargetWAD + slopeGteTargetUtilWAD.mulDiv(U − U_T, WAD, Floor)` (`:137`).
- Slopes precomputed at init (`:83,85`); `U_T = TARGET_UTILIZATION_WAD` immutable (`src/ydm/base/BaseYDM.sol:18`).

---

## 2. Observation / drawdown / realization

**No HWM, no rolling/fixed observation window, no discrete end-of-window realization in the accountant. Realization is continuous and path-independent per sync.** → Excel's HWM + 30-day/30% window have no code counterpart (**OPEN QUESTION #1**).

The real code analog is **JT coverage impermanent-loss (IL) recovery**, `lastJTCoverageImpermanentLoss` (`src/interfaces/IRoycoDayAccountant.sol:117`). On a senior gain, IL is repaired **before** yield resumes — first claim on ST appreciation (`RoycoDayAccountant.sol:578-586`): `recovery = min(stGain, jtCoverageImpermanentLoss)` (`:579`); `jtCoverageImpermanentLoss −= recovery` (`:582`); `jtEffectiveNAV += recovery` (`:584`); `stGain −= recovery` (`:585`). This is a **running coverage-claim accumulator, not a peak-NAV mark**: no lookback horizon; scaled proportionally when JT redeems (`:277-280`); force-erased on certain transitions (§3).

- **HWM:** absent. **Rolling 30-day window:** absent. **30% drawdown buffer:** absent as a window — nearest coded threshold is `coverageLiquidationUtilizationWAD` (a utilization ceiling > WAD, `:84`), a coverage-exhaustion trip, not a % NAV lookback. **HWM reset after loss:** nearest analog is JT-coverage-IL erasure on force-PERPETUAL (`:668-669`). All → OPEN QUESTION #1.
- The only time-based state machine is `FIXED_TERM` (`fixedTermDurationSeconds`), a **redemption/deposit freeze** (§3/§4), *not* a yield-realization window.

---

## 3. Loss waterfall

**Order on a negative senior effective delta: ST loss → JT coverage first (capped at JT's remaining buffer) → residual impairs ST.** JT is **not** permanently wiped in general — coverage books as a *recoverable* IL claim; permanent only via specific erasure branches.

Waterfall (`RoycoDayAccountant.sol:542-574`):
1. **JT own loss** absorbed fully first if `deltaJTEffectiveNAV < 0`: `jtEffectiveNAV −= jtLoss` (`:545-546`).
2. **ST loss coverage** if `deltaSTEffectiveNAV < 0` (`:557-574`): `stLoss = toNAVUnits(−deltaSTEffectiveNAV)` (`:558`); `coverageApplied = min(stLoss, jtEffectiveNAV)` (`:560`); `jtEffectiveNAV −= coverageApplied` (`:568`); `jtCoverageImpermanentLoss += coverageApplied` (`:570`, recoverable claim); `stLoss −= coverageApplied` (`:571`); **residual → ST impairment** `if (stLoss != 0) stEffectiveNAV −= stLoss` (`:574`).

**Coverage/utilization** (`src/libraries/UtilsLib.sol:32-53`): `coverageUtilizationWAD = (ST_RAW + (JT_COINVESTED ? JT_RAW : 0)) * minCoverageWAD / JT_EFFECTIVE`, **Ceil** (`:52`). Special cases: `minCoverage==0 → U=0`; `coveredExposure==0 → U=0`; `jtEff==0 with exposure → U=type(uint256).max` (`:44,48,50`).
- **β = `JT_COINVESTED` is a boolean gate**, not a numeric coefficient — include full `JT_RAW` (1) or exclude it (0). Immutable at construction (`RoycoDayAccountant.sol:31,59`); DAY_DEMO & SNUSD set `true`. **There is no `*β` scalar multiply; the Excel "β / co-invest" maps to this on/off flag only.**
- **COVERAGE = `minCoverageWAD`** (`< WAD`), set at init (`:107`) / `setMinCoverage` (`:876`).

**JT exhaustion / force-PERPETUAL + IL erasure** (`:660-672`): branch fires when `jtEff==0 && stEff>0` **or** `covU ≥ coverageLiquidationUtilizationWAD` **or** fixed term elapsed **or** `fixedTermDurationSeconds==0` (`:660-662`). Effect: `jtCoverageImpermanentLoss` erased (`:668-669`), `state = PERPETUAL`, `fixedTermEndTimestamp = 0`. **This is the one place JT's coverage claim is permanently erased.**

**Permanent wipe vs recoverable:** recoverable by default (coverage → `jtCoverageImpermanentLoss`, first claim on future ST gains). Permanent only via the erasure branch. **Special case:** a permanently-perpetual market (`fixedTermDurationSeconds==0`) erases JT coverage IL *every sync* — so JT coverage is never retained/recovered there (`:660` first disjunct, `:665` comment). This choice materially changes results (OPEN QUESTION #3).

**State transitions** (`:657-701`) — PROVEN wei-exact in Phase 3 (see PARITY-REPORT.md), semantics confirmed 3 ways (code read + boundary vectors E1-E5 + real-time path):
- **Force PERPETUAL + erase JT coverage IL** (`:660-672`) when ANY of: `fixedTermDurationSeconds==0`; **term elapsed** `initialMarketState==FIXED_TERM && fixedTermEndTimestamp <= block.timestamp` (operator is **non-strict `<=`**, `:661`); `coverageUtilization >= coverageLiquidationUtilization`; or Junior exhausted `jtEff==0 && stEff>0`. On this branch **Junior permanently eats the covered loss** (IL erased, not recovered).
- Else IL ≤ dust → PERPETUAL if it was perpetual or IL fully wiped, else stay FIXED_TERM (`:674-690`).
- Else IL > dust → FIXED_TERM; **liquidity premium + all protocol fees zeroed while in fixed term** (`:692-700`); the term anchor `fixedTermEndTimestamp = uint32(block.timestamp + fixedTermDurationSeconds)` is set **ONLY on a PERPETUAL→FIXED_TERM *entry*** (`:699`, guarded by `initialMarketState==PERPETUAL`) and **carried unchanged on FIXED_TERM→FIXED_TERM syncs** (it does NOT re-anchor each sync).
- **Consequence for the 30-day "observation period":** a drawdown that has not recovered within one full term elapses at the next sync past the anchor → the market force-reopens PERPETUAL and Junior's covered loss becomes permanent, *even if the price later recovers* (recovery came too late). `initialMarketState` is the pre-sync stored `$.lastMarketState`. Premium accrual uses `block.timestamp` deltas; if time ever regressed it would `uint256`-underflow-revert at `:747` (cannot happen on-chain; was a harness artifact — see PARITY-REPORT.md).

---

## 4. Junior NAV / redemption pricing

**JT effective NAV = NAV conservation ("pool − senior"), NOT an independent leveraged mark.** Enforced twice per sync: `require((stRaw + jtRaw) == (stEff + jtEff), NAV_CONSERVATION_VIOLATION())` — preview waterfall (`RoycoDayAccountant.sol:648`) and postOp (`:285`). So `jtEff == (stRaw + jtRaw) − stEff` always. No stored leverage multiplier; JT "leverage" is emergent from the coverage ratio. Claim decomposition for redemptions: `UtilsLib.computeSTandJTClaimsOnNAV` (`:151-169`), `jtClaimOnSTRawNAV = saturatingSub(jtEff, jtRaw)`.

**Mid-drawdown / mid-FIXED_TERM redemption:**
- **ALL user ops (deposits AND redemptions) are hard-blocked in FIXED_TERM** — every kernel entrypoint requires `PERPETUAL`: `stDeposit` (`src/kernels/base/RoycoDayKernel.sol:223`), `stRedeem` (`:257`), `jtDeposit` (`:293`), `jtRedeem` (`:327`); error `DISABLED_IN_FIXED_TERM_STATE`. **There is no mid-fixed-term redemption at all.** Exits resume only after transitioning back to PERPETUAL (§3). (OPEN QUESTION #4 if the Excel assumes mid-drawdown exits.)
- **When PERPETUAL (mid-drawdown, no active term):** redemptions price on **effective NAV**. postOp reduces `stEff`/`jtEff` by redeemed NAV (`:258-275`); JT redemption realizes a proportional slice of the coverage-IL claim: `jtCoverageImpermanentLoss = jtCoverageImpermanentLoss.mulDiv(jtEff, lastJTEff, Floor)` (`:278`) — exiting JT LP realizes its share of past coverage losses and forfeits recovery optionality.

**Deposit/withdrawal guards (coverage-bounded, not hard caps):** `maxSTDeposit = min(x_coverage, x_liquidity)` (`:353-386`); with `minLiquidity==0` the liquidity branch is `MAX_NAV_UNITS` (`:374-375`), so coverage binds: `x_coverage = jtEff/minCoverage − (jtCoinvested?jtRaw:0) − stRaw − dust` (`:363-369`). `maxJTWithdrawal` surplus over `requiredJTAssets = coveredExposure.mulDiv(minCoverage, WAD, Ceil)` (`:416`). Post-op invariant: `coverageUtilization ≤ WAD` for ST_DEPOSIT / JT_REDEEM (`:325-327`).

---

## 5. Compounding

**Per-sync (lazy, event-driven), compounded into effective NAV.** Not per-block, not fixed daily. Gains/losses/premiums book directly into `stEff`/`jtEff` each sync (`:643,628,553,574`) and become the new checkpoints `lastSTEffectiveNAV` etc. (`:175-176,291-292`); next sync's deltas are measured against the grown base (`:510,515-516`) → **effective-NAV gains compound**. The **YDM share fraction itself is nominal and time-integrated** (`twJTYieldShareAccruedWAD = Σ share_i·elapsed_i`, `:757`, ÷ elapsed at `:618`) — the share is a time-weighted mean, not compounded; the *amount* it multiplies (`stGain`) is on the compounded base. The accountant applies **no** per-block rate of its own; underlying yield enters only via raw-NAV oracle deltas (§7).

---

## 6. Tranche sizing, min coverage, capacity, fees

- **Min coverage ratio** `minCoverageWAD < WAD`, init `RoycoDayAccountant.sol:107`, setter `:876`. Config defaults: DAY_DEMO **0.03e18 (3%)**, SNUSD **0.1e18 (10%)** (`script/config/MarketDeploymentConfig.sol:246,306`). **For TRY, `minCoverage` is a free parameter** (see OPEN QUESTION #5 for the value that reproduces Excel's ~3× junior leverage; note implied exposure/JT ≈ 1/minCoverage).
- **β / JT_COINVESTED:** immutable ctor bool (`:31,55,59`); DAY_DEMO & SNUSD `true` (`MarketDeploymentConfig.sol:247,306`).
- **minLiquidity:** init `:118`, must be `< WAD`, may be `0` (TRY = 0).
- **Capacity:** no hard deposit cap; `maxSTDeposit` computed dynamically (`:353-385`) as a soft coverage/liquidity bound.
- **Fees (all on tranche *yields*, taken by minting shares to the fee recipient post-sync; capped at `MAX_PROTOCOL_FEE_WAD = 1e18`, `Constants.sol:28`):**
  - `stProtocolFeeWAD` — on ST gains (`:97`, taken `:640`); DAY_DEMO/SNUSD **0.1e18 (10%)**.
  - `jtProtocolFeeWAD` — on JT gains (`:98`, `:551/565`); DAY_DEMO/SNUSD **0**.
  - `jtYieldShareProtocolFeeWAD` — on the JT risk premium (`:99`).
  - `ltYieldShareProtocolFeeWAD` — on LT premium (`:100`, `:635`); **irrelevant here (LT=0)**.
  - No management fees. **While in FIXED_TERM all protocol fees are zeroed** (`:692-700`).
  - **OPEN QUESTION #6:** which fee values TRY uses (Excel appears to model 0 fees; the code default is 10% ST).

---

## 7. Price / oracle source feeding NAV

**Pull model** — the kernel quoter reads on each sync (nobody pushes). Raw NAV from `RoycoDayKernel._getSeniorTrancheRawNAV()` → `stConvertTrancheUnitsToNAVUnits(stOwnedYieldBearingAssets)` (`src/kernels/base/RoycoDayKernel.sol:721-730`, called `:547,569`). Chainlink variant (DAY_DEMO/SNUSD): ERC4626 `convertToAssets()` (tranche→base) then Chainlink `_queryChainlinkOracle()` (base→USD), combined `rate = ERC4626_rate * chainlink_price / pricePrecision`, floored (`src/kernels/base/quoter/identical-st-jt/IdenticalERC4626Shares_ST_JT_SharePriceToChainlinkOracle_Quoter.sol:44-65`). **For the TRY simulator the "oracle" is the wiTRY price path** supplied as the yield source (backtest = historical series; live = a data adapter, Phase 4).

---

## 8. Excel ↔ code mapping

| Excel concept | Code counterpart | Verdict |
|---|---|---|
| 47% senior yield share | `jtRiskPremium = stGain * (twJTYieldShareAccruedWAD/(elapsed·WAD))` (`:618`), capped by `maxJTYieldShareWAD` (`:753`); 47% is a **parameter** into the StaticCurveYDM points (`StaticCurveYDM.sol:72-88`) / `maxJTYieldShareWAD`. Applied to realized senior **gain**, not a yield rate. | PARAMETER |
| HWM | none (nearest: JT-coverage-IL recovery `:578-586`, a claim not a peak) | **NO counterpart — OPEN Q#1** |
| 30-day rolling window | none — continuous per-sync realization | **NO counterpart — OPEN Q#1** |
| 30% drawdown buffer | nearest: `coverageLiquidationUtilizationWAD` (`:84,662`) + `minCoverageWAD` sizing | PARAMETER-adjacent; exact 30% mapping **OPEN Q#1** |
| junior = pool − senior | NAV conservation `stRaw+jtRaw == stEff+jtEff` (`:285,648`), JT delta residual (`:529`) | **DIRECT primitive** |
| first-loss permanent wipe | default recoverable IL (`:570,579`); permanent only via erasure branch (`:668-669`) / `fixedTermDurationSeconds==0` | PARTIAL — Excel wipe = special case |
| 3× junior leverage | no stored factor; emergent from `minCoverageWAD` + conservation; `JT_COINVESTED` is boolean | PARAMETER via `minCoverage`; exact 3× **OPEN Q#5** |

---

## Load-bearing files
- `src/accountant/RoycoDayAccountant.sol` — sync path, waterfall, premium/IL (§1-§6).
- `src/libraries/UtilsLib.sol` — coverage/liquidity utilization (`:32,65`), claim decomposition (`:151`).
- `src/ydm/StaticCurveYDM.sol` (`:102`), `src/ydm/base/BaseYDM.sol` (`:18`), `src/interfaces/IYDM.sol` (`:29`).
- `src/interfaces/IRoycoDayAccountant.sol` — state (`:87`), init params (`:29`), IL field (`:117`).
- `src/kernels/base/RoycoDayKernel.sol` — FIXED_TERM freeze (`:223,257,293,327`), NAV read (`:721`).
- `script/config/MarketDeploymentConfig.sol` — defaults; `script/update/accountant/SetYDM.s.sol` — real YDM curves.
- `src/libraries/Constants.sol` — WAD (`:19`), MAX_PROTOCOL_FEE (`:28`).

## Precision
WAD=1e18. Rounding: **Floor** for gain→fee/premium conversions (`:551,565,618,619,635,640`), **Ceil** for protection/required-coverage thresholds (`:363,416,454`; `UtilsLib.sol:52`). Parity must match the contract's rounding direction per operation.
