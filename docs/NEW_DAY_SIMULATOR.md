# Strict Royco Day simulator factory

The public Day simulator is a grounded factory, not a page-building task. The approved Pareto FalconX v3 page is the default implementation. Every market starts from the same shared accountant, React tree, copy, typography, colors, borders, spacing, responsive behavior, charts, diagrams, and controls. Explicitly authorized market differences are recorded as narrow manifest-driven customizations rather than one-off forks.

Agents operate the factory. They do not recreate it.

## Explorer and published-market boundary

`/day-sim` is the canonical educational Day Explorer. It uses the shared Royco Explore product system—neutral foundation, white rounded surfaces, compact Inter typography, subtle borders, restrained shadows, and semantic tranche colors—and the same shared accountant runtime. It can load any registered certified market or an unverified user-supplied history from CSV, TSV, JSON, a public Google Sheet, or a public HTML date/value table.

Explorer imports are drafts. They must keep unknown price type and fee treatment visible until the user answers them, may not claim certification, and may not create or overwrite a public market route. The Explorer is allowed to derive source APY from the supplied normalized series, but all tranche accounting still flows through `lib/day-simulator-template/runtime.ts` and `lib/day/engine`.

The Explorer renders a compact guided variant. The source selector is followed by one unified market snapshot, not a stack of disconnected cards. Its default view contains a four-value setup summary, a secondary line for premium split/recovery/refill assumptions, one comparison table for the source, ST, JT, and SLP, proportional liquidity and loss-protection gauges, optional history, and the required disclosure. Each setup-summary tile must connect its assumption to a concise mechanism explanation and then to a current modeled result sourced from the shared explainer metrics. That mechanism-to-result chain is exposed in a readable tooltip on hover and keyboard focus so users can understand causality without squeezing permanent fine print into the card. Each tooltip must choose an above-card or below-card placement from the available viewport space rather than being clipped at a viewport edge. The comparison table must state each position's job, modeled end value, annualized return, and worst peak-to-trough drop. The two gauges use accountant-derived outputs: near-par and maximum atomic ST capacity for liquidity, and the source-loss breakpoint before ST declines for protection. Import controls, editable sliders, full liquidity and loss curves, the detailed history, and the monthly table are available on demand. The shared E-CLP downside-band input keeps its plain-language range and tradeoff when the setup editor is open; changing it must flow through `buildDayMarketConfig` and the existing executable quote path. The optional secondary-liquidity curve defaults to an illustrative 0–100% arbitrage-assisted sequence and provides a focused atomic-sale view through the current pool boundary. The sequence may only repeat the existing accountant-derived quote curve under a disclosed full-recentering assumption; it may not imply guaranteed arbitrage timing, total fill, or realized price. Every opened data chart—the liquidity views, coverage waterfall, detailed history, and timeframe overview—must expose its values on hover and must provide equivalent tap, focus, and arrow-key inspection where the chart is custom-rendered. These are presentation rules only; the guided variant may not calculate or restate accountant math.

Registered market manifests populate the Explorer source selector. Individual market routes remain compatibility and review surfaces until the Explorer supports every authorized customization and those routes are deliberately migrated. A future migration may redirect them to `/day-sim?market=<market-id>`; do not remove generated routes as part of ordinary market creation.

The Explorer may offer an optional tutorial alongside free exploration. Its entry must be a compact, visually distinct “New to Royco?” button that is clear to new users without competing with the simulator's primary purpose. The full simulator must remain rendered and interactive while the tutorial is open; the tutorial may highlight and scroll to existing controls or outcomes, but it may not gate the page or replace the simulator. The tutorial must use the same live controls, shared runtime state, and accountant-derived explainer metrics as the full simulator. Its teaching sequence is position definitions, JT first-loss coverage, SLP liquidity and pool-band assumptions, then the corresponding modeled ST loss and sale-capacity outcomes. It must distinguish the actual Royco Day mechanism from modeled consequences, preserve the educational disclosure, and provide a direct exit to the full simulator. A tutorial component may present existing values and accept control changes, but it may not calculate coverage, liquidity, waterfall, return, or quote outputs independently.

### Internal learning-lab boundary

