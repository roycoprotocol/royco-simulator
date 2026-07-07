# PARITY-REPORT.md — Phase 3: reference engine ⇄ accountant, wei-exact

**Result: 52/52 vectors pass, wei-exact.** The standalone TypeScript engine (`lib/try/engine.ts`, zero external deps, pure BigInt/WAD) reproduces the real `RoycoDayAccountant` accounting math exactly, for every generated vector.

## How the ground truth was produced (non-circular)
The `~/royco-day` repo ships **no** golden unit vectors (Phase 2). So we generated them by executing the **real compiled contracts** fork-free: a Foundry harness (`lib/try/harness/VectorGen.t.sol`, copy of the one run in `~/royco-day/test/vectors/`) drives `RoycoDayAccountant` (behind an ERC1967 proxy) via `preOpSyncTrancheAccounting(stRaw, jtRaw)` pranked as the kernel, with synthetic NAV inputs and a **monotonic wall clock** (`vm.warp`, +30d/step). Output → `lib/try/vectors.golden.json` (52 vectors). The TS engine is diffed against these to the wei by `lib/try/parity.ts` (`npx tsx lib/try/parity.ts` → `52/52 PASS`).

## Coverage (52 vectors)
- **A (6)** — StaticCurveYDM `yieldShare(U)` at U ∈ {0, 0.45, 0.9, 0.95, 1.0, 1.5}; flat 0.53 curve (Senior keeps 47%).
- **B (5)** — coverage utilization incl. the special cases (minCov=0→0, jtEff=0→max, zero exposure→0). Genesis U=0.9e18 confirmed.
- **C (11)** — single-sync waterfall: flat, +10% (Senior keeps exactly 47% of its gain), −10% (Junior covers, IL booked, FIXED_TERM), partial/full in-term recovery, deep drawdown (Junior exhausted → forced PERPETUAL + IL erased), term-elapsed.
- **D (12)** — a real-time 12-month price path `[1.00,1.02,1.05,1.03,1.08,0.98,0.95,1.01,1.06,1.10,1.04,1.12]`, 30 days/step. **This is also the backtest fixture.**
- **E (18)** — adversarial FIXED_TERM boundary vectors (see below).

## The transition rule — proven three independent ways
The FIXED_TERM ↔ PERPETUAL transition (`RoycoDayAccountant.sol:660-699`) was initially mis-modeled and caught by an adversarial pass. Its true semantics, now confirmed:
- **Term-elapse comparison is non-strict `<=`** (`:661`).
- **The term anchor is set to `now + duration` ONLY on a PERPETUAL→FIXED_TERM entry** (`:699`, guarded by `initialMarketState == PERPETUAL`); it is **carried unchanged** on a FIXED_TERM→FIXED_TERM sync (NOT re-anchored per sync).
- On elapse (or under-collateralization, or Junior exhaustion `jtEff==0 && stEff>0`), the market forces to PERPETUAL and **JT coverage IL is erased** — Junior permanently absorbs the covered loss.

Confirmed by: (1) direct read of `:660-699`; (2) controlled boundary vectors — **E3 (dt = exactly term) elapses** while **E2 (term−1) does not** (settles `<=`), and **E5 (cumulative > term via short syncs) elapses** (settles entry-only anchor); (3) the real-time Group-D path, where the ~60-day 0.98→0.95 drawdown makes the term **elapse at step 7** (IL 96e18 → 0, market → PERPETUAL, jtEff → 387e18 — Junior eats the loss) *before* the 1.01/1.06 recovery.

## Two false alarms resolved (were harness artifacts, not contract behavior)
- **Group-D "stayed FIXED_TERM across 30-day syncs"** was a **frozen-clock** bug (`block.timestamp` pinned every step); fixed to a monotonic clock, the term now elapses as above.
- **E6 "reverts on full in-term recovery"** was a **backward-clock** underflow (`block.timestamp - lastAccrual` at `:747`), NOT a real behavior; with a forward clock the recovery completes normally (IL→0, PERPETUAL). The engine still replicates the genuine `uint256` underflow-revert semantics *if* time ever regresses, but that cannot happen on-chain.

## What parity does and does NOT cover
**Covered (wei-exact):** YDM curve; coverage/liquidity utilization; deposit-based genesis seeding; the full per-sync waterfall — PnL attribution by claim, loss coverage `min(stLoss, jtEff)`, IL recovery (incl. the non-obvious proportional recovery, e.g. C4's 44.44e18), time-weighted JT premium, NAV conservation, and all market-state transitions; the 30-day term elapse + IL erasure.
**Not covered (out of scope / by design):** the kernel's NAV *quoting* (ERC4626/Chainlink oracle) — the sim **supplies** the price path instead; the kernel-level deposit/redeem **freeze** during FIXED_TERM (a kernel guard, not accountant math — the sim enforces it from `marketState`); parameter *values* still open (exact 47% YDM curve shape, fees, `coverageLiquidationUtilization`) — the engine is parameterized so these are config swaps, not engine changes (see OPEN-QUESTIONS).

## Reproduce
```
# regenerate golden from the real contracts (needs ~/royco-day + forge):
cp lib/try/harness/VectorGen.t.sol ~/royco-day/test/vectors/ && \
  ~/.foundry/bin/forge test --match-contract VectorGen -C ~/royco-day && \
  cp ~/royco-day/output/vectors-out.json lib/try/vectors.golden.json
# prove the TS engine against it:
npx tsx lib/try/parity.ts        # → 52/52 PASS
```
