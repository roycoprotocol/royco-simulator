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

1. Day accounting flows through `lib/day/engine`; never copy its formulas into UI or market files.
2. Day UI and template work belongs in `components/day-simulator` and `lib/day-simulator-template`. Do not modify Dawn accounting or design files for a Day change.
3. Day mechanism scenarios are not historical price/NAV backtests and must not be described as forecasts.
4. Run `npm run day-sim:verify` and `npm run day-sim:certify` before requesting publication.
5. Day invariant certification is not Solidity parity. Do not claim contract parity until authoritative golden vectors are present and pass.
6. Public Day simulators must use the Dawn/Tenbin visual contract: `SimulatorPageShell`, the approved cream/brown/black/green palette, Georgia headings, system body text, SFMono numeric text, square cards, locked section order, and locked section headings. The legacy dark Day frontend is internal-only and may never be used for a public Day market.
7. Day keeps Dawn accounting and chart behavior but exposes a deliberately compact public surface. Display six sliders—Base strategy APY, minimum coverage, minimum liquidity, Junior yield share, LP yield share, and observation-period duration—plus the Conservative/Balanced/Aggressive ladder and a plain-language Junior-refill checkbox. Protected exit, Junior sizing, curve endpoints, notional sizing, liquidation bonus, fees, and pool mechanics are backend market configuration. The overview contains exactly the three tranche-yield cards. Base-strategy and tranche returns appear in the month-over-month table beneath the full-detail chart. Retain the deploy handoff.
