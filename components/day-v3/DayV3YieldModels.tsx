import DayV3DocsLink from "@/components/day-v3/DayV3DocsLink";
import DayV3YieldCurve from "@/components/day-v3/DayV3YieldCurve";
import {
  Card,
  CardContent,
  CardNote,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Curve = { y0: number; yTarget: number; y100: number };

export default function DayV3YieldModels({
  curveOverridden = false,
  liquidity,
  risk,
  seniorShareOfCapital,
  sourceApy,
  target,
}: {
  curveOverridden?: boolean;
  liquidity: Curve;
  risk: Curve;
  seniorShareOfCapital: number;
  sourceApy: number;
  target: number;
}) {
  return (
    <Card
      data-model-source="runDayTargetScenario-yield-share-curves"
      weight="quiet"
    >
      <CardHeader className="gap-0.5 px-4 pt-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle className="text-[13.5px]">Premium curves</CardTitle>
          <DayV3DocsLink label="Yield split" topic="yieldSplit" />
        </div>
        <CardNote>
          {curveOverridden
            ? "The Junior and SLP anchors set above. Deployment still validates the registered YDM policy."
            : "How each tranche's share of Senior yield moves as its capital is used. Adjust them in the yield split."}
        </CardNote>
      </CardHeader>
      <CardContent className="px-4 pb-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <strong className="text-[12px] font-semibold">
              Junior premium
            </strong>
            <span className="text-[9.5px] uppercase tracking-[0.08em] text-[var(--tertiary)]">
              coverage utilization
            </span>
          </div>
          <DayV3YieldCurve
            paidTo="Jr"
            seniorShareOfCapital={seniorShareOfCapital}
            sourceApy={sourceApy}
            target={target}
            y0={risk.y0}
            y100={risk.y100}
            yTarget={risk.yTarget}
          />
        </section>
        <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <strong className="text-[12px] font-semibold">SLP premium</strong>
            <span className="text-[9.5px] uppercase tracking-[0.08em] text-[var(--tertiary)]">
              liquidity utilization
            </span>
          </div>
          <DayV3YieldCurve
            paidTo="SLP"
            seniorShareOfCapital={seniorShareOfCapital}
            sourceApy={sourceApy}
            target={target}
            y0={liquidity.y0}
            y100={liquidity.y100}
            yTarget={liquidity.yTarget}
          />
        </section>
      </CardContent>
    </Card>
  );
}
