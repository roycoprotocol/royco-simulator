"use client";

import { useEffect, useRef, type ComponentProps } from "react";

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
  const shell = useRef<HTMLDivElement>(null);

  /**
   * Keep the rail inside the window.
   *
   * The hero spans the full width above the split, so the rail starts below it
   * and its distance from the top of the window is 241px at the top of the
   * page and 0 once the sticky offset takes over. A fixed cap cannot be right
   * at both: `100dvh` put the rail's bottom 241px BELOW the window at the top
   * of the page — measured at 1512px wide with the input groups open, rail
   * 1000px tall, top 241, bottom 1241, window 1000 — and a cap tight enough
   * for that state wastes the same 241px once the rail is pinned.
   *
   * The height it can use is `window height − its own distance from the top of
   * the window`, and an element cannot query its own offset in CSS. So it is
   * measured here and published as one custom property the stylesheet reads.
   * Nothing else about the layout is scripted.
   *
   * `max-height` cannot move the rail's own top, so setting it cannot change
   * what the next measurement reads: no feedback loop.
   */
  useEffect(() => {
    const root = shell.current;
    if (!root) return;
    const rail = root.querySelector<HTMLElement>(
      'section[aria-labelledby="day-v3-inputs-heading"]',
    );
    if (!rail) return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const offset = Math.max(0, rail.getBoundingClientRect().top);
      root.style.setProperty(
        "--v4-rail-max",
        `${Math.max(0, window.innerHeight - offset)}px`,
      );
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };

    measure();
    // Capture phase on `document`, not `window`: this catches a scroll from
    // whichever element produces it, including a nested scroller, rather than
    // relying on the page being the thing that scrolled.
    document.addEventListener("scroll", schedule, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", schedule);
    // The hero's height sets the offset, and it reflows on its own when its
    // copy rewraps at a new width.
    const hero = root.querySelector("header");
    const observer = hero ? new ResizeObserver(schedule) : null;
    observer?.observe(hero as Element);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      document.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
    };
  }, []);

  /**
   * How far down the window the sticky scenario returns reach.
   *
   * An open model section is taller than the window, so its header — the row
   * you click to close it — scrolls away, and the only way out of a section was
   * to scroll back up through it. That header sticks instead, but it has to
   * stop below the returns rather than under them, and the returns are as tall
   * as their content. Measured here, published as one custom property.
   */
  useEffect(() => {
    const root = shell.current;
    if (!root) return;
    const returns = root.querySelector<HTMLElement>(
      'section[aria-labelledby="day-v3-positions-heading"]',
    );
    if (!returns) return;

    const publish = () =>
      root.style.setProperty(
        "--v4-stack-top",
        `${Math.round(returns.getBoundingClientRect().height)}px`,
      );
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(returns);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.shell} data-day-v4-layout="two-pane" ref={shell}>
      {/*
        Desktop only, by choice. /v3 remains the responsive route; this one is
        a two-pane tool for a laptop, and a 390px rail beside a results column
        has no honest small-screen form. Rather than ship a stacked fallback
        nobody asked for and nobody would maintain, small screens get told
        plainly where to open it. `role="alert"` so it is announced rather than
        silently replacing the page.
      */}
      <div className={styles.desktopOnly} role="alert">
        <div className={styles.desktopOnlyCard}>
          <strong className={styles.desktopOnlyTitle}>Open this on a desktop</strong>
          <p className={styles.desktopOnlyBody}>
            The two-pane simulator puts the inputs beside the results and needs
            a window at least 1024px wide.
          </p>
          <p className={styles.desktopOnlyBody}>
            On a phone or a narrow window, use the standard simulator at{" "}
            <a className={styles.desktopOnlyLink} href="/v3">
              /v3
            </a>
            , which has every one of the same models and answers.
          </p>
        </div>
      </div>
      <div className={styles.pane}>
        <DayV3Summary {...props} />
      </div>
    </div>
  );
}
