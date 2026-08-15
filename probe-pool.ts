import { DAY_MARKETS } from "@/lib/day-markets/registry";
import { buildDayMarketConfig } from "@/lib/day-simulator-template/runtime";
import { dayPoolSeniorWeight } from "@/lib/day-simulator-template/capital-sizing";
import { poolSeniorWeightAtPeg } from "@/lib/day/engine/engine";

console.log("market                restingSenior%   seededSenior%   match");
for (const m of DAY_MARKETS) {
  const d: any = m.defaults;
  const cfg = buildDayMarketConfig(d, {
    coverage: d.coverage, minLiquidity: d.minLiquidity, eclpBandWidth: d.eclpBandWidth,
    observationDays: d.observationDays, riskYieldShare: 0.4, liquidityYieldShare: 0.1,
  } as never);
  const rest = poolSeniorWeightAtPeg(cfg) * 100;
  const seed = dayPoolSeniorWeight(cfg) * 100;
  console.log(
    m.id.padEnd(20), rest.toFixed(3).padStart(12), seed.toFixed(3).padStart(15),
    Math.abs(rest - seed) < 0.01 ? "    yes" : "    NO",
  );
}
