import type { CSSProperties } from "react";

/**
 * One look for every range on the page.
 *
 * The V3 `.day-v3-range` rule paints a uniform hairline, which reads as a
 * rule under a label rather than as something you grab: nothing behind the
 * handle records that it has travelled. Filling the track to the handle is what
 * makes it read as a control, and it costs nothing to be honest about, because
 * the fill is the value.
 *
 * It is an inline style rather than a class because `.day-v3-range` lives in
 * `app/globals.css`, which is byte-locked. Same tokens as that rule, so a
 * filled track and an empty one are the same grey.
 *
 * **Longhands, not the `background` shorthand.** The locked rule paints a solid
 * fill on a `border-radius: 9999px` box, and the inline `min-height` stretches
 * that box to a 44px touch target. If the shorthand lands without its
 * `background-size`, the locked rule's own fill shows through at full height and
 * the control renders as a tall grey pill instead of a hairline — which is
 * exactly the inconsistency that was reported between two otherwise identical
 * sliders. Setting `backgroundColor: transparent` and `backgroundImage`
 * separately means no single dropped declaration can bring the pill back.
 */
export const DAY_V3_RANGE_TRACK_PX = 6;

export function dayV3RangeStyle(value: number, min: number, max: number): CSSProperties {
  const span = max - min;
  // A degenerate range is reachable: the exit and waterfall sliders index into
  // an engine-returned curve, and a market with no pool funded returns one
  // point, which would otherwise divide by zero and paint NaN into the gradient.
  const ratio = span > 0 ? (value - min) / span : 0;
  const filled = Math.min(100, Math.max(0, ratio * 100));
  return {
    backgroundColor: "transparent",
    backgroundImage: `linear-gradient(to right, var(--foreground) ${filled}%, color-mix(in srgb, var(--foreground) 14%, transparent) ${filled}%)`,
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundSize: `100% ${DAY_V3_RANGE_TRACK_PX}px`,
    // Belt and braces with the size above: a hairline gradient on a pill-shaped
    // box only reads right while the box itself paints nothing.
    borderRadius: 0,
    minHeight: 44,
  };
}
