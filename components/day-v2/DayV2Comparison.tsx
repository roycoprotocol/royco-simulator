"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { pct, stake100, unitAmount, type DayV2Unit } from "@/components/day-v2/format";
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
export type DayV2PositionBreakdown = {
  tone: "senior" | "junior" | "liquidity";
  name: string;
  short: string;
  apy: number;
  funded: boolean;
  role: string;
  /** Return with both premiums switched off. */
  base: number;
  /** What switching the risk premium on did to this position. */
  riskDelta: number;
  /** What switching the liquidity premium on then did. */
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
export const DAY_V2_TONE_DOT: Record<DayV2PositionBreakdown["tone"], string> = {
  senior: "var(--theme-navy)",
  junior: "var(--theme-brown)",
  liquidity: "var(--theme-green)",
};

export function DayV2ToneDot({ tone }: { tone: DayV2PositionBreakdown["tone"] }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ background: DAY_V2_TONE_DOT[tone] }}
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
        {note ? <span className="text-[var(--tertiary)]"> ({note})</span> : null}
      </span>
      <span className="font-mono text-[11.5px] tabular-nums whitespace-nowrap">{value}</span>
    </div>
  );
}

export default function DayV2Comparison({
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
    liquidityPct: number;
    riskSharePct: number;
    liqSharePct: number;
    targetUtilization: number;
    onOpenDeploy: () => void;
  };
  /** The venue assumptions the pool base rests on, read off the run's config. */
  poolEconomics: { stableYield: number; swapFeeBps: number; turnoverPerYear: number };
  positions: DayV2PositionBreakdown[];
  source: number;
  unit: DayV2Unit;
}) {
  // Stated from the config rather than written into the copy, so the conditions
  // quoted here are the ones the engine actually ran with.
  const swapApy = (poolEconomics.turnoverPerYear * poolEconomics.swapFeeBps) / 10_000;
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Card weight="quiet">
      <CardHeader>
        <CardTitle>Position comparison</CardTitle>
        {/* A basis is prose, not status. Badges are for state. */}
        <CardDescription>
          What each position pays on {stake100(unit)} over a year, and which part of the
          mechanism pays it. Open a row to see the build-up.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* Simulate has no control for either share, so it has to say where they
            came from. Otherwise the two premiums are numbers that appear from
            nowhere and the reader cannot tell whether they were chosen. */}
        <p className="max-w-[76ch] rounded-lg border border-dashed border-[var(--border-subtle)] px-3.5 py-2.5 text-[11px] leading-relaxed text-[var(--secondary)]">
          The two premiums are not set by hand here. Each tranche is priced for what it
          supplies: at {pct(shares.coveragePct / 100)} coverage Jr is paid{" "}
          <strong className="font-mono font-semibold tabular-nums">
            {pct(shares.riskSharePct / 100)}
          </strong>{" "}
          of Sr&apos;s yield, and at {pct(shares.liquidityPct / 100)} liquidity SLP is paid{" "}
          <strong className="font-mono font-semibold tabular-nums">
            {pct(shares.liqSharePct / 100)}
          </strong>
          , both read off their own curve at the {pct(shares.targetUtilization)} target.
          Move coverage or liquidity and the shares move with them.{" "}
          <button
            className="font-semibold text-[var(--foreground)] underline underline-offset-2"
            onClick={shares.onOpenDeploy}
            type="button"
          >
            Set the curves yourself in Deploy
          </button>
          .
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
              <TableCell className="font-semibold whitespace-nowrap">Source</TableCell>
              <TableCell className="text-[var(--secondary)]">
                The yield before it is split
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {unitAmount(100 * (1 + source), unit)}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">{pct(source)}</TableCell>
              <TableCell />
            </TableRow>

            {positions.map((position) => {
              const expanded = open === position.short;
              // The engine's own residual: whatever the position's no-premium
              // return does that the raw source rate does not explain.
              const drag = position.base - source;
              return [
                <TableRow
                  key={position.short}
                >
                  <TableCell className="font-semibold whitespace-nowrap">
                    <span className="flex items-center gap-2">
                      <DayV2ToneDot tone={position.tone} />
                      {position.name}
                      {position.funded ? null : <Badge tone="neutral">not funded</Badge>}
                    </span>
                  </TableCell>
                  <TableCell className="text-[var(--secondary)]">{position.role}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {unitAmount(position.funded ? 100 * (1 + position.apy) : 100, unit)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold tabular-nums">
                    {position.funded ? pct(position.apy) : "0.0%"}
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      aria-expanded={expanded}
                      aria-label={`${expanded ? "Hide" : "Show"} where ${position.name}'s yield comes from`}
                      className="rounded-md border border-[var(--border-subtle)] bg-[var(--foundation)] px-1.5 py-0.5 font-mono text-[11px] leading-none"
                      disabled={!position.funded}
                      onClick={() => setOpen(expanded ? null : position.short)}
                      type="button"
                    >
                      {expanded ? "–" : "+"}
                    </button>
                  </TableCell>
                </TableRow>,
                expanded ? (
                  <TableRow key={`${position.short}-detail`}>
                    <TableCell className="bg-[var(--foundation)]" colSpan={5}>
                      <div className="flex flex-col gap-0.5 py-1">
                        {position.holdsSource ? (
                          <>
                            <Line label="Source yield" value={exact(source)} />
                            {Math.abs(drag) >= 0.00005 ? (
                              <Line
                                label="Pool and fee drag"
                                note="protocol fees and the pool's own composition"
                                value={signed(drag)}
                              />
                            ) : null}
                          </>
                        ) : (
                          <Line
                            label="Pool base"
                            note="stable leg plus trading fees"
                            value={exact(position.base)}
                          />
                        )}
                        <Line
                          label={
                            position.riskDelta >= 0
                              ? "Risk premium received"
                              : "Risk premium paid to Jr"
                          }
                          note={position.riskDelta >= 0 ? "for standing in first loss" : undefined}
                          value={signed(position.riskDelta)}
                        />
                        <Line
                          label={
                            position.liqDelta >= 0
                              ? "Liquidity premium received"
                              : "Liquidity premium paid to SLP"
                          }
                          note={position.liqDelta >= 0 ? "for holding the exit pool" : undefined}
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
                        {/* The pool base is the one line here that is not a
                            property of the mechanism. It is three venue
                            assumptions, and a reader is entitled to know which,
                            because two of them are someone else's behaviour. */}
                        {position.holdsSource ? null : (
                          <p className="mt-1.5 rounded-md border border-dashed border-[var(--border-subtle)] px-2.5 py-2 text-[10px] leading-relaxed text-[var(--secondary)]">
                            The pool base holds only if all three are true: the stable leg
                            earns{" "}
                            <strong className="font-mono font-semibold tabular-nums">
                              {pct(poolEconomics.stableYield)}
                            </strong>{" "}
                            a year, the pool charges{" "}
                            <strong className="font-mono font-semibold tabular-nums">
                              {poolEconomics.swapFeeBps} bps
                            </strong>{" "}
                            a swap, and it trades{" "}
                            <strong className="font-mono font-semibold tabular-nums">
                              {poolEconomics.turnoverPerYear}x
                            </strong>{" "}
                            its own value a year, which is worth {pct(swapApy)}. Volume is
                            assumed, not derived from the depth curve. If nobody trades, that{" "}
                            {pct(swapApy)} is zero and the base is the stable leg alone.
                          </p>
                        )}
                        <p className="pt-1.5 text-[10px] leading-snug text-[var(--tertiary)]">
                          Each line is the change in this position&apos;s rate when that
                          premium is switched on, taken in the order shown, so the lines
                          add up to the rate above exactly.
                        </p>
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
