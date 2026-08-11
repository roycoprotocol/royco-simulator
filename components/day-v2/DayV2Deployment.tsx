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
  | { kind: "live"; label: string; value: string; hint?: string }
  // Fixed by the template or the mechanism, not a choice.
  | { kind: "fixed"; label: string; value: string; hint?: string }
  // Required at launch, does not move the modeled figures, so it is collected
  // here rather than simulated.
  | {
    kind: "declared";
    label: string;
    id: DayDeploymentFieldId;
    unit?: string;
    placeholder?: string;
    hint?: string;
  }
  // The deploy flow reads, probes or computes it and a simulator cannot.
  | { kind: "flow"; label: string; note: string; hint?: string };

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
  // What a deployer actually has to decide, and nothing else. The contract
  // address, chain and token metadata are entered in the deploy flow against a
  // live chain, so collecting them here is busywork that cannot be validated.
  // Defaults are the reference values the real pool step ships, so nobody
  // starts from an empty box (royco-rwa-frontend lib/deploy-market/pool-controls.ts).
  const groups: { title: string; caption: string; fields: Field[] }[] = [
    {
      title: "Coverage and liquidity",
      caption: "The accountant terms. These move every figure on this page.",
      fields: [
        {
          kind: "live",
          label: "Minimum coverage",
          value: `${terms.coveragePct.toFixed(1)}%`,
          hint: "The Jr capital the market requires per unit of Sr. Coverage utilization is this requirement divided by the Jr actually there.",
        },
        {
          kind: "live",
          label: "Minimum liquidity",
          value: `${terms.minLiquidityPct.toFixed(1)}%`,
          hint: "The pool depth the market requires per unit of Sr, and the base of the SLP premium.",
        },
        {
          kind: "live",
          label: "Observation period",
          value: `${terms.observationDays} days`,
          hint: "How long a loss has to persist before it is finalized against Jr. A fall that recovers inside the window never becomes a realized loss. Capped at about 194 days by the contract's uint24 seconds field.",
        },
        {
          kind: "declared",
          label: "Observation grace period",
          id: "observationGracePeriod",
          unit: "days",
          placeholder: "7",
          hint: "Extra time after the observation period before the loss is finalized. The deploy flow will not let you continue without it whenever coverage is on.",
        },
        {
          kind: "declared",
          label: "Protected exit threshold",
          id: "protectedExitThreshold",
          placeholder: defaults.exitBufferPct.toFixed(2).replace(/\.00$/, ""),
          unit: "%",
          hint: "How little coverage may remain before Sr can self-liquidate at a bonus. The flow derives the on-chain utilization multiple from this, so it is entered as a share, never as the raw multiple.",
        },
        {
          kind: "declared",
          label: "Protected exit bonus",
          id: "selfLiquidationBonus",
          placeholder: (defaults.selfLiquidationBonus * 100).toFixed(0),
          unit: "%",
          hint: "What Sr is paid on top for self-liquidating once the threshold is crossed. Must be below 100%, and the flow wants it at or under the threshold so the advertised rate is actually payable.",
        },
      ],
    },
    {
      title: "Yield split",
      caption: "Set by the two curves above. Shown here so the whole design reads in one place.",
      fields: [
        {
          kind: "live",
          label: "Jr share at target (YT)",
          value: pct(terms.riskSharePct / 100),
          hint: "The share of Sr's yield Jr is paid at the 90% target, which is where this page reads the coverage curve.",
        },
        {
          kind: "live",
          label: "SLP share at target",
          value: pct(terms.liqSharePct / 100),
          hint: "The share of Sr's yield SLP is paid at the 90% target on the liquidity curve.",
        },
        {
          kind: "live",
          label: "Jr cap (curve peak)",
          value: pct(terms.y100SharePct / 100),
          hint: "The contract reads each cap off the highest point of its own curve, and rejects a market whose two caps exceed 100% together.",
        },
        { kind: "fixed", label: "Target utilization", value: "90%", hint: "Both curves are read here. Fixed by the mechanism." },
      ],
    },
    {
      title: "Exit pool",
      caption:
        "The Balancer E-CLP Sr exits into, weighted 90% exit asset to 10% Sr shares at the peg. The band is modeled here, the rest size the pool and travel to the flow.",
      fields: [
        {
          kind: "live",
          label: "Asset yield",
          value: `${terms.sourceApyPct.toFixed(1)}%`,
          hint: "What the source pays before the split. The real flow collects this on its pool step as Asset Yield, and it is the base every position's rate is carved out of.",
        },
        {
          kind: "live",
          label: "Pool band",
          value: pct(terms.eclpBandWidthPct / 100),
          hint: "How far the pool price may move from NAV before the stable side is exhausted. This sets the E-CLP's lower price bound directly.",
        },
        {
          kind: "declared",
          label: "Exit liquidity",
          id: "exitLiquidity",
          placeholder: "10,000,000",
          unit: "$",
          hint: "Total exit asset funded into the pool. The reference range is $1M to $50M.",
        },
        {
          kind: "declared",
          label: "Concentration (lambda)",
          id: "poolLambda",
          placeholder: "300",
          hint: "How tightly the E-CLP concentrates liquidity around the peg. Reference range 100 to 1000, default 300. This page's own pool math runs a fixed concentration, so changing it here does not move the figures above.",
        },
        {
          kind: "declared",
          label: "Maximum discount",
          id: "maximumDiscount",
          unit: "bps",
          placeholder: "200",
          hint: "The furthest below NAV the pool will quote Sr. Reference range 50 to 500 bps.",
        },
        {
          kind: "declared",
          label: "Maximum premium",
          id: "maximumPremium",
          unit: "bps",
          placeholder: "50",
          hint: "The furthest above NAV the pool will quote Sr. Reference range 0 to 50 bps.",
        },
        {
          kind: "declared",
          label: "Exit asset yield",
          id: "exitAssetYield",
          unit: "%",
          placeholder: "3",
          hint: "What the stable leg of the pool earns. One of the three inputs behind the SLP rate, alongside trading fees and the Sr leg.",
        },
        {
          kind: "declared",
          label: "Redemption delay",
          id: "redemptionDelay",
          unit: "days",
          placeholder: "14",
          hint: "How long a market maker is stuck in the asset's redemption queue. It is what sets the restock hurdle.",
        },
        {
          kind: "declared",
          label: "Restock hurdle",
          id: "restockHurdle",
          unit: "bps",
          placeholder: "10",
          hint: "What a market maker must clear before restocking the pool is worth doing. Roughly fee plus gas plus about 0.8 bps per day of redemption delay.",
        },
        {
          kind: "declared",
          label: "NAV update cadence",
          id: "navUpdateCadence",
          unit: "days",
          placeholder: "30",
          hint: "How often the asset publishes a new NAV. Keep the oracle's staleness bound looser than this or the market fails shut between routine updates.",
        },
        {
          kind: "declared",
          label: "Reinvestment slippage tolerance",
          id: "reinvestmentSlippageTolerance",
          unit: "bps",
          placeholder: "50",
          hint: "How much slippage the venue will accept when redeploying the liquidity premium. Must be below 100%.",
        },
        { kind: "flow", label: "Swap fee", note: "Template policy, read from the chain" },
        { kind: "flow", label: "Exit asset", note: "Chosen against a live chain in the flow" },
      ],
    },
    {
      title: "Settlement",
      caption: "The deposit and withdrawal queues. One set of values for Sr, Jr and SLP alike.",
      fields: [
        {
          kind: "declared",
          label: "Deposit settlement delay",
          id: "depositSettlementDelay",
          unit: "days",
          placeholder: "1",
          hint: "How long a deposit waits before it settles.",
        },
        {
          kind: "declared",
          label: "Withdrawal settlement delay",
          id: "withdrawalSettlementDelay",
          unit: "days",
          placeholder: "1",
          hint: "How long a withdrawal waits. Royco mandates a minimum of 24 hours, the T+1 floor.",
        },
        {
          kind: "declared",
          label: "Deposit expiry",
          id: "depositExpiry",
          unit: "days",
          placeholder: "37",
          hint: "How long an unsettled deposit stays valid. The flow derives this as the longer of the NAV staleness bound and the observation period, plus a week.",
        },
        {
          kind: "declared",
          label: "Withdrawal expiry",
          id: "withdrawalExpiry",
          unit: "days",
          placeholder: "37",
          hint: "Same derivation as the deposit expiry.",
        },
        {
          kind: "declared",
          label: "Gate by price updates",
          id: "gateByPriceUpdates",
          placeholder: "yes / no",
          hint: "Whether deposits and withdrawals only settle against a fresh price.",
        },
      ],
    },
    {
      title: "Settled when you deploy",
      caption:
        "Entered in the deploy flow against a live chain, so there is nothing useful to decide here.",
      fields: [
        { kind: "flow", label: "Asset contract and chain", note: "Validated on chain" },
        { kind: "flow", label: "Price oracle and route", note: "Detected from the asset" },
        { kind: "flow", label: "Market denomination", note: "USD, BTC or ETH" },
        { kind: "flow", label: "Sr, Jr and SLP token names", note: "Suggested from the asset" },
        { kind: "flow", label: "Market ID and addresses", note: "Mined at the end of the flow" },
        { kind: "flow", label: "Genesis seed", note: "Funded in the exit asset" },
      ],
    },
  ];

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
          What to settle before you open the flow. Anything the flow enters against a live
          chain is listed at the end rather than collected here.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <p className="max-w-[72ch] text-[14.5px] leading-relaxed text-[var(--foreground)]">
          These are the decisions the deploy flow will ask you to make. A figure means
          the controls above already set it. A box is yours, and the greyed number in it
          is the value Royco&apos;s own flow starts from, so you can take it as read or
          change it. Hover any label for what it does.
        </p>

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
                    <span
                      className={`text-[11.5px] leading-snug text-[var(--secondary)] ${
                        field.hint
                          ? "cursor-help decoration-dotted underline-offset-2 [text-decoration-line:underline]"
                          : ""
                      }`}
                      title={field.hint}
                    >
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
