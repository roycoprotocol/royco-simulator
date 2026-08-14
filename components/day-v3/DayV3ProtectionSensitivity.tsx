"use client";

import DayV3DocsLink from "@/components/day-v3/DayV3DocsLink";
import {
  Card,
  CardContent,
  CardNote,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { recommendDayV3Coverage } from "@/lib/day-v3/protection";
import type { DaySimulatorDefaults } from "@/lib/day-simulator-template/market";

export type DayV3ProtectionSensitivityPoint = {
  drawdownPct: number;
  coveragePct: number | null;
  juniorPer100: number | null;
  selected: boolean;
};

/**
 * Presents repeated `recommendDayV3Coverage` results. Bar widths only place
 * the already-normalized percentages; every displayed requirement and capital
 * amount comes back from a separate shared-accountant solve.
 */
export default function DayV3ProtectionSensitivity({
  defaults,
  selectedDrawdownPct,
}: {
  defaults: DaySimulatorDefaults;
  selectedDrawdownPct: number | null;
}) {
  if (selectedDrawdownPct === null) {
    return (
      <Card data-accountant-source="recommendDayV3Coverage">
        <CardHeader className="gap-0.5 px-4 pt-3.5">
          <CardTitle className="text-[13.5px]">Protection sensitivity</CardTitle>
          <CardNote>
            Choose a protected source drawdown to compare the Junior capital
            required at smaller and larger shocks.
          </CardNote>
        </CardHeader>
      </Card>
    );
  }

  const drawdowns = [
    Math.max(0.01, selectedDrawdownPct * 0.5),
    selectedDrawdownPct,
    Math.min(95, selectedDrawdownPct * 1.5),
    Math.min(95, selectedDrawdownPct * 2),
  ].filter(
    (value, index, all) =>
      all.findIndex((candidate) => Math.abs(candidate - value) < 1e-9) ===
      index,
  );
  const points: DayV3ProtectionSensitivityPoint[] = drawdowns.map(
    (drawdownPct) => {
      const recommendation = recommendDayV3Coverage(defaults, {
        protectedDrawdownPct: drawdownPct,
      });
      return {
        drawdownPct,
        coveragePct: recommendation.coverage.value,
        juniorPer100: recommendation.capital?.juniorPer100 ?? null,
        selected: Math.abs(drawdownPct - selectedDrawdownPct) < 1e-9,
      };
    },
  );
  const maxCoverage = Math.max(
    1,
    ...points.map((point) => point.coveragePct ?? 0),
  );

  return (
    <Card
      data-accountant-source="recommendDayV3Coverage"
      data-model-source="recommendDayV3Coverage"
    >
      <CardHeader className="gap-0.5 px-4 pt-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle className="text-[13.5px]">
            Protection sensitivity
          </CardTitle>
          <DayV3DocsLink label="Minimum coverage" topic="coverage" />
        </div>
        <CardNote>
          How larger source shocks change the smallest Minimum Coverage and
          Junior capital required per $100 Senior.
        </CardNote>
      </CardHeader>

      <CardContent className="px-4 pb-4 flex flex-col gap-4">
        <div className="flex flex-col gap-2" aria-label="Protection sensitivity bars">
          {points.map((point) => (
            <div
              className={`grid grid-cols-[54px_minmax(0,1fr)_64px] items-center gap-3 rounded-md px-2 py-1.5 ${
                point.selected
                  ? "bg-[color-mix(in_srgb,var(--theme-brown)_9%,transparent)]"
                  : ""
              }`}
              key={point.drawdownPct}
            >
              <span className="font-mono text-[10.5px] font-semibold tabular-nums">
                {point.drawdownPct.toFixed(1)}% fall
              </span>
              <span className="h-2.5 overflow-hidden rounded-full bg-[var(--foundation)]">
                <span
                  className="block h-full rounded-full bg-[var(--theme-brown)]"
                  style={{
                    width: `${Math.max(
                      0,
                      Math.min(
                        100,
                        ((point.coveragePct ?? 0) / maxCoverage) * 100,
                      ),
                    )}%`,
                  }}
                />
              </span>
              <span className="text-right font-mono text-[11px] font-semibold tabular-nums">
                {point.coveragePct === null
                  ? "infeasible"
                  : `${point.coveragePct.toFixed(2)}%`}
              </span>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source drawdown</TableHead>
                <TableHead className="text-right">Minimum Coverage</TableHead>
                <TableHead className="text-right">Junior / $100 Senior</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {points.map((point) => (
                <TableRow
                  className={
                    point.selected
                      ? "bg-[color-mix(in_srgb,var(--theme-brown)_9%,transparent)]"
                      : undefined
                  }
                  key={point.drawdownPct}
                >
                  <TableCell className="font-mono font-semibold tabular-nums">
                    {point.drawdownPct.toFixed(1)}%
                    {point.selected ? " · selected" : ""}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {point.coveragePct === null
                      ? "Infeasible"
                      : `${point.coveragePct.toFixed(2)}%`}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {point.juniorPer100 === null
                      ? "—"
                      : `$${point.juniorPer100.toFixed(2)}`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <p className="text-[10.5px] leading-relaxed text-[var(--tertiary)]">
          Each row independently searches the shared accountant for the
          smallest deployable coverage setting that leaves Senior whole.
          Recovery time is separate: it changes how long a temporary loss may
          recover, not the capital required to absorb the initial shock.
        </p>
      </CardContent>
    </Card>
  );
}
