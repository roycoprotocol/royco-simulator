# `/create` — the pool creator

A public wizard where any protocol can configure a Royco Day pool against its own strategy.
Three jobs in priority order: **educate → abstract → deploy.**

`docs/NEW_DAY_SIMULATOR.md` is SHA-locked, so this lives alongside it rather than inside it.

## Where the code lives

Everything is outside `scripts/day-simulator/template-lock.json`. Nothing in
`components/day-simulator/`, `lib/day-simulator-template/`, `lib/day/engine/`, `app/globals.css`
or `package.json` is touched — `npm run day-sim:verify` must stay green.

```
app/create/page.tsx                  Server component; renders the shared SimulatorPageShell.
app/create/nav/route.ts              GET; read-only on-chain NAV reader (mode=probe|series).
lib/pool-creator/draft.ts            PoolDraft — the only wizard state.
lib/pool-creator/config.ts           PoolDraft → MarketConfig (production-shaped).
lib/pool-creator/solver.ts           Outcome → parameter inversion, by bisection over the engine.
lib/pool-creator/preview.ts          Backtest loop → chart rows + KPIs.
lib/pool-creator/synthetic.ts        "No track record" → a modelled NAV path.
lib/pool-creator/presets.ts          Archetypes + real markets to copy.
lib/pool-creator/nav/*               SERVER ONLY. Ported from scripts/data/extract-day-nav.mjs.
lib/pool-creator/derive.ts           PoolDraft → market.json + series.json + market.ts + page.tsx.
lib/pool-creator/validate.ts         Mirrors verify.mjs, so problems surface before download.
lib/pool-creator/export.ts           File blobs, publish commands, client-side download.
lib/pool-creator/permalink.ts        Shareable-link codec + localStorage autosave.
lib/pool-creator/emit-market.ts      CLI: writes a market into the repo for the certify proof.
lib/pool-creator/chain/*             Deploy layer — keccak, ABI, registry, params, wallet, machine.
components/pool-creator/*            Tokens, primitives, fields, diagrams, steps, rail, deploy.
```

Eight suites, 457 checks, all run directly (`package.json` is locked, so none can join `npm test`):

```bash
npx tsx lib/pool-creator/solver.test.ts            # 106
npx tsx lib/pool-creator/preview.test.ts           #  83
npx tsx lib/pool-creator/derive.test.ts            #  56
npx tsx lib/pool-creator/permalink.test.ts         #  42
npx tsx lib/pool-creator/nav/nav.test.ts           #  48
npx tsx lib/pool-creator/chain/abi.test.ts         #  48
npx tsx lib/pool-creator/chain/keccak.test.ts      #  25
npx tsx lib/pool-creator/chain/tx-machine.test.ts  #  49
```

## Design

Matches the Dawn / Tenbin visual contract in `public/tenbin-sims/` (the Dawn Market Builder),
encoded as style objects in `components/pool-creator/tokens.ts`. Cream `#FBFAF7`, square corners,
Georgia serif headings, SF Mono numerals, 9.5px/0.22em uppercase eyebrows. Keep those hex values
in sync with the `:root` block at the top of `public/tenbin-sims/index.html`.

Layout is a persistent right-hand rail beside the work column. The rail is a **live simulator
readout**, not a checklist — the three APYs recompute as the user drags, which is what carries
someone through the flow. It keeps its place down to 860px.

## Two modes, not six steps

The page began as a six-step gated wizard ending in a deploy button. That reads as a commitment,
and someone who is only *considering* a tranche bounces off it. So:

- **Simulate** is the landing surface and the default. All four configuration sections render at
  once, in order but never gated — you can jump straight to Returns without answering anything
  first. Scrolling supplies the sequence that step gating used to enforce. Nothing here is
  committed, and the rail says so.
- **Launch** is a deliberate second act: name it, size it, confirm the three consequences, publish,
  deploy. The rail flips to "Launching. Everything below is a real change."

`mode` is *derived* from `draft.step` (`>= 5` is launch) rather than stored, so permalinks,
persistence and validation keep one source of truth.

**Starting costs one click.** `StartBar` shows three archetypes and five markets that actually
exist as visible chips, not behind a disclosure. Copying a live market is the strongest of these —
"show me what Apollo's looks like" answers the question a visitor arrives with, using real
certified numbers.

One wrinkle that copying exposed: the twelve markets in this repo are modelled with **zero**
protocol fees, so some of their published Senior targets are unreachable once this wizard's
production defaults (10% on Senior, 45% on the risk premium) apply. Solving each against
production fees put the binding case at 0.743 retention, so `referenceToGoals` clamps at 0.73 —
otherwise copying a market that plainly exists would open on a "cannot reach that" warning.

