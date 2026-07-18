import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const marketId = process.argv[2];
const failures = [];
const requiredFiles = [
  "app/day-sim/page.tsx",
  "components/day-simulator/DayMarketSimulator.tsx",
  "components/day-simulator/DayTimeframeBrush.tsx",
  "components/day-simulator/DaySimulatorPageShell.tsx",
  "lib/day-simulator-template/locked-copy.ts",
  "lib/day-simulator-template/manifest.ts",
  "lib/day-simulator-template/erasure.ts",
  "lib/day-simulator-template/erasure.test.ts",
  "lib/day-simulator-template/explainer.ts",
  "lib/day-simulator-template/explainer.test.ts",
  "lib/day-simulator-template/series.ts",
  "lib/day/engine/engine.ts",
  "lib/day/engine/runner.ts",
  "lib/day/engine/engine.test.ts",
];

for (const relativePath of requiredFiles) {
  try {
    await access(path.join(root, relativePath));
  } catch {
    failures.push(`missing required file: ${relativePath}`);
  }
}

const route = await readFile(path.join(root, "app/day-sim/page.tsx"), "utf8");
if (!route.includes("DaySimulatorPageShell")) {
  failures.push("public Day route must use the shared Day page shell");
}

const shell = await readFile(
  path.join(root, "components/day-simulator/DaySimulatorPageShell.tsx"),
  "utf8",
);
if (!shell.includes("SimulatorPageShell")) {
  failures.push("Day page shell must use the Dawn/Tenbin SimulatorPageShell");
}
if (!shell.includes("DayMarketSimulator")) {
  failures.push("Day page shell must render the Tenbin-styled Day market simulator");
}

