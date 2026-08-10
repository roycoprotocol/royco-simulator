"use client";

import { pct } from "@/components/day-v2/format";

/** The Royco deploy flow this page hands its design off to. */
const DEPLOY_URL = "https://royco.org/deploy-market/";

/**
 * The one action the page is asking for, and the only place on it that is not
 * cream. The break in rhythm is the point: everything above is a readout, and
 * this is the thing to press.
 *
 * It restates the reader's own terms rather than generic marketing copy. The
 * figures are the live slider values, so the invitation is to deploy the design
 * actually on screen and not some default.
 */
export default function DayV2Deploy({
  coverage,
  liquidity,
  seniorApy,
  sourceApy,
}: {
  coverage: number;
  liquidity: number;
  seniorApy: number;
  sourceApy: number;
}) {
  return (
    <section
      aria-label="Deploy this market"
      className="flex flex-col gap-5 rounded-xl bg-[var(--foreground)] px-6 py-7 text-[var(--background)] sm:px-8 sm:py-8 lg:flex-row lg:items-center lg:justify-between lg:gap-10"
    >
      <div className="flex flex-col gap-2.5">
        <h2 className="max-w-[20ch] text-[clamp(22px,2.2vw,30px)] font-semibold leading-[1.1] tracking-[-0.02em]">
          This design is deployable today.
        </h2>
        <p className="max-w-[56ch] text-[13.5px] leading-relaxed text-[#c9c6bd]">
          Every term above is a parameter a real Royco Day market takes. Yours pays
          Sr{" "}
          <strong className="font-mono font-bold text-[var(--background)] tabular-nums">
            {pct(seniorApy)}
          </strong>{" "}
          a year from a source at {pct(sourceApy)}, with {pct(coverage)} coverage and{" "}
          {pct(liquidity)} liquidity behind it. Take it to the deploy flow and it
          becomes a market other people can enter.
        </p>
      </div>

      <div className="flex flex-col items-start gap-2 lg:items-end">
        {/* New tab on purpose: the reader has a design on this page and losing
            it to a navigation would cost them the whole session. */}
        <a
          className="rounded-lg bg-[var(--theme-gold)] px-6 py-3 text-[14px] font-bold text-[var(--foreground)] whitespace-nowrap"
          href={DEPLOY_URL}
          rel="noreferrer"
          target="_blank"
        >
          Deploy this market
        </a>
        <span className="text-[10.5px] leading-snug text-[#9b978d]">
          Opens royco.org in a new tab
        </span>
      </div>
    </section>
  );
}
