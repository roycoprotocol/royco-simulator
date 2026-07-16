// ---------------------------------------------------------------------------
// timeframe.ts — pure index-range helpers for the "Backtest window" brush.
//
// The brush selects a window over the full monthly series, and the simulator
// RESTARTS the market over that slice: the window start is a new genesis, so
// every KPI, stat, and calendar row recomputes over it. These helpers stay
// purely about index arithmetic (clamping, min-window, no-crossing) and do no
// accounting themselves, so those rules can be tested headlessly.
//
// MIN_WINDOW_MONTHS is what guarantees a restart always has enough points to be
// a runnable market rather than a degenerate one.
// ---------------------------------------------------------------------------

/** Inclusive index range into the series (a = start point, b = end point). */
export interface IndexRange {
  a: number;
  b: number;
}

/**
 * Minimum selectable window, in months (points). The series is monthly, so a
 * 3-point window is 3 months and the brush can never collapse to nothing.
 */
export const MIN_WINDOW_MONTHS = 3;

/** Minimum index distance between the two handles (inclusive window => n - 1). */
const MIN_SPAN = MIN_WINDOW_MONTHS - 1;

const clamp = (n: number, lo: number, hi: number): number =>
  n < lo ? lo : n > hi ? hi : n;

/**
 * Coerce an arbitrary (a, b) pair into a legal range over [0, max]:
 * clamps to the series bounds, un-crosses the handles, and widens the window
 * to MIN_WINDOW_MONTHS (preferring to push the end right, falling back to
 * pulling the start left when there is no room).
 */
export function normalizeRange(a: number, b: number, max: number): IndexRange {
  const hi = Math.max(0, max);
  let lo = clamp(Math.round(a), 0, hi);
  let up = clamp(Math.round(b), 0, hi);

  // Handles must not cross.
  if (up < lo) {
    const t = lo;
    lo = up;
    up = t;
  }

  // A series shorter than the minimum window can only ever select all of it.
  const span = Math.min(MIN_SPAN, hi);
  if (up - lo < span) {
    if (lo + span <= hi) up = lo + span;
    else {
      up = hi;
      lo = Math.max(0, hi - span);
    }
  }
  return { a: lo, b: up };
}

/**
 * Move one handle, keeping the range legal.
 *
 * The DRAGGED handle is clamped against the stationary one; the stationary one never moves.
 * Routing this through normalizeRange instead would SWAP the handles when they cross, which
 * yields a range that is valid (a <= b, in bounds, min-window met) but wrong: dragging start
 * rightwards past the end would drag the end along with it and hand ownership of the grab to
 * the other handle mid-gesture. Clamping is what a brush is expected to do.
 */
export function moveHandle(
  range: IndexRange,
  side: "start" | "end",
  index: number,
  max: number,
): IndexRange {
  const hi = Math.max(0, max);
  const span = Math.min(MIN_SPAN, hi);
  const want = clamp(Math.round(index), 0, hi);

  if (side === "start") {
    // Start can come no closer to the fixed end than the minimum window.
    const b = clamp(Math.round(range.b), 0, hi);
    return { a: clamp(want, 0, Math.max(0, b - span)), b };
  }
  const a = clamp(Math.round(range.a), 0, hi);
  return { a, b: clamp(want, Math.min(hi, a + span), hi) };
}

/**
 * Slide the whole window by `delta` points, preserving its width. Unlike
 * normalizeRange this never squashes the window at the bounds, it just stops.
 */
export function panRange(range: IndexRange, delta: number, max: number): IndexRange {
  const hi = Math.max(0, max);
  const width = range.b - range.a;
  let a = Math.round(range.a + delta);
  if (a + width > hi) a = hi - width;
  if (a < 0) a = 0;
  return { a, b: Math.min(hi, a + width) };
}

/** Nearest point index for a 0..1 fraction across the track. */
export function indexFromFraction(frac: number, max: number): number {
  return clamp(Math.round(clamp(frac, 0, 1) * Math.max(0, max)), 0, Math.max(0, max));
}

/** Which handle a click at `index` should grab, for click-to-reposition. */
export function nearestSide(range: IndexRange, index: number): "start" | "end" {
  return Math.abs(index - range.a) <= Math.abs(index - range.b) ? "start" : "end";
}

/** True when the range spans the entire series. */
export function isFullRange(range: IndexRange, max: number): boolean {
  return range.a <= 0 && range.b >= Math.max(0, max);
}

/** Position of an index along the track, as a percentage. */
export function pctOf(index: number, max: number): number {
  const hi = Math.max(0, max);
  if (hi === 0) return 0;
  return (clamp(index, 0, hi) / hi) * 100;
}
