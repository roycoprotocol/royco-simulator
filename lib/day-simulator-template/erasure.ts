export type DayErasureEvent = {
  index: number;
  date: string;
  forfeitIndexPts: number;
  forfeitPctOfJuniorNav: number;
  top: number;
  reason: string;
};

export type DayErasureInput = {
  index: number;
  date: string;
  currentJuniorIndex: number;
  erasedAmount: number;
  preRefillJuniorNAV: number;
  navPerIndexPoint: number;
  reason: string;
};

/**
 * Convert an exact accountant erasure into Dawn's chart geometry.
 *
 * Both denominators must come from the state immediately after the erasure and
 * before any same-timestamp Junior refill. A refill mints shares at the current
 * price, so using its larger NAV/share base would understate the erased claim.
 */
export function buildDayErasureEvent(input: DayErasureInput): DayErasureEvent {
  const erasedAmount = Number.isFinite(input.erasedAmount)
    ? Math.max(0, input.erasedAmount)
    : 0;
  const forfeitIndexPts = input.navPerIndexPoint > 0
    ? erasedAmount / input.navPerIndexPoint
    : 0;
  const forfeitPctOfJuniorNav = input.preRefillJuniorNAV > 0
    ? (erasedAmount / input.preRefillJuniorNAV) * 100
    : 0;
  const safeIndexPoints = Number.isFinite(forfeitIndexPts) ? forfeitIndexPts : 0;
  const safePct = Number.isFinite(forfeitPctOfJuniorNav) ? forfeitPctOfJuniorNav : 0;

  return {
    index: input.index,
    date: input.date,
    forfeitIndexPts: safeIndexPoints,
    forfeitPctOfJuniorNav: safePct,
    top: input.currentJuniorIndex + safeIndexPoints,
    reason: input.reason,
  };
}
