import {
  runDayHistoricalBacktest,
  type DayBacktestInput,
  type DayBacktestResult,
  type DayBacktestTerms,
} from "@/lib/day-simulator-template/backtest";
import type {
  DaySeriesPoint,
  DaySimulatorDefaults,
} from "@/lib/day-simulator-template/market";
import { normalizeDayV3Defaults } from "@/lib/day-v3/normalization";
import type { DayV3DesignField } from "@/lib/day-v3/types";

export const DAY_V3_MAX_RECOVERY_DAYS = 194;
export const DAY_V3_MIN_RECOVERED_EPISODES = 5;

export type DayV3RecoveryAnalysisStatus =
  | "no-history"
  | "no-observation-periods"
  | "sparse-history"
  | "outside-deployment-window"
  | "recommended";

export interface DayV3RecoveryEpisode {
  aIndex: number;
  bIndex: number;
  startDate: string;
  endDate: string | null;
  days: number | null;
  recovered: boolean;
  exitReason:
    "period-ended" | "protected-exit" | "st-impairment" | "recovered" | null;
}

/** Pair Observation Periods with exact lifecycle events without reading copy. */
export function dayV3RecoveryEpisodesFromBacktest(
  backtest: DayBacktestResult,
): DayV3RecoveryEpisode[] {
  const unusedExitEvents = backtest.sim.events.filter(
    (event) => event.kind === "exit-fixed-term",
  );
  return backtest.observationPeriods.map((period) => {
    const closeTime = backtest.chart[period.bIndex]?.t;
    const eventIndex = unusedExitEvents.findIndex(
      (event) =>
        event.t === closeTime && event.observationExitReason !== undefined,
    );
    const event =
      eventIndex >= 0 ? unusedExitEvents.splice(eventIndex, 1)[0] : undefined;
    const exitReason = event?.observationExitReason ?? null;
    return {
      aIndex: period.aIndex,
      bIndex: period.bIndex,
      startDate: period.startDate,
      endDate: event ? period.endDate : null,
      days: event ? Math.max(0, Math.ceil(period.days)) : null,
      recovered: exitReason === "recovered",
      exitReason,
    } satisfies DayV3RecoveryEpisode;
  });
}

export interface DayV3RecoveryAnalysis {
  status: DayV3RecoveryAnalysisStatus;
  field: DayV3DesignField<number>;
  episodes: DayV3RecoveryEpisode[];
  recoveredEpisodeCount: number;
  percentile90Days: number | null;
  cappedByDeploymentLimit: boolean;
  /** Evidence-only accountant horizon. It may exceed the deployable uint24
   * limit so historical recoveries are observed rather than censored. */
  referenceObservationDays: number;
}

export type DayV3RecoveryAnalysisInput = {
  defaults: DaySimulatorDefaults;
  series: DaySeriesPoint[];
  terms: Omit<DayBacktestTerms, "observationDays">;
  omitInitialZeroReturnPeriod?: boolean;
  monthlyBaselineDate?: string;
};

const unresolvedField = (evidence: string[]): DayV3DesignField<number> => ({
  id: "observation-period-duration",
  value: null,
  unit: "days",
  origin: "unresolved",
  deployPath: "accountantParams.fixedTermDurationSeconds",
  modelUsage: "fully-modeled",
  evidence,
});

/**
 * Inspect accountant-created Observation Periods and their structured exit
 * reasons. Raw price drawdowns and human-readable event messages are never
 * treated as recovery evidence.
 */
