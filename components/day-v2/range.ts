import type { CSSProperties } from "react";

/**
 * One look for every range on the page.
 *
 * The shared `.day-v2-range` rule paints a uniform hairline, which reads as a
 * rule under a label rather than as something you grab: nothing behind the
 * handle records that it has travelled. Filling the track to the handle is what
 * makes it read as a control, and it costs nothing to be honest about, because
 * the fill is the value.
 *
 * It is an inline background rather than a class because `.day-v2-range` lives
 * in `app/globals.css`, which is byte-locked. Same tokens as that rule, so a
 * filled track and an empty one are the same grey.
 */
export function dayV2RangeStyle(value: number, min: number, max: number): CSSProperties {
  const span = max - min;
  // A degenerate range is reachable: the exit and waterfall sliders index into
  // an engine-returned curve, and a market with no pool funded returns one
  // point, which would otherwise divide by zero and paint NaN into the gradient.
  const ratio = span > 0 ? (value - min) / span : 0;
  const filled = Math.min(100, Math.max(0, ratio * 100));
  return {
    height: 6,
    background: `linear-gradient(to right, var(--foreground) ${filled}%, color-mix(in srgb, var(--foreground) 14%, transparent) ${filled}%)`,
  };
}
