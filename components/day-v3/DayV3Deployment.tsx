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
  CardNote,
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
}) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const contentId = "day-v3-deployment-handoff-content";
  const protectionDisabled = protection.status === "disabled";
  const exitDisabled = exit.status === "disabled";
  const readinessChecks = [
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
      label: "Underlying redemption delay",
      ready: goals.entryPointSettlementDays !== null,
      scope: "v3-handoff" as const,
      missing: "Enter the in-kind Senior redemption queue.",
    },
    {
      label: "Underlying conversion time",
      ready: exitDisabled || goals.collateralToExitDays !== null,
      scope: "v3-handoff" as const,
      missing: "Enter the time from the redeemed underlying asset to the exit asset.",
    },
    {
      label: "External spread assumption",
      ready: exitDisabled || goals.collateralToExitCostBps !== null,
      scope: "v3-handoff" as const,
      missing:
        "Choose the conservative external conversion spread the refill test should withstand.",
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
      missing: "The supported deployment configuration is unavailable.",
    },
    {
      label: "Canonical pool design",
      ready:
        exitDisabled || (poolDesign !== null && exit.status === "recommended"),
      scope: "v3-handoff" as const,
      missing:
        exit.status === "infeasible"
          ? "These exit terms do not produce a deployable pool. Change the exit settings or operational costs."
          : "Resolve the pool fee, parameters, and exit outcomes.",
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
            ? "Conversion facts are complete, but these exit settings fail the restock hurdle. Change Section 3 or shorten/lower the conversion assumptions."
            : "Re-run the live pool design to resolve the restock point."
          : "Add underlying conversion time and cost, then resolve the scenario restock point.",
    },
    {
      label: "Live protocol fee policy",
      ready: exitDisabled || poolDesign !== null,
      scope: "v3-handoff" as const,
      missing:
        exit.status === "infeasible"
          ? "The market terms were checked, but no feasible pool recommendation can be exported for these inputs."
          : "Resolve the current market fee terms.",
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
          ? "Minimum Liquidity cannot be derived because the current exit settings have no feasible pool."
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
      "Protected drawdown",
      "Recovery time",
      "Underlying redemption delay",
      "Underlying conversion time",
      "External spread assumption",
      "Fixed-Term Grace Period",
      "NAV refresh cadence",
      "Immediate exit amount",
      "Minimum exit payout",
      "Deployment target",
      "Protected Exit trigger",
      "Protected Exit bonus",
    ].includes(check.label),
  );
  const calculationChecks = readinessChecks.filter(
    (check) => check.scope === "v3-handoff" && !issuerChecks.includes(check),
  );
  // Deployment-owned identity, addresses, oracle construction, administrators,
  // seed amounts, and approvals are intentionally collected and validated only
  // after import in Royco Deploy.
  const deploymentChecks: typeof readinessChecks = [
    {
      label: "Request scheduling",
      ready: false,
      scope: "v3-handoff" as const,
      missing:
        "Royco Deploy sets deposit timing, request expiry, and the post-request price-update gate.",
    },
    {
      label: "SLP reinvestment limit",
      ready: false,
      scope: "v3-handoff" as const,
      missing:
        "Royco Deploy sets the maximum value an SLP premium reinvestment may give up.",
    },
  ];
  const hrefFor = (label: string) => {
    if (["Source yield"].includes(label)) return "#day-v3-source-inputs";
    if (["Deployment target", "Live protocol fee policy"].includes(label))
      return "#day-v3-source-inputs";
    if (
      [
        "Underlying redemption delay",
        "Underlying conversion time",
        "External spread assumption",
        "Fixed-Term Grace Period",
        "NAV refresh cadence",
        "Restock scenario",
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
  const confirmedCount = handoffChecks.filter((check) => check.ready).length;
  const reviewCount = calculationChecks.filter((check) => !check.ready).length;
  const missingCount = issuerChecks.filter((check) => !check.ready).length;
  const firstMissing = issuerChecks.find((check) => !check.ready);
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
      sourceApyPct === null
    ) {
      return;
    }
    const {
      depositDelaySeconds,
      depositExpirySeconds,
      gateByOracleUpdate,
      maxReinvestmentSlippageBps,
      withdrawalExpirySeconds,
    } = deploymentPolicy;
    if (
      depositDelaySeconds === null ||
      depositExpirySeconds === null ||
      withdrawalExpirySeconds === null ||
      gateByOracleUpdate === null
    ) {
      window.open(DEPLOY_URL, "_blank", "noopener,noreferrer");
      return;
    }
    let resolvedMaxReinvestmentSlippageBps = 0;
    if (!exitDisabled) {
      if (maxReinvestmentSlippageBps === null) {
        window.open(DEPLOY_URL, "_blank", "noopener,noreferrer");
        return;
      }
      resolvedMaxReinvestmentSlippageBps = maxReinvestmentSlippageBps;
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
          depositDelaySeconds,
          depositExpirySeconds,
          withdrawalDelaySeconds:
            resolvedGoals.entryPointSettlementDays * 86_400,
          withdrawalExpirySeconds,
          gateByOracleUpdate,
        },
        maxReinvestmentSlippageBps: resolvedMaxReinvestmentSlippageBps,
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
            <span className="text-[10.5px] leading-snug text-[var(--secondary)]">
              {confirmedCount} confirmed · {reviewCount} review · {missingCount} missing · normalized to $100 Senior
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
        <nav aria-label="Deployment readiness counts" className="flex shrink-0 items-center gap-1.5">
          <a className="rounded-full border border-[var(--border-subtle)] px-2 py-1 font-mono text-[9.5px] font-semibold underline decoration-dotted underline-offset-2" href="#day-v3-readiness-heading">{confirmedCount} confirmed</a>
          <a className="rounded-full border border-[var(--border-subtle)] px-2 py-1 font-mono text-[9.5px] font-semibold text-[var(--gold-emphasis)] underline decoration-dotted underline-offset-2" href="#day-v3-readiness-heading">{reviewCount} review</a>
          <a className="rounded-full border border-[var(--border-subtle)] px-2 py-1 font-mono text-[9.5px] font-semibold text-[var(--red-emphasis)] underline decoration-dotted underline-offset-2" href={firstMissing ? hrefFor(firstMissing.label) : "#day-v3-readiness-heading"}>{missingCount} missing</a>
        </nav>
        {handoffReady ? (
          <DayV3Button onClick={openDeployment} size="md" variant="primary">
            Open Royco Deploy <span aria-hidden="true">↗</span>
          </DayV3Button>
        ) : (
          <span
            aria-disabled="true"
            className={cn(
              dayV3ButtonVariants({ size: "md", variant: "secondary" }),
              "cursor-not-allowed opacity-55",
            )}
            title="Complete the missing issuer decisions before opening Royco Deploy"
          >
            Complete setup to deploy
          </span>
        )}
      </div>

      <div
        className="border-t border-[var(--border-subtle)]"
        hidden={!open}
        id={contentId}
      >
        <CardHeader className="gap-0.5 px-4 pt-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-[13.5px]">Deployment handoff details</CardTitle>
            <Badge tone={handoffReady ? "liquidity" : "caution"}>
              {handoffReady
                ? "ready for deployment setup"
                : "draft · incomplete"}
            </Badge>
          </div>
          <CardNote>
            One relative design, normalized to $100 Senior. Deployment must
            revalidate it against the live template; absolute funding stays open
            until deployment has a notional and initialization policy.
          </CardNote>
        </CardHeader>

        <CardContent className="px-4 pb-4 flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-4 py-3">
              <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em]">
                Issuer choices
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
                Market checks
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
                label="Underlying redemption delay"
                value={shown(goals.entryPointSettlementDays, " days")}
              />
              <Row
                label="Underlying conversion"
                value={shown(goals.collateralToExitDays, " days")}
              />
              <Row
                label="External spread assumption"
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
                {confirmedCount} confirmed · {reviewCount} review · {missingCount} missing
              </Badge>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
              {[
                {
                  title: "Your decisions left",
                  checks: issuerChecks,
                  empty:
                    "All issuer choices, source facts, and stress assumptions are answered.",
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
