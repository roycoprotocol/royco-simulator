"use client";

import { memo, useDeferredValue, useState } from "react";

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
import type { DayIssuerPresetId } from "@/lib/day-simulator-template/issuer-presets";
import type { DaySimulatorDefaults } from "@/lib/day-simulator-template/market";

// Field labels, units and grouping mirror the deploy flow's own checklist as it
// is already encoded in `config-export.ts`. Nothing here is invented, and the
// export payload is built by `buildDayConfigExport` rather than assembled by
// hand, so the file this page writes is the file the flow expects.
type Field =
  // Set by a control in Market parameters above; moving it changes every figure.
  | { kind: "live"; label: string; value: string }
  // Fixed by the template or the mechanism, not a choice.
  | { kind: "fixed"; label: string; value: string }
  // Required at launch, does not move the modeled figures, so it is collected
  // here rather than simulated.
  | { kind: "declared"; label: string; id: DayDeploymentFieldId; unit?: string; placeholder?: string }
  // The deploy flow reads, probes or computes it and a simulator cannot.
  | { kind: "flow"; label: string; note: string };

function DayV2Deployment({
  defaults,
  market,
  modeled: modeledInput,
  terms: termsInput,
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
    maintainCoverage: boolean;
    y100SharePct: number;
    presetId: DayIssuerPresetId | null;
  };
}) {
  // The modeled figures and terms are read-only here, so they can lag a frame
  // behind a slider without anyone noticing. The declared fields are local
  // state and stay instant.
  const modeled = useDeferredValue(modeledInput);
  const terms = useDeferredValue(termsInput);
  const [values, setValues] = useState<DayDeploymentFieldValues>(EMPTY_DAY_DEPLOYMENT_FIELDS);
  const set = (id: DayDeploymentFieldId, value: string) =>
    setValues((current) => ({ ...current, [id]: value }));

  // Grouped and ordered exactly as the real deploy flow names its steps, so a
  // reader who learns these headings meets the same ones when they get there.
  // Verified against royco-rwa-frontend lib/deploy-market/constants.ts
  // (DEPLOY_STEPS). There is deliberately no "Recovery" group: the flow puts
  // the protected exit fields on its coverage step.
  const groups: { title: string; caption: string; fields: Field[] }[] = [
    {
      title: "Yield source",
      caption: "The asset being tranched.",
      fields: [
        { kind: "live", label: "Market name", value: market.name },
        { kind: "live", label: "Net underlying APY", value: `${terms.sourceApyPct.toFixed(1)}%` },
        { kind: "declared", label: "Token contract source", id: "tokenContractSource" },
        { kind: "declared", label: "Token contract address", id: "tokenContractAddress" },
        { kind: "declared", label: "Chain", id: "chain" },
        {
          kind: "flow",
          label: "Senior, Junior and Senior LP token names",
          note: "Suggested from the asset, editable in the flow",
        },
      ],
    },
    {
      title: "Pricing",
      caption: "How the market values the asset. Probed on chain, so none of it can be settled here.",
      fields: [
        { kind: "flow", label: "Market denomination", note: "USD, BTC or ETH" },
        { kind: "flow", label: "Price oracle", note: "Deployed or reused, then validated on chain" },
        { kind: "flow", label: "Pricing route", note: "Detected from the asset contract" },
        { kind: "flow", label: "Max time between price updates", note: "Set against the oracle you use" },
      ],
    },
    {
      title: "Coverage and liquidity",
      caption: "The accountant terms. Every one of these moves the figures above.",
      fields: [
        { kind: "live", label: "Minimum coverage", value: `${terms.coveragePct.toFixed(1)}%` },
        { kind: "live", label: "Minimum liquidity", value: `${terms.minLiquidityPct.toFixed(1)}%` },
        { kind: "live", label: "Observation period", value: `${terms.observationDays} days` },
        {
          kind: "declared",
          label: "Observation grace period",
          id: "observationGracePeriod",
          unit: "days",
        },
        {
          kind: "declared",
          label: "Protected exit threshold",
          id: "protectedExitThreshold",
          placeholder: defaults.exitBufferPct.toFixed(2).replace(/\.00$/, ""),
          unit: "%",
        },
        {
          kind: "declared",
          label: "Protected exit bonus",
          id: "selfLiquidationBonus",
          placeholder: (defaults.selfLiquidationBonus * 100).toFixed(0),
          unit: "%",
        },
      ],
    },
    {
      title: "Yield split",
      caption: "What Junior and Senior LP are paid, and the ceiling on each.",
      fields: [
        { kind: "fixed", label: "Risk pricing model", value: "Static curve" },
        {
          kind: "live",
          label: "Junior share at 0% utilization (Y0)",
          value: pct(Math.min(defaults.riskYDM.y0, terms.riskSharePct / 100)),
        },
        {
          kind: "live",
          label: "Junior share at target (YT)",
          value: pct(terms.riskSharePct / 100),
        },
        {
          kind: "live",
          label: "Junior share at 100% utilization (Y100)",
          value: pct(terms.y100SharePct / 100),
        },
        { kind: "live", label: "Senior LP share at target", value: pct(terms.liqSharePct / 100) },
        { kind: "fixed", label: "Target utilization", value: "90%" },
        {
          kind: "declared",
          label: "Junior yield share cap",
          id: "juniorYieldShareCap",
          placeholder: (Math.max(defaults.riskYDM.y0, defaults.riskYDM.y100) * 100).toFixed(0),
          unit: "%",
        },
        {
          kind: "declared",
          label: "Senior LP yield share cap",
          id: "seniorLpYieldShareCap",
          placeholder: (Math.max(defaults.liqYDM.y0, defaults.liqYDM.y100) * 100).toFixed(0),
          unit: "%",
        },
        // Adaptive-only. Every registry market runs a static curve, so with a
        // static model selected there is nothing to declare and showing the row
        // only adds a permanently blank box to the count.
        ...(defaults.riskYDM.mode === "adaptive"
          ? [{
            kind: "declared" as const,
            label: "Adaptation speed",
            id: "adaptationSpeed" as const,
          }]
          : []),
      ],
    },
    {
      title: "Liquidity venue",
      caption: "The pool Senior exits into. Sized here, deployed with the market.",
      fields: [
        { kind: "live", label: "Pool band", value: pct(terms.eclpBandWidthPct / 100) },
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
        { kind: "flow", label: "Swap fee", note: "Template policy, read from the chain" },
      ],
    },
    {
      title: "Settlement",
      caption:
        "The deposit and withdrawal queues. One set of values, applied to Senior, Junior and Senior LP alike.",
      fields: [
        { kind: "fixed", label: "Settlement queues", value: "Always on" },
        {
          kind: "declared",
          label: "Gate deposits and withdrawals by price updates",
          id: "gateByPriceUpdates",
          placeholder: "yes / no",
        },
        { kind: "declared", label: "Deposit settlement delay", id: "depositSettlementDelay", unit: "days" },
        { kind: "declared", label: "Deposit expiry", id: "depositExpiry", unit: "days" },
        {
          kind: "declared",
          label: "Withdrawal settlement delay",
          id: "withdrawalSettlementDelay",
          unit: "days",
        },
        { kind: "declared", label: "Withdrawal expiry", id: "withdrawalExpiry", unit: "days" },
      ],
    },
    {
      title: "Review and deploy",
      caption: "Resolved when you get there. Nothing here can be settled in a simulator.",
      fields: [
        { kind: "flow", label: "Market ID", note: "Mined so the Senior address sorts below the exit asset" },
        { kind: "flow", label: "Genesis seed", note: "Funded in the flow, in the exit asset" },
        { kind: "flow", label: "Predicted addresses", note: "Derived from the mined ID" },
      ],
    },
  ];


  const download = () => {
    const exportedAt = new Date().toISOString();
    const deploymentInputs = Object.fromEntries(
      DAY_DEPLOYMENT_INPUT_IDS.map((id) => [id, values[id]]),
    ) as DayDeploymentInputValues;
    const payload = buildDayConfigExport({
      exportedAt,
      market,
      presetId: terms.presetId,
      terms: {
        coveragePct: terms.coveragePct,
        minLiquidityPct: terms.minLiquidityPct,
        eclpBandWidthPct: terms.eclpBandWidthPct,
        riskSharePct: terms.riskSharePct,
        liqSharePct: terms.liqSharePct,
        observationDays: terms.observationDays,
        sourceApyPct: terms.sourceApyPct,
        maintainCoverage: terms.maintainCoverage,
        y100SharePct: terms.y100SharePct,
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

  // A raw count of blank boxes is not readiness: it weights a field with a sane
  // default the same as one with none, so it always reads as blocked and tells
  // a reader nothing about what to do next. Only the fields with no default can
  // actually stop a deployment, so only those are named.
  const isDeclared = (field: Field): field is Extract<Field, { kind: "declared" }> =>
    field.kind === "declared";
  // Per group, not per field. A flat list of sixteen labels is a wall, and the
  // useful question is not "which sixteen" but "where do I go next".
  const outstanding = groups
    .map((group) => ({
      title: group.title,
      count: group.fields
        .filter(isDeclared)
        .filter((field) => field.placeholder === undefined && values[field.id].trim() === "")
        .length,
    }))
    .filter((group) => group.count > 0);
  const blockingCount = outstanding.reduce((total, group) => total + group.count, 0);
  const ready = blockingCount === 0;
  const exportSummary = ready
    ? "ready to open the flow"
    : `${blockingCount} still to decide`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Deployment and venue terms</CardTitle>
          <Badge tone={ready ? "liquidity" : "caution"}>
            {exportSummary}
          </Badge>
        </div>
        <CardDescription>
          Everything a real market is deployed with, grouped and ordered the way the
          Royco deploy flow asks for it.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <p className="max-w-[72ch] text-[14.5px] leading-relaxed text-[var(--foreground)]">
          {ready
            ? "Every parameter without a sensible default now has a value. Take this to the deploy flow."
            : "These are the parameters a real market is deployed with. The ones already showing a value are set by the controls above or come from the template. The rest are yours to decide, and the flow will ask for them in this order."}
        </p>

        {ready ? null : (
          <ul className="flex flex-wrap gap-2">
            {outstanding.map((group) => (
              <li key={group.title}>
                <a
                  className="flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--theme-gold)_45%,transparent)] bg-[color-mix(in_srgb,var(--theme-gold)_12%,transparent)] px-2.5 py-1 text-[11px] font-semibold text-[var(--gold-emphasis)]"
                  href={`#day-v2-group-${group.title.replace(/\s+/g, "-").toLowerCase()}`}
                >
                  {group.title}
                  <span className="font-mono tabular-nums">{group.count}</span>
                </a>
              </li>
            ))}
          </ul>
        )}

        {/* The taxonomy, stated once. Two rendering rules carry it after that: a
            value the page models is never a text box, and a value it does not
            model never gets a slider. */}
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 rounded-xl border border-[var(--border-subtle)] px-4 py-3 text-[10.5px] leading-snug sm:grid-cols-3">
          {([
            ["Shown as a value", "Set by a control above. Moving it changes every figure on this page."],
            ["Shown as a box", "Required at launch. It does not move the figures above, so it is collected rather than simulated."],
            ["Marked in the flow", "The deploy flow reads or computes it on chain. A simulator cannot settle it."],
          ] as const).map(([term, detail]) => (
            <div key={term}>
              <dt className="font-semibold text-[var(--foreground)]">{term}</dt>
              <dd className="text-[var(--tertiary)]">{detail}</dd>
            </div>
          ))}
        </dl>

        {/* Two explicit columns, not CSS masonry. This list is walked in the
            order the flow asks for it, and column-fill reorders it. */}
        <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-2">
          {groups.map((group) => (
            <div className="flex flex-col gap-2" key={group.title}>
              <h3
                className="border-b border-[var(--border-subtle)] pb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]"
                id={`day-v2-group-${group.title.replace(/\s+/g, "-").toLowerCase()}`}
              >
                {group.title}
              </h3>
              <p className="-mt-1 text-[10.5px] leading-snug text-[var(--tertiary)]">
                {group.caption}
              </p>
              {group.fields.map((field) => (
                <div className="flex flex-col gap-1" key={field.label}>
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-[11.5px] leading-snug text-[var(--secondary)]">
                      {field.label}
                    </span>
                    {field.kind === "live" || field.kind === "fixed" ? (
                      <span className="font-mono text-[12px] font-semibold tabular-nums whitespace-nowrap">
                        {field.value}
                      </span>
                    ) : null}
                    {field.kind === "flow" ? (
                      <span className="text-[10.5px] text-[var(--tertiary)] whitespace-nowrap">
                        in the flow
                      </span>
                    ) : null}
                  </span>
                  {field.kind === "flow" ? (
                    <span className="text-[10.5px] leading-snug text-[var(--tertiary)]">
                      {field.note}
                    </span>
                  ) : null}
                  {field.kind === "declared" ? (
                    <span className="flex items-center gap-1.5">
                      <input
                        aria-label={field.label}
                        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--background)] px-2 py-1 font-mono text-[12px] tabular-nums"
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

export default memo(DayV2Deployment);
