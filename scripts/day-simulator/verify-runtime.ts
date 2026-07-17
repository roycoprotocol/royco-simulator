import { Sim, defaultConfig, steadyYear } from "../../lib/day/engine/runner";
import { DAY_TEMPLATE_MANIFEST } from "../../lib/day-simulator-template/manifest";

const cfg = defaultConfig(DAY_TEMPLATE_MANIFEST.defaults);
const sim = new Sim(cfg, { st: 40_000_000, jt: 10_000_000, lt: 6_000_000 });
steadyYear(0.12, 1, cfg.stableYield).forEach((step) => sim.step(step));

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
