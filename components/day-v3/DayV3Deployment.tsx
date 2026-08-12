"use client";

import { memo, useState } from "react";

import DayV3Button from "@/components/day-v3/DayV3Button";
import type {
  DayV3ExitView,
  DayV3ProtectedExitView,
  DayV3ProtectionView,
} from "@/components/day-v3/DayV3Goals";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  buildDayV3DeploymentUrl,
  buildDayV3HandoffV1,
} from "@/lib/day-v3/handoff";
import type { DayV3PoolDesignResult } from "@/lib/day-v3/pool-design";
import type { DayV3Goals } from "@/lib/day-v3/types";

const DEPLOY_URL =
  process.env.NEXT_PUBLIC_RWA_DEPLOY_URL ?? "https://royco.org/deploy-market/";
type ResolvedPoolDesign = Extract<
  DayV3PoolDesignResult,
  { status: "resolved" }
>;

type GoalDraft = {
  protectedDrawdownPct: number | null;
  recoveryDays: number | null;
  immediateExitSharePct: number | null;
  minimumProceedsPer100: number | null;
  redemptionDays: number | null;
  navUpdateDays: number | null;
  target: { chainId: number; templateId: string } | null;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-10 items-start justify-between gap-4 border-b border-[var(--border-subtle)] py-2 last:border-b-0">
      <span className="text-[11.5px] font-medium text-[var(--secondary)]">
        {label}
      </span>
      <span className="shrink-0 text-right font-mono text-[12px] font-semibold tabular-nums">
        {value}
      </span>
    </div>
  );
}

const shown = (value: number | null, suffix = "") =>
  value === null ? "Unresolved" : `${value.toFixed(2)}${suffix}`;

