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

/**
 * A per-100 ratio in the market's own unit, at the one decimal the capital
 * stack states these in. Same currency rule as everything else here: a market
 * quoted in ETH never gets a dollar sign in front of a number of ETH.
 */
export const unitRatio = (value: number, unit: DayV2Unit) =>
  isUsdUnit(unit) ? `$${value.toFixed(1)}` : value.toFixed(1);

/**
 * A position-sized figure in the market's own unit. `initialST` is a count of
 * the market's own asset, not dollars, so the two ETH and one BTC market would
 * otherwise have their tranche sizes labelled with a currency nobody quoted
 * them in.
 */
export const compactAmount = (value: number, unit: DayV2Unit) =>
  isUsdUnit(unit) ? compactUsd(value) : compactUsd(value).slice(1);

/**
 * A chart axis tick for a per-100 value. Every chart on the page hardcoded a
 * `$` here while the tables beside them already honoured the market's declared
 * unit, so a market quoted in ETH had a dollar axis over a table that carefully
 * refused to name a currency.
 */
export const unitTick = (value: number, unit: DayV2Unit) =>
  isUsdUnit(unit) ? `$${value.toFixed(0)}` : value.toFixed(0);
