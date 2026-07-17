# Royco Day simulator template

The Day simulator is separate from the Dawn historical-market factory. Dawn has two tranches and historical price/NAV backtests. Day adds a Liquidity Tranche and currently runs deterministic mechanism scenarios through `lib/day/engine`.

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

1. All Day state transitions, waterfall behavior, liquidity-premium accounting, E-CLP behavior, and NAV conservation flow through `lib/day/engine`.
2. Day UI belongs in `components/day-simulator` and Day template configuration belongs in `lib/day-simulator-template`.
3. Dawn files under `components/simulator`, `lib/simulator-template`, `lib/markets`, and `lib/try` are not Day extension points.
4. Standard Day page copy lives in `lib/day-simulator-template/locked-copy.ts`.
5. The current Day template uses deterministic mechanism scenarios. It must not describe those outputs as historical backtests or forecasts.
6. A change to `lib/day/engine` requires the complete Day invariant suite, repository tests, lint, build, and an accountant review.

## Dawn/Tenbin visual contract

Day changes the accountant and adds the Liquidity Tranche; it does not introduce a different visual system. Every public Day market must use the Dawn `SimulatorPageShell` and retain the Tenbin palette, typography, square card treatment, spacing, section order, headings, compact five-control builder, historical review layout, and deploy handoff. The required Day-specific additions are the Liquidity KPI, minimum-liquidity control, liquidity-premium control, Liquidity chart line, and Day deploy fields.

The legacy dark components under `app/DaySimulator*.tsx` and `app/internal/day` are internal prototypes. They are not public template components. `day-sim:verify` rejects a public Day route that imports them or uses their dark-theme variables.

## Accountant certification status

The repository contains a Day engine invariant suite covering conservation, loss waterfall behavior, senior priority, fixed-term transitions, coverage gates, self-liquidation, dual YDM splitting, liquidity-pool behavior, adaptive YDM behavior, and E-CLP properties.

The repository does not contain the `AUDIT.md` referenced by legacy source comments, deployed-contract bytecode references, or authoritative Solidity golden vectors. Therefore `day-sim:certify` certifies the implemented TypeScript accountant’s invariants but does not claim Solidity parity. Contract parity must remain visibly `NOT CERTIFIED` until authoritative vectors are added and compared exactly.

## Publication gate

Before requesting publication, run:

```bash
npm run day-sim:certify
npm test
npm run lint
npm run build
```

Then inspect `/day-sim` in a browser, including the default values, advanced controls, both utilization curves, tranche APYs, and browser console. Do not open a PR until the preview is approved.
