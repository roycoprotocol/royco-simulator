# Simulator factory rules

Read `docs/NEW_SIMULATOR.md` before creating or editing a simulator.

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
