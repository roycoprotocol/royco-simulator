import { Sim, steadyYear } from "@/lib/day/engine/runner";
import type { DaySimulatorDefaults } from "@/lib/day-simulator-template/market";
import {
  buildDayMarketConfig,
  DAY_TARGET_UTILIZATION,
} from "@/lib/day-simulator-template/runtime";
import {
  dayV3CapitalAtTarget,
  normalizeDayV3Defaults,
  type DayV3RelativeCapital,
} from "@/lib/day-v3/normalization";
import type { DayV3DesignField } from "@/lib/day-v3/types";
import { DAY_V3_SENIOR_BASIS } from "@/lib/day-v3/types";

export type DayV3CoverageRecommendationStatus =
  "recommended" | "infeasible" | "invalid-input";

export interface DayV3CoverageRecommendationInput {
  protectedDrawdownPct: number;
  /** Omit while the exit promise is unresolved; V3 will not invent it. */
  minimumLiquidityPct?: number;
  /** Deployment precision for the recommendation. Defaults to one basis point. */
  coverageResolutionBps?: number;
}

/**
 * Accountant-backed single-point evaluation used by the recommendation search
 * and its minimality regression. It exposes no duplicated coverage formula.
 */
export function dayV3CoverageKeepsSeniorWhole(
  defaults: DaySimulatorDefaults,
  input: {
    protectedDrawdownPct: number;
    coveragePct: number;
    minimumLiquidityPct?: number;
  },
): boolean {
  if (
    !Number.isFinite(input.protectedDrawdownPct) ||
    input.protectedDrawdownPct < 0 ||
    input.protectedDrawdownPct > 95 ||
    !Number.isFinite(input.coveragePct) ||
    input.coveragePct < 0 ||
    input.coveragePct >= DAY_TARGET_UTILIZATION * 100
  ) {
    return false;
  }
  try {
    return evaluateCoverage(
      defaults,
      Math.round(input.coveragePct * 100),
      input.protectedDrawdownPct,
      input.minimumLiquidityPct,
    ).passes;
  } catch {
    return false;
  }
}

export interface DayV3CoverageRecommendation {
  status: DayV3CoverageRecommendationStatus;
  seniorBasis: typeof DAY_V3_SENIOR_BASIS;
  coverage: DayV3DesignField<number>;
  capital: {
    seniorPer100: number;
    juniorPer100: number;
    slpPer100: number | null;
    targetUtilization: number;
  } | null;
  stress: {
    protectedDrawdownPct: number;
    seniorValueBefore: number | null;
    seniorValueAfter: number | null;
    seniorLossPer100: number | null;
    keepsSeniorWhole: boolean;
  };
  projectedApy: {
    senior: number | null;
    junior: number | null;
    slp: number | null;
  };
  reason: string;
}

type Evaluation = {
  passes: boolean;
  capital: DayV3RelativeCapital;
  before: number;
  after: number;
  projectedApy: DayV3CoverageRecommendation["projectedApy"];
};

function unresolvedCoverage(
  protectedDrawdownPct: number,
  status: Exclude<DayV3CoverageRecommendationStatus, "recommended">,
  reason: string,
): DayV3CoverageRecommendation {
  return {
    status,
    seniorBasis: DAY_V3_SENIOR_BASIS,
    coverage: {
      id: "minimum-coverage",
      value: null,
      unit: "%",
      origin: "unresolved",
      deployPath: "accountantParams.minCoverageWAD",
      modelUsage: "fully-modeled",
      evidence: [reason],
    },
    capital: null,
    stress: {
      protectedDrawdownPct,
      seniorValueBefore: null,
      seniorValueAfter: null,
      seniorLossPer100: null,
      keepsSeniorWhole: false,
    },
    projectedApy: { senior: null, junior: null, slp: null },
    reason,
  };
}

function evaluateCoverage(
  defaults: DaySimulatorDefaults,
  coverageBps: number,
  protectedDrawdownPct: number,
  minimumLiquidityPct: number | undefined,
): Evaluation {
  const coveragePct = coverageBps / 100;
  const modeledLiquidityPct = minimumLiquidityPct ?? 0;
  const normalized = normalizeDayV3Defaults(defaults);
  const capital = dayV3CapitalAtTarget(normalized, {
    coveragePct,
    minimumLiquidityPct: modeledLiquidityPct,
  });
  const cfg = buildDayMarketConfig(normalized, {
    coverage: coveragePct / 100,
    minLiquidity: modeledLiquidityPct / 100,
    eclpBandWidth: normalized.eclpBandWidth,
    // Recovery time is deliberately not part of this solve. The zero-time
    // shock asks only whether Junior absorbs the selected depth immediately.
    observationDays: 0,
    riskYieldShare: coveragePct > 0 ? normalized.riskYDM.yTarget : 0,
    liquidityYieldShare:
      modeledLiquidityPct > 0 ? normalized.liqYDM.yTarget : 0,
  });
  const sim = new Sim(cfg, {
    st: capital.seniorPer100,
    jt: capital.juniorPer100,
    lt: capital.slpPer100,
  });
  const before = sim.last().stEffectiveNAV;
  sim.step({
    dtSec: 0,
    stReturn: -protectedDrawdownPct / 100,
    jtReturn: -protectedDrawdownPct / 100,
  });
  const after = sim.last().stEffectiveNAV;

  const projection = new Sim(cfg, {
    st: capital.seniorPer100,
    jt: capital.juniorPer100,
    lt: capital.slpPer100,
  });
  const opening = projection.last();
  for (const step of steadyYear(normalized.sourceApy, 1, cfg.stableYield)) {
    projection.step(step);
  }
  const ending = projection.last();
  const apy = (end: number, start: number, funded: boolean): number | null =>
    funded && start > 0 ? end / start - 1 : null;

  return {
    passes: after + 1e-9 >= before,
    capital,
    before,
    after,
    projectedApy: {
      senior: apy(ending.stPrice, opening.stPrice, true),
      junior: apy(ending.jtPrice, opening.jtPrice, capital.juniorPer100 > 0),
      slp: apy(ending.ltPrice, opening.ltPrice, capital.slpPer100 > 0),
    },
  };
}

