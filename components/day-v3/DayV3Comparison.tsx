"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import DayV3DocsLink from "@/components/day-v3/DayV3DocsLink";
import {
  pct,
  stake100,
  unitAmount,
  type DayV3Unit,
} from "@/components/day-v3/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Where each position's yield comes from, measured rather than apportioned.
// Every component is the difference between two `runDayTargetScenario` runs
// with a premium switched off, so the parts are engine output and they sum to
// the engine's own total exactly. Nothing here divides a number by hand.
export type DayV3PositionBreakdown = {
  tone: "senior" | "junior" | "liquidity";
  name: string;
  short: string;
  apy: number;
  funded: boolean;
  role: string;
  /** Engine-measured starting contribution for the sequential breakdown. */
  base: number;
  /** Change after the risk-premium run. */
  riskDelta: number;
  /** Change after the liquidity-premium run. */
  liqDelta: number;
  /** True when this position holds the source asset itself. */
  holdsSource: boolean;
};

/**
 * Tone as a dot rather than a second chip. With the short names in the titles,
 * a badge reading "SR" next to a heading reading "Sr" said the same thing
 * twice, so the colour stays and the duplicate words go. The badge is kept for
 * the one state that adds information, which is a position with no capital.
 */
export const DAY_V3_TONE_DOT: Record<DayV3PositionBreakdown["tone"], string> = {
  senior: "var(--theme-navy)",
  junior: "var(--theme-brown)",
  liquidity: "var(--theme-green)",
};

export function DayV3ToneDot({
  tone,
}: {
  tone: DayV3PositionBreakdown["tone"];
}) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ background: DAY_V3_TONE_DOT[tone] }}
    />
  );
}

const signed = (value: number) =>
  `${value < 0 ? "-" : "+"}${Math.abs(value * 100).toFixed(2)}%`;
/**
 * The build-up is stated to the same precision throughout. The table above
 * rounds to a tenth for scanning, but inside the expansion the lines have to
 * add up on screen: mixing a 5.8% anchor with -0.02% components gives a reader
 * a column that visibly does not reconcile.
 */
const exact = (value: number) => `${(value * 100).toFixed(2)}%`;

function Line({
  label,
  note,
  value,
}: {
  label: string;
  note?: string;
  value: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-[var(--border-subtle)] py-1 last:border-b-0">
      <span className="text-[11.5px] text-[var(--secondary)]">
        {label}
        {/* Parenthesised so the label and its gloss do not read as one run-on
            sentence: "Pool base the stable side plus trading fees on the pool". */}
        {note ? (
          <span className="text-[var(--tertiary)]"> ({note})</span>
        ) : null}
      </span>
      <span className="font-mono text-[11.5px] tabular-nums whitespace-nowrap">
        {value}
      </span>
    </div>
  );
}