`/internal/day-lab` is a parallel, non-indexed learning experiment. It reuses the Explorer registry, import workflow, market defaults, shared runtime configuration, and accountant-derived result object. Its required reading order is source input, editable market assumptions, then model outputs. The learning renderer must label those categories explicitly, define SLP as Senior Liquidity Provider, and use a single LP workbench that places the primary editable terms beside the live SLP result. Visual explanations must show the market-wide SLP-to-ST capital relationship, the configured price band, the yield split, the disclosed SLP return drivers, and the sell/pool-move/arbitrage sequence without restating accountant formulas. The liquidity output must use a focused lane normalized to the current executable one-trade pool boundary, directly label the near-marked and boundary capacities, and show arbitrage as a possible reset before a later trade; it may not render the rest of a 0–100% position as empty or permanently blocked. Every fixed model assumption that materially drives the SLP result must remain visible, while advanced ST/JT controls and position results may be collapsed as supporting market context. The lab must link back to the canonical Explorer for the full hoverable curves and history.

The learning lab is not a public Day route, a market customization, or a replacement for `/day-sim`. It may not add market-local math, components, CSS, or manifest fields. Its learning renderer remains shared code under `components/day-simulator/`, and any change to it or its wiring requires the full template lock, verification, certification, and visual review. Publishing or promoting the experiment requires an intentional template decision after user approval; ordinary market creation must never route through it.

## Required intake

Do not start until all fields below are answered. Never infer an unanswered field.

- **Market name**
- **Route**
- **Underlying asset**
- **Display asset name** (the short label used in “___ base yield”)
- **Senior Tranche name/symbol**
- **Junior Tranche name/symbol**
- **Data source**
- **Is price NAV or total-return data?**
- **Are fees already included?**
- **Desired ST yield** (a range, as decimals in the manifest)
- **Desired JT yield** (a range, as decimals in the manifest)
- **Desired SLP yield** (optional guardrail range; both bounds are required when used)
- **Desired minimum coverage**
- **Anything that must differ from the standard template**

If the last answer is not “nothing,” restate the exact requested difference and obtain explicit authorization. Record the authorization and rationale in `market.json`. Use an existing supported customization when possible. If the requested capability is not supported, extend the shared customization schema once, with tests and full template certification; never create a market-local component or stylesheet.

## One permitted workflow

### 1. Create the market

The source can be a local CSV/TSV, a public CSV/JSON API URL, a Google Sheet URL, or a public HTML page containing a date/price table.

```bash
npm run day-sim:new -- <market-id> <source-file-or-url> <route>
```

An explicitly authorized forward-only market with no historical series may use the branch-scoped published-APY input:

```bash
npm run day-sim:new -- <market-id> <source-url> <route> --published-apy <decimal>
```

This mode records zero historical observations, derives the forward input from the supplied APY, and uses the shared accountant-backed forward-series adapter for runtime outputs. It must hide `backtest` through the authorized customization manifest unless the user has explicitly authorized the shared finite-facility forward test described below. Every forward-only market must disclose that no historical performance series is supplied.

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

Do not edit `market.ts`, `series.json`, the route, any market-local component, any stylesheet, or any accountant file. Standard markets keep the generated customization block unchanged:

```json
"customization": {
  "explicitlyAuthorized": false,
  "authorizationNote": "",
  "hiddenSections": [],
  "copyOverrides": {}
}
```

For an explicitly authorized presentation difference, use only supported manifest fields. For example, hiding Backtest for one market is:

```json
"customization": {
  "explicitlyAuthorized": true,
  "authorizationNote": "User explicitly authorized removing Backtest for the Blockhouse market.",
  "hiddenSections": ["backtest"],
  "copyOverrides": {}
}
```

Supported hidden sections are `senior-summary`, `roles`, `market-inputs`, `liquidity-and-coverage`, `observation-period`, `backtest`, `junior-funding`, and `disclosure`. Supported copy overrides are `heroTitle` and `heroDescription`. Unsupported keys fail verification.

An explicitly authorized reverse market may configure `customization.forwardTest` together with `customization.reverseMarket`. A forward test may use either the standard three-outcome set (`good`, `normal`, and `bad`) or a fixed-return two-outcome set (`expected` and `bad`) when the lender has no contractual participation in borrower upside. It requires a finite facility term, a payment delay, and either full recovery or an explicit terminal recovery amount. Capacity, issuer-funded/closed JT status, and ST support are declared under `reverseMarket`. The shared runtime accrues the configured published APY through maturity, holds value flat during a payment delay, and routes terminal recovery through the existing accountant and observation logic. When the generated anchor produces a zero-return calendar period, an authorized market may set `omitInitialZeroReturnPeriod` to omit only that anchor from the chart, brush, and monthly table while preserving it for accountant accrual and return calculations. The market manifest may contain only these assumptions—not derived prices, tranche formulas, waterfall math, or UI logic. In this mode the shared `backtest` section remains visible and is labeled Forward test.

Hidden defaults are still accountant inputs. Keep them explicit. Never guess a fee, curve endpoint, liquidity assumption, observation duration, refill rule, notional, or protocol parameter. Ask the user when a required value is missing.

