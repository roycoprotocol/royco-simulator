"use client";

import { useState, type ReactNode } from "react";

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
  /** Exact capital or fee inputs are still being validated. This is distinct
   * from an issuer intentionally leaving the position unfunded. */
  pending?: boolean;
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

export type DayV3PoolCarryBreakdown = {
  /** Carry earned by the Senior-share side of the resting pool. */
  seniorShareCarry: number;
  /** Carry earned by the exit-asset side of the resting pool. */
  exitAssetCarry: number;
  /** Fee income produced by the modeled annual swap volume. */
  swapFeeIncome: number;
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
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-b border-[var(--border-subtle)] py-2 last:border-b-0">
      <span className="text-[11.5px] font-medium text-[var(--secondary)]">
        {label}
      </span>
      <span className="row-span-2 font-mono text-[11.5px] font-semibold tabular-nums whitespace-nowrap">
        {value}
      </span>
      {note ? (
        <span className="mt-0.5 text-[10px] leading-snug text-[var(--tertiary)]">
          {note}
        </span>
      ) : null}
    </div>
  );
}

function BreakdownGroup({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <section className="rounded-lg border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2">
      <h4 className="border-b border-[var(--border-subtle)] pb-2 text-[9.5px] font-semibold uppercase tracking-[0.11em] text-[var(--tertiary)]">
        {label}
      </h4>
      {children}
    </section>
  );
}

function ResultLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--foundation)] px-3 py-2.5">
      <span className="text-[12px] font-semibold">{label}</span>
      <span className="font-mono text-[13px] font-bold tabular-nums">
        {value}
      </span>
    </div>
  );
}

export function DayV3PoolCarryLines({
  breakdown,
  poolEconomics,
  source,
  total,
}: {
  breakdown: DayV3PoolCarryBreakdown;
  poolEconomics: {
    seniorWeight: number;
    stableYield: number | null;
    swapFeeBps: number | null;
    turnoverPerYear: number | null;
  };
  source: number;
  total: number;
}) {
  const exitAssetWeight = Math.max(0, 1 - poolEconomics.seniorWeight);
  const swapFeeNote =
    poolEconomics.swapFeeBps === null
      ? "Live execution fee unresolved"
      : poolEconomics.turnoverPerYear === null
        ? `${poolEconomics.swapFeeBps} bps execution · annual volume unresolved`
        : poolEconomics.turnoverPerYear === 0
          ? `${poolEconomics.swapFeeBps} bps execution · no annual volume forecast`
          : `${poolEconomics.swapFeeBps} bps execution · ${poolEconomics.turnoverPerYear}x annual turnover`;

  return (
    <BreakdownGroup label="Pool carry">
      <Line
        label="Senior shares"
        note={`${pct(poolEconomics.seniorWeight)} of pool · ${pct(source)} source APY`}
        value={signed(breakdown.seniorShareCarry)}
      />
      <Line
        label="Exit asset"
        note={`${pct(exitAssetWeight)} of pool · ${poolEconomics.stableYield === null ? "yield unresolved" : `${pct(poolEconomics.stableYield)} modeled yield`}`}
        value={signed(breakdown.exitAssetCarry)}
      />
      <Line
        label="Swap fees"
        note={swapFeeNote}
        value={signed(breakdown.swapFeeIncome)}
      />
      <div className="flex items-center justify-between gap-3 pt-2">
        <span className="text-[11.5px] font-semibold">Pool carry subtotal</span>
        <span className="font-mono text-[12.5px] font-bold tabular-nums">
          {exact(total)}
        </span>
      </div>
    </BreakdownGroup>
  );
}

export default function DayV3Comparison({
  poolCarry,
  poolEconomics,
  positions,
  shares,
  source,
  unit,
}: {
  /** Engine-differential decomposition of the SLP's return before premiums. */
  poolCarry: DayV3PoolCarryBreakdown;
  /** How the two premiums were priced, so Simulate can show the derivation it
   *  has no controls for. */
  shares: {
    coveragePct: number;
    curveOverridden: boolean;
    liquidityPct: number;
    riskSharePct: number;
    liqSharePct: number;
    targetUtilization: number;
  };
  /** The venue assumptions the pool base rests on, read off the run's config. */
  poolEconomics: {
    seniorWeight: number;
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
            ? "Issuer-edited static yield-share curves. "
            : "Illustrative V3 yield-share curves. "}
          At the {pct(shares.targetUtilization)} target, Jr receives{" "}
          <strong className="font-mono font-semibold tabular-nums">
            {pct(shares.riskSharePct / 100)}
          </strong>{" "}
          of Sr yield at {pct(shares.coveragePct / 100)} minimum coverage; SLP
          receives{" "}
          <strong className="font-mono font-semibold tabular-nums">
            {pct(shares.liqSharePct / 100)}
          </strong>{" "}
          at {pct(shares.liquidityPct / 100)} minimum liquidity.{" "}
          {shares.curveOverridden
            ? "These anchors drive every model here. RWA deployment must still validate the final registered YDM policy."
            : "These are visible starting assumptions—not facts supplied by the custom source. Adjust the yield split above."}
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
                        <Badge tone="neutral">
                          {position.pending ? "validating" : "not funded"}
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-[var(--secondary)]">
                    {position.role}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {position.pending
                      ? "—"
                      : unitAmount(
                          position.funded ? 100 * (1 + position.apy) : 100,
                          unit,
                        )}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold tabular-nums">
                    {position.pending
                      ? "—"
                      : position.funded
                        ? pct(position.apy)
                        : "0.0%"}
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
                      <div className="flex flex-col gap-3 py-1">
                        {position.holdsSource ? (
                          <BreakdownGroup label="Starting return">
                            <Line
                              label="Return before premiums"
                              value={exact(position.base)}
                            />
                          </BreakdownGroup>
                        ) : (
                          <DayV3PoolCarryLines
                            breakdown={poolCarry}
                            poolEconomics={poolEconomics}
                            source={source}
                            total={position.base}
                          />
                        )}
                        <BreakdownGroup label="Premium flows">
                          <Line
                            label="Junior risk premium"
                            note="Senior pays Junior for first-loss protection"
                            value={signed(position.riskDelta)}
                          />
                          <Line
                            label="SLP liquidity premium"
                            note="Senior pays SLP for holding the exit pool"
                            value={signed(position.liqDelta)}
                          />
                        </BreakdownGroup>
                        <ResultLine
                          label={`${position.name} keeps`}
                          value={exact(position.apy)}
                        />
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
