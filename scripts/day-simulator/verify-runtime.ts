import { Sim, defaultConfig, steadyYear } from "../../lib/day/engine/runner";
import { DAY_TEMPLATE_MANIFEST } from "../../lib/day-simulator-template/manifest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DayMarketManifest } from "../../lib/day-simulator-template/market";

async function main() {
  const marketId = process.argv[2];
  let market: DayMarketManifest | undefined;
  if (marketId) {
    market = JSON.parse(
      await readFile(path.join(process.cwd(), "lib", "day-markets", marketId, "market.json"), "utf8"),
    ) as DayMarketManifest;
  }

  const cfg = defaultConfig({
  ...DAY_TEMPLATE_MANIFEST.defaults,
  ...(market
    ? {
        coverage: market.defaults.coverage,
        minLiquidity: market.defaults.minLiquidity,
        liquidationUtilization: market.defaults.liquidationUtilization,
        riskYDM: market.defaults.riskYDM,
        liqYDM: market.defaults.liqYDM,
        stSelfLiquidationBonus: market.defaults.selfLiquidationBonus,
      }
    : {}),
  });
  const initial = market
  ? {
      st: market.defaults.initialST,
      jt: market.defaults.initialJT,
      lt: market.defaults.initialLT,
    }
  : { st: 40_000_000, jt: 10_000_000, lt: 6_000_000 };
  const sourceApy = market?.defaults.sourceApy ?? 0.12;
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
  if (cfg.premiumPriority !== "jtPriority") {
    throw new Error("Day template premium priority changed unexpectedly");
  }

  console.log("Day runtime defaults: PASS");
  console.log("Day NAV conservation: PASS");
  if (market) {
    console.log(`${market.id} minimum liquidity: ${(cfg.minLiquidity * 100).toFixed(0)}% PASS`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
