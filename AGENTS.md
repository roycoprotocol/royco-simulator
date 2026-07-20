# Simulator template rules

Read `docs/NEW_SIMULATOR.md` before creating or editing a Dawn simulator.
Read `docs/NEW_DAY_SIMULATOR.md` before creating or editing the Day simulator.

## Non-negotiable boundaries

1. Never duplicate or rewrite the accountant, waterfall, coverage, NAV, observation, or YDM math. All simulator accounting must flow through `lib/try/engine.ts` and `lib/try/backtest.ts`.
2. Never copy and modify the simulator page or its CSS for a new market. New markets use `components/simulator/MarketSimulator.tsx` and `SimulatorPageShell.tsx` unchanged.
3. Never replace locked descriptions. Standard section text lives in `lib/simulator-template/locked-copy.ts` and must remain exact unless the template itself is intentionally revised for every simulator.
4. Market-specific work belongs in `lib/markets/<market-id>/market.json`, `series.json`, `market.ts`, and the small route generated under `app/<market-id>-sim/page.tsx`.
5. Market folders may not contain CSS or React components.
6. Never invent data provenance, fee treatment, asset history, launch dates, or production integration details. Use `unknown` and fail verification when information is missing.
7. Run `npm run sim:verify -- <market-id>` and `npm run sim:certify -- <market-id>` before requesting publication.
8. Do not create or merge a PR while any data, math, copy, design, test, lint, or build check is failing.

## Shared-file changes

Changes to `lib/try/engine.ts`, `lib/try/backtest.ts`, `components/simulator/`, or `lib/simulator-template/` are template changes affecting every market. They require the full repository test, parity, lint, build, and visual review—not merely a market verification.

## Day boundary

1. A new Day market is a factory operation. Run `npm run day-sim:new`; then edit only `lib/day-markets/<market-id>/market.json`.
2. Market-specific presentation changes must be declared in `market.json` under `customization`, explicitly authorized by the user, supported by the shared customization schema, and reported by verification. Never add market-local React or CSS.
3. Day accounting flows through `lib/day/engine` and `lib/day-simulator-template/runtime.ts`. Never copy formulas into UI, routes, market files, calibration, or reports.
4. Every public Day route must use `StrictDaySimulatorPageShell`. It may not pass variants, classes, styles, copy, or custom children.
5. Pareto FalconX v3 is the grounded default. Fonts, colors, borders, spacing, charts, diagrams, and behavior remain shared and byte-locked; an authorized market may use supported section-visibility or copy overrides without forking the component.
6. Never guess provenance, price type, fee treatment, desired yield ranges, hidden parameters, or customization authority. Incomplete intake must remain `unknown` and fail verification.
7. Calibrate with `npm run day-sim:calibrate -- <market-id>`; never calculate tranche outputs independently.
8. Run `npm run day-sim:verify -- <market-id>` and `npm run day-sim:certify -- <market-id>` before requesting publication. Certification must pass all 74 Solidity vectors, tests, lint, and build.
9. If an explicitly authorized customization is not yet supported, extend the shared manifest-driven customization schema with tests; do not create a one-off market component. Updating the template lock is a maintainer action after full certification.
10. Do not create or merge a PR until verification and certification pass and the user approves the browser preview.
11. Erasure annotations consume the accountant's structured erased amount and pre-refill Junior valuation. Never parse event copy or size erasure against a same-timestamp refill.
