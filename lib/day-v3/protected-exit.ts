import { coverageUtilizationWad } from "@/lib/day/engine/engine";
import { Sim } from "@/lib/day/engine/runner";
import { MarketState } from "@/lib/day/engine/types";
import { WAD, fromWad, toWad } from "@/lib/day/engine/wad";
import {
  runDayHistoricalBacktest,
  type DayBacktestResult,
  type DayBacktestTerms,
} from "@/lib/day-simulator-template/backtest";
import { dayExitBufferPctFromAbsolute } from "@/lib/day-simulator-template/deploy-fields";
import type { DaySeriesPoint, DaySimulatorDefaults } from "@/lib/day-simulator-template/market";
import { buildDayMarketConfig } from "@/lib/day-simulator-template/runtime";
import { dayV3CapitalAtTarget, normalizeDayV3Defaults } from "@/lib/day-v3/normalization";
import {
  DAY_V3_MIN_RECOVERED_EPISODES,
  dayV3RecoveryEpisodesFromBacktest,
} from "@/lib/day-v3/recovery-history";
import type { DayV3DesignField } from "@/lib/day-v3/types";

const REFERENCE_EXIT_BUFFER_PCT = 1e-9;
const MAX_BONUS_PROBE = 1 - 1e-12;

export type DayV3ProtectedExitTriggerStatus =
  | "recommended"
  | "unresolved"
  | "invalid-input";

export interface DayV3ProtectedExitTriggerInput {
  defaults: DaySimulatorDefaults;
  series: DaySeriesPoint[];
  terms: Omit<DayBacktestTerms, "observationDays">;
  recoveryDays: number;
  triggerResolutionBps?: number;
}

export interface DayV3ProtectedExitTriggerRecommendation {
  status: DayV3ProtectedExitTriggerStatus;
  trigger: DayV3DesignField<number>;
  recoveredEpisodeCount: number;
  liquidationUtilization: number | null;
  recoveryDays: number;
  reason: string;
}

const unresolvedTrigger = (
  status: Exclude<DayV3ProtectedExitTriggerStatus, "recommended">,
  recoveryDays: number,
  reason: string,
  recoveredEpisodeCount = 0,
): DayV3ProtectedExitTriggerRecommendation => ({
  status,
  trigger: {
    id: "protected-exit-threshold",
    value: null,
    unit: "% coverage remaining",
    origin: "unresolved",
    deployPath: "accountantParams.coverageLiquidationUtilizationWAD",
    modelUsage: "fully-modeled",
    evidence: [reason],
  },
  recoveredEpisodeCount,
  liquidationUtilization: null,
  recoveryDays,
  reason,
});

function triggerBacktest(
  input: DayV3ProtectedExitTriggerInput,
  absoluteThresholdPct: number | null,
): DayBacktestResult {
  const coveragePct = input.terms.coveragePct;
  const normalized = normalizeDayV3Defaults(input.defaults);
  const exitBufferPct = absoluteThresholdPct === null
    ? REFERENCE_EXIT_BUFFER_PCT
    : dayExitBufferPctFromAbsolute(absoluteThresholdPct, coveragePct);
  return runDayHistoricalBacktest({
    defaults: { ...normalized, exitBufferPct },
    series: input.series,
    terms: { ...input.terms, observationDays: input.recoveryDays },
    maintainCoverage: false,
    omitInitialZeroReturnPeriod: false,
  });
}

function recoveredEpisodesSurvive(
  baseline: DayBacktestResult,
  candidate: DayBacktestResult,
): boolean {
  const recovered = dayV3RecoveryEpisodesFromBacktest(baseline).filter(
    (episode) => episode.recovered,
  );
  const candidateEpisodes = dayV3RecoveryEpisodesFromBacktest(candidate);
  return recovered.every((episode) => {
    if (candidate.chart[episode.aIndex]?.state !== MarketState.FIXED_TERM) return false;
    for (let index = episode.aIndex; index < episode.bIndex; index += 1) {
      if (candidate.chart[index]?.state !== MarketState.FIXED_TERM) return false;
    }
    return candidateEpisodes.some(
      (candidateEpisode) =>
        candidateEpisode.aIndex === episode.aIndex &&
        candidateEpisode.bIndex === episode.bIndex &&
        candidateEpisode.exitReason === "recovered",
    );
  });
}

