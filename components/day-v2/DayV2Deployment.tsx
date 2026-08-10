"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { pct } from "@/components/day-v2/format";
import {
  DAY_DEPLOYMENT_INPUT_IDS,
  EMPTY_DAY_DEPLOYMENT_FIELDS,
  buildDayConfigExport,
  dayConfigExportFilename,
  type DayDeploymentFieldId,
  type DayDeploymentFieldValues,
  type DayDeploymentInputValues,
} from "@/lib/day-simulator-template/config-export";
import type { DaySimulatorDefaults } from "@/lib/day-simulator-template/market";

// Field labels, units and grouping mirror the deploy flow's own checklist as it
// is already encoded in `config-export.ts`. Nothing here is invented, and the
// export payload is built by `buildDayConfigExport` rather than assembled by
// hand, so the file this page writes is the file the flow expects.
type Field =
  | { kind: "modeled"; label: string; value: string }
  | { kind: "fixed"; label: string; value: string }
  | { kind: "declared"; label: string; id: DayDeploymentFieldId; unit?: string; placeholder?: string };

export default function DayV2Deployment({
  defaults,
  market,
  modeled,
  terms,
}: {
  defaults: DaySimulatorDefaults;
  market: { id: string; name: string; asset: string; variant: string };
  modeled: {
    seniorApy: number;
    juniorApy: number;
    liquidityApy: number;
    coverageLossLimit: number;
    referenceSellShareOfSenior: number;
    boundarySellShareOfSenior: number;
  };
  terms: {
    coveragePct: number;
    minLiquidityPct: number;
    eclpBandWidthPct: number;
    riskSharePct: number;
    liqSharePct: number;
    observationDays: number;
    sourceApyPct: number;
  };
}) {
  const [values, setValues] = useState<DayDeploymentFieldValues>(EMPTY_DAY_DEPLOYMENT_FIELDS);
  const set = (id: DayDeploymentFieldId, value: string) =>
    setValues((current) => ({ ...current, [id]: value }));

  const groups: { title: string; fields: Field[] }[] = [
    {
      title: "Token and deployment",
      fields: [
        { kind: "modeled", label: "Market name", value: market.name },
        { kind: "declared", label: "Token contract source", id: "tokenContractSource" },
        { kind: "declared", label: "Token contract address", id: "tokenContractAddress" },
        { kind: "declared", label: "Chain", id: "chain" },
      ],
    },
    {
      title: "Market terms",
      fields: [
        { kind: "modeled", label: "Net underlying APY", value: `${terms.sourceApyPct.toFixed(1)}%` },
        { kind: "modeled", label: "Minimum coverage", value: `${terms.coveragePct.toFixed(1)}%` },
        { kind: "modeled", label: "Observation period", value: `${terms.observationDays} days` },
      ],
    },
    {
      title: "Yield-share curve",
      fields: [
        {
          kind: "modeled",
          label: "Yield share at low utilization (Y0)",
          value: pct(Math.min(defaults.riskYDM.y0, terms.riskSharePct / 100)),
        },
        {
          kind: "modeled",
          label: "Yield share at target utilization (YT)",
          value: pct(terms.riskSharePct / 100),
        },
        {
          kind: "declared",
          label: "Yield share at full utilization (Y100)",
          id: "yieldShareAtFullUtilization",
          placeholder: (defaults.riskYDM.y100 * 100).toFixed(0),
          unit: "%",
        },
        { kind: "fixed", label: "Target utilization", value: "90%" },
        // Adaptive-only and optional, and every registry market runs a static
        // curve, so this is undefined everywhere. Modeling it printed the
        // literal string "undefined". Root's treatment is the correct one: with
        // no value to model it is a field the deployer still has to declare.
        defaults.riskYDM.maxAdaptSpeedPerYear === undefined
          ? { kind: "declared", label: "Adaptation speed", id: "adaptationSpeed" }
          : {
            kind: "modeled",
            label: "Adaptation speed",
            value: String(defaults.riskYDM.maxAdaptSpeedPerYear),
          },
      ],
    },
    {
      title: "Liquidity venue",
      fields: [
        { kind: "declared", label: "Exit asset", id: "exitAsset" },
        { kind: "declared", label: "Exit asset priced flat", id: "exitAssetStatic", placeholder: "yes / no" },
        { kind: "declared", label: "Exit liquidity", id: "exitLiquidity", placeholder: "$" },
        { kind: "declared", label: "NAV update cadence", id: "navUpdateCadence", unit: "days" },
        { kind: "declared", label: "Redemption delay", id: "redemptionDelay", unit: "days" },
        { kind: "declared", label: "Restock hurdle", id: "restockHurdle", unit: "bps" },
        { kind: "declared", label: "Maximum discount", id: "maximumDiscount", unit: "bps" },
        { kind: "declared", label: "Maximum premium", id: "maximumPremium", unit: "bps" },
        { kind: "declared", label: "Depth at NAV", id: "depthAtNav" },
        {
          kind: "declared",
          label: "Reinvestment slippage tolerance",
          id: "reinvestmentSlippageTolerance",
          unit: "bps",
        },
      ],
    },
    {
      title: "Recovery",
      fields: [
        {
          kind: "declared",
          label: "Protected exit threshold",
          id: "protectedExitThreshold",
          placeholder: defaults.exitBufferPct.toFixed(2).replace(/\.00$/, ""),
          unit: "%",
        },
        {
          kind: "declared",
          label: "Self-liquidation bonus",
          id: "selfLiquidationBonus",
          placeholder: (defaults.selfLiquidationBonus * 100).toFixed(0),
          unit: "%",
        },
      ],
    },
  ];

  const declaredIds = groups.flatMap((group) =>
    group.fields.filter((field): field is Extract<Field, { kind: "declared" }> => field.kind === "declared")
      .map((field) => field.id),
  );
  const filled = declaredIds.filter((id) => values[id].trim() !== "").length;

  const download = () => {
    const exportedAt = new Date().toISOString();
    const deploymentInputs = Object.fromEntries(
      DAY_DEPLOYMENT_INPUT_IDS.map((id) => [id, values[id]]),
    ) as DayDeploymentInputValues;
    const payload = buildDayConfigExport({
      exportedAt,
      market,
      presetId: null,
      terms: {
        coveragePct: terms.coveragePct,
        minLiquidityPct: terms.minLiquidityPct,
        eclpBandWidthPct: terms.eclpBandWidthPct,
        riskSharePct: terms.riskSharePct,
        liqSharePct: terms.liqSharePct,
        observationDays: terms.observationDays,
        sourceApyPct: terms.sourceApyPct,
        maintainCoverage: defaults.maintainCoverage,
        y100SharePct: Number(values.yieldShareAtFullUtilization) || defaults.riskYDM.y100 * 100,
        exitBufferPct: Number(values.protectedExitThreshold) || defaults.exitBufferPct,
        selfLiquidationBonusPct:
          Number(values.selfLiquidationBonus) || defaults.selfLiquidationBonus * 100,
      },
      // This page applies no hypothetical shock to the source, and the payload
      // has to say so or the modeled figures get read as stressed results.
      scenario: { sourceStressPct: 0 },
      modeled,
      deploymentInputs,
    });
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = dayConfigExportFilename(market.name, exportedAt);
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportSummary = filled === declaredIds.length
    ? "all declared"
    : `${declaredIds.length - filled} of ${declaredIds.length} still to declare`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Deployment and venue terms</CardTitle>
          <Badge tone={filled === declaredIds.length ? "liquidity" : "caution"}>
            {exportSummary}
          </Badge>
        </div>
        <CardDescription>
          Every parameter a real market needs. The simulator above runs on a subset.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <p className="max-w-[70ch] text-[14.5px] leading-relaxed text-[var(--foreground)]">
          Filling these in does not move a single figure above, and that is the
          honest answer rather than an omission. This page models the market at its
          90% target utilization, where the top of the yield-share curve and the
          recovery terms never bind. They still have to be declared to deploy, and
          they decide what happens in the cases this page does not model.
        </p>

        {/* Column-packed rather than a grid. The five groups are very uneven
            (the liquidity venue has three times the fields of recovery), and on
            a grid the short ones leave a quarter of the card empty. */}
        <div className="gap-x-6 [column-fill:balance] md:columns-2 xl:columns-3">
          {groups.map((group) => (
            <div className="mb-5 flex break-inside-avoid flex-col gap-2" key={group.title}>
              <h3 className="border-b border-[var(--border-subtle)] pb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
                {group.title}
              </h3>
              {group.fields.map((field) => (
                <div className="flex flex-col gap-1" key={field.label}>
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-[11.5px] leading-snug text-[var(--secondary)]">
                      {field.label}
                    </span>
                    {field.kind === "declared" ? null : (
                      <span className="font-mono text-[12px] font-semibold tabular-nums whitespace-nowrap">
                        {field.value}
                      </span>
                    )}
                  </span>
                  {field.kind === "declared" ? (
                    <span className="flex items-center gap-1.5">
                      <input
                        aria-label={field.label}
                        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--foundation)] px-2 py-1 font-mono text-[12px] tabular-nums"
                        onChange={(event) => set(field.id, event.target.value)}
                        placeholder={field.placeholder ?? "Not provided"}
                        value={values[field.id]}
                      />
                      {field.unit ? (
                        <span className="text-[10px] text-[var(--tertiary)]">{field.unit}</span>
                      ) : null}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--border-subtle)] pt-3">
          <span className="mr-auto text-[11px] text-[var(--tertiary)]">
            Exports the terms above, the figures this page modeled from them, and
            whatever has been declared so far.
          </span>
          <button
            className="rounded-lg border border-[var(--foreground)] bg-[var(--foreground)] px-3.5 py-1.5 text-[12px] font-semibold text-[var(--background)]"
            onClick={download}
            type="button"
          >
            Export config
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
