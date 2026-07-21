import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DayMarketManifest } from "../../lib/day-simulator-template/market";
import { runDayTargetScenario } from "../../lib/day-simulator-template/runtime";

async function main() {
  const marketId = process.argv[2];
  const write = process.argv.includes("--write");
  if (!marketId) {
    throw new Error("Usage: npm run day-sim:calibrate -- <market-id> [--write]");
  }

  const manifestPath = path.join(process.cwd(), "lib", "day-markets", marketId, "market.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as DayMarketManifest;
  const requiredTargetValues = [
    manifest.targets.seniorApyMin,
    manifest.targets.seniorApyMax,
    manifest.targets.juniorApyMin,
    manifest.targets.juniorApyMax,
  ];
  if (!requiredTargetValues.every(Number.isFinite)) {
    throw new Error("Fill all four desired Senior/Junior APY target bounds before calibration.");
  }
  const hasLiquidityTarget = manifest.targets.liquidityApyMin !== undefined
    || manifest.targets.liquidityApyMax !== undefined;
  if (
    hasLiquidityTarget
    && ![manifest.targets.liquidityApyMin, manifest.targets.liquidityApyMax].every(Number.isFinite)
  ) {
    throw new Error("Fill both LP APY target bounds when using an LP calibration guardrail.");
  }

const distanceToRange = (value: number, min: number, max: number) => {
  if (value < min) return (min - value) / Math.max(max - min, 0.005);
  if (value > max) return (value - max) / Math.max(max - min, 0.005);
  return 0;
};

type Candidate = {
  riskYieldShare: number;
  liquidityYieldShare: number;
  seniorApy: number;
  juniorApy: number;
  liquidityApy: number;
  score: number;
};

const evaluate = (riskYieldShare: number, liquidityYieldShare: number): Candidate => {
  const output = runDayTargetScenario(manifest.defaults, {
    riskYieldShare,
    liquidityYieldShare,
  });
  const targetPenalty =
    distanceToRange(output.seniorApy, manifest.targets.seniorApyMin, manifest.targets.seniorApyMax) ** 2
    + distanceToRange(output.juniorApy, manifest.targets.juniorApyMin, manifest.targets.juniorApyMax) ** 2
    + (hasLiquidityTarget
      ? distanceToRange(
        output.liquidityApy,
        manifest.targets.liquidityApyMin!,
        manifest.targets.liquidityApyMax!,
      ) ** 2
      : 0);
  const changePenalty =
    (riskYieldShare - manifest.defaults.riskYDM.yTarget) ** 2
    + (liquidityYieldShare - manifest.defaults.liqYDM.yTarget) ** 2;
  return { riskYieldShare, liquidityYieldShare, ...output, score: targetPenalty * 1_000 + changePenalty };
};

  let best: Candidate | undefined;
  const consider = (risk: number, liquidity: number) => {
  if (risk < 0 || liquidity < 0 || risk + liquidity > 1) return;
  if (risk > manifest.defaults.riskYDM.y100 || liquidity > manifest.defaults.liqYDM.y100) return;
  const candidate = evaluate(risk, liquidity);
  if (!best || candidate.score < best.score) best = candidate;
  };

  for (let risk = 0; risk <= manifest.defaults.riskYDM.y100 + 1e-12; risk += 0.005) {
  for (let liquidity = 0; liquidity <= manifest.defaults.liqYDM.y100 + 1e-12; liquidity += 0.005) {
    consider(Number(risk.toFixed(6)), Number(liquidity.toFixed(6)));
  }
  }
  if (!best) throw new Error("No valid Day calibration candidate was found.");

  const coarse = best;
  for (let risk = Math.max(0, coarse.riskYieldShare - 0.006); risk <= coarse.riskYieldShare + 0.006; risk += 0.001) {
  for (let liquidity = Math.max(0, coarse.liquidityYieldShare - 0.006); liquidity <= coarse.liquidityYieldShare + 0.006; liquidity += 0.001) {
    consider(Number(risk.toFixed(6)), Number(liquidity.toFixed(6)));
  }
  }

  if (!best) throw new Error("No valid Day calibration candidate was found.");
  const report = {
  marketId,
  accountant: "lib/day/engine",
  riskYieldShare: best.riskYieldShare,
  liquidityYieldShare: best.liquidityYieldShare,
  seniorApy: best.seniorApy,
  juniorApy: best.juniorApy,
  liquidityApy: best.liquidityApy,
  withinSeniorTarget: best.seniorApy >= manifest.targets.seniorApyMin && best.seniorApy <= manifest.targets.seniorApyMax,
  withinJuniorTarget: best.juniorApy >= manifest.targets.juniorApyMin && best.juniorApy <= manifest.targets.juniorApyMax,
  withinLiquidityTarget: hasLiquidityTarget
    ? best.liquidityApy >= manifest.targets.liquidityApyMin!
      && best.liquidityApy <= manifest.targets.liquidityApyMax!
    : null,
  };
  console.log(JSON.stringify(report, null, 2));

  if (write) {
    manifest.defaults.riskYDM.yTarget = best.riskYieldShare;
    manifest.defaults.riskYDM.y0 = Math.min(manifest.defaults.riskYDM.y0, best.riskYieldShare);
    manifest.defaults.liqYDM.yTarget = best.liquidityYieldShare;
    manifest.defaults.liqYDM.y0 = Math.min(manifest.defaults.liqYDM.y0, best.liquidityYieldShare);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Updated ${manifestPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
