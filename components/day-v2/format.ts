// One set of number formats for every v2 section. Sections that format their
// own figures drift apart, and a page whose numbers are written three ways
// stops being skimmable.

/** A rate or share, at the precision the page states rates in. */
export const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

/** An exact dollar figure, for per-$100 readouts where cents carry meaning. */
export const usd = (value: number) => `$${value.toFixed(2)}`;

/** A position-sized dollar figure, where cents are noise. */
export function compactUsd(value: number): string {
  const size = Math.abs(value);
  if (size >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (size >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (size >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
}

/** A cost in basis points, which is how a trading desk states slippage. */
export const bps = (fraction: number) => `${(fraction * 10_000).toFixed(1)} bps`;

/**
 * Not every market reports in dollars. A few are quoted in their own asset, and
 * for those the root route drops the currency symbol and states the basis
 * separately rather than printing a `$` in front of a number of ETH. These
 * follow that rule, so a stake denominated in ETH is never labelled as dollars.
 */
export type DayV2Unit = string;

export const isUsdUnit = (unit: DayV2Unit) => unit === "USD";

/** The stake a per-unit readout is quoted against: "$100", or "100" in ETH. */
export const stake100 = (unit: DayV2Unit) => (isUsdUnit(unit) ? "$100" : "100");

/** An exact per-100 figure in the market's own unit. */
export const unitAmount = (value: number, unit: DayV2Unit) =>
  isUsdUnit(unit) ? `$${value.toFixed(2)}` : value.toFixed(2);
