// Display formatters for the pool creator.
// The locked simulator carries its own private formatters; this is a fresh set.

/**
 * The em-dash every formatter falls back to.
 *
 * A solve can legitimately fail — an infeasible Advanced override makes the
 * accountant throw, and `describeTerms` reports NaN rather than crashing. That
 * NaN must not reach the page as the literal text "NaN%", so the guard lives
 * here rather than at each of the ~30 call sites.
 */
export const EMPTY = "—";

export const pct = (value: number, digits = 1): string =>
  Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : EMPTY;

/** Percentage points, for "Senior gives up 2.8 points" style copy. */
export const points = (value: number, digits = 1): string =>
  Number.isFinite(value)
    ? `${(value * 100).toFixed(digits)} pt${Math.abs(value * 100) === 1 ? "" : "s"}`
    : EMPTY;

export const usd = (value: number): string => {
  if (!Number.isFinite(value)) return EMPTY;
  const abs = Math.abs(value);
  const digits = abs >= 100 || abs === 0 ? 0 : 2;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

/** Compact money for tight rails: $1.0M, $167k. */
export const usdCompact = (value: number): string => {
  if (!Number.isFinite(value)) return EMPTY;
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return usd(value);
};

/** Price per $1, for exit-ladder quotes. */
export const perDollar = (value: number): string =>
  Number.isFinite(value) ? `$${value.toFixed(3)}` : EMPTY;

export const days = (value: number): string => {
  if (value <= 0) return "no recovery window";
  return `${value} day${value === 1 ? "" : "s"}`;
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-02-14" → "Feb 2026". Parsed as UTC to avoid a local-timezone day shift. */
export const monthYear = (iso: string): string => {
  const [y, m] = iso.split("-").map(Number);
  if (!y || !m) return iso;
  return `${MONTHS[m - 1]} ${y}`;
};

/** "2026-02-14" → "14 Feb 2026". */
export const longDate = (iso: string): string => {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

export const clamp = (value: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, value));

/** Round to a step, used to snap slider values coming from the URL. */
export const snap = (value: number, step: number): number =>
  Math.round(value / step) * step;