/**
 * Find the smallest basis-point coverage setting whose exact accountant run
 * leaves Senior whole after the issuer's selected instantaneous source stress.
 */
export function recommendDayV3Coverage(
  defaults: DaySimulatorDefaults,
  input: DayV3CoverageRecommendationInput,
): DayV3CoverageRecommendation {
  if (
    !Number.isFinite(input.protectedDrawdownPct) ||
    input.protectedDrawdownPct < 0 ||
    input.protectedDrawdownPct > 95
  ) {
    return unresolvedCoverage(
      input.protectedDrawdownPct,
      "invalid-input",
      "Protected drawdown must be between 0% and 95%.",
    );
  }
  if (
    input.minimumLiquidityPct !== undefined &&
    (!Number.isFinite(input.minimumLiquidityPct) ||
      input.minimumLiquidityPct < 0 ||
      input.minimumLiquidityPct >= 100)
  ) {
    return unresolvedCoverage(
      input.protectedDrawdownPct,
      "invalid-input",
      "Minimum liquidity must be between 0% and less than 100%.",
    );
  }
  const resolution = input.coverageResolutionBps ?? 1;
  if (!Number.isInteger(resolution) || resolution < 1 || resolution > 100) {
    return unresolvedCoverage(
      input.protectedDrawdownPct,
      "invalid-input",
      "Coverage resolution must be a whole number from 1 to 100 basis points.",
    );
  }

  // Coverage includes co-invested Junior in its exposure. At the locked 90%
  // operating target, a finite opening stack therefore requires coverage to
  // remain strictly below 90%.
  const maxCoverageBps = Math.floor(DAY_TARGET_UTILIZATION * 10_000) - 1;
  const maxStep = Math.floor(maxCoverageBps / resolution);
  let highEvaluation: Evaluation;
  try {
    highEvaluation = evaluateCoverage(
      defaults,
      maxStep * resolution,
      input.protectedDrawdownPct,
      input.minimumLiquidityPct,
    );
  } catch (error) {
    return unresolvedCoverage(
      input.protectedDrawdownPct,
      "infeasible",
      error instanceof Error
        ? error.message
        : "The accountant could not size this stress.",
    );
  }
  if (!highEvaluation.passes) {
    return unresolvedCoverage(
      input.protectedDrawdownPct,
      "infeasible",
      "The requested drawdown cannot be fully protected at the 90% operating target.",
    );
  }

  let lowStep = 0;
  let highStep = maxStep;
  while (lowStep < highStep) {
    const midStep = Math.floor((lowStep + highStep) / 2);
    const evaluation = evaluateCoverage(
      defaults,
      midStep * resolution,
      input.protectedDrawdownPct,
      input.minimumLiquidityPct,
    );
    if (evaluation.passes) highStep = midStep;
    else lowStep = midStep + 1;
  }
  const coverageBps = highStep * resolution;
  const evaluation =
    coverageBps === maxStep * resolution
      ? highEvaluation
      : evaluateCoverage(
          defaults,
          coverageBps,
          input.protectedDrawdownPct,
          input.minimumLiquidityPct,
        );
  const coveragePct = coverageBps / 100;
  const capital = {
    ...evaluation.capital,
    slpPer100:
      input.minimumLiquidityPct === undefined
        ? null
        : evaluation.capital.slpPer100,
  };
  const seniorLoss = Math.max(0, evaluation.before - evaluation.after);
  return {
    status: "recommended",
    seniorBasis: DAY_V3_SENIOR_BASIS,
    coverage: {
      id: "minimum-coverage",
      value: coveragePct,
      unit: "%",
      origin: "recommended",
      deployPath: "accountantParams.minCoverageWAD",
      modelUsage: "fully-modeled",
      evidence: [
        `Smallest ${resolution} bp setting that kept Senior whole in the shared accountant stress run.`,
        `Tested an instantaneous ${input.protectedDrawdownPct}% source drawdown at the 90% operating target.`,
      ],
    },
    capital,
    stress: {
      protectedDrawdownPct: input.protectedDrawdownPct,
      seniorValueBefore: evaluation.before,
      seniorValueAfter: evaluation.after,
      seniorLossPer100: seniorLoss,
      keepsSeniorWhole: evaluation.passes,
    },
    projectedApy: evaluation.projectedApy,
    reason:
      "The exact shared accountant kept Senior whole at this setting and not at the preceding deployable step.",
  };
}
