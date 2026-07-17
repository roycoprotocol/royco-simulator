import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { runBacktest } from '../../lib/try/backtest';
import { buildSimulatorConfig, screenMarketPresets, type SimulatorMarket } from '../../lib/simulator-template/market';

async function main() {
  const id = process.argv[2];
  if (!id) throw new Error('Usage: tsx scripts/simulator/verify-runtime.ts <market-id>');
  const moduleUrl = pathToFileURL(path.resolve('lib', 'markets', id, 'market.ts')).href;
  const imported = (await import(moduleUrl)) as { MARKET: SimulatorMarket };
  const market = imported.MARKET;

  for (const maintainJuniorCoverage of [true, false]) {
    const result = runBacktest({
      config: buildSimulatorConfig(market.defaultParams),
      depositST: market.defaultParams.depositST,
      depositJT: market.defaultParams.depositJT,
      series: market.series,
      maintainJuniorCoverage,
    });
    if (!result.steps.length) throw new Error(`${id}: backtest returned no steps`);
    if ([result.seniorAvgYr, result.juniorAvgYr, result.strategyAvgYr].some((value) => !Number.isFinite(value))) {
      throw new Error(`${id}: non-finite backtest metric`);
    }
  }

  const screens = screenMarketPresets(market);
  if (screens.length !== 3) throw new Error(`${id}: expected three preset screens`);
  const juniorYields = screens.map((screen) => screen.juniorAvgYr);
  if (!(juniorYields[0] <= juniorYields[1] && juniorYields[1] <= juniorYields[2])) {
    throw new Error(`${id}: Junior yield must rise from Conservative to Aggressive`);
  }
  console.log(`${id}: runtime PASS`);
  for (const screen of screens) {
    console.log(`  ${screen.label}: Senior ${screen.seniorAvgYr.toFixed(4)}, Junior ${screen.juniorAvgYr.toFixed(4)}, guardrail ${screen.pass ? 'PASS' : 'FAIL'}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