/**
 * Recommend the earliest (highest remaining-coverage) trigger that preserves
 * every sufficiently evidenced recovery in an exact backtest rerun.
 */
export function recommendDayV3ProtectedExitTrigger(
  input: DayV3ProtectedExitTriggerInput,
): DayV3ProtectedExitTriggerRecommendation {
  const coveragePct = input.terms.coveragePct;
  if (!Number.isFinite(coveragePct) || coveragePct <= 0 || coveragePct >= 90) {
    return unresolvedTrigger(
      "invalid-input",
      input.recoveryDays,
      "Minimum Coverage must be above 0% and below the 90% operating target.",
    );
  }
  if (
    !Number.isInteger(input.recoveryDays) ||
    input.recoveryDays < 0 ||
    input.recoveryDays > 194
  ) {
    return unresolvedTrigger(
      "invalid-input",
      input.recoveryDays,
      "Recovery time must be a whole number from 0 to 194 days.",
    );
  }
  const resolution = input.triggerResolutionBps ?? 1;
  if (!Number.isInteger(resolution) || resolution < 1 || resolution > 100) {
    return unresolvedTrigger(
      "invalid-input",
      input.recoveryDays,
      "Trigger resolution must be a whole number from 1 to 100 basis points.",
    );
  }
  if (input.series.length < 2) {
    return unresolvedTrigger(
      "unresolved",
      input.recoveryDays,
      "Dated history is required before recommending a Protected Exit trigger.",
    );
  }

  const baseline = triggerBacktest(input, null);
  const recovered = dayV3RecoveryEpisodesFromBacktest(baseline).filter(
    (episode) => episode.recovered,
  );
  if (recovered.length < DAY_V3_MIN_RECOVERED_EPISODES) {
    return unresolvedTrigger(
      "unresolved",
      input.recoveryDays,
      `${recovered.length} recovered Observation Period${recovered.length === 1 ? "" : "s"} found; at least ${DAY_V3_MIN_RECOVERED_EPISODES} are required.`,
      recovered.length,
    );
  }

  // Threshold is absolute coverage remaining and must be strictly below the
  // Minimum Coverage Requirement. Search deployable basis-point steps only.
  const maximumBps = Math.ceil(coveragePct * 100) - 1;
  const maximumStep = Math.floor(maximumBps / resolution);
  if (maximumStep < 1) {
    return unresolvedTrigger(
      "unresolved",
      input.recoveryDays,
      "Coverage is too small to express a positive trigger at this precision.",
      recovered.length,
    );
  }
  const passes = (step: number) => recoveredEpisodesSurvive(
    baseline,
    triggerBacktest(input, (step * resolution) / 100),
  );
  if (!passes(1)) {
    return unresolvedTrigger(
      "unresolved",
      input.recoveryDays,
      "No positive deployable trigger preserves every evidenced recovery.",
      recovered.length,
    );
  }

  let low = 1;
  let high = maximumStep;
  let best = 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (passes(middle)) {
      best = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  const thresholdPct = (best * resolution) / 100;
  const selected = triggerBacktest(input, thresholdPct);
  return {
    status: "recommended",
    trigger: {
      id: "protected-exit-threshold",
      value: thresholdPct,
      unit: "% coverage remaining",
      origin: "recommended",
      deployPath: "accountantParams.coverageLiquidationUtilizationWAD",
      modelUsage: "fully-modeled",
      evidence: [
        `Highest ${resolution} bp threshold that preserved all ${recovered.length} accountant-confirmed recoveries inside ${input.recoveryDays} days.`,
        "Each candidate was rerun through the shared historical backtest with coverage restoration off.",
      ],
    },
    recoveredEpisodeCount: recovered.length,
    liquidationUtilization: selected.cfg.liquidationUtilization,
    recoveryDays: input.recoveryDays,
    reason: "The next higher deployable step would interrupt at least one evidenced recovery.",
  };
}

export type DayV3ProtectedExitBonusStatus = "ready" | "unresolved" | "invalid-input";

export interface DayV3ProtectedExitBonus {
  status: DayV3ProtectedExitBonusStatus;
  incentiveBudgetPer100Senior: number | null;
  bonus: DayV3DesignField<number>;
  reason: string;
}

/** Convert the issuer's per-100 incentive budget into the deployable rate. */
export function deriveDayV3ProtectedExitBonus(
  incentiveBudgetPer100Senior: number | null,
  protectedExitThresholdPct: number | null,
): DayV3ProtectedExitBonus {
  if (incentiveBudgetPer100Senior === null) {
    return {
      status: "ready",
      incentiveBudgetPer100Senior: null,
      bonus: {
        id: "protected-exit-bonus",
        value: 0,
        unit: "%",
        origin: "derived",
        deployPath: "stSelfLiquidationBonusWAD",
        modelUsage: "fully-modeled",
        evidence: ["No Junior-funded incentive budget was supplied, so the bonus is 0%."],
      },
      reason: "Protected Exit remains available without a bonus.",
    };
  }
  if (
    !Number.isFinite(incentiveBudgetPer100Senior) ||
    incentiveBudgetPer100Senior < 0 ||
    incentiveBudgetPer100Senior >= 100
  ) {
    return {
      status: "invalid-input",
      incentiveBudgetPer100Senior,
      bonus: {
        id: "protected-exit-bonus",
        value: null,
        unit: "%",
        origin: "unresolved",
        deployPath: "stSelfLiquidationBonusWAD",
        modelUsage: "fully-modeled",
        evidence: ["The incentive budget must be at least 0 and below 100 per 100 Senior."],
      },
      reason: "The incentive budget is outside deployment bounds.",
    };
  }
  if (
    incentiveBudgetPer100Senior > 0 &&
    (protectedExitThresholdPct === null || protectedExitThresholdPct <= 0)
  ) {
    return {
      status: "unresolved",
      incentiveBudgetPer100Senior,
      bonus: {
        id: "protected-exit-bonus",
        value: null,
        unit: "%",
        origin: "unresolved",
        deployPath: "stSelfLiquidationBonusWAD",
        modelUsage: "fully-modeled",
        evidence: ["Resolve the Protected Exit threshold before validating a positive bonus."],
      },
      reason: "A positive bonus depends on the trigger.",
    };
  }
  if (
    protectedExitThresholdPct !== null &&
    incentiveBudgetPer100Senior > protectedExitThresholdPct + 1e-12
  ) {
    return {
      status: "unresolved",
      incentiveBudgetPer100Senior,
      bonus: {
        id: "protected-exit-bonus",
        value: null,
        unit: "%",
        origin: "unresolved",
        deployPath: "stSelfLiquidationBonusWAD",
        modelUsage: "fully-modeled",
        evidence: [
          "The deployment flow requires the advertised bonus to be no greater than the Protected Exit threshold.",
        ],
      },
      reason: "Reduce the incentive budget or choose a different trigger.",
    };
  }
  return {
    status: "ready",
    incentiveBudgetPer100Senior,
    bonus: {
      id: "protected-exit-bonus",
      // On a 100-Senior basis, an amount per 100 is numerically the percent rate.
      value: incentiveBudgetPer100Senior,
      unit: "%",
      origin: "issuer-goal",
      deployPath: "stSelfLiquidationBonusWAD",
      modelUsage: "fully-modeled",
      evidence: [
        `${incentiveBudgetPer100Senior} of Junior budget per 100 Senior maps to a ${incentiveBudgetPer100Senior}% advertised bonus.`,
      ],
    },
    reason: "The advertised rate is deployment-valid; scenario runs still expose the dynamic on-chain cap.",
  };
}

export interface DayV3ProtectedExitScenario {
  redeemedSeniorPct: 25 | 50 | 100;
  baseRedemptionPer100: number;
  bonusPaidPer100: number;
  bonusPaidPctOfRedemption: number;
  payoutPer100: number;
  onChainBonusCapPer100: number;
  onChainBonusCapPctOfRedemption: number;
  desiredBonusPer100: number;
  wasCapped: boolean;
  juniorConsumedPer100: number;
  remainingCoveragePct: number;
  coverageUtilization: number;
}

export type DayV3ProtectedExitScenariosResult =
  | {
      status: "ready";
      activationStressPct: number;
      scenarios: DayV3ProtectedExitScenario[];
      reason: string;
    }
  | {
      status: "invalid-input" | "infeasible";
      activationStressPct: null;
      scenarios: [];
      reason: string;
    };

export interface DayV3ProtectedExitScenariosInput {
  defaults: DaySimulatorDefaults;
  coveragePct: number;
  protectedExitThresholdPct: number;
  bonusPct: number;
  recoveryDays: number;
  minimumLiquidityPct?: number;
}

function remainingCoveragePct(sim: Sim): number {
  const state = sim.state;
  let low = 0n;
  let high = WAD;
  while (low < high) {
    const middle = (low + high + 1n) / 2n;
    const utilization = coverageUtilizationWad(
      toWad(state.stRawNAV),
      toWad(state.jtRawNAV),
      sim.cfg.beta,
      middle,
      toWad(state.jtEffectiveNAV),
    );
    if (utilization <= WAD) low = middle;
    else high = middle - 1n;
  }
  return fromWad(low) * 100;
}

function scenarioFactory(
  input: DayV3ProtectedExitScenariosInput,
  bonusPct: number,
  stressBps: number,
): Sim {
  const minimumLiquidityPct = input.minimumLiquidityPct ?? 0;
  const normalized = normalizeDayV3Defaults(input.defaults);
  const configured: DaySimulatorDefaults = {
    ...normalized,
    exitBufferPct: dayExitBufferPctFromAbsolute(
      input.protectedExitThresholdPct,
      input.coveragePct,
    ),
    selfLiquidationBonus: bonusPct / 100,
  };
  const capital = dayV3CapitalAtTarget(configured, {
    coveragePct: input.coveragePct,
    minimumLiquidityPct,
  });
  const cfg = buildDayMarketConfig(configured, {
    coverage: input.coveragePct / 100,
    minLiquidity: minimumLiquidityPct / 100,
    eclpBandWidth: configured.eclpBandWidth,
    observationDays: input.recoveryDays,
    riskYieldShare: input.coveragePct > 0 ? configured.riskYDM.yTarget : 0,
    liquidityYieldShare:
      minimumLiquidityPct > 0 ? configured.liqYDM.yTarget : 0,
  });
  const sim = new Sim(cfg, {
    st: capital.seniorPer100,
    jt: capital.juniorPer100,
    lt: capital.slpPer100,
  });
  if (stressBps > 0) {
    sim.step({
      dtSec: 0,
      stReturn: -stressBps / 10_000,
      jtReturn: -stressBps / 10_000,
    });
  }
  return sim;
}

function isProtectedExitActive(sim: Sim): boolean {
  return sim.last().utilization + 1e-12 >= sim.cfg.liquidationUtilization;
}

/** Exercise the actual self-liquidation operation at 25%, 50%, and 100%. */
export function runDayV3ProtectedExitScenarios(
  input: DayV3ProtectedExitScenariosInput,
): DayV3ProtectedExitScenariosResult {
  if (
    !Number.isFinite(input.coveragePct) ||
    input.coveragePct <= 0 ||
    input.coveragePct >= 90 ||
    !Number.isFinite(input.protectedExitThresholdPct) ||
    input.protectedExitThresholdPct <= 0 ||
    input.protectedExitThresholdPct >= input.coveragePct ||
    !Number.isFinite(input.bonusPct) ||
    input.bonusPct < 0 ||
    input.bonusPct >= 100 ||
    input.bonusPct > input.protectedExitThresholdPct + 1e-12 ||
    !Number.isInteger(input.recoveryDays) ||
    input.recoveryDays < 0 ||
    input.recoveryDays > 194 ||
    (input.minimumLiquidityPct !== undefined &&
      (!Number.isFinite(input.minimumLiquidityPct) ||
        input.minimumLiquidityPct < 0 ||
        input.minimumLiquidityPct >= 100))
  ) {
    return {
      status: "invalid-input",
      activationStressPct: null,
      scenarios: [],
      reason: "Protected Exit terms are outside their deployment bounds.",
    };
  }

  const maximumStressBps = 9_999;
  if (!isProtectedExitActive(scenarioFactory(input, input.bonusPct, maximumStressBps))) {
    return {
      status: "infeasible",
      activationStressPct: null,
      scenarios: [],
      reason: "The shared accountant could not activate Protected Exit under a valid stress.",
    };
  }
  let low = 0;
  let high = maximumStressBps;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (isProtectedExitActive(scenarioFactory(input, input.bonusPct, middle))) high = middle;
    else low = middle + 1;
  }
  const activationStressBps = low;

  const runRedemption = (
    redeemedSeniorPct: 25 | 50 | 100,
  ): DayV3ProtectedExitScenario => {
    const fraction = redeemedSeniorPct / 100;
    const sim = scenarioFactory(input, input.bonusPct, activationStressBps);
    const before = sim.last();
    const shareAmount = sim.state.stShares * fraction;
    sim.step({
      dtSec: 0,
      stReturn: 0,
      jtReturn: 0,
      op: { type: "stRedeem", shares: shareAmount },
    });
    const after = sim.last();
    const baseRedemption = Math.max(0, before.stEffectiveNAV - after.stEffectiveNAV);
    const juniorConsumed = Math.max(0, before.jtEffectiveNAV - after.jtEffectiveNAV);
    // A zero-time ST redemption has no other Junior transition. Reading the
    // state delta captures the accountant's exact paid bonus; event copy does
    // not carry a value and must never be parsed.
    const bonusPaid = juniorConsumed;

    // Probe the same exact state with an effectively unbounded advertised rate.
    // The engine's emitted bonus is therefore the dynamic on-chain cap.
    const capSim = scenarioFactory(input, MAX_BONUS_PROBE * 100, activationStressBps);
    const capBefore = capSim.last();
    capSim.step({
      dtSec: 0,
      stReturn: 0,
      jtReturn: 0,
      op: { type: "stRedeem", shares: capSim.state.stShares * fraction },
    });
    const onChainCap = Math.max(
      0,
      capBefore.jtEffectiveNAV - capSim.last().jtEffectiveNAV,
    );
    const desiredBonus = baseRedemption * (input.bonusPct / 100);
    return {
      redeemedSeniorPct,
      baseRedemptionPer100: baseRedemption,
      bonusPaidPer100: bonusPaid,
      bonusPaidPctOfRedemption:
        baseRedemption > 0 ? (bonusPaid / baseRedemption) * 100 : 0,
      payoutPer100: baseRedemption + bonusPaid,
      onChainBonusCapPer100: onChainCap,
      onChainBonusCapPctOfRedemption:
        baseRedemption > 0 ? (onChainCap / baseRedemption) * 100 : 0,
      desiredBonusPer100: desiredBonus,
      wasCapped: bonusPaid + 1e-9 < desiredBonus,
      juniorConsumedPer100: juniorConsumed,
      remainingCoveragePct: remainingCoveragePct(sim),
      coverageUtilization: after.utilization,
    };
  };

  return {
    status: "ready",
    activationStressPct: activationStressBps / 100,
    scenarios: [runRedemption(25), runRedemption(50), runRedemption(100)],
    reason: "Every payout and cap was produced by the shared accountant's Senior redemption path.",
  };
}
