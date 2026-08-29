/**
 * Keep every input to one displayed accountant run in the same value. React may
 * defer this snapshot, but it must never defer the goals separately from the
 * canonical market-pool policy that prices them.
 */
export function createDayV3ModelSnapshot<
  TTerms extends Record<string, unknown>,
  TEngineOverrides,
>(terms: TTerms, engineOverrides: TEngineOverrides) {
  return { ...terms, engineOverrides } as const;
}

export type DayV3ReturnDisplayState =
  | "updating"
  | "missing-source"
  | "ready";

type ExitQuoteSummary = {
  filledNAV: number;
  stableOutNAV: number;
  executionPrice: number;
};

export type DayV3IllustrativeExitMetrics = {
  lowestPayoutPer100: number;
  proceedsPer100Senior: number;
  sellablePer100Senior: number;
};

/**
 * Normalizes quotes produced by the shared Day engine to the simulator's
 * per-$100-Senior display basis. This deliberately contains no pool math: the
 * selected-sale and boundary quotes have already been fee-priced by
 * `previewSecondarySell`.
 */
export function dayV3IllustrativeExitMetrics(input: {
  boundaryQuote: ExitQuoteSummary;
  openingSeniorNAV: number;
  selectedQuote: ExitQuoteSummary;
}): DayV3IllustrativeExitMetrics | null {
  const { boundaryQuote, openingSeniorNAV, selectedQuote } = input;
  const values = [
    openingSeniorNAV,
    selectedQuote.filledNAV,
    selectedQuote.stableOutNAV,
    boundaryQuote.executionPrice,
  ];
  if (
    !values.every(Number.isFinite) ||
    openingSeniorNAV <= 0 ||
    selectedQuote.filledNAV < 0 ||
    selectedQuote.stableOutNAV < 0 ||
    boundaryQuote.executionPrice < 0
  ) {
    return null;
  }
  return {
    sellablePer100Senior:
      (selectedQuote.filledNAV / openingSeniorNAV) * 100,
    proceedsPer100Senior:
      (selectedQuote.stableOutNAV / openingSeniorNAV) * 100,
    lowestPayoutPer100: boundaryQuote.executionPrice * 100,
  };
}

/**
 * Forward returns need a source yield, not a resolved deployment pool. Exact
 * E-CLP quotes keep their own stricter readiness gate; coupling that gate to
 * APYs caused valid shared-accountant results to disappear while the pool
 * service refreshed or while an observation period was being edited.
 */
export function dayV3ReturnDisplayState(input: {
  modelUpdating: boolean;
  sourceApyResolved: boolean;
}): DayV3ReturnDisplayState {
  if (!input.sourceApyResolved) return "missing-source";
  return "ready";
}
