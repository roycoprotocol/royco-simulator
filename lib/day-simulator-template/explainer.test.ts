import { defaultConfig } from '@/lib/day/engine/runner';
import { buildDayExplainerMetrics } from './explainer';

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

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
