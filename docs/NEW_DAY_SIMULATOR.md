# Royco Day simulator template

The Day simulator is separate from the Dawn historical-market factory. Dawn has two tranches and historical price/NAV backtests. Day adds an LP tranche and currently runs deterministic mechanism scenarios through `lib/day/engine`.

## Commands

```bash
npm run day-sim:verify
npm run day-sim:verify -- <market-id>
npm run day-sim:certify
npm run day-sim:certify -- <market-id>
npm run day-sim:preview
```

- `day-sim:verify` checks the public route, locked copy contract, Day-only file boundary, manifest, default configuration, finite outputs, and NAV conservation.
- Passing a market ID additionally verifies its Day manifest, source-series provenance, premium-curve guardrails, public route boundary, market defaults, and live accountant outputs.
- `day-sim:certify` runs verification plus the Day accountant invariant suite.
- `day-sim:preview` opens the local development server at `http://localhost:3000/day-sim`.

## Boundaries

1. All Day state transitions, waterfall behavior, LP-premium accounting, E-CLP behavior, and NAV conservation flow through `lib/day/engine`.
2. Day UI belongs in `components/day-simulator` and Day template configuration belongs in `lib/day-simulator-template`.
3. Dawn files under `components/simulator`, `lib/simulator-template`, `lib/markets`, and `lib/try` are not Day extension points.
4. Standard Day page copy lives in `lib/day-simulator-template/locked-copy.ts`.
5. The current Day template uses deterministic mechanism scenarios. It must not describe those outputs as historical backtests or forecasts.
6. A change to `lib/day/engine` requires the complete Day invariant suite, repository tests, lint, build, and an accountant review.

## Dawn/Tenbin visual contract

Day changes the accountant and adds the LP tranche; it does not introduce a different visual system or remove Dawn behavior. Every public Day market must use the Dawn `SimulatorPageShell` and retain the Tenbin palette, typography, square card treatment, spacing, section order, headings, historical review layout, and deploy handoff.

The public Day control surface is intentionally compact. It displays six sliders—Base strategy APY, minimum coverage, minimum liquidity, Junior yield share, LP yield share, and observation-period duration—plus the plain-language `Refill Junior after losses` checkbox. A refill may occur only when an observation period closes (`FIXED_TERM` to `PERPETUAL`), never during an ordinary perpetual checkpoint. Market manifests define the initial slider values; the public UI does not expose scenario presets.

All other accountant terms are backend market configuration: coverage-based exit threshold, Junior sizing and replenishment, risk- and LP-curve endpoints and maximum shares, notional sizing, self-liquidation bonus, fees, stable yield, swap assumptions, and E-CLP settings. Hiding a term never removes it from the accountant. Market manifests must provide the hidden values explicitly, and the simulator must pass them through `lib/day/engine` without duplicating formulas in the UI. The contract rejects configurations whose maximum Junior and LP yield shares sum to more than 100%; the simulator must not invent a priority rule for an invalid configuration. The standard simulation path models the contract's full-balance liquidity-premium reinvestment attempt as successful: newly minted LP-owned Senior shares are immediately added to the ECLP Senior leg and continue earning the base-strategy return there. A future adverse-venue scenario may model a failed slippage gate and leave those shares idle, but it must be explicit.

The overview contains exactly three KPI cards: Senior, Junior, and LP average annual yield. Base-strategy return is not a fourth KPI. The full-detail Dawn history chart is followed by a month-over-month table with Base strategy, Senior, Junior, and LP returns, plus each row's end value and annualized result. The chart retains the complete legend, ISO-date hover, observation and non-observation hover bands, claim-erasure and Senior-loss marks, line-end values, year markers, and unified two-handle Backtest window scrubber with its full-history mini preview. Replacing the scrubber with separate start/end sliders is a design-contract failure. Retain the locked deploy handoff and keep the Junior-refill explanation short and plain-language.

The legacy dark components under `app/DaySimulator*.tsx` and `app/internal/day` are internal prototypes. They are not public template components. `day-sim:verify` rejects a public Day route that imports them or uses their dark-theme variables.

Erasure chart geometry is an accountant-data contract. `jt-il-erased` events carry an exact structured NAV amount; the Day adapter converts that amount into Dawn's I-beam height and tooltip percentage using Junior's valuation and share base immediately after erasure but before any same-timestamp refill. Formatted event copy must never be parsed for accounting values. The repository test suite includes a forced observation-expiry fixture with Junior refill enabled and must prove a non-zero I-beam, the pre-refill percentage, and the Dawn material-erasure label.

## Accountant certification status

The repository contains a Day engine invariant suite covering conservation, loss waterfall behavior, senior priority, fixed-term transitions, coverage gates, self-liquidation, dual YDM splitting, LP-pool behavior, adaptive YDM behavior, and E-CLP properties.

The repository contains 52 Foundry-generated core RoycoDayAccountant vectors in `lib/try/vectors.golden.json` and a pinned 22-vector current-contract bundle in `lib/day/engine/vectors/golden.json`. `npm run day-sim:parity` replays all 74 vectors through the public Day WAD engine with bigint equality. The extended bundle covers nonzero liquidity utilization, LT raw-NAV commitment, successful and deferred liquidity-premium reinvestment, isolated and combined nonzero fee rates, Senior liquidity-premium share minting, all six post-operation paths, coverage/liquidity gates, self-liquidation, one-wei rounding, and the mint-dilution clamp.

The extended vectors are pinned by `lib/day/engine/vectors/contract-lock.json`. Regenerate them only from the compiled contracts with `ROYCO_DAY_REPO=/path/to/royco-day npm run day-sim:vectors:generate`; the command rejects the wrong contract commit, records the harness hash, and emits decimal strings for every integer. Never regenerate vectors from the TypeScript engine itself.

Solidity parity covers the Day accountant and simulator-used kernel mechanics. LP stable yield, trading-fee income, turnover, and execution-liquidity economics remain variable off-chain market-model inputs. They are invariant-tested and must not be described as fixed contract outputs.

## Publication gate

Before requesting publication, run:

```bash
npm run day-sim:certify
npm test
npm run lint
npm run build
```

Then inspect `/day-sim` in a browser, including the six visible sliders, the visible-only preset ladder, the Junior-refill checkbox, the three tranche-yield KPIs, the four-row month-over-month table, observation-period bands and dates, deploy handoff, full chart interactions, and browser console. Do not open a PR until the preview is approved.
