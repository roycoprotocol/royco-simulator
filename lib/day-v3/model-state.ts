/**
 * Keep every input to one displayed accountant run in the same value. React may
 * defer this snapshot, but it must never defer the goals separately from the
 * live template policy that prices them.
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