export function analyzeDayV3RecoveryHistory(
  backtest: DayBacktestResult,
  referenceObservationDays = DAY_V3_MAX_RECOVERY_DAYS,
): DayV3RecoveryAnalysis {
  if (backtest.chart.length < 2) {
    return {
      status: "no-history",
      field: unresolvedField([
        "Dated history is required for a recovery-time recommendation.",
      ]),
      episodes: [],
      recoveredEpisodeCount: 0,
      percentile90Days: null,
      cappedByDeploymentLimit: false,
      referenceObservationDays,
    };
  }

  const episodes = dayV3RecoveryEpisodesFromBacktest(backtest);

  if (episodes.length === 0) {
    return {
      status: "no-observation-periods",
      field: unresolvedField([
        "The shared accountant did not open an Observation Period in this history.",
      ]),
      episodes,
      recoveredEpisodeCount: 0,
      percentile90Days: null,
      cappedByDeploymentLimit: false,
      referenceObservationDays,
    };
  }

  const recoveredDays = episodes
    .filter((episode) => episode.recovered && episode.days !== null)
    .map((episode) => episode.days as number)
    .sort((a, b) => a - b);
  if (recoveredDays.length < DAY_V3_MIN_RECOVERED_EPISODES) {
    return {
      status: "sparse-history",
      field: unresolvedField([
        `${recoveredDays.length} recovered Observation Period${recoveredDays.length === 1 ? "" : "s"} found; at least ${DAY_V3_MIN_RECOVERED_EPISODES} are required.`,
        "Observed recovery durations can be shown as scenarios, but are not a recommendation.",
      ]),
      episodes,
      recoveredEpisodeCount: recoveredDays.length,
      percentile90Days: null,
      cappedByDeploymentLimit: false,
      referenceObservationDays,
    };
  }

  // Nearest-rank p90 selects the first duration that covers at least 90% of
  // recovered episodes. Durations and the deploy field are whole days.
  const percentileIndex = Math.max(
    0,
    Math.ceil(recoveredDays.length * 0.9) - 1,
  );
  const percentile90Days = Math.ceil(recoveredDays[percentileIndex]);
  const capped = percentile90Days > DAY_V3_MAX_RECOVERY_DAYS;
  if (capped) {
    const reason = `The 90th-percentile recovery took ${percentile90Days} days, longer than the 194-day deployment limit. V3 will not recommend a shorter timer than the evidence supports.`;
    return {
      status: "outside-deployment-window",
      field: unresolvedField([reason]),
      episodes,
      recoveredEpisodeCount: recoveredDays.length,
      percentile90Days,
      cappedByDeploymentLimit: true,
      referenceObservationDays,
    };
  }
  return {
    status: "recommended",
    field: {
      id: "observation-period-duration",
      value: percentile90Days,
      unit: "days",
      origin: "recommended",
      deployPath: "accountantParams.fixedTermDurationSeconds",
      modelUsage: "fully-modeled",
      evidence: [
        `Nearest-rank 90th percentile across ${recoveredDays.length} accountant-confirmed recovered Observation Periods.`,
        "Rounded up to a whole day.",
      ],
    },
    episodes,
    recoveredEpisodeCount: recoveredDays.length,
    percentile90Days,
    cappedByDeploymentLimit: false,
    referenceObservationDays,
  };
}

const DAY_MS = 86_400_000;

/**
 * Keep evidence collection separate from the deployable timer. A 194-day
 * accountant run would classify a real day-195 recovery as `period-ended`,
 * hiding the evidence needed to say that the deployable limit is too short.
 * The evidence run therefore stays open beyond the full supplied history;
 * recommendations are still rejected above the 194-day deployment limit.
 */
function recoveryEvidenceHorizonDays(series: DaySeriesPoint[]): number {
  const timestamps = series
    .map((point) => Date.parse(point.date))
    .filter(Number.isFinite);
  if (timestamps.length < 2) return DAY_V3_MAX_RECOVERY_DAYS;
  const spanDays = Math.ceil(
    (Math.max(...timestamps) - Math.min(...timestamps)) / DAY_MS,
  );
  return Math.max(DAY_V3_MAX_RECOVERY_DAYS + 1, spanDays + 1);
}

/** Run history through the shared accountant with an uncensored evidence horizon. */
export function runDayV3RecoveryAnalysis(
  input: DayV3RecoveryAnalysisInput,
): DayV3RecoveryAnalysis {
  if (input.series.length < 2) {
    return {
      status: "no-history",
      field: unresolvedField([
        "Dated history is required for a recovery-time recommendation.",
      ]),
      episodes: [],
      recoveredEpisodeCount: 0,
      percentile90Days: null,
      cappedByDeploymentLimit: false,
      referenceObservationDays: DAY_V3_MAX_RECOVERY_DAYS,
    };
  }
  const evidenceObservationDays = recoveryEvidenceHorizonDays(input.series);
  const backtestInput: DayBacktestInput = {
    // Recovery evidence must not be censored by a market's existing Protected
    // Exit trigger. A near-zero buffer maps to a practically unreachable
    // liquidation utilization while preserving the shared runtime path.
    defaults: {
      ...normalizeDayV3Defaults(input.defaults),
      exitBufferPct: 1e-9,
    },
    series: input.series,
    terms: {
      ...input.terms,
      observationDays: evidenceObservationDays,
    },
    maintainCoverage: false,
    omitInitialZeroReturnPeriod: input.omitInitialZeroReturnPeriod ?? false,
    monthlyBaselineDate: input.monthlyBaselineDate,
  };
  return analyzeDayV3RecoveryHistory(
    runDayHistoricalBacktest(backtestInput),
    evidenceObservationDays,
  );
}
