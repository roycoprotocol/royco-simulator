import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

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
  "lib/day-simulator-template/market.ts",
  "lib/day-simulator-template/runtime.ts",
  "lib/day/engine/engine.ts",
  "lib/day/engine/runner.ts",
  "lib/day/engine/engine.test.ts",
  "scripts/day-simulator/create.mjs",
  "scripts/day-simulator/calibrate.ts",
  "scripts/day-simulator/factory.test.mjs",
  "scripts/day-simulator/template-lock.json",
];

for (const relativePath of requiredFiles) {
  try {
    await access(path.join(root, relativePath));
  } catch {
    failures.push(`missing required file: ${relativePath}`);
  }
}

const templateLock = JSON.parse(
  await readFile(path.join(root, "scripts/day-simulator/template-lock.json"), "utf8"),
);
for (const [relativePath, expectedHash] of Object.entries(templateLock)) {
  const contents = await readFile(path.join(root, relativePath));
  const actualHash = createHash("sha256").update(contents).digest("hex");
  if (actualHash !== expectedHash) {
    failures.push(`locked Day template changed: ${relativePath}; market agents may not modify shared design or accounting files`);
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
if (!shell.includes("StrictDaySimulatorPageShell")) {
  failures.push("Day page shell must export the strict executive template shell");
}

const simulator = await readFile(
  path.join(root, "components/day-simulator/DayMarketSimulator.tsx"),
  "utf8",
);
const marketTemplate = await readFile(
  path.join(root, "lib/day-simulator-template/market.ts"),
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
for (const geometryContract of [
  '<line x1={boundaryX} y1={boundaryY - 3} x2={boundaryX}',
  'const observationStartX = 72',
  'const observationEndX = 142',
  'const recoveryObservationEndX = 83',
  'const finalizationObservationEndX = 194',
  'width={observationEndX - observationStartX}',
  'width={recoveryObservationEndX - 5}',
  'width={finalizationObservationEndX - 116}',
  'points="5,15 28,18 49,34 72,23 83,15 95,10"',
  '<circle cx={finalizationObservationEndX} cy="34"',
  'const narrowSeniorZone = (metrics.displayMaxLoss - metrics.coverageLossLimit) / metrics.displayMaxLoss < 0.18',
  'const juniorZoneLabelPosition = placeCoverageLabel',
  'const seniorZoneLabelPosition = placeCoverageLabel',
  'const coveredBalanceLabelPosition = placeCoverageLabel',
  'segmentIntersectsRect(curvePixels[index - 1], point, rect)',
]) {
  if (!simulator.includes(geometryContract)) {
    failures.push(`Day simulator missing locked shared-diagram geometry: ${geometryContract}`);
  }
}
for (const observationBoundSeniorPolyline of [
  'points="5,18 48,15 205,15"',
  'points="5,18 48,16 72,15 142,15 174,13 205,11"',
]) {
  if (!simulator.includes(observationBoundSeniorPolyline)) {
    failures.push(`Day observation explainer must keep Senior flat only during the shaded observation window: ${observationBoundSeniorPolyline}`);
  }
}
for (const lockedCopyReference of [
  'LOCKED_COPY.reviewTitle',
  'LOCKED_COPY.reviewDescription',
  'DAY_LOCKED_COPY.liquidityBenefit',
  'DAY_LOCKED_COPY.coverageBenefit',
]) {
  if (!simulator.includes(lockedCopyReference)) failures.push(`Day simulator missing locked Dawn copy reference: ${lockedCopyReference}`);
}
for (const customizationContract of [
  "DAY_PRESENTATION_SECTION_IDS",
  "DAY_COPY_OVERRIDE_IDS",
  "vaultTabs",
  "validateDayMarketCustomization",
  "describeDayMarketCustomizations",
  "isDaySectionVisible",
]) {
  if (!marketTemplate.includes(customizationContract)) {
    failures.push(`Day market customization contract missing: ${customizationContract}`);
  }
}
for (const vaultTabWiring of [
  "market.customization.vaultTabs?.group",
  "candidate.customization.vaultTabs?.label",
  'role="tablist"',
  'role="tab"',
  "key={activeMarket.id}",
]) {
  if (!shell.includes(vaultTabWiring)) {
    failures.push(`Day strict shell missing vault-tab customization wiring: ${vaultTabWiring}`);
  }
}
for (const customizationWiring of [
  "activeMarket.customization.copyOverrides.heroTitle",
  "activeMarket.customization.copyOverrides.heroDescription",
  "isDaySectionVisible(activeMarket.customization, section)",
  "showSection('backtest')",
]) {
  if (!simulator.includes(customizationWiring)) {
    failures.push(`Day market customization wiring missing: ${customizationWiring}`);
  }
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
  'calibrateSeriesApy(simulationSeries, sourceApyPct / 100)',
  'buildDayInitialBalances(defaults, { coverage, minLiquidity })',
  'buildDayMarketConfig(defaults, {',
  'const [maintainCoverage, setMaintainCoverage] = useState(defaults.maintainCoverage)',
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
for (const strictExecutiveContract of [
  "variant === 'executive'",
  "'Make illiquid yield easier to own.'",
  "'Royco Day gives Senior holders first-loss coverage and a dedicated exit pool. Junior and LP participants earn additional yield for providing those benefits.'",
  '<Eyebrow>What Senior receives</Eyebrow>',
  '<Eyebrow>One opportunity · three roles</Eyebrow>',
  '<Eyebrow>Senior · yield and liquidity</Eyebrow>',
  '<Eyebrow>Junior · first-loss capital</Eyebrow>',
  '<Eyebrow>LP · dedicated liquidity</Eyebrow>',
  '<Eyebrow>Loss waterfall</Eyebrow>',
  "'This accountant-backed chart shows each position, every observation period, and any loss that becomes permanent.'",
  'generalizeObservation',
]) {
  if (!simulator.includes(strictExecutiveContract)) {
    failures.push(`strict Day business template contract missing: ${strictExecutiveContract}`);
  }
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
  'view={displayedViewRange}',
  'isFull={isFullRange(displayedViewRange, displayMaxIndex)}',
  'onChange={setDisplayedRange}',
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
  let marketText = "";
  try {
    marketText = await readFile(marketPath, "utf8");
    market = JSON.parse(marketText);
  } catch {
    failures.push(`missing or invalid Day market manifest: lib/day-markets/${marketId}/market.json`);
  }

  if (market) {
    if (/REPLACE_WITH_|\bunknown\b|null/i.test(marketText)) {
      failures.push("Day market intake is incomplete; placeholders, unknown values, and nulls are forbidden");
    }
    if (market.id !== marketId) failures.push("Day market id does not match its folder");
    if (!/^\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(market.route ?? "")) {
      failures.push("Day market route must be a lowercase absolute path");
    }
    if (market.copy !== undefined || market.presets !== undefined) {
      failures.push("Day markets may not override locked copy or add scenario presets");
    }
    for (const field of ["marketName", "displayAssetName", "underlyingAsset", "seniorName", "seniorSymbol", "juniorName", "juniorSymbol"]) {
      if (typeof market.identity?.[field] !== "string" || !market.identity[field].trim()) {
        failures.push(`Day market identity.${field} must be explicit`);
      }
    }
    if (market.certification?.intakeConfirmed !== true) {
      failures.push("Day market intake must be explicitly confirmed before certification");
    }
    if (market.certification?.templateExceptions !== undefined) {
      failures.push("legacy templateExceptions are unsupported; use the auditable customization manifest");
    }
    for (const field of ["seniorApyMin", "seniorApyMax", "juniorApyMin", "juniorApyMax"]) {
      if (!Number.isFinite(market.targets?.[field])) failures.push(`Day market targets.${field} must be explicit`);
    }
    const hasLiquidityTarget = market.targets?.liquidityApyMin !== undefined
      || market.targets?.liquidityApyMax !== undefined;
    if (hasLiquidityTarget) {
      for (const field of ["liquidityApyMin", "liquidityApyMax"]) {
        if (!Number.isFinite(market.targets?.[field])) failures.push(`Day market targets.${field} must be explicit when LP guardrails are configured`);
      }
    }
    if (market.targets?.seniorApyMin > market.targets?.seniorApyMax) failures.push("Senior APY target range is reversed");
    if (market.targets?.juniorApyMin > market.targets?.juniorApyMax) failures.push("Junior APY target range is reversed");
    if (market.targets?.liquidityApyMin > market.targets?.liquidityApyMax) failures.push("LP APY target range is reversed");
    if (!(market.defaults?.minLiquidity > 0 && market.defaults.minLiquidity < 1)) failures.push("Day market LP ratio must be a fraction between 0 and 1");
    if (!(market.defaults?.coverage > 0 && market.defaults.coverage < 0.9)) failures.push("Day market coverage must be a fraction between 0 and 90%");
    if (!(market.defaults?.sourceApy > -1 && Number.isFinite(market.defaults.sourceApy))) failures.push("Day market sourceApy must be finite and greater than -100%");
    if (!(market.defaults?.observationDays >= 7 && market.defaults.observationDays <= 194)) failures.push("Day market observationDays must preserve the 7–194 day range");
    if (!(market.defaults?.exitBufferPct >= 1 && market.defaults.exitBufferPct <= 99.91)) failures.push("Day market exitBufferPct must preserve the 1–99.91% range");
    for (const feeField of ["stProtocolFee", "jtProtocolFee", "jtYieldShareProtocolFee", "ltYieldShareProtocolFee"]) {
      const value = market.defaults?.[feeField];
      if (!(Number.isFinite(value) && value >= 0 && value <= 1)) failures.push(`Day market ${feeField} must be explicit and within [0,1]`);
    }
    for (const modelField of ["stableYield", "swapFeeBps", "poolTurnoverPerYear", "eclpBandWidth"]) {
      if (!Number.isFinite(market.defaults?.[modelField])) failures.push(`Day market ${modelField} must be explicit`);
    }
    if (typeof market.defaults?.reinvestLiquidityPremium !== "boolean") failures.push("Day market reinvestLiquidityPremium must be explicit");
    if (market.defaults?.linkJuniorToFirstLoss !== true) failures.push("Day market Junior sizing must remain linked to coverage");
    const closedIssuerJunior = market.customization?.reverseMarket?.juniorFunding === "issuer-funded"
      && market.customization?.reverseMarket?.juniorDeposits === "closed";
    if (market.defaults?.maintainCoverage !== true && !(closedIssuerJunior && market.defaults?.maintainCoverage === false)) {
      failures.push("Day market must enable Junior replenishment unless an authorized reverse market closes issuer-funded Junior deposits");
    }
    const expectedJT = (market.defaults?.initialST * market.defaults?.coverage) / (0.9 - market.defaults?.coverage);
    const expectedLT = (market.defaults?.initialST * market.defaults?.minLiquidity) / 0.9;
    if (Math.abs(market.defaults?.initialJT - expectedJT) > 1e-9) failures.push("Day market initial Junior balance must be accountant-sized at 90% utilization");
    if (Math.abs(market.defaults?.initialLT - expectedLT) > 1e-9) failures.push("Day market initial LP balance must be accountant-sized at 90% utilization");
    if (Math.abs(market.defaults?.liquidationUtilization - 100 / market.defaults?.exitBufferPct) > 1e-9) failures.push("Day market exit utilization must derive from exitBufferPct");
    for (const curveName of ["riskYDM", "liqYDM"]) {
      const curve = market.defaults?.[curveName];
      if (!curve || ![curve.y0, curve.yTarget, curve.y100].every(Number.isFinite)) failures.push(`${curveName} must provide finite y0, yTarget, and y100 anchors`);
      else if (!(curve.y0 <= curve.yTarget && curve.yTarget <= curve.y100)) failures.push(`${curveName} anchors must be monotonic`);
    }
    for (const anchor of ["y0", "yTarget", "y100"]) {
      const total = market.defaults?.riskYDM?.[anchor] + market.defaults?.liqYDM?.[anchor];
      if (!Number.isFinite(total) || total > 1) failures.push(`combined ${anchor} premium shares must not exceed 100%`);
    }
    for (const field of ["source", "sourceUrl", "sourceProvider", "seriesPath", "dataMode", "dataCadence", "priceType", "feesIncluded", "observationCount", "firstDate", "lastDate"]) {
      if (market.provenance?.[field] === undefined || market.provenance[field] === "") failures.push(`Day market provenance.${field} must be explicit`);
    }
    if (!/^https?:\/\//.test(market.provenance?.sourceUrl ?? "")) failures.push("Day market sourceUrl must be a complete http(s) URL");
    if (market.provenance?.supportingSources !== undefined) {
      if (!Array.isArray(market.provenance.supportingSources) || market.provenance.supportingSources.length === 0) {
        failures.push("Day market provenance.supportingSources must be a non-empty array when supplied");
      } else {
        for (const [index, source] of market.provenance.supportingSources.entries()) {
          if (typeof source?.label !== "string" || !source.label.trim()) failures.push(`Day supporting source ${index + 1} needs a label`);
          if (!/^https?:\/\//.test(source?.url ?? "")) failures.push(`Day supporting source ${index + 1} needs a complete http(s) URL`);
        }
      }
    }
    const expectedSeriesPath = `lib/day-markets/${marketId}/series.json`;
    if (market.provenance?.seriesPath !== expectedSeriesPath) failures.push(`Day market seriesPath must be ${expectedSeriesPath}`);
    if (market.provenance?.seriesPath) {
      const sourceSeries = JSON.parse(await readFile(path.join(root, market.provenance.seriesPath), "utf8"));
      const first = sourceSeries[0];
      const last = sourceSeries.at(-1);
      if (sourceSeries.length !== market.provenance.observationCount) failures.push("Day market observationCount does not match its series");
      const publishedApyForward = market.provenance.dataMode === "published-apy-forward";
      const historicalWithPublishedApy = market.provenance.dataMode === "historical-series-with-published-apy";
      if (publishedApyForward) {
        if (market.provenance.dataCadence !== "none") failures.push("published-apy-forward markets must use dataCadence none");
        if (market.provenance.priceType !== "published-apy") failures.push("published-apy-forward markets must use priceType published-apy");
        if (market.provenance.observationCount !== 0 || sourceSeries.length !== 0) failures.push("published-apy-forward markets may not claim historical observations");
        if (!Number.isFinite(market.provenance.publishedApy) || Math.abs(market.provenance.publishedApy - market.defaults.sourceApy) > 1e-12) failures.push("published APY must match defaults.sourceApy");
        if (market.customization?.forwardTest && market.customization?.hiddenSections?.includes("backtest")) failures.push("finite forward tests must remain visible in the shared backtest section");
      } else {
        if (market.provenance.dataMode !== "historical-series" && !historicalWithPublishedApy) failures.push("Day market dataMode must be historical-series, historical-series-with-published-apy, or published-apy-forward");
        if (first?.date !== market.provenance.firstDate || last?.date !== market.provenance.lastDate) failures.push("Day market provenance dates do not match its series");
        if (historicalWithPublishedApy) {
          if (market.provenance.priceType !== "nav" && market.provenance.priceType !== "total-return-index") failures.push("historical-series-with-published-apy markets must use NAV or total-return observations");
          if (!Number.isFinite(market.provenance.publishedApy) || Math.abs(market.provenance.publishedApy - market.defaults.sourceApy) > 1e-12) failures.push("published APY must match defaults.sourceApy");
        }
      }
      for (let index = 0; index < sourceSeries.length; index += 1) {
        const point = sourceSeries[index];
        if (!/^\d{4}-\d{2}-\d{2}$/.test(point?.date ?? "") || !(point?.price > 0)) failures.push(`invalid date/price at series row ${index + 1}`);
        if (index > 0 && point.date <= sourceSeries[index - 1].date) failures.push(`series dates are not strictly increasing at row ${index + 1}`);
      }
      if (market.provenance.dataMode === "historical-series") {
        const elapsedDays = (Date.parse(last?.date) - Date.parse(first?.date)) / 86_400_000;
        const derivedApy = Math.pow(last?.price / first?.price, 365 / elapsedDays) - 1;
        if (!Number.isFinite(derivedApy) || Math.abs(derivedApy - market.defaults.sourceApy) > 1e-12) failures.push("Day market sourceApy does not match its annualized source series");
      }
    }
    const marketFiles = (await readdir(marketDir)).sort();
    const allowedFiles = ["market.json", "market.ts", "series.json"];
    if (marketFiles.join("\n") !== allowedFiles.sort().join("\n")) failures.push("Day market folder must contain exactly market.json, market.ts, and series.json");
    const marketModule = await readFile(path.join(marketDir, "market.ts"), "utf8");
    for (const contract of ['import series from "./series.json"', "dayMarketFromManifest", "type DayMarketManifest"]) {
      if (!marketModule.includes(contract)) failures.push(`Day market module must use factory contract: ${contract}`);
    }
    if (marketModule.includes("defaultConfig") || marketModule.includes("function ") || marketModule.includes("<")) failures.push("Day market module may not contain accounting or UI logic");

    const routePath = path.join(root, "app", ...market.route.slice(1).split("/"), "page.tsx");
    let marketRoute = "";
    try {
      marketRoute = await readFile(routePath, "utf8");
    } catch {
      failures.push(`missing Day route: ${market.route}`);
    }
    if (!marketRoute.includes("StrictDaySimulatorPageShell") || !marketRoute.includes(`@/lib/day-markets/${marketId}/market`)) failures.push("Day route must be the generated strict shell wrapper");
    if (marketRoute.includes("variant=") || marketRoute.includes("style=") || marketRoute.includes("className=")) failures.push("Day route may not override the strict template design");

    if (marketId === "pareto-falconx" && (
      market.route !== "/falconx-v3" ||
      market.defaults.coverage !== 0.03 || market.defaults.minLiquidity !== 0.15 ||
      market.defaults.riskYDM?.yTarget !== 0.06 || market.defaults.liqYDM?.yTarget !== 0.17 ||
      market.defaults.observationDays !== 7 || market.defaults.riskYDM?.y100 !== 0.18 ||
      market.defaults.exitBufferPct !== 1 || market.defaults.selfLiquidationBonus !== 0.01
    )) failures.push("Pareto FalconX must retain the approved strict-template reference configuration");
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