## Why the abstraction is cheap: the system is triangular

Measured against the engine (susdai defaults, base 8.28%):

| knob ↑ | Senior | Junior | LP |
|---|---|---|---|
| `riskYieldShare` 0→0.4 | 7.17 → 4.12 | 8.28 → 36.05 | ~flat |
| `liquidityYieldShare` 0→0.3 | 7.57 → 5.25 | **exactly flat** | 5.52 → 19.18 |
| `coverage` 0.03→0.5 | 6.595 → 6.590 | 25.26 → 8.75 | **exactly flat** |
| `minLiquidity` 0.05→0.4 | ~flat | **exactly flat** | 24.00 → 7.18 |

Coverage and minLiquidity are pure *sizing* knobs; only the two yield shares move Senior. So a
full solve is one forward pass — size the cushion, size the exit pool, then price the two
premiums — about **245ms and 200 engine runs**, against ~2,000 for the locked grid calibrator.

## Parameter translation table

The core abstraction deliverable. Nothing in the left column ever appears on the default path.

| Raw parameter | What the user sees |
|---|---|
| `coverage` | "Protect Senior from the first **__%** drawdown" — inverted through the accountant |
| `minLiquidity` | "Sell **__%** of a position in one go for under a 1% discount" |
| `exitBufferPct` / `liquidationUtilization` | "When can Senior take an early exit?" — three named chips. Never the word *liquidation* |
| `fixedTermDurationSeconds` | "How long does the strategy get to recover?" (0 = perpetual) |
| `FIXED_TERM` state | "the recovery window". *Observation period* appears once, in an ⓘ reveal |
| Junior claim erasure | "Junior's claim on that loss is written off" — active voice, with a subject |
| `riskYDM` / `liqYDM` anchors | **Hidden.** Derived from the two target-return questions |
| YDM `mode` | Advanced only. Defaults to `adaptive`, matching production |
| `targetUtilization` (0.9) | **Never shown, not even in Advanced.** A constant nobody varies is not a setting |
| `beta` / `linkJuniorToFirstLoss` | **Hidden.** Always 1 / true |
| `maintainCoverage` | Advanced: "Top the cushion back up automatically" |
| `stSelfLiquidationBonus` | Advanced: "Bonus for Seniors who exit during a stress event" |
| `stableYield`, `swapFeeBps`, `poolTurnoverPerYear`, `eclpBandWidth` | Advanced, under a heading stating plainly they are **modelling inputs, not deployed terms** |
| 4 protocol fees | Advanced. Defaults to production: 10% on Senior, 45% on the risk premium |
| `initialST` | "How much Senior are you opening with?" — the only capital number typed |
| `initialJT` / `initialLT` | **Derived**, shown in dollars with a `derived` tag |
| `sourceApy` | **Derived** from the history. Never a slider — typing your own APY over your own data is how you lie to yourself |

House rules for anyone extending this:

- Every control carries a one-line explanation. **No tooltip may hold information needed to
  answer the question** — tooltips serve the curious and the expert, never the confused.
- The diagram goes *above* the inputs. Show the picture, then ask.
- "What happens if it doesn't recover" is **always visible**, never behind a reveal.
- Amber means "pay attention"; red is reserved for blocking errors and the loss line.

## Production shape, not simulator shape

The wizard emits what the live contracts actually run, which is **not** what the 12 markets in
this repo use. From `roycoprotocol/royco-day` `script/config/MarketDeploymentConfig.sol` (snUSD):

| | production | this repo's markets |
|---|---|---|
| YDM | `AdaptiveCurve_V2` | `static` |
| `stProtocolFee` | 10% | 0 |
| `jtYieldShareProtocolFee` | 45% | 0 |
| `fixedTermDuration` | 0 (perpetual) | 7–30 days |

`buildDayMarketConfig` in the locked runtime cannot express a perpetual market — it hardcodes
`observationDays * 86400` — which is why `lib/pool-creator/config.ts` assembles `MarketConfig`
through `defaultConfig()` directly. Initial balances still delegate to the locked
`buildDayInitialBalances`, so the sizing ratios keep one definition.

The emitted config maps one-to-one onto `RoycoDayAccountantInitParams`, so what the user
simulates is what would deploy. `stableYield`, `swapFeeBps`, `poolTurnoverPerYear` and
`eclpBandWidth` are excluded on purpose — they shape projections, not the market.

## Two engine limits worth knowing

