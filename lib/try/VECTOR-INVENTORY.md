# VECTOR-INVENTORY.md — Phase 2: test vectors that pin the mechanism

## Headline: the repo ships NO golden-number unit vectors for the core accounting math.
The `~/royco-day` suite is **integration-heavy and fork-dependent** — end-to-end deploy/scaffold tests that fork mainnet, not isolated arithmetic tests. `forge` is not installed locally, and nearly every real test calls `vm.createSelectFork()` with `MAINNET_RPC_URL`. So there is **nothing in-repo to diff a reference model against to the wei.** This directly affects Phase 3: "run against every Phase-2 vector, match to the wei" has no existing vectors to run against — **the baseline must be generated** (see "Proposed regression baseline" below).

## What exists (thin)
| # | Mechanic | Coverage in repo tests | Evidence |
|---|---|---|---|
| 1 | Coverage utilization `U=(ST_raw+JT_raw·β)·minCov/JT_eff` | **none** (only config value asserted) | `test/deploy/DayMarketDeploymentTest.sol:257-266` asserts `minCoverage`/`liqUtil`/`maxJTYieldShare`/`fixedTermDuration` are *set*, not the formula |
| 2 | YDM `yieldShare(U)` piecewise curve | **none** (only `TARGET_UTIL=0.9e18` set) | no assertion of share at U=0 / target / 100% |
| 3 | Loss waterfall `coverageApplied=min(stLoss,jtEff)` | **none** | logic at `RoycoDayAccountant.sol:560`, untested |
| 4 | IL recovery (Senior gain repays JT IL first) | **none** | `:585`, untested |
| 5 | JT risk-premium distribution (time-weighted share) | **none** | `:618`, untested |
| 6 | NAV conservation `stRaw+jtRaw==stEff+jtEff` | **invariant only, approximate** | `test/kernels/abstract/AbstractKernelTestSuite.sol:163`, `test/base/BaseTest.sol:422-430` — `assertApproxEqAbs(..., tolerance)` |
| 7 | PERPETUAL↔FIXED_TERM transitions + in-term behavior | **none** | snUSD sets `fixedTermDuration==0` (always perpetual), so the term path is never exercised |
| 8 | maxSTDeposit / maxJTWithdrawal bounds | **none** | no bounds tests |

Only pure-unit, fork-free test in the repo: `test/factory/RoycoFactoryTest.sol` (factory wiring — irrelevant to accounting math).

## Offline runnability
- `forge` **not installed** → prerequisite `foundryup`.
- Real tests require a mainnet **fork** (RPC) → won't run in this sandbox.
- **BUT the core math is fork-free**: `StaticCurveYDM.yieldShare()` and `UtilsLib.computeCoverageUtilization()` are pure functions; the accountant's `_previewSyncTrancheAccounting` takes **raw NAV as parameters** (`RoycoDayAccountant.sol:476-477`) — it does not itself call the oracle. So a purpose-built harness can drive the real contracts with synthetic NAV inputs and **no fork**.

## Proposed regression baseline (for the accountants to bless)
Because no golden vectors exist, generate them by executing the **real Solidity** over a designed input set, print exact outputs, and have the accountants sign off. That harness output becomes the Phase-3 parity target (matched to the wei) AND doubles as the simulator's backtest fixture. Harness = a small Foundry test/script in a throwaway dir of `~/royco-day` that instantiates `StaticCurveYDM`, `UtilsLib`, and a thin `RoycoDayAccountant` test-exposer, runs the vectors below, and emits results.

**Group A — YDM `yieldShare(U)` (pure, exact).** Curve = the TRY config (flat 47%-senior ⇒ junior share 53% at all anchors, or the agreed curve), `U_T=0.9`. Assert share at `U ∈ {0, 0.45, 0.9, 0.95, 1.0, 1.5(clamp)}`.

**Group B — coverage utilization (pure, exact).** `minCov=0.30e18`, `β=true`. Assert `U` for: (start) ST=10, JT=5, JTeff=5 ⇒ 0.90; (junior eroded to 30% pool) ⇒ 1.00; plus special cases `minCov=0⇒0`, `JTeff=0 & exposure>0 ⇒ max`, `exposure=0 ⇒ 0`.

**Group C — single-sync waterfall (accountant, synthetic NAV, no fork, exact).**
- C1 flat: ΔNAV=0 ⇒ no premium, no IL, conservation holds.
- C2 up-sync (PERPETUAL): Senior gain ⇒ JT premium credited, ST residual, conservation.
- C3 down-sync: `coverageApplied=min(stLoss,jtEff)`, IL booked, state→FIXED_TERM.
- C4 down → partial recover in-term: IL partially repaid, still FIXED_TERM.
- C5 down → full recover ≤30d: IL→0, state→PERPETUAL, Senior made whole.
- C6 drawdown deeper than Junior buffer: `jtEff→0`, residual impairs ST, force→PERPETUAL + IL erased.
- C7 term elapses unrecovered (>30d): IL erased, Junior eats loss, reopen PERPETUAL.
- C8 bounds: `maxSTDeposit` value at a state; ST/JT redeem **reverts** `DISABLED_IN_FIXED_TERM_STATE` while in term.

**Group D — multi-sync path (the real proof + the backtest fixture).** Feed a wiTRY price series (start with the Excel "Real Simulator" 60-day daily path, then a longer 2021-stress path) through repeated syncs; record `stEff, jtEff, jtCoverageIL, marketState` at every step. The TS module must reproduce this step-for-step to the wei. This is also exactly the data the simulator's backtest mode renders.

Edge cases explicitly covered (from the brief): drawdown that recovers within the window (C5), one that breaches it / Junior exhaustion (C6/C7), a flat month (C1).

## Verdict
Phase 3's "parity to the wei" is achievable **only** by executing real Solidity (Groups A–D above) — the repo has no vectors and a pure TS re-derivation would be circular. **Prerequisite: install `foundryup`/`forge`, then author the Group A–D harness in `~/royco-day` and get accountant sign-off.**
