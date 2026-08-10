"use client";

import { useDeferredValue, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import DayV2Chart, { type DayV2Point } from "@/components/day-v2/DayV2Chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DayMarket } from "@/lib/day-simulator-template/market";
import { runDayTargetScenario } from "@/lib/day-simulator-template/runtime";

// The accountant is not reimplemented here. Every number on this page comes from
// `runDayTargetScenario`, the same target-scenario entry point the interactive
// simulator uses, so v2 and /day-sim can never disagree.
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

function Slider({
  label,
  display,
  max,
  min,
  onChange,
  note,
  step,
  value,
}: {
  label: string;
  display: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  note: string;
  step: number;
  value: number;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
          {label}
        </span>
        <span className="font-mono text-[15px] font-bold tabular-nums">{display}</span>
      </span>
      <input
        className="day-v2-range"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
      <span className="text-[10px] leading-snug text-[var(--tertiary)]">{note}</span>
    </label>
  );
}

export default function DayV2Summary({
  initialMarket,
  markets,
}: {
  initialMarket: DayMarket;
  markets: readonly DayMarket[];
}) {
  const [marketId, setMarketId] = useState(initialMarket.id);
  const market = markets.find((candidate) => candidate.id === marketId) ?? initialMarket;
  const defaults = market.defaults;
  const [coveragePct, setCoveragePct] = useState(defaults.coverage * 100);
  const [liquidityPct, setLiquidityPct] = useState(defaults.minLiquidity * 100);
  const [sourceApyPct, setSourceApyPct] = useState(defaults.sourceApy * 100);

  // Switching market adopts that market's own terms, so the sliders describe the
  // market on screen rather than carrying the previous one's numbers over.
  const selectMarket = (nextId: string) => {
    const next = markets.find((candidate) => candidate.id === nextId);
    if (!next) return;
    setMarketId(nextId);
    setCoveragePct(next.defaults.coverage * 100);
    setLiquidityPct(next.defaults.minLiquidity * 100);
    setSourceApyPct(next.defaults.sourceApy * 100);
  };

  // Keeps the controls responsive while the engine re-runs, the same pattern the
  // main simulator uses after measuring input lag.
  const inputs = useDeferredValue({ coveragePct, liquidityPct, sourceApyPct });

  const scenario = useMemo(() => {
    const coverage = inputs.coveragePct / 100;
    const minLiquidity = inputs.liquidityPct / 100;
    return runDayTargetScenario({
      ...defaults,
      coverage,
      minLiquidity,
      sourceApy: inputs.sourceApyPct / 100,
      // A tranche with no capital cannot be paid a premium, so its share goes to
      // zero with its requirement. Without this Sr keeps paying a counterparty
      // that does not exist.
      riskYDM: { ...defaults.riskYDM, yTarget: coverage > 0 ? defaults.riskYDM.yTarget : 0 },
      liqYDM: { ...defaults.liqYDM, yTarget: minLiquidity > 0 ? defaults.liqYDM.yTarget : 0 },
    });
  }, [defaults, inputs]);

  const chartData = useMemo<DayV2Point[]>(() => {
    const grow = (apy: number, months: number) => 100 * (1 + apy) ** (months / 12);
    return Array.from({ length: 13 }, (_, month) => ({
      month,
      senior: grow(scenario.seniorApy, month),
      junior: grow(scenario.juniorApy, month),
      liquidity: grow(scenario.liquidityApy, month),
    }));
  }, [scenario]);

  const source = inputs.sourceApyPct / 100;
  const positions = [
    {
      tone: "senior" as const,
      name: "Senior",
      short: "Sr",
      apy: scenario.seniorApy,
      holds: "The strategy asset, protected by Junior",
      risk: coveragePct > 0
        ? "Loses value only after Junior is exhausted"
        : "Unprotected. No Junior capital stands in front of it",
      funded: true,
    },
    {
      tone: "junior" as const,
      name: "Junior",
      short: "Jr",
      apy: scenario.juniorApy,
      holds: "First-loss coverage for Senior",
      risk: "Absorbs the first losses, in full",
      funded: coveragePct > 0,
    },
    {
      tone: "liquidity" as const,
      name: "Senior LP",
      short: "SLP",
      apy: scenario.liquidityApy,
      holds: "The pool Senior exits into",
      risk: "Holds Senior shares when Senior sells",
      funded: liquidityPct > 0,
    },
  ];

  return (
    <div className="royco-v2 flex flex-col gap-6 px-5 py-8 sm:px-8">
      <header className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
            Yield source
          </span>
          <select
            aria-label="Yield source"
            className="w-full max-w-[420px] rounded-lg border border-[var(--border-subtle)] bg-[var(--card)] px-3 py-2 text-[13px] font-medium"
            onChange={(event) => selectMarket(event.target.value)}
            value={marketId}
          >
            {markets.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.identity.marketName}
              </option>
            ))}
          </select>
        </label>
        <h1 className="max-w-[24ch] text-[clamp(28px,3.4vw,44px)] font-semibold leading-[1.05] tracking-[-0.02em]">
          One yield source, split into three risks.
        </h1>
        <p className="max-w-[62ch] text-[13.5px] leading-relaxed text-[var(--secondary)]">
          This market earns{" "}
          <strong className="font-semibold text-[var(--foreground)]">{pct(source)}</strong> a year
          before it is split. Move the terms below and every figure updates.
        </p>
      </header>

      {/* Controls first, because this is a simulator: the reader should meet the
          thing they can change before the numbers it changes. */}
      <section
        aria-label="Terms"
        className="grid grid-cols-1 gap-x-6 gap-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-5 py-4 sm:grid-cols-3"
      >
        <Slider
          display={pct(sourceApyPct / 100)}
          label="Source yield"
          max={30}
          min={0}
          note="Before the split"
          onChange={setSourceApyPct}
          step={0.1}
          value={sourceApyPct}
        />
        <Slider
          display={pct(coveragePct / 100)}
          label="Coverage"
          max={25}
          min={0}
          note="Junior per unit of Senior"
          onChange={setCoveragePct}
          step={0.5}
          value={coveragePct}
        />
        <Slider
          display={pct(liquidityPct / 100)}
          label="Liquidity"
          max={25}
          min={0}
          note="Pool depth for Senior"
          onChange={setLiquidityPct}
          step={0.5}
          value={liquidityPct}
        />
      </section>

      {/* Three peers, scanned across: identical slots, so the eye compares the
          rate first and reads detail only if it wants to. */}
      <section aria-label="Positions" className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {positions.map((position) => (
          <Card
            key={position.short}
            className={position.funded ? undefined : "opacity-55"}
            style={position.funded ? undefined : { borderStyle: "dashed" }}
          >
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>{position.name}</CardTitle>
                <Badge tone={position.funded ? position.tone : "neutral"}>
                  {position.funded ? position.short : "not funded"}
                </Badge>
              </div>
              <CardDescription>{position.holds}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-[30px] font-bold leading-none tracking-[-0.02em] tabular-nums">
                  {position.funded ? pct(position.apy) : "0.0%"}
                </span>
                <span className="text-[11px] text-[var(--tertiary)]">a year</span>
              </div>
              <p className="border-t border-[var(--border-subtle)] pt-2 text-[11.5px] leading-relaxed text-[var(--secondary)]">
                {position.risk}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>$100 in each position, over a year</CardTitle>
          <CardDescription>
            Each line compounds that position&apos;s rate above. It shows what the
            terms pay, not what a bad year does to them: there is no drawdown in
            this projection.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DayV2Chart data={chartData} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Position comparison</CardTitle>
          <CardDescription>
            $100 into each position, held for a year at these terms.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Position</TableHead>
                <TableHead>What it does</TableHead>
                <TableHead className="text-right">End value</TableHead>
                <TableHead className="text-right">Avg / year</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-semibold">Source</TableCell>
                <TableCell className="text-[var(--secondary)]">
                  Baseline, before the split
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  ${(100 * (1 + source)).toFixed(2)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {pct(source)}
                </TableCell>
              </TableRow>
              {positions.map((position) => (
                <TableRow key={position.short} className={position.funded ? undefined : "opacity-55"}>
                  <TableCell className="font-semibold whitespace-nowrap">
                    {position.name}
                  </TableCell>
                  <TableCell className="text-[var(--secondary)]">{position.risk}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    ${(position.funded ? 100 * (1 + position.apy) : 100).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {position.funded ? pct(position.apy) : "0.0%"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="max-w-[70ch] text-[10.5px] leading-relaxed text-[var(--tertiary)]">
        Educational simulator only. No securities are offered through this page.
        Figures are mechanism simulations at the target utilization, not
        historical backtests, forecasts, or announced terms.
      </p>
    </div>
  );
}