export default function DayV3Comparison({
  poolEconomics,
  positions,
  shares,
  source,
  unit,
}: {
  /** How the two premiums were priced, so Simulate can show the derivation it
   *  has no controls for. */
  shares: {
    coveragePct: number;
    curveOverridden: boolean;
    deploying: boolean;
    liquidityPct: number;
    riskSharePct: number;
    liqSharePct: number;
    targetUtilization: number;
    onOpenDeploy: () => void;
  };
  /** The venue assumptions the pool base rests on, read off the run's config. */
  poolEconomics: {
    stableYield: number | null;
    swapFeeBps: number | null;
    turnoverPerYear: number | null;
  };
  positions: DayV3PositionBreakdown[];
  source: number;
  unit: DayV3Unit;
}) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Card weight="quiet">
      <CardHeader>
        <div className="flex items-baseline justify-between gap-2">
          <CardTitle>Position comparison</CardTitle>
          <DayV3DocsLink label="How yield is split" topic="yieldSplit" />
        </div>
        {/* A basis is prose, not status. Badges are for state. */}
        <CardDescription>
          Returns on {stake100(unit)} over one year. Select any position for its
          breakdown.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* Simulate has no control for either share, so it has to say where they
            came from. Otherwise the two premiums are numbers that appear from
            nowhere and the reader cannot tell whether they were chosen. */}
        <p className="max-w-[76ch] rounded-lg border border-dashed border-[var(--border-subtle)] px-3.5 py-2.5 text-[11px] leading-relaxed text-[var(--secondary)]">
          {shares.curveOverridden
            ? "Manual yield-share curves. "
            : "Source-model yield-share curves. "}
          At the {pct(shares.targetUtilization)} target, Jr receives{" "}
          <strong className="font-mono font-semibold tabular-nums">
            {pct(shares.riskSharePct / 100)}
          </strong>{" "}
          of Sr yield at {pct(shares.coveragePct / 100)} minimum coverage; SLP
          receives{" "}
          <strong className="font-mono font-semibold tabular-nums">
            {pct(shares.liqSharePct / 100)}
          </strong>{" "}
          at {pct(shares.liquidityPct / 100)} minimum liquidity. These curves
          are visible simulation assumptions; V3 does not export them as
          issuer-approved deployment terms.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Position</TableHead>
              <TableHead>What it does</TableHead>
              <TableHead className="text-right">End value</TableHead>
              <TableHead className="text-right">Avg / year</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* The source is the base the split starts from, not a fourth
                position competing with the other three. */}
            <TableRow>
              <TableCell className="font-semibold whitespace-nowrap">
                Source
              </TableCell>
              <TableCell className="text-[var(--secondary)]">
                The yield before it is split
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {unitAmount(100 * (1 + source), unit)}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {pct(source)}
              </TableCell>
              <TableCell />
            </TableRow>

            {positions.map((position) => {
              const expanded = open === position.short;
              const detailsId = `day-v3-${position.short.toLowerCase()}-breakdown`;
              const toggle = () => {
                if (!position.funded) return;
                setOpen(expanded ? null : position.short);
              };
              return [
                <TableRow
                  aria-controls={position.funded ? detailsId : undefined}
                  aria-expanded={position.funded ? expanded : undefined}
                  aria-label={
                    position.funded
                      ? `${expanded ? "Hide" : "Show"} where ${position.name}'s yield comes from`
                      : undefined
                  }
                  className={
                    position.funded
                      ? "cursor-pointer outline-none hover:bg-[var(--foundation)] focus-visible:bg-[var(--foundation)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--foreground)]"
                      : undefined
                  }
                  key={position.short}
                  onClick={position.funded ? toggle : undefined}
                  onKeyDown={
                    position.funded
                      ? (event) => {
                          if (event.key !== "Enter" && event.key !== " ")
                            return;
                          event.preventDefault();
                          toggle();
                        }
                      : undefined
                  }
                  tabIndex={position.funded ? 0 : undefined}
                >
                  <TableCell className="font-semibold whitespace-nowrap">
                    <span className="flex items-center gap-2">
                      <DayV3ToneDot tone={position.tone} />
                      {position.name}
                      {position.funded ? null : (
                        <Badge tone="neutral">not funded</Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-[var(--secondary)]">
                    {position.role}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {unitAmount(
                      position.funded ? 100 * (1 + position.apy) : 100,
                      unit,
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold tabular-nums">
                    {position.funded ? pct(position.apy) : "0.0%"}
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      aria-hidden="true"
                      className={`inline-flex size-7 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--foundation)] text-[var(--tertiary)] transition-transform ${
                        expanded ? "rotate-180" : ""
                      }`}
                    >
                      <svg className="size-3" fill="none" viewBox="0 0 16 16">
                        <path
                          d="m4 6 4 4 4-4"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.5"
                        />
                      </svg>
                    </span>
                  </TableCell>
                </TableRow>,
                expanded ? (
                  <TableRow id={detailsId} key={`${position.short}-detail`}>
                    <TableCell className="bg-[var(--foundation)]" colSpan={5}>
                      <div className="flex flex-col gap-0.5 py-1">
                        {position.holdsSource ? (
                          <Line
                            label="Return before the displayed premiums"
                            value={exact(position.base)}
                          />
                        ) : (
                          <Line
                            label="SLP pool carry"
                            note={
                              poolEconomics.stableYield === null ||
                              poolEconomics.swapFeeBps === null ||
                              poolEconomics.turnoverPerYear === null
                                ? "Live template fee unresolved; no exit-asset yield or swap-volume income is forecast"
                                : poolEconomics.stableYield === 0 &&
                                    poolEconomics.turnoverPerYear === 0
                                  ? `${poolEconomics.swapFeeBps} bps live fee prices execution; V3 forecasts no exit-asset yield or swap-volume income`
                                  : `Sr/exit-asset mix; ${pct(poolEconomics.stableYield)} exit yield; ${poolEconomics.swapFeeBps} bps × ${poolEconomics.turnoverPerYear}x modeled swaps`
                            }
                            value={exact(position.base)}
                          />
                        )}
                        <Line
                          label={
                            position.riskDelta >= 0
                              ? "Risk premium received"
                              : "Risk premium paid to Jr"
                          }
                          note={
                            position.riskDelta >= 0
                              ? "for standing in first loss"
                              : undefined
                          }
                          value={signed(position.riskDelta)}
                        />
                        <Line
                          label={
                            position.liqDelta >= 0
                              ? "Liquidity premium received"
                              : "Liquidity premium paid to SLP"
                          }
                          note={
                            position.liqDelta >= 0
                              ? "for holding the exit pool"
                              : undefined
                          }
                          value={signed(position.liqDelta)}
                        />
                        <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-[var(--border-subtle)] pt-1.5">
                          <span className="text-[11.5px] font-semibold">
                            {position.name} keeps
                          </span>
                          <span className="font-mono text-[12.5px] font-bold tabular-nums">
                            {exact(position.apy)}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null,
              ];
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
