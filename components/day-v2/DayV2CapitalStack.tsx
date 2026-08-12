"use client";

import { memo } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DayV2DocsLink from "@/components/day-v2/DayV2DocsLink";
import DayV2StackDiagram from "@/components/day-v2/DayV2StackDiagram";
import { pct, unitRatio, type DayV2Unit } from "@/components/day-v2/format";
import {
  dayCapitalAtUtilization,
  dayCapitalInYieldSource,
} from "@/lib/day-simulator-template/capital-sizing";
import type { DaySimulatorDefaults } from "@/lib/day-simulator-template/market";

/**
 * What the design asks the issuer to raise.
 *
 * This is the question the page never answered. Every figure on it was a rate,
 * and an issuer's first problem is not a rate, it is how much capital has to
 * stand at each leg before the market can open. The page even implied the wrong
 * number: the coverage control was captioned "Jr per unit of Sr", and coverage
 * is not a Junior size, it is a requirement. The Junior capital that satisfies
 * it at the 90% target is `coverage / (target - coverage)` per unit of Senior,
 * which at 20% coverage is 28.6%, not 20%. An issuer planning a raise off the
 * caption would have come up 43% short on the tranche that absorbs every loss.
 *
 * Nothing here is computed locally. The balances are `buildDayInitialBalances`,
 * the same function that seeds the run whose rates appear above, so the stack
 * and the rates are two readings of one market. The target and minimum columns
 * keep that distinction visible without repeating a notional-sized summary.
 */
