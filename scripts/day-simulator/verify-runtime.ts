import { Sim, steadyYear } from "../../lib/day/engine/runner";
import { DAY_TEMPLATE_MANIFEST } from "../../lib/day-simulator-template/manifest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  describeDayMarketCustomizations,
  type DayMarketManifest,
  validateDayMarketCustomization,
} from "../../lib/day-simulator-template/market";
import {
  annualizedSeriesApy,
  calibrateSeriesApy,
} from "../../lib/day-simulator-template/series";
import {
  buildDayInitialBalances,
  buildDayMarketConfig,
  runDayTargetScenario,
} from "../../lib/day-simulator-template/runtime";

async function main() {
  const marketId = process.argv[2];
  let market: DayMarketManifest | undefined;
  if (marketId) {
    market = JSON.parse(
      await readFile(path.join(process.cwd(), "lib", "day-markets", marketId, "market.json"), "utf8"),
    ) as DayMarketManifest;
  }

  const runtimeDefaults = market?.defaults ?? {
    sourceApy: 0.12,
    coverage: DAY_TEMPLATE_MANIFEST.defaults.coverage,
    minLiquidity: DAY_TEMPLATE_MANIFEST.defaults.minLiquidity,
    liquidationUtilization: DAY_TEMPLATE_MANIFEST.defaults.liquidationUtilization,
    observationDays: 30,
    exitBufferPct: 66.67,
    linkJuniorToFirstLoss: true,
    maintainCoverage: true,
    riskYDM: { mode: "static" as const, y0: 0.25, yTarget: 0.35, y100: 0.55 },
    liqYDM: { mode: "static" as const, y0: 0.08, yTarget: 0.12, y100: 0.2 },
    selfLiquidationBonus: 0.02,
    stProtocolFee: 0,
    jtProtocolFee: 0,
    jtYieldShareProtocolFee: 0,
    ltYieldShareProtocolFee: 0,
    stableYield: 0.035,
    swapFeeBps: 10,
    poolTurnoverPerYear: 8,
    eclpBandWidth: 0.1,
    reinvestLiquidityPremium: true,
    initialST: 40_000_000,
    initialJT: 10_000_000,
    initialLT: 6_000_000,
  };
  const terms = {
    coverage: runtimeDefaults.coverage,
    minLiquidity: runtimeDefaults.minLiquidity,
    observationDays: runtimeDefaults.observationDays,
    riskYieldShare: runtimeDefaults.riskYDM.yTarget,
    liquidityYieldShare: runtimeDefaults.liqYDM.yTarget,
  };
  const cfg = buildDayMarketConfig(runtimeDefaults, terms);
  const initial = buildDayInitialBalances(runtimeDefaults, terms);
  const sourceApy = market?.defaults.sourceApy ?? 0.12;
  if (market?.provenance.dataMode === "published-apy-forward") {
    if (market.provenance.publishedApy !== sourceApy) {
      throw new Error("Published APY provenance must match defaults.sourceApy");
    }
  } else if (market?.provenance.seriesPath) {
    const sourceSeries = JSON.parse(
      await readFile(path.join(process.cwd(), market.provenance.seriesPath), "utf8"),
    );
    for (const targetApy of [0, sourceApy, 0.2]) {
      const calibrated = calibrateSeriesApy(sourceSeries, targetApy);
      const actualApy = annualizedSeriesApy(calibrated);
      if (Math.abs(actualApy - targetApy) > 1e-10) {
        throw new Error(
          `Day base-strategy calibration missed target ${(targetApy * 100).toFixed(2)}%: ${(actualApy * 100).toFixed(8)}%`,
        );
      }
    }
  }
  const sim = new Sim(cfg, initial);
  steadyYear(sourceApy, 1, cfg.stableYield).forEach((step) => sim.step(step));

  const final = sim.last();
  const numericOutputs = [
  final.stEffectiveNAV,
  final.jtEffectiveNAV,
  final.ltNAV,
  final.stPrice,
  final.jtPrice,
  final.ltPrice,
  final.utilization,
  final.liquidityUtilization,
  final.conservationResidual,
  ];

  if (numericOutputs.some((value) => !Number.isFinite(value))) {
    throw new Error("Day default scenario produced a non-finite output");
  }
  if (Math.abs(final.conservationResidual) >= 1e-3) {
    throw new Error(
      `Day default scenario violates NAV conservation: ${final.conservationResidual}`,
    );
  }
  if (cfg.targetUtilization !== 0.9 || cfg.liqTargetUtilization !== 0.9) {
    throw new Error("Day target utilizations must remain at the 90% template default");
  }
  if (cfg.maxJTYieldShare + cfg.maxLTYieldShare > 1) {
    throw new Error("Day maximum yield shares exceed the contract's 100% combined limit");
  }
  if (market && cfg.fixedTermDurationSec !== market.defaults.observationDays * 86_400) {
    throw new Error("Day observation period diverges from the market manifest");
  }
  if (market && cfg.liquidationUtilization !== 100 / market.defaults.exitBufferPct) {
    throw new Error("Day coverage-based exit threshold diverges from the Dawn exit-buffer rule");
  }
  if (market) {
    const customizationIssues = validateDayMarketCustomization(market.customization);
    if (customizationIssues.length) {
      throw new Error(`Invalid Day market customization: ${customizationIssues.join("; ")}`);
    }
    const target = runDayTargetScenario(market.defaults);
    if (
      target.seniorApy < market.targets.seniorApyMin
      || target.seniorApy > market.targets.seniorApyMax
    ) {
      throw new Error(
        `Day accountant Senior APY ${(target.seniorApy * 100).toFixed(2)}% is outside the configured target range`,
      );
    }
    if (
      target.juniorApy < market.targets.juniorApyMin
      || target.juniorApy > market.targets.juniorApyMax
    ) {
      throw new Error(
        `Day accountant Junior APY ${(target.juniorApy * 100).toFixed(2)}% is outside the configured target range`,
      );
    }
    console.log(`${market.id} accountant Senior APY: ${(target.seniorApy * 100).toFixed(2)}% PASS`);
    console.log(`${market.id} accountant Junior APY: ${(target.juniorApy * 100).toFixed(2)}% PASS`);
    const customizations = describeDayMarketCustomizations(market.customization);
    if (customizations.length) {
      console.log(`${market.id} authorized presentation changes: ${customizations.join(", ")} PASS`);
      console.log(`${market.id} authorization note: ${market.customization.authorizationNote}`);
    } else {
      console.log(`${market.id} presentation: STANDARD TEMPLATE PASS`);
    }
  }

  console.log("Day runtime defaults: PASS");
  console.log("Day base-strategy APY calibration: PASS");
  console.log("Day NAV conservation: PASS");
  if (market) {
    console.log(`${market.id} minimum LP ratio: ${(cfg.minLiquidity * 100).toFixed(0)}% PASS`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