const simulator = await readFile(
  path.join(root, "components/day-simulator/DayMarketSimulator.tsx"),
  "utf8",
);
const dayLockedCopy = await readFile(
  path.join(root, "lib/day-simulator-template/locked-copy.ts"),
  "utf8",
);
const seriesCalibration = await readFile(
  path.join(root, "lib/day-simulator-template/series.ts"),
  "utf8",
);
const erasureAdapter = await readFile(
  path.join(root, "lib/day-simulator-template/erasure.ts"),
  "utf8",
);
const explainerAdapter = await readFile(
  path.join(root, "lib/day-simulator-template/explainer.ts"),
  "utf8",
);
const timeframeBrush = await readFile(
  path.join(root, "components/day-simulator/DayTimeframeBrush.tsx"),
  "utf8",
);
for (const contract of [
  "pageBg: '#FBFAF7'",
  "cardBg: '#FFFDF9'",
  "border: '#E8E2D8'",
  "text: '#171511'",
  "eyebrow: '#967756'",
  "seniorLine: '#8E7355'",
  "juniorLine: '#1B1A17'",
  'const SERIF = "Georgia, \'Times New Roman\', serif"',
  'const MONO = \'"SFMono-Regular", Consolas, monospace\'',
]) {
  if (!simulator.includes(contract)) failures.push(`Day simulator violates Dawn/Tenbin design token: ${contract}`);
}
for (const lockedCopyReference of [
  'LOCKED_COPY.reviewTitle',
  'LOCKED_COPY.reviewDescription',
  'DAY_LOCKED_COPY.liquidityBenefit',
  'DAY_LOCKED_COPY.coverageBenefit',
]) {
  if (!simulator.includes(lockedCopyReference)) failures.push(`Day simulator missing locked Dawn copy reference: ${lockedCopyReference}`);
}
for (const benefitCopy of [
  'Many yield opportunities are illiquid by design. Despite that, the LP design now allows ST to buy/sell their positions through a dedicated liquidity layer.',
  'Every ST position has a minimum JT buffer defined in the protocol’s contracts. This gives risk committees a concrete, verifiable loss-absorption layer.',
]) {
  if (!dayLockedCopy.includes(benefitCopy)) failures.push(`Day benefit copy is missing or changed: ${benefitCopy}`);
}
for (const layoutContract of [
  'className="flex flex-col" style={{ gap: 10 }}',
  'className="mt-3 max-w-3xl"',
  '<Eyebrow>How Day works</Eyebrow>',
  '<Eyebrow>Market inputs</Eyebrow>',
  "const [showInputs, setShowInputs] = useState(false)",
  "aria-label={showInputs ? 'Collapse market inputs' : 'Expand market inputs'}",
  'aria-expanded={showInputs}',
  'className="mt-3 grid grid-cols-1 md:grid-cols-2"',
  '<Eyebrow>APYs</Eyebrow>',
  '<Eyebrow>Liquidity</Eyebrow>',
  '<Eyebrow>Coverage</Eyebrow>',
  '<Eyebrow>Backtest</Eyebrow>',
  'className="mt-3 grid grid-cols-1 md:grid-cols-3"',
  'className="grid grid-cols-1 md:grid-cols-2"',
  'className="flex items-start justify-between gap-4"',
  'aria-label={showReview ? \'Collapse\' : \'Expand\'}',
  'className="pb-8 border-t pt-4"',
]) {
  if (!simulator.includes(layoutContract)) failures.push(`Day simulator missing Dawn element/layout contract: ${layoutContract}`);
}
for (const control of [
  'Base strategy APY (%)',
  'tone={C.muted}',
  'labelColor={C.muted}',
  'background: `${C.strategyLine}14`',
  'Minimum coverage (%)',
  'Minimum liquidity (%)',
  'Junior yield share (%)',
  'LP yield share (%)',
  'Observation period duration (days)',
  'Refill Junior after losses',
]) {
  if (!simulator.includes(control)) failures.push(`Day simulator missing compact public control: ${control}`);
}
for (const output of [
  'Senior avg/yr',
  'Junior avg/yr',
  'LP avg/yr',
  'Month-over-month return',
  'label="Base strategy"',
  'label="Senior return"',
  'label="Junior return"',
  'label="LP return"',
  'result.monthly',
  'function ReturnRow',
  '<Eyebrow>Junior funding</Eyebrow>',
  'LP share price',
  '<Eyebrow>How Day works</Eyebrow>',
  '<Eyebrow>Liquidity</Eyebrow>',
  '<Eyebrow>Coverage</Eyebrow>',
  'function LiquidityExecutionDiagram',
  'function CoverageLossDiagram',
  'buildDayExplainerMetrics(result.cfg, result.initial)',
  'Atomic Senior exit',
  'Execution value',
  'Underlying redemption value',
  'Risk premium',
  'Liquidity premium',
  'Arbitrage incentive grows',
  'Senior $ balance',
  'Base strategy loss',
]) {
  if (!simulator.includes(output)) failures.push(`Day simulator missing compact public output: ${output}`);
}
const kpiCount = simulator.match(/<Kpi label=/g)?.length ?? 0;
if (kpiCount !== 3) {
  failures.push(`Day APY panel must contain exactly three tranche KPI cards; found ${kpiCount}`);
}
for (const hiddenControl of [
  'Senior deposit ($)',
  'Junior buffer remaining for Senior exit (%)',
  'Advanced override',
  'Junior deposit ($)',
  'Assume Junior is replenished to hold the buffer',
  'Additional outcome metrics',
  'Calendar-year return / observation stats',
  'Base strategy return',
  'Key modeling assumption',
  'Deploy handoff',
  'LOCKED_COPY.deploy',
  'LOCKED_COPY.overview',
  'LOCKED_COPY.customize',
  'showAdvanced',
  'RequirementMeter',
  'MarketInput',
  'Copy link',
  'Assume Junior is replenished to hold the buffer',
  '<Eyebrow>Scenario</Eyebrow>',
  'activePreset',
  'applyPreset',
  'Three tranche returns.',
  'Atomic sell size and slippage.',
  'Senior balance across strategy losses.',
]) {
  if (simulator.includes(hiddenControl)) failures.push(`Day simulator exposes backend-only or removed output: ${hiddenControl}`);
}
for (const invariant of [
  'calibrateSeriesApy(activeMarket.series, sourceApyPct / 100)',
  'fixedTermDurationSec: observationDays * DAY',
  'liquidationUtilization: 100 / Math.max(exitBufferPct, 0.01)',
  'const linkJuniorToFirstLoss = defaults.linkJuniorToFirstLoss',
  'const [maintainCoverage, setMaintainCoverage] = useState(defaults.maintainCoverage)',
  'stSelfLiquidationBonus: defaults.selfLiquidationBonus',
  "op: { type: 'jtDeposit', amount: refill }",
  'previousSnapshot.state === MarketState.FIXED_TERM',
  'postReturn.state === MarketState.PERPETUAL',
  'MarketState.PERPETUAL',
  'MarketState.FIXED_TERM',
  '<ReferenceArea',
  'buildDayExplainerMetrics(result.cfg, result.initial)',
]) {
  if (!simulator.includes(invariant)) failures.push(`Day simulator missing Dawn behavior invariant: ${invariant}`);
}
for (const explainerContract of [
  'export const ARBITRAGE_REFERENCE_SLIPPAGE = 0.01',
  'function findSellAtSlippage',
  'function findPoolBoundary',
  'function findCoverageLossLimit',
  'function shockSeniorBalance',
  'stReturn: -loss, jtReturn: -loss',
  'opening.previewSecondarySell(boundaryQuote.filledNAV)',
  'const curve = Array.from({ length: 25 }',
  'opening.previewSecondarySell(sellNAV)',
]) {
  if (!explainerAdapter.includes(explainerContract)) {
    failures.push(`Day explainer diagram accounting contract missing: ${explainerContract}`);
  }
}
for (const calibrationContract of [
  'export function annualizedSeriesApy',
  'export function calibrateSeriesApy',
  'pathResidual + targetLogGrowth * progress',
]) {
  if (!seriesCalibration.includes(calibrationContract)) {
    failures.push(`Day base-strategy APY calibration contract missing: ${calibrationContract}`);
  }
}
for (const chartContract of [
  'function ChartTooltip',
  'function BandChip',
  'function EndValueTag',
  'function ErasureIBeam',
  'function SeniorLossMark',
  'function LegendSwatch',
  'Observation period: ${observationSplit',
  'Non-observation period:',
  'dateLabel(label)',
  'hoverObservationBand',
  'hoverNonObservationBand',
  'const xTicks = useMemo',
  'const anchorIndices = Array.from(new Set([0, ...yearMarkIndices, dates.length - 1]))',
  'const segmentIntervals = Array.from(',
  'ticks={xTicks}',
  'interval={0}',
  'setHoverDate(typeof state?.activeLabel',
  'fillOpacity={0.32}',
  'strokeDasharray="3 3"',
  "value: '$ per $100 deposited'",
  '<ReferenceLine y={100}',
  'strokeDasharray="4 5"',
  'height: 360, minHeight: 360',
  'What this is, and what it is not.',
  'erasureEvent?.amountNAV',
  'preRefillJuniorNAV',
  '(sim.state.jtShares * firstSnapshot.jtPrice) / 100',
  'buildDayErasureEvent({',
]) {
  if (!simulator.includes(chartContract)) failures.push(`Day simulator missing exact Dawn review/chart contract: ${chartContract}`);
}
for (const erasureContract of [
  'export function buildDayErasureEvent',
  'erasedAmount / input.navPerIndexPoint',
  'erasedAmount / input.preRefillJuniorNAV',
  'input.currentJuniorIndex + safeIndexPoints',
]) {
  if (!erasureAdapter.includes(erasureContract)) {
    failures.push(`Day erasure adapter missing exact Dawn geometry contract: ${erasureContract}`);
  }
}
if (simulator.includes('event.msg.match(/erased:')) {
  failures.push('Day erasure accounting data must not be parsed from formatted event text');
}
for (const observationContract of [
  'const observationPeriods: DayObservationPeriod[]',
  'const nonObservationPeriods: DayObservationPeriod[]',
  "event.kind === 'exit-fixed-term'",
  '/term expired/i',
  'targetDays: observationDays',
  'index >= period.aIndex && index <= period.bIndex',
]) {
  if (!simulator.includes(observationContract)) failures.push(`Day simulator missing observation hover/accounting contract: ${observationContract}`);
}
for (const forbiddenChartRegression of [
  'contentStyle={{ background: C.cardBg',
  'labelFormatter={(label)',
  'height: 340',
  'minTickGap={70}',
]) {
  if (simulator.includes(forbiddenChartRegression)) failures.push(`Day simulator reintroduced simplified chart behavior: ${forbiddenChartRegression}`);
}
for (const timeframeContract of [
  '<DayTimeframeBrush',
  'isFull={isFullRange(viewRange, maxIndex)}',
  'onChange={setRange}',
]) {
  if (!simulator.includes(timeframeContract)) failures.push(`Day simulator missing Dawn unified timeframe contract: ${timeframeContract}`);
}
for (const timeframeContract of [
  'Backtest window controls',
  'Full history overview for the backtest window',
  'Backtest window start,',
  'Backtest window end,',
  'moveHandle',
  'panRange',
]) {
  if (!timeframeBrush.includes(timeframeContract)) failures.push(`Day timeframe brush missing Dawn behavior: ${timeframeContract}`);
}
for (const forbiddenTimeframe of ['label="Start date"', 'label="End date"', '>Chart timeframe<']) {
  if (simulator.includes(forbiddenTimeframe)) failures.push(`Day simulator reintroduced split timeframe controls: ${forbiddenTimeframe}`);
}
for (const forbidden of ['var(--foundation)', 'var(--theme-background)', 'DaySimulatorSidebar']) {
  if (simulator.includes(forbidden) || shell.includes(forbidden)) {
    failures.push(`public Day simulator contains legacy dark-frontend dependency: ${forbidden}`);
  }
}

