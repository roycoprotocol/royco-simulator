"use client";

import { memo, useState } from "react";

import DayV3Button, {
  dayV3ButtonVariants,
} from "@/components/day-v3/DayV3Button";
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
  buildDayV3HandoffV3,
  dayV3DeploymentCta,
  isDayV3HandoffReady,
} from "@/lib/day-v3/handoff";
import type {
  DayV3PoolDesignResult,
  DayV3PoolDesignTarget,
} from "@/lib/day-v3/pool-design";
import type { DayV3ExpiryPolicy, DayV3Goals } from "@/lib/day-v3/types";
import type { DayV3YieldCurveDesign } from "@/lib/day-v3/yield-curves";
import { cn } from "@/lib/utils";

const DEPLOY_URL = "https://www.royco.org/deploy-market";
type ResolvedPoolDesign = Extract<
  DayV3PoolDesignResult,
  { status: "resolved" }
>;

type GoalDraft = {
  protectedDrawdownPct: number | null;
  recoveryDays: number | null;
  immediateExitSharePct: number | null;
  minimumProceedsPer100: number | null;
  entryPointSettlementDays: number | null;
  collateralToExitDays: number | null;
  collateralToExitCostBps: number | null;
  fixedTermGraceDays: number | null;
  navUpdateDays: number | null;
  target: { chainId: number; templateId: string } | null;
};

