import { defaultConfig } from '@/lib/day/engine/runner';
import {
  buildDayExplainerMetrics,
  DAY_COVERAGE_COMPARISON_MAX_LOSS,
} from './explainer';

let passed = 0;
let failed = 0;
const approx = (a: number, b: number, epsilon = 1e-6) => Math.abs(a - b) <= epsilon;
const check = (name: string, condition: boolean, detail = '') => {
  if (condition) {
    passed += 1;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed += 1;
    console.log(`  \x1b[31m✗\x1b[0m ${name} ${detail}`);
  }
};

console.log('\nDay explainer diagrams — accountant-backed geometry');

const cfg = defaultConfig({
  coverage: 0.03,
  beta: 1,
  minLiquidity: 0.15,
  eclpBandWidth: 0.1,
});
const initial = { st: 1000, jt: 34.48275862068966, lt: 166.66666666666666 };
const metrics = buildDayExplainerMetrics(cfg, initial);

check(
  'arbitrage reference row executes at 1% average slippage',
  approx(metrics.liquidity.referenceQuote.slippage, 0.01, 1e-9),
  `slippage=${metrics.liquidity.referenceQuote.slippage}`,
);
check(
  'pool-boundary row sells more Senior NAV than the 1% row',
  metrics.liquidity.boundarySellNAV > metrics.liquidity.referenceSellNAV,
);
check(
  'liquidity exit sizes are normalized to opening Senior NAV',
  approx(metrics.liquidity.referenceSellShareOfSenior, metrics.liquidity.referenceSellNAV / initial.st) &&
    approx(metrics.liquidity.boundarySellShareOfSenior, metrics.liquidity.boundarySellNAV / initial.st),
);
check(
  'pool-boundary row is a fully fillable atomic sale',
  metrics.liquidity.boundaryQuote.unfilledNAV < 1e-6 &&
    approx(metrics.liquidity.boundaryQuote.filledNAV, metrics.liquidity.boundarySellNAV, 1e-6),
);
check(
  'pool-boundary average slippage stays within the configured E-CLP band',
  metrics.liquidity.boundaryQuote.slippage <= cfg.eclpBandWidth + 1e-9,
);
check(
  'liquidity curve is sampled from executable quotes through the pool boundary',
  metrics.liquidity.curve.length === 26 &&
    approx(
      metrics.liquidity.curve[metrics.liquidity.curve.length - 1].sellNAV,
      metrics.liquidity.boundarySellNAV,
      1e-6,
    ),
);
check(
  'average execution price declines monotonically as atomic sale size grows',
  metrics.liquidity.curve.every(
    (point, index) =>
      index === 0 ||
      point.executionPrice <= metrics.liquidity.curve[index - 1].executionPrice + 1e-9,
  ),
);

const beforeBreakpoint = metrics.coverage.points
  .filter((point) => point.loss <= metrics.coverage.coverageLossLimit)
  .every((point) => point.seniorBalancePer100 >= 100 - 1e-8);
const afterBreakpoint = metrics.coverage.points
  .filter((point) => point.loss > metrics.coverage.coverageLossLimit + 1e-6)
  .some((point) => point.seniorBalancePer100 < 100 - 1e-6);
check('Senior balance is flat through the Junior-covered loss range', beforeBreakpoint);
check('Senior balance declines after the coverage breakpoint', afterBreakpoint);
check(
  'coverage curve is monotone non-increasing',
  metrics.coverage.points.every(
    (point, index) => index === 0 || point.seniorBalancePer100 <= metrics.coverage.points[index - 1].seniorBalancePer100 + 1e-9,
  ),
);

const liquidityComparisons = [0.1, 0.15, 0.2].map((minLiquidity) => {
  const comparisonConfig = defaultConfig({
    coverage: 0.03,
    beta: 1,
    minLiquidity,
    eclpBandWidth: 0.1,
  });
  const comparisonInitial = {
    st: 1000,
    jt: initial.jt,
    lt: (1000 * minLiquidity) / 0.9,
  };
  return buildDayExplainerMetrics(comparisonConfig, comparisonInitial);
});
check(
  'more minimum liquidity increases the displayed maximum atomic-exit percentage',
  liquidityComparisons.every(
    (comparison, index) => index === 0
      || comparison.liquidity.boundarySellShareOfSenior
        > liquidityComparisons[index - 1].liquidity.boundarySellShareOfSenior,
  ),
);

const bandComparisons = [0.1, 0.05, 0.03, 0.01].map((eclpBandWidth) => {
  const comparisonConfig = defaultConfig({
    coverage: 0.03,
    beta: 1,
    minLiquidity: 0.15,
    eclpBandWidth,
  });
  return buildDayExplainerMetrics(comparisonConfig, initial);
});
check(
  'tighter E-CLP bands increase the amount of Sr sellable at 1% slippage',
  bandComparisons.every(
    (comparison, index) => index === 0
      || comparison.liquidity.referenceSellShareOfSenior
        > bandComparisons[index - 1].liquidity.referenceSellShareOfSenior,
  ),
);

const nearParBandComparisons = [0.01, 0.005, 0.0025].map((eclpBandWidth) => {
  const comparisonConfig = defaultConfig({
    coverage: 0.03,
    beta: 1,
    minLiquidity: 0.15,
    eclpBandWidth,
  });
  return buildDayExplainerMetrics(comparisonConfig, initial);
});
check(
  'sub-1% E-CLP bands produce finite executable quotes',
  nearParBandComparisons.every((comparison) =>
    Number.isFinite(comparison.liquidity.referenceQuote.executionPrice)
      && Number.isFinite(comparison.liquidity.boundaryQuote.executionPrice)
      && comparison.liquidity.referenceSellNAV > 0
      && comparison.liquidity.boundarySellNAV > 0,
  ),
);
check(
  'sub-1% bands use the pool boundary when it arrives before 1% average slippage',
  nearParBandComparisons.every((comparison) =>
    approx(comparison.liquidity.referenceSellNAV, comparison.liquidity.boundarySellNAV, 1e-6)
      && comparison.liquidity.referenceQuote.slippage <= 0.01 + 1e-9,
  ),
);
check(
  'tighter E-CLP bands reduce average slippage at the pool boundary',
  bandComparisons.every(
    (comparison, index) => index === 0
      || comparison.liquidity.boundaryQuote.slippage
        < bandComparisons[index - 1].liquidity.boundaryQuote.slippage,
  ),
);

const coverageComparisons = [0.03, 0.06, 0.12].map((coverage) => {
  const comparisonConfig = defaultConfig({
    coverage,
    beta: 1,
    minLiquidity: 0.15,
    eclpBandWidth: 0.1,
  });
  const comparisonInitial = {
    st: 1000,
    jt: (1000 * coverage) / (0.9 - coverage),
    lt: initial.lt,
  };
  return buildDayExplainerMetrics(comparisonConfig, comparisonInitial);
});
check(
  'fixed coverage comparison axis stays constant across coverage settings',
  coverageComparisons.every(
    (comparison) => approx(
      comparison.coverage.displayMaxLoss,
      DAY_COVERAGE_COMPARISON_MAX_LOSS,
    ),
  ),
);
check(
  'more minimum coverage moves the Senior-loss breakpoint right on the fixed axis',
  coverageComparisons.every(
    (comparison, index) => index === 0
      || comparison.coverage.coverageLossLimit
        > coverageComparisons[index - 1].coverage.coverageLossLimit,
  ),
);

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