function DayV3Deployment({
  exit,
  goals,
  market,
  poolDesign,
  protectedExit,
  protection,
  sourceApyPct,
}: {
  exit: DayV3ExitView;
  goals: GoalDraft;
  market: { id: string; name: string; asset: string };
  poolDesign: ResolvedPoolDesign | null;
  protectedExit: DayV3ProtectedExitView;
  protection: DayV3ProtectionView;
  sourceApyPct: number | null;
}) {
  const [copied, setCopied] = useState(false);
  const readinessChecks = [
    {
      label: "Source yield",
      ready: sourceApyPct !== null,
      missing: "Enter the source’s net annual yield.",
    },
    {
      label: "Protected drawdown",
      ready: goals.protectedDrawdownPct !== null,
      missing: "Choose the source drawdown Senior should withstand.",
    },
    {
      label: "Minimum Coverage",
      ready:
        protection.status === "recommended" && protection.coveragePct !== null,
      missing: "Resolve the accountant-backed coverage recommendation.",
    },
    {
      label: "Recovery time",
      ready: goals.recoveryDays !== null,
      missing: "Choose no recovery window or enter its duration.",
    },
    {
      label: "Redemption time",
      ready: goals.redemptionDays !== null,
      missing: "Enter the asset’s redemption timing.",
    },
    {
      label: "NAV refresh cadence",
      ready: goals.navUpdateDays !== null,
      missing: "Enter how often Senior’s value is published.",
    },
    {
      label: "Immediate exit amount",
      ready: goals.immediateExitSharePct !== null,
      missing: "Choose how much of every 100 Senior can sell at once.",
    },
    {
      label: "Minimum exit payout",
      ready: goals.minimumProceedsPer100 !== null,
      missing: "Choose the lowest acceptable payout per 100 sold.",
    },
    {
      label: "Deployment target",
      ready: goals.target !== null,
      missing: "Choose a live chain and template in Deployment mapping.",
    },
    {
      label: "Canonical pool design",
      ready: poolDesign !== null && exit.status === "recommended",
      missing: "Resolve the live fee, E-CLP parameters, and exit outcomes.",
    },
    {
      label: "Minimum Liquidity",
      ready: exit.minimumLiquidityPct !== null,
      missing: "Resolve the pool-funding-to-liquidity mapping.",
    },
    {
      label: "Protected Exit trigger",
      ready: protectedExit.thresholdPct !== null,
      missing: "Use a history-backed trigger or enter a manual comparison.",
    },
    {
      label: "Protected Exit bonus",
      ready: protectedExit.bonusPct !== null,
      missing: "Resolve the optional bonus; no budget should produce 0%.",
    },
    {
      label: "Protected Exit scenarios",
      ready: protectedExit.status === "scenario-ready",
      missing: "Run the 25%, 50%, and 100% redemption scenarios.",
    },
  ];
  const ready = readinessChecks.every((check) => check.ready);

  const payload = (exportedAt: string) => ({
    schema: "royco.day.v3-draft",
    version: 1,
    exportedAt,
    status: ready ? "ready-for-revalidation" : "incomplete",
    normalization: { senior: 100, targetUtilizationPct: 90 },
    market,
    goals,
    recommendations: {
      protection,
      exit,
      protectedExit,
      canonicalPoolSnapshot: poolDesign,
    },
    warnings: [
      "This draft is untrusted input to deployment.",
      "The deployment flow must refresh template policy and recompute every derived pool field.",
    ],
  });

  const copy = async () => {
    await navigator.clipboard.writeText(
      JSON.stringify(payload(new Date().toISOString()), null, 2),
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const download = () => {
    const exportedAt = new Date().toISOString();
    const blob = new Blob([JSON.stringify(payload(exportedAt), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${market.id || "day-market"}-v3-design.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const openDeployment = () => {
    if (
      !ready ||
      goals.protectedDrawdownPct === null ||
      goals.recoveryDays === null ||
      goals.immediateExitSharePct === null ||
      goals.minimumProceedsPer100 === null ||
      goals.redemptionDays === null ||
      goals.navUpdateDays === null ||
      goals.target === null ||
      protection.coveragePct === null ||
      exit.minimumLiquidityPct === null ||
      protectedExit.thresholdPct === null ||
      protectedExit.bonusPct === null ||
      poolDesign === null ||
      sourceApyPct === null
    ) {
      return;
    }
    const resolvedGoals: DayV3Goals = {
      protectedDrawdownPct: goals.protectedDrawdownPct,
      recoveryDays: goals.recoveryDays,
      immediateExitSharePct: goals.immediateExitSharePct,
      minimumProceedsPer100: goals.minimumProceedsPer100,
      redemptionDays: goals.redemptionDays,
      navUpdateDays: goals.navUpdateDays,
      target: goals.target,
    };
    const handoff = buildDayV3HandoffV1({
      exportedAt: new Date().toISOString(),
      source: {
        marketId: market.id,
        name: market.name,
        asset: market.asset,
        sourceApyPct,
      },
      goals: resolvedGoals,
      minimumCoveragePct: protection.coveragePct,
      minimumLiquidityPct: exit.minimumLiquidityPct,
      protectedExitThresholdPct: protectedExit.thresholdPct,
      protectedExitBonusPct: protectedExit.bonusPct,
      canonicalPoolSnapshot: poolDesign,
    });
    window.open(
      buildDayV3DeploymentUrl(DEPLOY_URL, handoff),
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <Card data-day-v3-section="deployment-brief" weight="primary">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Deployment handoff</CardTitle>
          <Badge tone={ready ? "liquidity" : "caution"}>
            {ready ? "ready for revalidation" : "draft · incomplete"}
          </Badge>
        </div>
        <CardDescription>
          One relative design, normalized to 100 Senior. The deployment flow
          must scale and revalidate it against the selected live template.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-4 py-3">
            <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em]">
              Issuer goals
            </h3>
            <Row
              label="Protected drawdown"
              value={shown(goals.protectedDrawdownPct, "%")}
            />
            <Row
              label="Recovery time"
              value={shown(goals.recoveryDays, " days")}
            />
            <Row
              label="Immediate exit"
              value={shown(goals.immediateExitSharePct, " / 100")}
            />
            <Row
              label="Minimum payout"
              value={shown(goals.minimumProceedsPer100, " / 100")}
            />
          </section>

          <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-4 py-3">
            <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em]">
              Recommended terms
            </h3>
            <Row
              label="Minimum Coverage"
              value={shown(protection.coveragePct, "%")}
            />
            <Row
              label="Minimum Liquidity"
              value={shown(exit.minimumLiquidityPct, "%")}
            />
            <Row
              label="Maximum Discount"
              value={shown(exit.maximumDiscountPct, "%")}
            />
            <Row label="Depth at NAV" value={shown(exit.lambda, " λ")} />
            <Row
              label="Maximum Premium"
              value={shown(exit.maximumPremiumBps, " bps")}
            />
          </section>

          <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-4 py-3">
            <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em]">
              Live-policy checks
            </h3>
            <Row
              label="Deployment target"
              value={
                goals.target
                  ? `${goals.target.chainId}:${goals.target.templateId}`
                  : "Unresolved"
              }
            />
            <Row label="Swap Fee" value={shown(exit.swapFeeBps, " bps")} />
            <Row
              label="Redemption time"
              value={shown(goals.redemptionDays, " days")}
            />
            <Row
              label="NAV refresh"
              value={shown(goals.navUpdateDays, " days")}
            />
            <Row
              label="Protected Exit trigger"
              value={shown(protectedExit.thresholdPct, "%")}
            />
          </section>
        </div>

        <section
          aria-labelledby="day-v3-readiness-heading"
          aria-live="polite"
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-4 py-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3
              className="text-[11px] font-semibold uppercase tracking-[0.1em]"
              id="day-v3-readiness-heading"
            >
              Deployment readiness
            </h3>
            <Badge tone={ready ? "liquidity" : "caution"}>
              {readinessChecks.filter((check) => check.ready).length}/
              {readinessChecks.length} resolved
            </Badge>
          </div>

          <ul className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            {readinessChecks.map((check) => (
              <li
                className="flex items-start gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--card)] px-3 py-2"
                key={check.label}
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                    check.ready
                      ? "bg-[color-mix(in_srgb,var(--theme-green)_22%,var(--card))] text-[var(--foreground)]"
                      : "border border-[var(--border-subtle)] text-[var(--tertiary)]"
                  }`}
                >
                  {check.ready ? "✓" : "·"}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[11px] font-semibold">
                    {check.label}
                  </span>
                  <span className="text-[10px] leading-snug text-[var(--tertiary)]">
                    {check.ready ? "Resolved" : check.missing}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-4">
          <span className="mr-auto max-w-[62ch] text-[10.5px] leading-snug text-[var(--tertiary)]">
            JSON contains goals, field status, and unresolved values. It never
            substitutes a fallback fee or pool parameter.
          </span>
          <DayV3Button
            onClick={() => void copy()}
            size="md"
            variant="secondary"
          >
            {copied ? "Copied" : "Copy JSON"}
          </DayV3Button>
          <DayV3Button onClick={download} size="md" variant="secondary">
            Download JSON
          </DayV3Button>
          <DayV3Button
            disabled={!ready}
            onClick={openDeployment}
            size="md"
            variant="primary"
          >
            Open deployment
            <span aria-hidden="true">↗</span>
          </DayV3Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default memo(DayV3Deployment);