const manifest = await readFile(
  path.join(root, "lib/day-simulator-template/manifest.ts"),
  "utf8",
);
for (const contract of [
  'route: "/day-sim"',
  'accountant: "lib/day/engine"',
  'dataMode: "deterministic-scenarios"',
]) {
  if (!manifest.includes(contract)) failures.push(`manifest contract missing: ${contract}`);
}

if (marketId) {
  const marketDir = path.join(root, "lib", "day-markets", marketId);
  const marketPath = path.join(marketDir, "market.json");
  let market;
  try {
    market = JSON.parse(await readFile(marketPath, "utf8"));
  } catch {
    failures.push(`missing or invalid Day market manifest: lib/day-markets/${marketId}/market.json`);
  }

  if (market) {
    if (market.id !== marketId) failures.push("Day market id does not match its folder");
    if (market.route !== `/${marketId}-sim`) failures.push("Day market route must match /<market-id>-sim");
    if (!(market.defaults?.minLiquidity > 0 && market.defaults.minLiquidity < 1)) {
      failures.push("Day market LP ratio must be a fraction between 0 and 1");
    }
    if (!(market.defaults?.sourceApy > -1 && Number.isFinite(market.defaults.sourceApy))) {
      failures.push("Day market sourceApy must be finite and greater than -100%");
    }
    if (!(market.defaults?.observationDays >= 7 && market.defaults.observationDays <= 194)) {
      failures.push("Day market observationDays must preserve the Dawn 7–194 day range");
    }
    if (!(market.defaults?.exitBufferPct >= 1 && market.defaults.exitBufferPct <= 99.91)) {
      failures.push("Day market exitBufferPct must preserve the Dawn 1–99.91% range");
    }
    for (const feeField of ["stProtocolFee", "jtProtocolFee", "jtYieldShareProtocolFee", "ltYieldShareProtocolFee"]) {
      const value = market.defaults?.[feeField];
      if (!(Number.isFinite(value) && value >= 0 && value <= 1)) {
        failures.push(`Day market ${feeField} must be explicit and within [0,1]`);
      }
    }
    for (const modelField of ["stableYield", "swapFeeBps", "poolTurnoverPerYear", "eclpBandWidth"]) {
      if (!Number.isFinite(market.defaults?.[modelField])) {
        failures.push(`Day market ${modelField} must be explicit`);
      }
    }
    if (typeof market.defaults?.reinvestLiquidityPremium !== "boolean") {
      failures.push("Day market reinvestLiquidityPremium must be explicit");
    }
    if (market.defaults?.linkJuniorToFirstLoss !== true) {
      failures.push("Day market backend Junior sizing must be linked to coverage");
    }
    if (market.defaults?.maintainCoverage !== true) {
      failures.push("Day market backend must explicitly enable Junior coverage replenishment");
    }
    const genesisCoverageUtilization =
      (market.defaults.coverage * (market.defaults.initialST + market.defaults.initialJT)) /
      market.defaults.initialJT;
    if (Math.abs(genesisCoverageUtilization - 0.9) > 1e-9) {
      failures.push("Day market linked Junior sizing must land exactly at 90% Dawn coverage utilization");
    }
    if (Math.abs(market.defaults.liquidationUtilization - 100 / market.defaults.exitBufferPct) > 1e-9) {
      failures.push("Day market coverage-based exit utilization must derive from exitBufferPct");
    }
    if (market.presets !== undefined) {
      failures.push("Day market manifests must use one editable default configuration, not scenario presets");
    }
    if (marketId === "pareto-falconx") {
      if (Math.abs(market.defaults.minLiquidity - 0.15) > 1e-12) {
        failures.push("Pareto FalconX Day minimum LP ratio must remain 15%");
      }
      if (
        market.defaults.coverage !== 0.03 ||
        market.defaults.riskYDM?.yTarget !== 0.06 ||
        market.defaults.liqYDM?.yTarget !== 0.17 ||
        market.defaults.minLiquidity !== 0.15 ||
        market.defaults.observationDays !== 7 ||
        market.defaults.riskYDM?.y100 !== 0.18 ||
        market.defaults.exitBufferPct !== 1 ||
        market.defaults.selfLiquidationBonus !== 0.01
      ) {
        failures.push("Pareto FalconX editable defaults and backend terms must retain the approved Balanced values");
      }
    }
    for (const curveName of ["riskYDM", "liqYDM"]) {
      const curve = market.defaults?.[curveName];
      if (!curve || ![curve.y0, curve.yTarget, curve.y100].every(Number.isFinite)) {
        failures.push(`${curveName} must provide finite y0, yTarget, and y100 anchors`);
      } else if (!(curve.y0 <= curve.yTarget && curve.yTarget <= curve.y100)) {
        failures.push(`${curveName} anchors must be monotonic`);
      }
    }
    for (const anchor of ["y0", "yTarget", "y100"]) {
      const total = market.defaults?.riskYDM?.[anchor] + market.defaults?.liqYDM?.[anchor];
      if (!Number.isFinite(total) || total > 1) failures.push(`combined ${anchor} premium shares must not exceed 100%`);
    }
    if (market.targets) {
      const sourceApy = market.defaults.sourceApy;
      const coverage = market.defaults.coverage;
      const jtSize = coverage / (0.9 - coverage);
      const riskShare = market.defaults.riskYDM.yTarget;
      const liqShare = market.defaults.liqYDM.yTarget;
      const seniorApy = sourceApy * (1 - riskShare - liqShare);
      const juniorApy = sourceApy + (riskShare * sourceApy) / jtSize;
      if (seniorApy < market.targets.seniorApyMin || seniorApy > market.targets.seniorApyMax) {
        failures.push(`target Senior APY ${(seniorApy * 100).toFixed(2)}% is outside its market guardrail`);
      }
      if (juniorApy < market.targets.juniorApyMin || juniorApy > market.targets.juniorApyMax) {
        failures.push(`target Junior APY ${(juniorApy * 100).toFixed(2)}% is outside its market guardrail`);
      }
      console.log(`${marketId} target Senior APY: ${(seniorApy * 100).toFixed(2)}%`);
      console.log(`${marketId} target Junior APY: ${(juniorApy * 100).toFixed(2)}%`);
    }
    if (!/^https?:\/\//.test(market.provenance?.sourceUrl ?? "")) {
      failures.push("Day market sourceUrl must be a complete http(s) URL");
    }
    if (market.provenance?.seriesPath) {
      const sourceSeries = JSON.parse(
        await readFile(path.join(root, market.provenance.seriesPath), "utf8"),
      );
      const first = sourceSeries[0];
      const last = sourceSeries[sourceSeries.length - 1];
      if (sourceSeries.length !== market.provenance.observationCount) {
        failures.push("Day market observationCount does not match its source series");
      }
      if (first?.date !== market.provenance.firstDate || last?.date !== market.provenance.lastDate) {
        failures.push("Day market provenance dates do not match its source series");
      }
      const elapsedDays = (Date.parse(last?.date) - Date.parse(first?.date)) / 86_400_000;
      const derivedApy = Math.pow(last?.price / first?.price, 365 / elapsedDays) - 1;
      if (!Number.isFinite(derivedApy) || Math.abs(derivedApy - market.defaults.sourceApy) > 1e-12) {
        failures.push("Day market sourceApy does not match the annualized source NAV series");
      }
    }
    const marketFiles = await readdir(marketDir);
    if (marketFiles.some((file) => file.endsWith(".css") || file.endsWith(".tsx"))) {
      failures.push("Day market folders may not contain CSS or React components");
    }
  }

  const marketRoute = await readFile(path.join(root, "app", `${marketId}-sim`, "page.tsx"), "utf8");
  if (!marketRoute.includes("DaySimulatorPageShell")) {
    failures.push("Day market route must use the shared Day page shell");
  }
  if (
    marketRoute.includes("@/components/simulator/MarketSimulator") ||
    marketRoute.includes("@/components/simulator/SimulatorPageShell")
  ) {
    failures.push("Day market route must not use the Dawn simulator components");
  }
}

if (failures.length) {
  console.error("Day template verification: FAILED");
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}

const runtime = spawnSync(
  "npx",
  ["tsx", "scripts/day-simulator/verify-runtime.ts", ...(marketId ? [marketId] : [])],
  { cwd: root, stdio: "inherit" },
);
if (runtime.status !== 0) process.exit(runtime.status ?? 1);

console.log("Day configuration integrity: PASS");
console.log("Day locked copy: PASS");
console.log("Day design boundary: PASS");
if (marketId) console.log(`${marketId}: Day market configuration PASS`);
