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

export function formatDayErasureLabel(forfeitPctOfJuniorNav: number): string {
  const pct = Number.isFinite(forfeitPctOfJuniorNav)
    ? Math.max(0, forfeitPctOfJuniorNav)
    : 0;
  const formatted = pct >= 1
    ? pct.toFixed(0)
    : pct >= 0.1
      ? pct.toFixed(1)
      : pct >= 0.01
        ? pct.toFixed(2)
        : '<0.01';
  return formatted.startsWith('<')
    ? `erased ${formatted}%`
    : `erased −${formatted}%`;
}

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
