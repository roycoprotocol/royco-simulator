"use client";

import { memo } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DAY_V2_TONE_DOT } from "@/components/day-v2/DayV2Comparison";
import { compactAmount, pct, type DayV2Unit } from "@/components/day-v2/format";

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
 * and the rates are two readings of one market. Measured across all 13 markets
 * and six coverage settings, to 1e-12:
 *
 *   coverageLossLimit === junior / (senior + junior) === coverage / target
 *
 * which is why the caption below can chain the issuer's whole trade together:
 * a coverage setting fixes a Junior raise, and that raise is exactly the source
 * fall Senior is protected through. It holds at the 90% target, which is where
 * every figure on this page is read, and not away from it.
 */
function DayV2CapitalStack({
  balances,
  coverage,
  coverageLossLimit,
  minLiquidity,
  targetUtilization,
  unit,
}: {
  balances: { st: number; jt: number; lt: number };
  coverage: number;
  coverageLossLimit: number;
  minLiquidity: number;
  targetUtilization: number;
  unit: DayV2Unit;
}) {
  const { st, jt, lt } = balances;
  // Senior is the reference, not a fourth figure: an issuer picks the Senior
  // raise and asks what else has to stand beside it, so the page answers in
  // those terms. A "Senior: 100 per 100 of Senior" cell said nothing.
  const per100 = (value: number) => (st > 0 ? (value / st) * 100 : 0);
  const legs = [
    {
      tone: "junior" as const,
      name: "Junior",
      amount: jt,
      ratio: per100(jt),
      note: `Meets the ${pct(coverage)} coverage requirement at the ${pct(targetUtilization)} target`,
      funded: coverage > 0,
    },
    {
      tone: "liquidity" as const,
      name: "Exit pool",
      amount: lt,
      ratio: per100(lt),
      note: `Meets the ${pct(minLiquidity)} liquidity requirement at the ${pct(targetUtilization)} target`,
      funded: minLiquidity > 0,
    },
    {
      tone: "senior" as const,
      name: "Total capital",
      amount: st + jt + lt,
      ratio: 100 + per100(jt) + per100(lt),
      note: "Everything that has to be standing before the market can open",
      funded: true,
    },
  ];

  return (
    <Card weight="primary">
      <CardHeader>
        <CardTitle>What it takes to open</CardTitle>
        <CardDescription>
          For every 100 of Senior you raise, this is what has to stand beside it. Sized
          by the engine rather than read off the requirement, because a requirement is
          not a tranche size.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {legs.map((leg) => (
            <div
              className="flex flex-col gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-4 py-3"
              key={leg.name}
              style={leg.funded ? undefined : { borderStyle: "dashed" }}
            >
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{
                    background: leg.funded
                      ? DAY_V2_TONE_DOT[leg.tone]
                      : `color-mix(in srgb, ${DAY_V2_TONE_DOT[leg.tone]} 30%, transparent)`,
                  }}
                />
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
                  {leg.name}
                </span>
              </span>
              <span className="flex items-baseline gap-1.5">
                <span
                  className="font-mono text-[24px] font-bold leading-none tracking-[-0.02em] tabular-nums"
                  style={leg.funded ? undefined : { color: "var(--tertiary)" }}
                >
                  {leg.ratio.toFixed(1)}
                </span>
                <span className="text-[10.5px] text-[var(--tertiary)]">per 100 of Senior</span>
              </span>
              <span className="text-[10.5px] leading-snug text-[var(--tertiary)]">{leg.note}</span>
            </div>
          ))}
        </div>

        {/* The absolute figures are secondary and labelled as a basis on
            purpose. Eleven of the thirteen markets ship `initialST` as 1000,
            which is a normalizing unit rather than anybody's raise, so leading
            with "$1.00k to open" would read as a capital plan and be one. */}
        <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-[var(--border-subtle)] pt-3 font-mono text-[11.5px] tabular-nums text-[var(--tertiary)]">
          <span>Modelled here at</span>
          <span>Sr {compactAmount(st, unit)}</span>
          <span>Jr {coverage > 0 ? compactAmount(jt, unit) : "none"}</span>
          <span>pool {minLiquidity > 0 ? compactAmount(lt, unit) : "none"}</span>
        </p>

        {/* The issuer's whole trade in one chain, and every link of it is a
            measured engine identity rather than an arrangement of the same
            number three ways. */}
        {coverage > 0 ? (
          <p className="text-[11.5px] leading-relaxed text-[var(--secondary)]">
            Coverage of{" "}
            <strong className="font-mono font-semibold tabular-nums">{pct(coverage)}</strong> is a
            requirement, not a Junior size. Meeting it at the{" "}
            <strong className="font-mono font-semibold tabular-nums">
              {pct(targetUtilization)}
            </strong>{" "}
            target takes Junior capital equal to{" "}
            <strong className="font-mono font-semibold tabular-nums">
              {per100(jt).toFixed(1)}%
            </strong>{" "}
            of Senior, which is{" "}
            <strong className="font-mono font-semibold tabular-nums">
              {pct(coverageLossLimit)}
            </strong>{" "}
            of the two together, and that is exactly the source fall Senior is protected
            through.
          </p>
        ) : (
          <p className="text-[11.5px] leading-relaxed text-[var(--secondary)]">
            At zero coverage no Junior capital is raised and Senior is unprotected: the
            first dollar the source loses is Senior&apos;s. Nothing is paid for cover
            either, which is why Senior keeps the whole rate above.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default memo(DayV2CapitalStack);