type DeploymentPolicyDraft = {
  depositDelaySeconds: number | null;
  depositExpirySeconds: DayV3ExpiryPolicy | null;
  withdrawalExpirySeconds: DayV3ExpiryPolicy | null;
  gateByOracleUpdate: boolean | null;
  maxReinvestmentSlippageBps: number | null;
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

const shownDollars = (value: number | null, suffix = "") =>
  value === null ? "Unresolved" : `$${value.toFixed(2)}${suffix}`;

function DayV3Deployment({
  exit,
  goals,
  market,
  poolDesign,
  yieldTarget,
  protectedExit,
  protection,
  deploymentPolicy,
  sourceApyPct,
  yieldCurveDesign,
  yieldCurvePolicyResolved,
  starterValuesConfirmed,
}: {
  exit: DayV3ExitView;
  goals: GoalDraft;
  market: { id: string; name: string; asset: string };
  poolDesign: ResolvedPoolDesign | null;
  yieldTarget: DayV3PoolDesignTarget | null;
  protectedExit: DayV3ProtectedExitView;
  protection: DayV3ProtectionView;
  deploymentPolicy: DeploymentPolicyDraft;
  sourceApyPct: number | null;
  yieldCurveDesign: DayV3YieldCurveDesign;
  yieldCurvePolicyResolved: boolean;
  starterValuesConfirmed: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const contentId = "day-v3-deployment-handoff-content";
  const protectionDisabled = protection.status === "disabled";
  const exitDisabled = exit.status === "disabled";
  const readinessChecks = [
    {
      label: "Illustrative starter values",
      ready: starterValuesConfirmed,
      scope: "v3-handoff" as const,
      missing:
        "Review the illustrative starter inputs above and confirm or replace them before creating a deployment handoff.",
    },
    {
      label: "Source yield",
      ready: sourceApyPct !== null,
      scope: "v3-handoff" as const,
      missing: "Enter the source’s net annual yield.",
    },
    {
      label: "Protected drawdown",
      ready: goals.protectedDrawdownPct !== null,
      scope: "v3-handoff" as const,
      missing: "Choose the source drawdown Senior should withstand.",
    },
    {
      label: "Minimum Coverage",
      ready:
        protectionDisabled ||
        (protection.status === "recommended" &&
          protection.coveragePct !== null),
      scope: "v3-handoff" as const,
      missing: "Resolve the accountant-backed coverage recommendation.",
    },
    {
      label: "Recovery time",
      ready: protectionDisabled || goals.recoveryDays !== null,
      scope: "v3-handoff" as const,
      missing: "Choose no recovery window or enter its duration.",
    },
    {
      label: "EntryPoint settlement",
      ready: goals.entryPointSettlementDays !== null,
      scope: "v3-handoff" as const,
      missing: "Enter the in-kind Senior redemption queue.",
    },
    {
      label: "Collateral conversion time",
      ready: exitDisabled || goals.collateralToExitDays !== null,
      scope: "v3-handoff" as const,
      missing: "Enter the time from claimed collateral to exit asset.",
    },
    {
      label: "Collateral conversion cost",
      ready: exitDisabled || goals.collateralToExitCostBps !== null,
      scope: "v3-handoff" as const,
      missing: "Enter the all-in restock conversion cost.",
    },
    {
      label: "Fixed-Term Grace Period",
      ready: protectionDisabled || goals.fixedTermGraceDays !== null,
      scope: "v3-handoff" as const,
      missing:
        "Choose how long after deployment before a loss may start a recovery window.",
    },
    {
      label: "NAV refresh cadence",
      ready: goals.navUpdateDays !== null,
      scope: "v3-handoff" as const,
      missing: "Enter how often Senior’s value is published.",
    },
    {
      label: "Immediate exit amount",
      ready: goals.immediateExitSharePct !== null,
      scope: "v3-handoff" as const,
      missing: "Choose how much of every $100 Senior can sell at once.",
    },
    {
      label: "Minimum exit payout",
      ready: goals.minimumProceedsPer100 !== null,
      scope: "v3-handoff" as const,
      missing: "Choose the lowest acceptable payout per $100 sold.",
    },
    {
      label: "Deployment target",
      ready: goals.target !== null,
      scope: "v3-handoff" as const,
      missing: "Choose a live chain and market template above.",
    },
    {
      label: "Canonical pool design",
      ready:
        exitDisabled || (poolDesign !== null && exit.status === "recommended"),
      scope: "v3-handoff" as const,
      missing:
        exit.status === "infeasible"
          ? "The live solver found no feasible pool. Change the exit promise or operational costs in Section 3."
          : "Resolve the live fee, E-CLP parameters, and exit outcomes.",
    },
    {
      label: "Restock scenario",
      ready:
        exitDisabled ||
        (goals.collateralToExitDays !== null &&
          goals.collateralToExitCostBps !== null &&
          exit.restockPoint !== null),
      scope: "v3-handoff" as const,
      missing:
        goals.collateralToExitDays !== null &&
        goals.collateralToExitCostBps !== null
          ? exit.status === "infeasible"
            ? "Conversion facts are complete, but this exit promise fails the restock hurdle. Change Section 3 or shorten/lower the conversion assumptions."
            : "Re-run the live pool design to resolve the restock point."
          : "Add collateral conversion time and cost, then resolve the scenario restock point.",
    },
    {
      label: "Live protocol fee policy",
      ready: exitDisabled || poolDesign !== null,
      scope: "v3-handoff" as const,
      missing:
        exit.status === "infeasible"
          ? "The live policy was checked, but no feasible pool recommendation can be exported for these inputs."
          : "Resolve all four current template protocol fee rates.",
    },
    {
      label: "Settlement policy",
      ready:
        deploymentPolicy.depositDelaySeconds !== null &&
        deploymentPolicy.depositExpirySeconds !== null &&
        deploymentPolicy.withdrawalExpirySeconds !== null &&
        deploymentPolicy.gateByOracleUpdate !== null,
      scope: "v3-handoff" as const,
      missing:
        "Resolve the market-level deposit, withdrawal, expiry, and oracle-gate policy.",
    },
    {
      label: "Reinvestment slippage",
      ready:
        exitDisabled || deploymentPolicy.maxReinvestmentSlippageBps !== null,
      scope: "v3-handoff" as const,
      missing: "Enter the maximum SLP reinvestment slippage ceiling.",
    },
    {
      label: "Registered yield-share models",
      ready:
        yieldCurvePolicyResolved &&
        yieldTarget !== null &&
        Boolean(
          yieldTarget.yieldModels.jt[
            protectionDisabled ? "FIXED" : "STATIC_CURVE"
          ],
        ) &&
        Boolean(
          yieldTarget.yieldModels.lpt[exitDisabled ? "FIXED" : "STATIC_CURVE"],
        ),
      scope: "v3-handoff" as const,
      missing:
        "Resolve the live template registry for the exact Junior and SLP shapes required by this design.",
    },
    {
      label: "Minimum Liquidity",
      ready:
        exitDisabled ||
        (exit.status === "recommended" && exit.minimumLiquidityPct !== null),
      scope: "v3-handoff" as const,
      missing:
        exit.status === "infeasible"
          ? "Minimum Liquidity cannot be derived because the current exit promise has no feasible pool."
          : "Resolve the pool-funding-to-liquidity mapping.",
    },
    {
      label: "Protected Exit trigger",
      ready: protectionDisabled || protectedExit.thresholdPct !== null,
      scope: "v3-handoff" as const,
      missing: "Use a history-backed trigger or enter a manual comparison.",
    },
    {
      label: "Protected Exit bonus",
      ready: protectionDisabled || protectedExit.bonusPct !== null,
      scope: "v3-handoff" as const,
      missing: "Resolve the optional bonus; no budget should produce 0%.",
    },
    {
      label: "Protected Exit scenarios",
      ready: protectionDisabled || protectedExit.status === "scenario-ready",
      scope: "v3-handoff" as const,
      missing: "Run the 25%, 50%, and 100% redemption scenarios.",
    },
  ];
  const handoffChecks = readinessChecks.filter(
    (check) => check.scope === "v3-handoff",
  );
  const issuerChecks = readinessChecks.filter((check) =>
    [
      "Source yield",
      "Illustrative starter values",
      "Protected drawdown",
      "Recovery time",
      "EntryPoint settlement",
      "Collateral conversion time",
      "Collateral conversion cost",
      "Fixed-Term Grace Period",
      "NAV refresh cadence",
      "Immediate exit amount",
      "Minimum exit payout",
      "Deployment target",
      "Protected Exit trigger",
      "Protected Exit bonus",
      "Settlement policy",
      "Reinvestment slippage",
    ].includes(check.label),
  );
  const calculationChecks = readinessChecks.filter(
    (check) => check.scope === "v3-handoff" && !issuerChecks.includes(check),
  );
  // Deployment-owned identity, addresses, oracle construction, administrators,
  // seed amounts, and approvals are intentionally collected and validated only
  // after import in Royco Deploy.
  const deploymentChecks: typeof readinessChecks = [];
  const hrefFor = (label: string) => {
    if (label === "Illustrative starter values") return "#day-v3-inputs";
    if (["Source yield"].includes(label)) return "#day-v3-source-inputs";
    if (["Deployment target", "Live protocol fee policy"].includes(label))
      return "#day-v3-deployment-target";
    if (
      [
        "EntryPoint settlement",
        "Collateral conversion time",
        "Collateral conversion cost",
        "Fixed-Term Grace Period",
        "NAV refresh cadence",
        "Restock scenario",
        "Settlement policy",
        "Reinvestment slippage",
      ].includes(label)
    )
      return "#day-v3-source-operations";
    if (
      ["Protected drawdown", "Minimum Coverage", "Recovery time"].includes(
        label,
      )
    )
      return "#day-v3-protection-inputs";
    if (
      [
        "Immediate exit amount",
        "Minimum exit payout",
        "Canonical pool design",
        "Minimum Liquidity",
      ].includes(label)
    )
      return "#day-v3-exit-inputs";
    if (["Registered yield-share models"].includes(label))
      return "#day-v3-premium-inputs";
    return "#day-v3-protected-exit-inputs";
  };
  const handoffReady = isDayV3HandoffReady(readinessChecks);
  const primaryCta = dayV3DeploymentCta(handoffReady);
  const exportedExit: DayV3ExitView =
    exit.status === "recommended"
      ? exit
      : {
          ...exit,
          status: "unresolved",
          message:
            "Illustrative starter values were omitted. Deployment must resolve the selected live template.",
          sellablePer100: null,
          proceeds: null,
          lowestPayoutPer100: null,
          slpPer100: null,
          restockPoint: null,
          restockOperationalHurdleBps: null,
          restockHurdleBps: null,
          restockMarginBps: null,
          minimumLiquidityPct: null,
          maximumDiscountPct: null,
          lambda: null,
          maximumPremiumBps: null,
          restingExitAssetPct: null,
          restingSeniorPct: null,
          swapFeeBps: null,
          feeSource: null,
        };

  // JSON export remains useful while required deployment fields are open, but
  // only the explicit handoff builder below may claim readiness.
  const payload = (exportedAt: string) => ({
    schema: "royco.day.v3-draft",
    version: 1,
    exportedAt,
    status: "incomplete",
    normalization: { senior: 100, targetUtilizationPct: 90 },
    market,
    goals,
    recommendations: {
      protection,
      exit: exportedExit,
      protectedExit,
      canonicalPoolSnapshot: poolDesign,
    },
    modeledInputs: {
      staticYieldShareCurves: yieldCurveDesign,
    },
    warnings: [
      "This draft is untrusted input to deployment.",
      "The deployment flow must refresh template policy and recompute every derived pool field.",
      "The static Junior and SLP curve anchors are issuer-edited modeling inputs. Deployment must select and validate a registered YDM shape before using them.",
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
      !handoffReady ||
      !starterValuesConfirmed ||
      goals.protectedDrawdownPct === null ||
      (!protectionDisabled && goals.recoveryDays === null) ||
      goals.immediateExitSharePct === null ||
      goals.minimumProceedsPer100 === null ||
      goals.entryPointSettlementDays === null ||
      (!exitDisabled && goals.collateralToExitDays === null) ||
      (!exitDisabled && goals.collateralToExitCostBps === null) ||
      (!protectionDisabled && goals.fixedTermGraceDays === null) ||
      goals.navUpdateDays === null ||
      goals.target === null ||
      protection.coveragePct === null ||
      exit.minimumLiquidityPct === null ||
      (!protectionDisabled &&
        (protectedExit.thresholdPct === null ||
          protectedExit.bonusPct === null)) ||
      (!exitDisabled && poolDesign === null) ||
      yieldTarget === null ||
      deploymentPolicy.depositDelaySeconds === null ||
      deploymentPolicy.depositExpirySeconds === null ||
      deploymentPolicy.withdrawalExpirySeconds === null ||
      deploymentPolicy.gateByOracleUpdate === null ||
      (!exitDisabled &&
        deploymentPolicy.maxReinvestmentSlippageBps === null) ||
      sourceApyPct === null
    ) {
      return;
    }
    const resolvedGoals: DayV3Goals = {
      protectedDrawdownPct: protectionDisabled ? 0 : goals.protectedDrawdownPct,
      recoveryDays: protectionDisabled ? 0 : (goals.recoveryDays as number),
      immediateExitSharePct: exitDisabled ? 0 : goals.immediateExitSharePct,
      minimumProceedsPer100: exitDisabled ? 0 : goals.minimumProceedsPer100,
      entryPointSettlementDays: goals.entryPointSettlementDays,
      collateralToExitDays: exitDisabled ? null : goals.collateralToExitDays,
      collateralToExitCostBps: exitDisabled
        ? null
        : goals.collateralToExitCostBps,
      fixedTermGraceDays: protectionDisabled
        ? 0
        : (goals.fixedTermGraceDays as number),
      navUpdateDays: goals.navUpdateDays,
      target: goals.target,
    };
    const handoff = buildDayV3HandoffV3({
      exportedAt: new Date().toISOString(),
      source: {
        marketId: market.id,
        name: market.name,
        asset: market.asset,
        sourceApyPct,
      },
      features: {
        seniorProtection: protectionDisabled ? "disabled" : "enabled",
        immediateExit: exitDisabled ? "disabled" : "enabled",
      },
      goals: resolvedGoals,
      deploymentPolicy: {
        settlement: {
          appliesTo: "all-tranches",
          depositDelaySeconds: deploymentPolicy.depositDelaySeconds,
          depositExpirySeconds: deploymentPolicy.depositExpirySeconds,
          withdrawalDelaySeconds:
            resolvedGoals.entryPointSettlementDays * 86_400,
          withdrawalExpirySeconds: deploymentPolicy.withdrawalExpirySeconds,
          gateByOracleUpdate: deploymentPolicy.gateByOracleUpdate,
        },
        maxReinvestmentSlippageBps: exitDisabled
          ? 0
          : (deploymentPolicy.maxReinvestmentSlippageBps as number),
      },
      minimumCoveragePct: protectionDisabled ? 0 : protection.coveragePct,
      minimumLiquidityPct: exitDisabled ? 0 : exit.minimumLiquidityPct,
      protectedExitThresholdPct: protectionDisabled
        ? 0
        : (protectedExit.thresholdPct as number),
      protectedExitBonusPct: protectionDisabled
        ? 0
        : (protectedExit.bonusPct as number),
      canonicalPoolSnapshot: exitDisabled ? null : poolDesign,
      liveYieldTarget: yieldTarget,
      staticYieldShareCurves: yieldCurveDesign,
    });
    window.open(
      buildDayV3DeploymentUrl(DEPLOY_URL, handoff),
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <Card
      className="overflow-hidden"
      data-day-v3-section="deployment-brief"
      weight="primary"
    >
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <button
          aria-controls={contentId}
          aria-expanded={open}
          className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg text-left outline-none transition-colors hover:bg-[var(--foundation)] focus-visible:ring-2 focus-visible:ring-[var(--foreground)] focus-visible:ring-offset-2 sm:min-w-[240px]"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-semibold tracking-[-0.01em]">
                Deployment handoff
              </span>
              <Badge tone={handoffReady ? "liquidity" : "caution"}>
                {handoffReady
                  ? "ready for deployment setup"
                  : "draft · incomplete"}
              </Badge>
            </span>
            <span className="text-[11px] leading-snug text-[var(--secondary)]">
              {handoffChecks.filter((check) => check.ready).length}/
              {handoffChecks.length} fields resolved · normalized to $100 Senior
              · open for goals, mappings, and readiness
            </span>
          </span>
          <span
            aria-hidden="true"
            className={cn(
              "mr-1 flex size-8 shrink-0 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--foundation)] text-[var(--tertiary)] transition-transform",
              open && "rotate-180",
            )}
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
        </button>
        <a
          className={dayV3ButtonVariants({ size: "md", variant: "primary" })}
          href={DEPLOY_URL}
          rel="noreferrer"
          target="_blank"
        >
          Open Royco Deploy <span aria-hidden="true">↗</span>
        </a>
      </div>

      <div
        className="border-t border-[var(--border-subtle)]"
        hidden={!open}
        id={contentId}
      >
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Deployment handoff details</CardTitle>
            <Badge tone={handoffReady ? "liquidity" : "caution"}>
              {handoffReady
                ? "ready for deployment setup"
                : "draft · incomplete"}
            </Badge>
          </div>
          <CardDescription>
            One relative design, normalized to $100 Senior. Deployment must
            revalidate it against the live template; absolute funding stays open
            until deployment has a notional and initialization policy.
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
                value={shownDollars(goals.immediateExitSharePct, " / $100")}
              />
              <Row
                label="Minimum payout"
                value={shownDollars(goals.minimumProceedsPer100, " / $100")}
              />
            </section>

            <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-4 py-3">
              <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em]">
                {exit.status === "recommended"
                  ? "Recommended terms"
                  : "Modeled starter terms"}
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
              <Row
                label={
                  exit.status === "recommended"
                    ? "Swap Fee"
                    : "Swap Fee (model only)"
                }
                value={shown(exit.swapFeeBps, " bps")}
              />
              <Row
                label="EntryPoint settlement"
                value={shown(goals.entryPointSettlementDays, " days")}
              />
              <Row
                label="Collateral conversion"
                value={shown(goals.collateralToExitDays, " days")}
              />
              <Row
                label="Conversion cost"
                value={shown(goals.collateralToExitCostBps, " bps")}
              />
              <Row
                label="Fixed-Term Grace"
                value={shown(goals.fixedTermGraceDays, " days")}
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
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3
                className="text-[11px] font-semibold uppercase tracking-[0.1em]"
                id="day-v3-readiness-heading"
              >
                V3 handoff readiness
              </h3>
              <Badge tone={handoffReady ? "liquidity" : "caution"}>
                {handoffChecks.filter((check) => check.ready).length}/
                {handoffChecks.length} handoff fields resolved
              </Badge>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
              {[
                {
                  title: "Your decisions left",
                  checks: issuerChecks,
                  empty: "All issuer goals and source facts are answered.",
                },
                {
                  title: "Calculations waiting",
                  checks: calculationChecks,
                  empty: "All V3 calculations are resolved.",
                },
                {
                  title: "Deferred to RWA Deploy",
                  checks: deploymentChecks,
                  empty: "No downstream deployment checks remain.",
                  countLabel: "deferred",
                },
              ].map((group) => {
                const open = group.checks.filter((check) => !check.ready);
                return (
                  <section
                    className="rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-4 py-3"
                    key={group.title}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-[10px] font-semibold uppercase tracking-[0.09em]">
                        {group.title}
                      </h4>
                      <Badge tone={open.length === 0 ? "liquidity" : "caution"}>
                        {open.length} {group.countLabel ?? "open"}
                      </Badge>
                    </div>
                    {open.length === 0 ? (
                      <p className="mt-3 text-[10px] leading-snug text-[var(--tertiary)]">
                        {group.empty}
                      </p>
                    ) : (
                      <ul className="mt-3 flex flex-col gap-2">
                        {open.map((check) => (
                          <li
                            className="border-t border-[var(--border-subtle)] pt-2 first:border-t-0 first:pt-0"
                            key={check.label}
                          >
                            <a
                              className="inline-flex text-[11px] font-semibold underline decoration-dotted underline-offset-2"
                              href={hrefFor(check.label)}
                            >
                              {check.label} ↗
                            </a>
                            <span className="mt-0.5 block text-[10px] leading-snug text-[var(--tertiary)]">
                              {check.missing}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-4">
            <span className="mr-auto max-w-[62ch] text-[10.5px] leading-snug text-[var(--tertiary)]">
              {handoffReady
                ? "Continue with an untrusted handoff for deployment setup and revalidation. RWA must refresh every live dependency, including the exact registered yield-model addresses, before deployment."
                : "This export is explicitly incomplete and cannot start deployment. It preserves unresolved fields without substituting curve, fee, or pool values."}
            </span>
            <DayV3Button
              onClick={() => void copy()}
              size="md"
              variant="secondary"
            >
              {copied ? "Copied" : "Copy JSON"}
            </DayV3Button>
            <DayV3Button
              onClick={
                primaryCta.action === "continue-deployment"
                  ? openDeployment
                  : download
              }
              size="md"
              variant="primary"
            >
              {primaryCta.label}
              <span aria-hidden="true">
                {primaryCta.action === "continue-deployment" ? "↗" : "↓"}
              </span>
            </DayV3Button>
          </div>
        </CardContent>
      </div>
    </Card>
  );
}

export default memo(DayV3Deployment);