function DayV2CapitalStack({
  balances,
  coverage,
  defaults,
  minLiquidity,
  poolSeniorWeight,
  targetUtilization,
  unit,
}: {
  balances: { st: number; jt: number; lt: number };
  coverage: number;
  /** Needed to size the same stack at 100% utilization, which is the floor the
   *  requirement is literally met at. */
  defaults: DaySimulatorDefaults;
  minLiquidity: number;
  /** How much of the pool sits in Senior shares, so the in-source figure counts
   *  the pool's Senior leg and not its exit-asset leg. */
  poolSeniorWeight: number;
  targetUtilization: number;
  unit: DayV2Unit;
}) {
  const { st, jt, lt } = balances;
  // Senior is the reference, not a fourth figure: an issuer picks the Senior
  // raise and asks what else has to stand beside it, so the page answers in
  // those terms.
  const per100 = (value: number) => (st > 0 ? (value / st) * 100 : 0);
  const total = st + jt + lt;
  const share = (value: number) => (total > 0 ? (value / total) * 100 : 0);

  /**
   * A capital stack, drawn as one, with every leg's proportion inside its own
   * row rather than in a separate column beside them.
   *
   * The previous attempt put one continuous to-scale column to the left of
   * equal-height rows, and the two could not line up: at 5% coverage the navy
   * band covered the Senior row AND the Junior row, the brown sliver landed on
   * the boundary, and the green band sat beside the exit pool row only by
   * accident. Adjacency implies correspondence, so it read as broken. A bar per
   * row is aligned by construction, is still strictly to scale against a shared
   * 0-to-total axis so the rows stay comparable, and a thin leg is now thin in
   * one dimension the row can afford rather than in the dimension that squeezes
   * its label out.
   *
   * Senior leads: loss arrives at the bottom of a stack and works up, which is
   * why Junior sits under Senior and absorbs first. The two loss layers carry a
   * coloured left edge; the exit pool does not, because it is venue capital
   * rather than a layer that absorbs anything.
   */

  // The same stack at the floor. The requirement is only literally met at 100%
  // utilization, and the 0.90 target sits above it with headroom. Showing the
  // target alone makes it look like the minimum, which it is not.
  const floor = dayCapitalAtUtilization(
    defaults,
    { coverage, minLiquidity },
    1,
  );

  const legs = [
    {
      name: "Sr",
      amount: st,
      ratio: 100,
      // Senior is the basis and does not move with utilization, so it has no
      // separate floor to state. A repeated 100.0 in both columns would invite
      // the reader to look for a difference that cannot exist.
      floorRatio: null,
      description: "The raise; last to take a loss",
      funded: true,
      fill: "var(--theme-navy)",
      lossLayer: true,
    },
    {
      name: "Jr",
      amount: jt,
      ratio: per100(jt),
      floorRatio: per100(floor.jt),
      description: `First loss; meets ${pct(coverage)} minimum coverage at the ${pct(targetUtilization)} target`,
      funded: coverage > 0,
      fill: "var(--theme-brown)",
      lossLayer: true,
    },
    {
      name: "SLP",
      amount: lt,
      ratio: per100(lt),
      floorRatio: per100(floor.lt),
      description: `Exit liquidity; meets ${pct(minLiquidity)} minimum liquidity at the ${pct(targetUtilization)} target`,
      funded: minLiquidity > 0,
      fill: "var(--theme-green)",
      lossLayer: false,
    },
  ];

  return (
    <Card weight="primary">
      <CardHeader>
        <div className="flex items-baseline justify-between gap-2">
          <CardTitle>What it takes to open</CardTitle>
          <DayV2DocsLink label="How tranching works" topic="tranching" />
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="mx-auto w-full max-w-[260px] shrink-0 lg:mx-0 lg:w-[260px]">
          {/* Per 100 of Senior, exactly like the table beside it. Passing the
              raw balances printed $40000000.0 on the Senior block: `initialST`
              is a modelling basis, not anybody's raise. */}
          <DayV2StackDiagram
            jt={per100(jt)}
            jtFloor={per100(floor.jt)}
            lt={per100(lt)}
            ltFloor={per100(floor.lt)}
            st={100}
            unit={unit}
          />
          <p className="mt-2 max-w-[46ch] text-[10.5px] leading-snug text-[var(--tertiary)]">
            Dashed markers show minimums; lighter caps show target headroom.
          </p>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/* One column rhythm for the whole block, set once here and reused by
            every row and the total, so the three numeric columns line up
            without any row restating a width. */}
          <div className="hidden items-baseline gap-3 pl-3.5 pr-3.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--tertiary)] sm:flex">
            <span className="min-w-0 flex-1">Leg</span>
            <span className="w-[86px] shrink-0 text-right">Target</span>
            <span className="w-[86px] shrink-0 text-right">Minimum</span>
            <span className="w-[54px] shrink-0 text-right">Share</span>
          </div>

          <ul className="flex flex-col gap-2">
            {legs.map((leg) => (
              <li
                className={`flex min-w-0 flex-col gap-0.5 rounded-lg border px-3.5 py-2.5 ${
                  leg.funded
                    ? "border-[var(--border-subtle)] bg-[var(--foundation)]"
                    : "border-dashed border-[var(--border-subtle)]"
                }`}
                key={leg.name}
                // The loss ordering, drawn rather than stated: a left edge in the
                // leg's own colour on the two tranches that actually absorb, and
                // none on the pool, which does not.
                style={
                  leg.lossLayer && leg.funded
                    ? { borderLeftColor: leg.fill, borderLeftWidth: 3 }
                    : undefined
                }
              >
                <span className="grid grid-cols-3 items-start gap-x-3 gap-y-2 sm:flex sm:items-center sm:gap-3">
                  <span className="col-span-3 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 sm:flex-1">
                    <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
                      {leg.name}
                    </span>
                    <span className="text-[11px] leading-snug text-[var(--tertiary)]">
                      {leg.description}
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-col gap-1 sm:w-[86px] sm:shrink-0 sm:text-right">
                    <span className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[var(--tertiary)] sm:hidden">
                      Target
                    </span>
                    <span
                      className="font-mono text-[14px] font-semibold leading-none tabular-nums"
                      style={
                        leg.funded ? undefined : { color: "var(--tertiary)" }
                      }
                    >
                      {leg.funded ? unitRatio(leg.ratio, unit) : "none"}
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-col gap-1 sm:w-[86px] sm:shrink-0 sm:text-right">
                    <span className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[var(--tertiary)] sm:hidden">
                      Minimum
                    </span>
                    <span
                      className="font-mono text-[14px] font-semibold leading-none tabular-nums text-[var(--tertiary)]"
                      title={
                        leg.floorRatio === null
                          ? "Senior is the basis. It does not move with utilization."
                          : "The least capital that satisfies the requirement, which is 100% utilization with no headroom."
                      }
                    >
                      {leg.floorRatio === null
                        ? "basis"
                        : leg.funded
                          ? unitRatio(leg.floorRatio, unit)
                          : "none"}
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-col gap-1 text-right sm:w-[54px] sm:shrink-0">
                    <span className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[var(--tertiary)] sm:hidden">
                      Share
                    </span>
                    <span className="font-mono text-[14px] font-semibold leading-none tabular-nums text-[var(--tertiary)]">
                      {leg.funded ? `${share(leg.amount).toFixed(1)}%` : "0%"}
                    </span>
                  </span>
                </span>
              </li>
            ))}
          </ul>

          {/* Totals are grouped away from the three funded positions so summary
            rows cannot be mistaken for additional tranches. */}
          <div className="mt-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--card)] px-3.5">
            <div className="grid grid-cols-3 items-start gap-x-3 gap-y-2 py-2.5 sm:flex sm:items-center sm:gap-3">
              <span className="col-span-3 flex min-w-0 flex-col gap-0.5 sm:flex-1">
                <span className="text-[11px] font-semibold text-[var(--secondary)]">
                  In the yield source
                </span>
                <span className="text-[11px] leading-snug text-[var(--tertiary)]">
                  Sr, Jr, and SLP&apos;s {pct(poolSeniorWeight)} Sr allocation
                </span>
              </span>
              <span className="flex min-w-0 flex-col gap-1 sm:w-[86px] sm:shrink-0 sm:text-right">
                <span className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[var(--tertiary)] sm:hidden">
                  Target
                </span>
                <span className="font-mono text-[14px] font-semibold leading-none tabular-nums">
                  {unitRatio(
                    dayCapitalInYieldSource(
                      { st: 100, jt: per100(jt), lt: per100(lt) },
                      poolSeniorWeight,
                    ),
                    unit,
                  )}
                </span>
              </span>
              <span className="flex min-w-0 flex-col gap-1 sm:w-[86px] sm:shrink-0 sm:text-right">
                <span className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[var(--tertiary)] sm:hidden">
                  Minimum
                </span>
                <span className="font-mono text-[14px] font-semibold leading-none tabular-nums text-[var(--tertiary)]">
                  {unitRatio(
                    dayCapitalInYieldSource(
                      { st: 100, jt: per100(floor.jt), lt: per100(floor.lt) },
                      poolSeniorWeight,
                    ),
                    unit,
                  )}
                </span>
              </span>
              <span className="flex min-w-0 flex-col gap-1 text-right sm:w-[54px] sm:shrink-0">
                <span className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[var(--tertiary)] sm:hidden">
                  Share
                </span>
                <span className="font-mono text-[14px] font-semibold leading-none tabular-nums text-[var(--tertiary)]">
                  {`${((dayCapitalInYieldSource({ st, jt, lt }, poolSeniorWeight) / total) * 100).toFixed(1)}%`}
                </span>
              </span>
            </div>

            <div className="grid grid-cols-3 items-baseline gap-x-3 gap-y-2 border-t border-[var(--border-subtle)] py-2.5 sm:flex sm:gap-3">
              <span className="col-span-3 min-w-0 text-[11px] font-semibold text-[var(--secondary)] sm:flex-1">
                Total capital
              </span>
              <span className="flex min-w-0 flex-col gap-1 sm:w-[86px] sm:shrink-0 sm:text-right">
                <span className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[var(--tertiary)] sm:hidden">
                  Target
                </span>
                <span className="font-mono text-[14px] font-bold leading-none tabular-nums">
                  {unitRatio(100 + per100(jt) + per100(lt), unit)}
                </span>
              </span>
              <span className="flex min-w-0 flex-col gap-1 sm:w-[86px] sm:shrink-0 sm:text-right">
                <span className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[var(--tertiary)] sm:hidden">
                  Minimum
                </span>
                <span className="font-mono text-[14px] font-bold leading-none tabular-nums text-[var(--tertiary)]">
                  {unitRatio(100 + per100(floor.jt) + per100(floor.lt), unit)}
                </span>
              </span>
              <span className="flex min-w-0 flex-col gap-1 text-right sm:w-[54px] sm:shrink-0">
                <span className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[var(--tertiary)] sm:hidden">
                  Share
                </span>
                <span className="font-mono text-[14px] font-bold leading-none tabular-nums text-[var(--tertiary)]">
                  100.0%
                </span>
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default memo(DayV2CapitalStack);