1. **The combined premium share is capped at 0.95** (`MAX_TOTAL_YIELD_SHARE`). `defaultConfig()`
   rejects a configured sum above 1, but `reconcile()` applies a second, tighter runtime test on
   *time-weighted* shares (`engine.ts:423`) whose accumulator rounding throws on the exact
   `r + l = 1` diagonal. A grid scan confirms it. 0.95 constrains nothing real — production
   prices its risk premium at 0.11.

2. **No engine exception reaches the UI.** The accountant legitimately throws on configurations
   it cannot account for, and those regions always sit at the high end of every knob we search.
   `bisect` treats a throw as "past the goal" so the search retreats; `describeTerms` degrades to
   NaN, which the rail renders as "—". A slider drag must never white-screen the page.

## The NAV reader (`/create/nav`)

Three ways to supply a strategy, in tab order: **vault address** (default), **paste history**,
**describe it**. The first reads the chain.

`scripts/data/extract-day-nav.mjs` is the source of truth for this logic — it produced the
histories in `data/day-nav-provenance/`. It is a CLI with a top-level `await main()` and no
exports, so `lib/pool-creator/nav/` is a **port, not an import**. Keep the selectors, batch size
and retry behaviour in sync with it.

Two departures, both forced by running inside a request:

- the 1s inter-chunk sleep drops to 120ms, or a 105-date pull spends most of a minute asleep;
- the `/tmp` block cache becomes in-memory (`cache.ts`), since serverless instances share no
  filesystem. Block lookups are cached separately from probes and series because they are the
  slowest upstream and are shared across every vault on a chain.

**The probe discovers, it does not guess.** The script is *told* each asset's kind and asserts
the answer matches; a pasted address gives no such hint, so `probe.ts` tries calls in order —
`asset()`+`convertToAssets` → `shareToken()`+`accountingToken()` → `latestRoundData()` →
`decimals()` — and reports `unknown` with the attempted selectors rather than inventing a
plausible answer. A plain token returns `erc20-only`: *"This looks like a token, not a yield
vault."*

Verified against live chains:

| address | chain | result |
|---|---|---|
| `0x0B2b…5ef9` (sUSDai) | Arbitrum | `erc4626`, 64 weekly obs, **8.31%** |
| `0xD6Bc…d51C` (ACRED) | Ethereum | `chainlink`, 8 decimals |
| `0x6b00…f721` (Makina DUSD) | Ethereum | `makina`, probeShares 1e30 |
| `0xA0b8…eB48` (USDC) | Ethereum | `erc20-only`, correctly refused |

Pulling the committed susdai window reproduces its certified `sourceApy` to **0.0 basis points**
(0.082779919594975 vs 0.08278) in ~9s. That equivalence is the real test of the port.

Caps and limits: weekly default, 400 observations, 2-year lookback, per-instance token bucket
(10 probes/min, 4 series/min), and a probe-before-series handshake so scraping costs two round
trips. The rate limiter is **soft** — per-instance, not a security control. Anything stronger
needs a shared store.

Reads before a contract existed return nothing and are omitted rather than filled in, so
requesting a window wider than the vault's life silently narrows to its real history. Blocks left
on interpolation after five refinement rounds are reported via `approximateBlocks` rather than
presented as exact — NAV moves far slower than a block, but the estimate is disclosed.

## The artifact: a wizard-built pool certifies

`npx tsx lib/pool-creator/emit-market.ts <id>` writes the four files the wizard offers for
download into the repo, so the output can be run through the real pipeline. It has been, and it
passes:

```
npm run day-sim:verify   -- wizard-proof   → PASS (accountant APYs inside the target bands)
npm run day-sim:calibrate -- wizard-proof  → riskYieldShare 0.084, liquidityYieldShare 0.129
npm run day-sim:certify  -- wizard-proof   → Data integrity, Accountant parity (74/74),
                                              Calibration guardrails, Locked copy,
                                              Design contract, Tests and build: all PASS
```

The calibration line is the load-bearing one. The wizard's fast bisection solved
`0.084066 / 0.128700`; the sanctioned grid calibrator independently found `0.084 / 0.129`. The
two agree, which is what makes the fast solver trustworthy. Remove the scratch market afterwards
with `--clean`.

Two things `derive.ts` gets right that are easy to get wrong:

- **`sourceApy` is derived with `annualizedSeriesApy`**, the same function verify.mjs checks
  against, so the 1e-12 equality holds by construction rather than by rounding luck.
- **A modelled strategy never claims a track record.** The wizard synthesises a path so the
  cushion diagram and backtest have something to work with, but publishing that as
  `historical-series` would present synthetic points to depositors as real observations. Modelled
  pools emit `published-apy-forward` with zero observations and `not-applicable` dates — the same
  representation Blockhouse, DualMint and Muga use.

