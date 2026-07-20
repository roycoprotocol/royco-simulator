# Strict Royco Day simulator factory

The public Day simulator is a locked factory, not a page-building task. The approved Pareto FalconX v3 page is the reference implementation. Every market uses the same shared accountant, React tree, copy, typography, colors, borders, spacing, responsive behavior, charts, diagrams, and controls.

Agents operate the factory. They do not recreate it.

## Required intake

Do not start until all fields below are answered. Never infer an unanswered field.

- **Market name**
- **Route**
- **Underlying asset**
- **Display asset name** (the short label used in “___ base yield”)
- **Senior name/symbol**
- **Junior name/symbol**
- **Data source**
- **Is price NAV or total-return data?**
- **Are fees already included?**
- **Desired Senior yield** (a range, as decimals in the manifest)
- **Desired Junior yield** (a range, as decimals in the manifest)
- **Desired minimum coverage**
- **Anything that must differ from the standard template**

If the last answer is not “nothing,” stop. A difference is a shared-template design decision and cannot be implemented as a market exception.

## One permitted workflow

### 1. Create the market

The source can be a local CSV/TSV, a public CSV/JSON API URL, a Google Sheet URL, or a public HTML page containing a date/price table.

```bash
npm run day-sim:new -- <market-id> <source-file-or-url> <route>
```

The factory creates exactly four artifacts:

```text
lib/day-markets/<market-id>/market.json
lib/day-markets/<market-id>/series.json
lib/day-markets/<market-id>/market.ts
app/<route>/page.tsx
```

It refuses to overwrite an existing market or route. It normalizes dates, validates positive prices, sorts the series, rejects duplicate dates, infers cadence, records provenance, and derives the source APY from the imported series.

### 2. Edit only `market.json`

Fill identity, provenance, target ranges, minimum coverage, and other approved backend defaults. Replace every placeholder and `unknown`, then set `certification.intakeConfirmed` to `true`.

Do not edit `market.ts`, `series.json`, the route, any component, any stylesheet, any template file, or any accountant file. `templateExceptions` must remain an empty array.

Hidden defaults are still accountant inputs. Keep them explicit. Never guess a fee, curve endpoint, liquidity assumption, observation duration, refill rule, notional, or protocol parameter. Ask the user when a required value is missing.

### 3. Calibrate through the accountant

```bash
npm run day-sim:calibrate -- <market-id>
```

This searches the Junior and LP yield-share settings by repeatedly running `lib/day/engine`. It does not use an approximate yield formula. Review the report. If both target ranges pass, write the result with:

```bash
npm run day-sim:calibrate -- <market-id> --write
```

Never hand-calculate or rewrite tranche-yield, coverage, waterfall, observation, fee, NAV, YDM, LP, or E-CLP formulas.

### 4. Verify and preview

```bash
npm run day-sim:verify -- <market-id>
npm run day-sim:preview -- <market-id>
```

Verification fails for incomplete intake, inaccurate provenance, malformed series, target misses, invalid contract parameters, market-local code/styles, a non-generated route, any market copy override, or a one-byte change to a locked shared template/accountant file.

In the browser, compare the market with `/falconx-v3` at desktop, mobile, and high zoom. Only market identity, asset-related text, source disclosure, dates/data, values, and configured defaults may differ. Structure and styling must not differ.

### 5. Certify

```bash
npm run day-sim:certify -- <market-id>
```

Certification runs data verification, accountant runtime checks, all 74 Solidity golden vectors, the Day invariant and regression suites, source-import tests, lint, and a production build. A successful report ends with:

```text
Data integrity: PASS
Accountant parity: PASS (74/74 Solidity vectors)
Calibration guardrails: PASS
Locked copy: PASS
Design contract: PASS
Tests and build: PASS
```

Do not request publication or open a PR unless every category passes and the user approves the preview.

## Immutable shared surface

Market agents must never edit these locations:

- `components/day-simulator/`
- `components/simulator/SimulatorPageShell.tsx`
- `lib/day-simulator-template/`
- `lib/day/engine/`
- `app/globals.css`
- `scripts/day-simulator/`
- `scripts/day-simulator/template-lock.json`

The SHA-256 lock file makes that boundary machine-verifiable. Only a deliberate shared-template change may update it, and that requires full repository tests, parity, lint, build, and visual comparison against the approved reference before regenerating the lock.

## Accounting contract

All Day state transitions and outputs flow through `lib/day/engine`. Shared wiring in `lib/day-simulator-template/runtime.ts` is the only adapter allowed to build initial balances and accountant configuration. The UI, market files, calibration command, and verifier consume this shared adapter; none may duplicate its formulas.

The Solidity suite contains 52 Foundry-generated core accountant vectors and 22 pinned current-contract vectors. It covers LT commitment/reinvestment, all four fee rates, Senior liquidity-premium share minting, all six post-operation paths, coverage/liquidity gates, self-liquidation, one-wei rounding, and the mint-dilution clamp. Regenerate vectors only from the locked compiled contracts using the documented generator—never from TypeScript.

LP stable yield, trading-fee income, turnover, and execution-liquidity economics are variable off-chain model inputs. They are invariant-tested, but they are not fixed onchain economics.

## Locked presentation contract

The strict shell always renders the approved executive page. It includes the same section order, text, mechanism diagrams, expandable market-input bar, six sliders, three APY cards, liquidity diagram, loss waterfall, observation-period explainer, full accountant-backed history chart, ISO-date hover behavior, observation/erasure/loss annotations, unified two-handle backtest scrubber, month-over-month table, refill control, and source disclosure as Pareto FalconX v3.

Fonts, palette, borders, radii, shadows, card dimensions, spacing, breakpoints, chart geometry, label placement, and mobile/high-zoom behavior are shared code. A market route cannot pass a variant, class, or style override. Market folders cannot contain React or CSS.

## Instructions for lower-cost agents

Use this literal checklist:

1. Read this file completely.
2. Confirm every intake field; ask instead of guessing.
3. Run `day-sim:new` once.
4. Edit only the generated `market.json`.
5. Run accountant calibration; do not write formulas.
6. Run verification. Fix only market data/configuration failures.
7. If verification reports a locked template change, stop—do not update the lock.
8. Inspect screenshots against `/falconx-v3`; report differences, do not patch shared design.
9. Run certification.
10. Wait for preview approval before any PR.

Cheap and fast models may load data, run calibration searches, generate reports, and inspect screenshots. They may never independently rewrite accounting formulas or recreate the design.
