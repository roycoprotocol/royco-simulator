import type { ComponentProps } from "react";

import DayV3Summary from "@/components/day-v3/DayV3Summary";
import styles from "@/components/day-v4/DayV4TwoPane.module.css";

/**
 * /v4 is /v3 in a two-pane frame: inputs in a left rail, results in a right
 * column.
 *
 * It renders `DayV3Summary` itself rather than a copy of it. That component
 * owns every piece of V3 state and every shared-accountant call — the
 * `structuralModel` and `immediateModelInput` snapshots, the
 * `engineOverrides`/`canonicalPoolDesign` gate, `restockView` — so any V4 that
 * assembled its own sections would need its own copy of all of it, and two
 * copies of the inputs to `runDayTargetScenario` is precisely the divergence
 * `scripts/day-v3/model-output-parity.test.mjs` guards against. Taking the
 * whole component instead means /v4 cannot disagree with /v3 about a single
 * number, because there is only one model on the page.
 *
 * Props are `DayV3Summary`'s own, so the two routes stay in step by type: a
 * prop added there is a compile error here until it is passed through.
 *
 * The layout itself is in the sibling stylesheet. Nothing in /v3 changes, and
 * `DayV3Summary` is not told which route it is on.
 */
export default function DayV4TwoPane(
  props: ComponentProps<typeof DayV3Summary>,
) {
  return (
    <div className={styles.shell} data-day-v4-layout="two-pane">
      <DayV3Summary {...props} />
    </div>
  );
}