A perpetual pool (`recoveryDays = 0`) can be deployed but **cannot be published**: the simulator
template requires a 7–194 day observation period. Validation says exactly that rather than
silently substituting a number.

## Deploy

Built and tested end to end against an empty registry. `executeMarketDeployment` is `restricted`
to `DEPLOYER_ROLE`, and the four implementation addresses and two YDM addresses are not in the
public contracts repo — so `DAY_DEPLOYMENTS` is empty, the step says so plainly, and it hands the
configuration over instead. A test asserts the registry contains no address literals beyond the
four documented public infrastructure ones; a placeholder would be worse than nothing, because it
would send a real transaction somewhere real.

**No viem, no wallet library.** `package.json` is SHA-locked, so adding one means editing a
guardrail file — a maintainer decision, not a side effect of building a page. Instead:

- `chain/keccak.ts` — keccak-256, validated against the empty-string vector and against the eight
  selectors `scripts/data/extract-day-nav.mjs` already uses successfully on live chains, plus five
  published ERC-20 selectors. Selectors are therefore **derived from signatures, never pasted**.
  (Worth noting: a hand-guessed `executeMarketDeployment` selector was wrong —
  `0x0d4b2aec` versus the real `0x6c5e1b01`. Derivation is not a nicety.)
- `chain/abi.ts` — encoder for exactly the types `MarketParams` needs. Its head/tail handling is
  verified against the canonical worked example in the Solidity ABI specification.
- `chain/tx-machine.ts` — a pure reducer, so every transition is testable without a wallet.

Behaviours that matter more than the happy path, all covered by tests: a user rejection is a calm,
resumable state that does **not** rebuild the plan; a pending transaction that times out is never
reported as lost, because it may still be mined; every write is `eth_call`-simulated before any
signature, so a revert costs nothing; and satisfied approvals are skipped rather than re-sent.

If the lock is ever regenerated to admit viem, `encodeParameters` and `chain/wallet.ts` are the
only things to swap.

## Surviving a refresh, and a shared link

Two mechanisms, deliberately different:

- **localStorage autosave** (debounced 600ms) keeps the whole draft, imported price history
  included. On return the page *offers* to restore rather than silently replacing what is on
  screen — clobbering someone's work without asking is worse than losing it. A version bump
  discards rather than migrating: a half-understood old draft is worse than a clean start.
- **A permalink** carries only the choices — goals, identity, step, and the shape of the strategy.
  Everything derived is recomputed, so a link can never disagree with the engine. A 400-point
  price history is far too large for a URL, so a link that had one says so and offers to
  re-import it, rather than quietly restoring a modelled path as though it were the real data.

`searchParams` is read on the **server** and passed as a prop. Never `useSearchParams()` — it
suspends the subtree, and this repo has shipped a dead page that way once.

## Post-deployment: seed each tranche

Deployment creates the market; it does not make it usable. Step 6 is therefore two phases, and the
second appends only once the deploy transaction has produced tranche addresses —
`buildSeedSteps` cannot be built up front because those addresses do not exist yet.

Each tranche gets **$10**. That is not funding: it mints the first shares in each vault at a known
one-to-one price, which closes the ERC-4626 inflation attack (an empty vault lets the first
depositor donate assets and skew the share price against everyone after them). It also proves all
three tranches accept a deposit before anyone real arrives.

**The order is load-bearing, and was verified against the accountant rather than assumed.** A grid
over the four plausible orderings:

| order | outcome |
|---|---|
| Senior → Junior → exit pool | Senior **rejected** |
| Junior → Senior → exit pool | Senior **rejected** |
| Junior → exit pool → Senior | all three land |
| exit pool → Junior → Senior | all three land |

Senior is refused until **both** the cushion and the exit pool exist — seeding Junior first is not
sufficient on its own, which is the non-obvious part. `buildSeedSteps` only ever emits
Junior → exit pool → Senior, and the test asserts Senior is last.

Each vault pulls with `transferFrom`, so each needs its own allowance: six transactions in total,
with any approval already covered by an existing allowance marked skipped rather than re-sent.

## Still open

- **Confirm with Royco before any mainnet deployment:** the four implementation and two YDM
  addresses; whether `NAV_UNIT`'s underlying type is `uint256` (assumed in `params.ts`); whether
  the team wants `script/mine-market-id/` output rather than the derived market id; and whether
  cushion, recovery window and early-exit level are genuinely immutable post-deploy, since the
  step-5 confirmation says so.
- **The NAV route's rate limiter is per-instance and therefore soft.** It raises the cost of casual
  scraping; it is not a security control. A shared store (Vercel KV) would be.