### 3. Calibrate through the accountant

```bash
npm run day-sim:calibrate -- <market-id>
```

This searches the JT risk-premium and SLP liquidity-premium settings by repeatedly running `lib/day/engine`. It does not use an approximate yield formula. Review the report. If every configured ST, JT, and optional SLP target range passes, write the result with:

```bash
npm run day-sim:calibrate -- <market-id> --write
```

Never hand-calculate or rewrite tranche-yield, coverage, waterfall, observation, fee, NAV, YDM, SLP, or E-CLP formulas.

### 4. Verify and preview

```bash
npm run day-sim:verify -- <market-id>
npm run day-sim:preview -- <market-id>
```

Verification fails for incomplete intake, inaccurate provenance, malformed series, target misses, invalid contract parameters, market-local code/styles, a non-generated route, silent or unsupported customizations, or a one-byte unauthorized change to a locked shared template/accountant file. Authorized differences are listed in the verification report.

In the browser, compare the market with `/falconx-v3` at desktop, mobile, and high zoom. Market identity, asset-related text, source disclosure, dates/data, values, configured defaults, and the exact authorized presentation differences may vary. Everything else should match.

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

Market agents must never directly edit these locations for a one-off market:

- `components/day-simulator/`
- `components/simulator/SimulatorPageShell.tsx`
- `lib/day-simulator-template/`
- `lib/day/engine/`
- `app/globals.css`
- `scripts/day-simulator/`
- `scripts/day-simulator/template-lock.json`

The SHA-256 lock file makes that boundary machine-verifiable. It prevents a market agent from silently changing shared behavior. A maintainer may deliberately extend the shared customization schema after explicit authorization; that requires full repository tests, parity, lint, build, visual comparison against the approved reference, and regeneration of the lock.

## Accounting contract

All Day state transitions and outputs flow through `lib/day/engine`. Shared wiring in `lib/day-simulator-template/runtime.ts` is the only adapter allowed to build initial balances and accountant configuration. The UI, market files, calibration command, and verifier consume this shared adapter; none may duplicate its formulas.

The Solidity suite contains 52 Foundry-generated core accountant vectors and 22 pinned current-contract vectors. It covers SLP commitment/reinvestment (contract symbol LT), all four fee rates, ST liquidity-premium share minting, all six post-operation paths, coverage/liquidity gates, Protected Exit, one-wei rounding, and the mint-dilution clamp. Regenerate vectors only from the locked compiled contracts using the documented generator—never from TypeScript.

SLP stable-asset yield, trading-fee income, turnover, and execution-liquidity economics are variable off-chain model inputs. They are invariant-tested, but they are not fixed onchain economics.

## Locked presentation contract

The strict shell renders the approved executive page by default. It includes the same section order, plain-language role text, mechanism diagrams, expandable market-input bar, six sliders, three APY cards, a shared 0.25%–20% E-CLP downside-band control with near-par presets, focused atomic and illustrative 0–100% arbitrage-assisted liquidity views with executable-capacity outputs, fixed-scale coverage loss waterfall, full accountant-backed history chart, hover/tap/focus chart tooltips, observation/erasure/loss annotations, unified two-handle backtest scrubber with a hoverable overview, month-over-month table, refill control, and source disclosure as Pareto FalconX v3. The observation-period explainer is shown only when the supplied source history contains an observed drawdown. An authorized finite forward test reuses that same chart and scrubber, adding only shared scenario and capacity controls driven by the manifest.

Fonts, palette, borders, radii, shadows, card dimensions, spacing, breakpoints, chart geometry, label placement, and mobile/high-zoom behavior are shared code. A market route cannot pass a variant, class, or style override. Market folders cannot contain React or CSS. Supported market customizations flow through the manifest and shared component, so disabling a section does not alter or duplicate its accounting.

## Instructions for lower-cost agents

Use this literal checklist:

1. Read this file completely.
2. Confirm every intake field and any requested difference; ask instead of guessing.
3. Run `day-sim:new` once.
4. Edit only the generated `market.json`.
5. Run accountant calibration; do not write formulas.
6. For a requested difference, record the explicit authorization note and use only supported `customization` fields.
7. Run verification. Fix only market data/configuration/customization-manifest failures.
8. If verification reports an unsupported customization or locked template change, stop and escalate to a maintainer; do not create a one-off component or update the lock.
9. Inspect screenshots against `/falconx-v3`; confirm that every difference is either market data or explicitly authorized.
10. Run certification.
11. Wait for preview approval before any PR.

Cheap and fast models may load data, run calibration searches, generate reports, and inspect screenshots. They may never independently rewrite accounting formulas or recreate the design.
