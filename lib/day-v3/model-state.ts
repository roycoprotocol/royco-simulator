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
  | "missing-policy"
  | "ready";

/** Stale model values are never presented as answers to newly visible goals. */
export function dayV3ReturnDisplayState(input: {
  modelUpdating: boolean;
  sourceApyResolved: boolean;
  returnPolicyResolved: boolean;
}): DayV3ReturnDisplayState {
  if (input.modelUpdating) return "updating";
  if (!input.sourceApyResolved) return "missing-source";
  if (!input.returnPolicyResolved) return "missing-policy";
  return "ready";
}
