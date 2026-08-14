"use client";

import { useState, type ReactNode } from "react";

import DayV3Button from "@/components/day-v3/DayV3Button";
import DayV3Disclosure from "@/components/day-v3/DayV3Disclosure";
import DayV3Group from "@/components/day-v3/DayV3Group";
import DayV3NumberField from "@/components/day-v3/DayV3NumberField";
import DayV3Origin, {
  type DayV3VisibleOrigin,
} from "@/components/day-v3/DayV3Origin";
import DayV3SegmentedControl from "@/components/day-v3/DayV3SegmentedControl";
import { Badge } from "@/components/ui/badge";
import {
  dayV3ExitInputReadiness,
  dayV3MissingPreview,
} from "@/lib/day-v3/input-readiness";

type MaybeNumber = number | null;

export type DayV3ProtectionView = {
  coveragePct: MaybeNumber;
  juniorPer100: MaybeNumber;
  juniorApy: MaybeNumber;
  status:
    "disabled" | "missing-goal" | "recommended" | "infeasible" | "unresolved";
  message: string;
};

export type DayV3ExitView = {
  status:
    | "disabled"
    | "missing-goal"
    | "resolving"
    | "recommended"
    | "illustrative"
    | "infeasible"
    | "unresolved";
  message: string;
  sellablePer100: MaybeNumber;
  proceeds: MaybeNumber;
  lowestPayoutPer100: MaybeNumber;
  slpPer100: MaybeNumber;
  restockPoint: MaybeNumber;
  /** Desk operating hurdle before the live pool fee. */
  restockOperationalHurdleBps: MaybeNumber;
  /** All-in hurdle used by the canonical pool solver. */
  restockHurdleBps: MaybeNumber;
  /** Net refill margin at the state reached by the promised sale. */
  restockMarginBps: MaybeNumber;
  minimumLiquidityPct: MaybeNumber;
  maximumDiscountPct: MaybeNumber;
  lambda: MaybeNumber;
  maximumPremiumBps: MaybeNumber;
  restingExitAssetPct: MaybeNumber;
  restingSeniorPct: MaybeNumber;
  swapFeeBps: MaybeNumber;
  feeSource: string | null;
};

export type DayV3ProtectedExitView = {
  thresholdPct: MaybeNumber;
  bonusPct: MaybeNumber;
  /** Source stress used by the accountant to enter Protected Exit. */
  activationStressPct?: MaybeNumber;
  status: "unresolved" | "scenario-ready";
  message: string;
  scenarios: Array<{
    redeemedPct: number;
    payoutPer100: number;
    bonusPaidPer100?: number;
    bonusPaidPctOfRedemption?: number;
    onChainBonusCapPer100?: number;
    onChainBonusCapPctOfRedemption?: number;
    juniorUsedPer100: number;
    remainingCoveragePct: number;
    capped: boolean;
  }>;
  /** Exact accountant runs shown only as alternatives, never as a recommendation. */
  comparisons?: Array<{
    thresholdPct: number;
    activationStressPct: number;
    payoutPer100: number;
    juniorUsedPer100: number;
    remainingCoveragePct: number;
  }>;
};

export type DayV3RecoveryView = {
  status:
    | "no-history"
    | "no-observation-periods"
    | "sparse-history"
    | "outside-deployment-window"
    | "recommended";
  suggestedDays: MaybeNumber;
  recoveredEpisodeCount: number;
  observedDays: number[];
  message: string;
};

function ResultTile({
  label,
  note,
  origin = "derived",
  value,
}: {
  label: string;
  note: string;
  origin?: DayV3VisibleOrigin;
  value: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border-t border-[var(--border-subtle)] pt-3">
      <span className="flex items-center justify-between gap-2">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
          {label}
        </span>
        <DayV3Origin origin={origin} />
      </span>
      <span className="font-mono text-[22px] font-bold leading-none tracking-[-0.02em] tabular-nums">
        {value}
      </span>
      <span className="text-[10px] leading-snug text-[var(--tertiary)]">
        {note}
      </span>
    </div>
  );
}

const fixed = (value: MaybeNumber, digits = 1) =>
  value === null ? "—" : value.toFixed(digits);

const dollars = (value: MaybeNumber, digits = 1) =>
  value === null ? "—" : `$${value.toFixed(digits)}`;

function ExitPresetButton({
  detail,
  onClick,
  selected,
  title,
}: {
  detail: string;
  onClick: () => void;
  selected: boolean;
  title: string;
}) {
  return (
    <DayV3Button
      aria-pressed={selected}
      className="min-h-16 min-w-0 flex-1 flex-col items-start whitespace-normal px-3 py-2.5 text-left"
      onClick={onClick}
      size="md"
      variant={selected ? "primary" : "secondary"}
    >
      <span className="text-[12px] font-semibold leading-tight">{title}</span>
      <span className="text-[10px] font-normal leading-snug opacity-75">
        {detail}
      </span>
    </DayV3Button>
  );
}

export function DayV3OperationalFacts({
  collateralToExitCostBps,
  collateralToExitDays,
  entryPointSettlementDays,
  fixedTermGraceDays,
  navUpdateDays,
  onCollateralToExitCostBps,
  onCollateralToExitDays,
  onEntryPointSettlementDays,
  onFixedTermGraceDays,
  onNavUpdateDays,
  origins = {},
  seniorProtectionEnabled = true,
  slpEnabled = true,
}: {
  collateralToExitCostBps: MaybeNumber;
  collateralToExitDays: MaybeNumber;
  entryPointSettlementDays: MaybeNumber;
  fixedTermGraceDays: MaybeNumber;
  navUpdateDays: MaybeNumber;
  onCollateralToExitCostBps: (value: MaybeNumber) => void;
  onCollateralToExitDays: (value: MaybeNumber) => void;
  onEntryPointSettlementDays: (value: MaybeNumber) => void;
  onFixedTermGraceDays: (value: MaybeNumber) => void;
  onNavUpdateDays: (value: MaybeNumber) => void;
  seniorProtectionEnabled?: boolean;
  slpEnabled?: boolean;
  origins?: Partial<{
    collateralToExitCost: DayV3VisibleOrigin;
    collateralToExitDays: DayV3VisibleOrigin;
    entryPointSettlement: DayV3VisibleOrigin;
    fixedTermGrace: DayV3VisibleOrigin;
    navUpdate: DayV3VisibleOrigin;
  }>;
}) {
  const factOrigin = (origin: DayV3VisibleOrigin | undefined) =>
    origin ?? "source-fact";
  const [graceMode, setGraceMode] = useState<"immediately" | "delay" | null>(
    fixedTermGraceDays === 0
      ? "immediately"
      : fixedTermGraceDays === null
        ? null
        : "delay",
  );
  return (
    <div
      className="flex scroll-mt-6 flex-col gap-3 border-t border-[var(--border-subtle)] pt-3"
      id="day-v3-source-operations"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <strong className="text-[12px] font-semibold">
          {slpEnabled ? "Redemption and refill route" : "Senior redemption"}
        </strong>
        <span className="text-[10.5px] text-[var(--tertiary)]">
          {slpEnabled
            ? "Two clocks: receive collateral, then convert it for the SLP"
            : "The in-kind withdrawal clock"}
        </span>
      </div>
      <div
        className={`grid grid-cols-1 gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3 ${slpEnabled ? "sm:grid-cols-2" : ""}`}
      >
        <p className="text-[10.5px] leading-relaxed text-[var(--secondary)]">
          <strong className="block text-[11px] text-[var(--foreground)]">
            1 · Redeem Senior for collateral
          </strong>
          The market enforces a minimum queue before the in-kind redemption may
          execute.
        </p>
        {slpEnabled ? (
          <p className="text-[10.5px] leading-relaxed text-[var(--secondary)]">
            <strong className="block text-[11px] text-[var(--foreground)]">
              2 · Convert collateral to the exit asset
            </strong>
            Once the queued redemption executes and collateral is received,
            this separate clock covers conversion into the asset used to refill
            the SLP.
          </p>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <DayV3NumberField
          label="What minimum withdrawal settlement delay should the market enforce?"
          max={194}
          min={1}
          note="Senior redeems for collateral in kind. After this minimum delay, execution may proceed once any post-request oracle gate and market-state checks pass. This is not the conversion time below."
          onChange={onEntryPointSettlementDays}
          origin={origins.entryPointSettlement ?? "your-answer"}
          placeholder="Enter days"
          presets={[
            { label: "1 day", value: 1 },
            { label: "7 days", value: 7 },
            { label: "30 days", value: 30 },
            { label: "90 days", value: 90 },
          ]}
          suffix="days"
          value={entryPointSettlementDays}
          wholeNumber
          required
        />
        {slpEnabled ? (
          <>
            <DayV3NumberField
              label="Once the redemption executes and collateral is received, how long should conversion into the exit asset take?"
              max={365}
              min={0}
              note="This clock starts only after the in-kind redemption above finishes. Use the source’s actual conversion process; enter 0 only for same-day conversion."
              onChange={onCollateralToExitDays}
              origin={factOrigin(origins.collateralToExitDays)}
              placeholder="Enter days"
              presets={[
                { label: "Same day", value: 0 },
                { label: "1 day", value: 1 },
                { label: "7 days", value: 7 },
              ]}
              suffix="days"
              value={collateralToExitDays}
              wholeNumber
              required
            />
            <DayV3NumberField
              label="What does it cost to convert $100 of collateral into the exit asset?"
              max={99.99}
              min={0}
              note={`Include spread, execution, and operational costs. ${collateralToExitCostBps === null ? "This cost is still missing." : `$${(collateralToExitCostBps / 100).toFixed(2)} per $100 equals ${collateralToExitCostBps.toFixed(0)} bps.`}`}
              onChange={(value) =>
                onCollateralToExitCostBps(value === null ? null : value * 100)
              }
              origin={factOrigin(origins.collateralToExitCost)}
              placeholder="Enter cost"
              prefix="$"
              presets={[
                { label: "No cost", value: 0 },
                { label: "0.25", value: 0.25 },
                { label: "0.50", value: 0.5 },
                { label: "1.00", value: 1 },
              ]}
              step={0.01}
              suffix="per $100"
              value={
                collateralToExitCostBps === null
                  ? null
                  : collateralToExitCostBps / 100
              }
              required
            />
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-[var(--border-subtle)] pt-3">
        <strong className="text-[12px] font-semibold">
          Valuation and protection timing
        </strong>
        <span className="text-[10.5px] text-[var(--tertiary)]">
          {seniorProtectionEnabled
            ? "How quickly the market sees a new value and begins protection"
            : "How quickly the market sees a new value"}
        </span>
      </div>
      <DayV3NumberField
        label="How often will Senior’s published value be refreshed?"
        max={365}
        min={1}
        note="For a daily NAV, enter 1. For a weekly NAV, enter 7."
        onChange={onNavUpdateDays}
        origin={factOrigin(origins.navUpdate)}
        placeholder="Enter days"
        presets={[
          { label: "Daily", value: 1 },
          { label: "Weekly", value: 7 },
          { label: "Monthly", value: 30 },
        ]}
        suffix="days"
        value={navUpdateDays}
        wholeNumber
        required
      />

      {seniorProtectionEnabled ? (
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[12.5px] font-semibold leading-snug">
            When should recovery protection become active after launch?
            {graceMode === null ? (
              <span
                aria-label="Required"
                className="ml-1 text-[var(--negative)]"
              >
                *
              </span>
            ) : null}
          </span>
          <span className="flex flex-wrap items-center justify-end gap-2">
            {graceMode === null ? (
              <Badge className="border-[var(--negative)]/40 bg-[var(--negative)]/10 text-[var(--negative)]">
                Missing
              </Badge>
            ) : null}
            <DayV3Origin origin={factOrigin(origins.fixedTermGrace)} />
          </span>
        </div>
        <div className="mt-3">
          <DayV3SegmentedControl
            ariaLabel="Recovery protection activation"
            onValueChange={(value) => {
              const next = value as "immediately" | "delay";
              setGraceMode(next);
              onFixedTermGraceDays(next === "immediately" ? 0 : null);
            }}
            options={[
              { label: "Immediately", value: "immediately" },
              { label: "After a delay", value: "delay" },
            ]}
            value={graceMode ?? ""}
          />
        </div>
        {graceMode === "delay" ? (
          <DayV3NumberField
            className="mt-3"
            label="How many days after launch?"
            max={194}
            min={1}
            note="This becomes Fixed-Term Grace Period. It is separate from the drawdown recovery window."
            onChange={onFixedTermGraceDays}
            origin={factOrigin(origins.fixedTermGrace)}
            placeholder="Enter days"
            presets={[
              { label: "7 days", value: 7 },
              { label: "14 days", value: 14 },
              { label: "30 days", value: 30 },
            ]}
            suffix="days"
            value={fixedTermGraceDays}
            wholeNumber
            required
          />
        ) : null}
      </div>
      ) : null}
      {entryPointSettlementDays === null || navUpdateDays === null ? (
        <p className="text-[10.5px] leading-relaxed text-[var(--tertiary)]">
          No settlement or NAV timing is assumed. Add both facts before the pool
          design can be resolved.
        </p>
      ) : null}
      {slpEnabled &&
      (collateralToExitDays === null || collateralToExitCostBps === null) ? (
        <p className="rounded-lg border border-dashed border-[var(--border-subtle)] px-3 py-2 text-[10.5px] leading-relaxed text-[var(--secondary)]">
          The immediate pool quote can still be priced, but the restock point
          remains unresolved until both collateral-conversion facts are added.
        </p>
      ) : null}
    </div>
  );
}

export default function DayV3Goals({
  deploying = false,
  drawdownPct,
  exit,
  exitSharePct,
  incentiveBudgetPer100,
  indexOffset = 0,
  inputOrigins = {},
  minimumProceedsPer100,
  onDrawdownPct,
  onDisableProtectedExit,
  onExitSharePct,
  onIncentiveBudgetPer100,
  onMinimumProceedsPer100,
  onRetryPoolDesign,
  onProtectedExitThreshold,
  onRecoveryDays,
  onRecoveryMode,
  onResetExit,
  onResetProtection,
  premiumCurveEditor,
  protectedExit,
  protectedExitThresholdOverride,
  protection,
  recovery,
  recoveryDays,
  recoveryMode,
  showExitSection = true,
  showInlineFeatureControls = true,
  showProtectionSection = true,
}: {
  deploying?: boolean;
  drawdownPct: MaybeNumber;
  exit: DayV3ExitView;
  exitSharePct: MaybeNumber;
  incentiveBudgetPer100: MaybeNumber;
  indexOffset?: number;
  inputOrigins?: Partial<{
    drawdown: DayV3VisibleOrigin;
    exitAmount: DayV3VisibleOrigin;
    incentive: DayV3VisibleOrigin;
    payout: DayV3VisibleOrigin;
    recovery: DayV3VisibleOrigin;
  }>;
  minimumProceedsPer100: MaybeNumber;
  onDrawdownPct: (value: MaybeNumber) => void;
  onDisableProtectedExit?: () => void;
  onExitSharePct: (value: MaybeNumber) => void;
  onIncentiveBudgetPer100: (value: MaybeNumber) => void;
  onMinimumProceedsPer100: (value: MaybeNumber) => void;
  onRetryPoolDesign?: () => void;
  onProtectedExitThreshold: (value: MaybeNumber) => void;
  onRecoveryDays: (value: MaybeNumber) => void;
  onRecoveryMode: (value: "none" | "window") => void;
  onResetExit: () => void;
  onResetProtection: () => void;
  /** Deploy-only premium inputs belong after the exit promise and before the
   *  secondary Protected Exit settings. The parent owns their model state. */
  premiumCurveEditor?: ReactNode;
  protectedExit: DayV3ProtectedExitView;
  protectedExitThresholdOverride: MaybeNumber;
  protection: DayV3ProtectionView;
  recovery: DayV3RecoveryView;
  recoveryDays: MaybeNumber;
  recoveryMode: "none" | "window" | null;
  showExitSection?: boolean;
  showInlineFeatureControls?: boolean;
  showProtectionSection?: boolean;
}) {
  const inputOrigin = (origin: DayV3VisibleOrigin | undefined) =>
    origin ?? "your-answer";
  const poolResultOrigin: DayV3VisibleOrigin =
    exit.status === "recommended" ? "derived" : "illustrative";
  const namedCapacity =
    exitSharePct === 5
      ? "small"
      : exitSharePct === 10
        ? "standard"
        : exitSharePct === 20
          ? "large"
          : null;
  const namedDiscount =
    minimumProceedsPer100 === 99
      ? "tight"
      : minimumProceedsPer100 === 95
        ? "balanced"
        : minimumProceedsPer100 === 90
          ? "flexible"
          : null;
  const [customCapacity, setCustomCapacity] = useState(
    exitSharePct !== null && namedCapacity === null,
  );
  const [customDiscount, setCustomDiscount] = useState(
    minimumProceedsPer100 !== null && namedDiscount === null,
  );
  const protectionDisabled = drawdownPct === 0;
  const exitDisabled = exitSharePct === 0;
  const protectionNeedsReview =
    (inputOrigins.drawdown === "illustrative" ||
      inputOrigins.recovery === "illustrative");
  const exitNeedsReview =
    (inputOrigins.exitAmount === "illustrative" ||
      inputOrigins.payout === "illustrative");
  const exitInputReadiness = dayV3ExitInputReadiness({
    enabled: !exitDisabled,
    exitSharePct,
    minimumProceedsPer100,
  });
  const protectionComplete =
    drawdownPct !== null &&
    (protection.status === "disabled" ||
      (protection.status === "recommended" &&
        (!deploying || recoveryDays !== null)));
  const recoverySummary =
    recoveryMode === "none"
      ? "losses realize immediately"
      : recoveryMode === "window" && recoveryDays !== null
        ? `${recoveryDays}-day recovery window`
        : "recovery timing missing";
  const exitStatus =
    !exitInputReadiness.complete
      ? ({
          label: "Missing",
          tone: "incomplete",
          missing: exitInputReadiness.missing,
        } as const)
      : exit.status === "resolving"
        ? ({ label: "Checking", tone: "checking" } as const)
        : exit.status === "infeasible"
          ? ({ label: "Needs changes", tone: "blocked" } as const)
          : exit.status === "unresolved"
            ? ({ label: deploying ? "Review" : "Selected", tone: "review" } as const)
      : exitNeedsReview
              ? ({ label: deploying ? "Review" : "Example", tone: "review" } as const)
              : ({ label: deploying ? "Confirmed" : "Selected", tone: "complete" } as const);
  const protectionMissing = [
    ...(drawdownPct === null ? ["Protection choice"] : []),
    ...(!protectionDisabled && deploying && recoveryDays === null
      ? ["Recovery timing"]
      : []),
  ];

  return (
    <>
      {showProtectionSection ? (
      <DayV3Group
        action={
          <DayV3Button
            onClick={onResetProtection}
            size="sm"
            variant="quiet"
          >
            Reset protection
          </DayV3Button>
        }
        collapsible
        defaultOpen={false}
        docs="coverage"
        docsLabel="How Junior protects Senior"
        id="day-v3-protection-inputs"
        impactHref="#day-v3-risk-models"
        impactLabel="See loss impact"
        index={2 + indexOffset}
        key={deploying ? "deploy-protection" : "simulate-protection"}
        status={
          protectionComplete
            ? protectionNeedsReview
              ? { label: deploying ? "Review" : "Example", tone: "review" }
              : { label: deploying ? "Confirmed" : "Selected", tone: "complete" }
            : {
                label: "Missing",
                tone: "incomplete",
                missing: protectionMissing,
              }
        }
        nextId={showExitSection ? "day-v3-exit-inputs" : deploying ? "day-v3-premium-inputs" : undefined}
        subtitle="Choose the source loss Senior should survive and its recovery window"
        summary={
          protectionDisabled
            ? "Protection off · Senior takes source losses directly"
            : `${drawdownPct === null ? "Protection goal missing" : `${fixed(drawdownPct)}% drop → ${protection.coveragePct === null ? "coverage pending" : `${fixed(protection.coveragePct)}% minimum coverage`}${protection.juniorPer100 === null ? "" : ` · ${dollars(protection.juniorPer100)} Junior`}`} · ${recoverySummary}`
        }
        title="Senior protection"
      >
        {showInlineFeatureControls ? (
        <div className="flex flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-[12.5px] font-semibold leading-tight">
                Should Senior have first-loss protection?
              </h4>
              <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--tertiary)]">
                Turning this off removes Junior capital and lets Senior absorb
                source losses directly.
              </p>
            </div>
            <DayV3Origin origin={inputOrigin(inputOrigins.drawdown)} />
          </div>
          <DayV3SegmentedControl
            ariaLabel="Senior first-loss protection"
            onValueChange={(value) => {
              if (value === "off") {
                onDrawdownPct(0);
                onRecoveryMode("none");
                return;
              }
              if (protectionDisabled) {
                onDrawdownPct(15);
                onRecoveryMode("none");
              }
            }}
            options={[
              { label: "Add protection", value: "on" },
              { label: "No protection", value: "off" },
            ]}
            value={protectionDisabled ? "off" : "on"}
          />
        </div>
        ) : null}

        {!protectionDisabled ? (
          <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
            <DayV3NumberField
              label="What one-time drop should Senior survive without losing principal?"
              max={95}
              min={0}
              note="We find the smallest coverage level that keeps Senior whole through this drop."
              onChange={onDrawdownPct}
              origin={inputOrigin(inputOrigins.drawdown)}
              placeholder="Choose a drawdown"
              presets={[
                { label: "10%", value: 10 },
                { label: "15%", value: 15 },
                { label: "20%", value: 20 },
                { label: "30%", value: 30 },
              ]}
              step={0.5}
              suffix="%"
              value={drawdownPct}
              required
            />

            <DayV3Disclosure
              defaultOpen
              description="Only needed for recovery analysis and Advanced setup"
              key={deploying ? "deploy-recovery" : "simulate-recovery"}
              summary={
                recoveryMode === "none"
                  ? "Recovery timing · realize immediately"
                  : recoveryMode === "window" && recoveryDays !== null
                    ? `Recovery timing · ${recoveryDays} days`
                    : "Add recovery timing"
              }
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12.5px] font-semibold leading-snug">
                    {deploying && recoveryMode === null ? (
                      <span className="mr-1 text-[var(--red-emphasis)]">*</span>
                    ) : null}
                    Should a temporary drawdown have time to recover?
                  </span>
                  <DayV3Origin origin={inputOrigin(inputOrigins.recovery)} />
                </div>
                <DayV3SegmentedControl
                  ariaLabel="Temporary drawdown recovery window"
                  onValueChange={(value) =>
                    onRecoveryMode(value as "none" | "window")
                  }
                  options={[
                    { label: "Realize immediately", value: "none" },
                    { label: "Allow recovery", value: "window" },
                  ]}
                  value={recoveryMode ?? ""}
                />
                {recoveryMode === "window" ? (
                  <DayV3NumberField
                    label="How long should it have to recover?"
                    max={194}
                    min={0}
                    note="This becomes Observation Period Duration in deployment."
                    onChange={onRecoveryDays}
                    origin={inputOrigin(inputOrigins.recovery)}
                    placeholder="Enter days"
                    presets={[
                      { label: "7 days", value: 7 },
                      { label: "30 days", value: 30 },
                      { label: "90 days", value: 90 },
                    ]}
                    suffix="days"
                    value={recoveryDays}
                    wholeNumber
                    required={deploying}
                  />
                ) : null}
                <p className="text-[10.5px] leading-relaxed text-[var(--tertiary)]">
                  Junior covers a drop immediately. While this timer runs,
                  Senior withdrawals pause and a recovery can restore Junior. If
                  the drop has not recovered when time runs out, Junior’s loss
                  becomes permanent.
                </p>
                {recovery.status === "recommended" &&
                recovery.suggestedDays !== null ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--foundation)] px-3 py-2">
                    <span className="text-[10.5px] leading-snug text-[var(--secondary)]">
                      History suggests {recovery.suggestedDays} days from{" "}
                      {recovery.recoveredEpisodeCount} recovered periods.
                    </span>
                    <DayV3Button
                      onClick={() => {
                        onRecoveryMode("window");
                        onRecoveryDays(recovery.suggestedDays);
                      }}
                      size="sm"
                      variant="secondary"
                    >
                      Use {recovery.suggestedDays} days
                    </DayV3Button>
                  </div>
                ) : recovery.status === "sparse-history" ? (
                  <p className="rounded-lg border border-[var(--border-subtle)] bg-[var(--foundation)] px-3 py-2 text-[10.5px] leading-relaxed text-[var(--secondary)]">
                    {recovery.message}
                    {recovery.observedDays.length > 0
                      ? ` Observed recoveries: ${recovery.observedDays.join(", ")} days.`
                      : ""}
                  </p>
                ) : recovery.status === "outside-deployment-window" ? (
                  <p
                    className="rounded-lg border px-3 py-2 text-[10.5px] leading-relaxed"
                    style={{
                      background:
                        "color-mix(in srgb, var(--theme-gold) 10%, transparent)",
                      borderColor:
                        "color-mix(in srgb, var(--theme-gold) 45%, transparent)",
                      color: "var(--gold-emphasis)",
                    }}
                  >
                    {recovery.message}
                  </p>
                ) : recovery.status === "no-observation-periods" ? (
                  <p className="rounded-lg border border-[var(--border-subtle)] bg-[var(--foundation)] px-3 py-2 text-[10.5px] leading-relaxed text-[var(--secondary)]">
                    {recovery.message}
                  </p>
                ) : null}
              </div>
            </DayV3Disclosure>
          </div>
        ) : null}

        <div
          aria-live="polite"
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-4"
          data-status={protection.status}
          role="status"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <strong className="text-[12px] font-semibold">
              Protection result
            </strong>
            <span className="text-[10.5px] text-[var(--tertiary)]">
              Normalized to $100 Senior
            </span>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <ResultTile
              label="Minimum Coverage"
              note="deployment requirement"
              origin="recommended"
              value={
                protection.coveragePct === null
                  ? "—"
                  : `${fixed(protection.coveragePct)}%`
              }
            />
            <ResultTile
              label="Junior required"
              note="per $100 Senior"
              value={dollars(protection.juniorPer100)}
            />
            <ResultTile
              label="Junior return"
              note={
                protectionDisabled
                  ? "Junior is not funded"
                  : "scenario annual rate"
              }
              value={
                protectionDisabled
                  ? "Not funded"
                  : protection.juniorApy === null
                    ? "—"
                    : `${fixed(protection.juniorApy)}%`
              }
            />
          </div>
          <p className="mt-3 text-[10.5px] leading-relaxed text-[var(--tertiary)]">
            {protection.message}
          </p>
        </div>
      </DayV3Group>
      ) : null}

      {showExitSection ? (
      <DayV3Group
        action={
          <DayV3Button
            onClick={() => {
              setCustomCapacity(false);
              setCustomDiscount(false);
              onResetExit();
            }}
            size="sm"
            variant="quiet"
          >
            Reset exit promise
          </DayV3Button>
        }
        collapsible
        defaultOpen={false}
        docs="liquidity"
        docsLabel="How Senior exits"
        id="day-v3-exit-inputs"
        impactHref="#day-v3-exit-models"
        impactLabel="See exit impact"
        index={3 + indexOffset}
        key={deploying ? "deploy-exit" : "simulate-exit"}
        status={exitStatus}
        nextId={deploying ? "day-v3-premium-inputs" : undefined}
        subtitle="Choose how much Senior can sell immediately and the minimum payout"
        summary={
          exitDisabled
            ? "Immediate exit off · no SLP"
            : `${exitSharePct === null ? "Exit amount missing" : `${dollars(exitSharePct)} immediate exit`} → ${exit.slpPer100 === null ? "SLP pending" : `${dollars(exit.slpPer100)} SLP`}${exit.proceeds === null ? "" : ` · ${dollars(exit.proceeds)} proceeds`} · ${minimumProceedsPer100 === null ? "payout floor missing" : `${dollars(minimumProceedsPer100)} floor`}${!exitInputReadiness.complete ? ` · missing ${dayV3MissingPreview(exitInputReadiness.missing)}` : exit.status === "infeasible" ? " · no feasible pool" : exit.status === "unresolved" ? " · live validation unavailable" : ""}`
        }
        title="Senior exit"
      >
        {showInlineFeatureControls ? (
        <div className="flex flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-[12.5px] font-semibold leading-tight">
                Should Senior have an immediate pool exit?
              </h4>
              <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--tertiary)]">
                Turning this off removes the SLP and its one-trade exit promise.
              </p>
            </div>
            <DayV3Origin origin={inputOrigin(inputOrigins.exitAmount)} />
          </div>
          <DayV3SegmentedControl
            ariaLabel="Senior immediate pool exit"
            onValueChange={(value) => {
              if (value === "off") {
                setCustomCapacity(false);
                setCustomDiscount(false);
                onExitSharePct(0);
                onMinimumProceedsPer100(0);
                return;
              }
              if (exitDisabled) {
                onExitSharePct(10);
                onMinimumProceedsPer100(95);
              }
            }}
            options={[
              { label: "Add immediate exit", value: "on" },
              { label: "No immediate exit", value: "off" },
            ]}
            value={exitDisabled ? "off" : "on"}
          />
        </div>
        ) : null}

        {!exitDisabled ? (
          <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
            <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] p-3.5">
              <div className="flex items-start gap-2.5">
                <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--card)] px-2 py-1 font-mono text-[9px] font-bold leading-none text-[var(--secondary)]">
                  3A
                </span>
                <div className="min-w-0">
                  <h4 className="text-[12.5px] font-semibold leading-tight">
                    Size the exit pool
                  </h4>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--tertiary)]">
                    Choose how much Senior the SLP should support selling in one
                    trade. The solver finds the smallest pool that can do it.
                  </p>
                </div>
              </div>

              {!deploying ? (
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      id: "small",
                      title: "Small",
                      detail: "Sell $5 of $100",
                      value: 5,
                    },
                    {
                      id: "standard",
                      title: "Standard",
                      detail: "Sell $10 of $100",
                      value: 10,
                    },
                    {
                      id: "large",
                      title: "Large",
                      detail: "Sell $20 of $100",
                      value: 20,
                    },
                  ].map((preset) => (
                    <ExitPresetButton
                      detail={preset.detail}
                      key={preset.id}
                      onClick={() => {
                        setCustomCapacity(false);
                        onExitSharePct(preset.value);
                      }}
                      selected={!customCapacity && namedCapacity === preset.id}
                      title={preset.title}
                    />
                  ))}
                  <ExitPresetButton
                    detail="Choose an exact amount"
                    onClick={() => setCustomCapacity(true)}
                    selected={customCapacity}
                    title="Custom"
                  />
                </div>
              ) : null}

              {deploying || customCapacity ? (
                <DayV3NumberField
                  label="Out of every $100 Senior, how much should the SLP support selling right away?"
                  max={100}
                  min={0.01}
                  note="A single sale into a pool at rest. This goal determines SLP capital, not a lifetime withdrawal limit."
                  onChange={onExitSharePct}
                  origin={inputOrigin(inputOrigins.exitAmount)}
                  placeholder="Choose an amount"
                  prefix="$"
                  presets={
                    deploying
                      ? [
                          { label: "5", value: 5 },
                          { label: "10", value: 10 },
                          { label: "20", value: 20 },
                        ]
                      : undefined
                  }
                  step={0.5}
                  suffix="of $100"
                  value={exitSharePct}
                  required
                />
              ) : null}

              <div className="grid grid-cols-2 gap-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--card)] px-3 py-3">
                <ResultTile
                  label="Sell at once"
                  note="Senior per $100"
                  origin={poolResultOrigin}
                  value={dollars(exit.sellablePer100)}
                />
                <ResultTile
                  label="SLP required"
                  note="per $100 Senior"
                  origin={poolResultOrigin}
                  value={dollars(exit.slpPer100)}
                />
              </div>
            </section>

            <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] p-3.5">
              <div className="flex items-start gap-2.5">
                <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--card)] px-2 py-1 font-mono text-[9px] font-bold leading-none text-[var(--secondary)]">
                  3B
                </span>
                <div className="min-w-0">
                  <h4 className="text-[12.5px] font-semibold leading-tight">
                    Choose the minimum payout
                  </h4>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--tertiary)]">
                    Set the fee-inclusive payout floor. The solver derives the
                    curve and checks that refilling is economic by the promised
                    exit.
                  </p>
                </div>
              </div>

              {!deploying ? (
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      id: "tight",
                      title: "Tight",
                      detail: "Receive at least $99",
                      value: 99,
                    },
                    {
                      id: "balanced",
                      title: "Balanced",
                      detail: "Receive at least $95",
                      value: 95,
                    },
                    {
                      id: "flexible",
                      title: "Flexible",
                      detail: "Receive at least $90",
                      value: 90,
                    },
                  ].map((preset) => (
                    <ExitPresetButton
                      detail={preset.detail}
                      key={preset.id}
                      onClick={() => {
                        setCustomDiscount(false);
                        onMinimumProceedsPer100(preset.value);
                      }}
                      selected={!customDiscount && namedDiscount === preset.id}
                      title={preset.title}
                    />
                  ))}
                  <ExitPresetButton
                    detail="Choose an exact floor"
                    onClick={() => setCustomDiscount(true)}
                    selected={customDiscount}
                    title="Custom"
                  />
                </div>
              ) : null}

              {deploying || customDiscount ? (
                <DayV3NumberField
                  label="At the deepest point in the SLP, what is the least a seller should receive for $100 Senior?"
                  max={100}
                  min={0}
                  note="A lower payout permits a steeper discount. Deployment checks the minimum settlement delay, collateral-conversion time and cost, and live swap fee. Any additional oracle-gate wait is not modeled."
                  onChange={onMinimumProceedsPer100}
                  origin={inputOrigin(inputOrigins.payout)}
                  placeholder="Choose a payout floor"
                  prefix="$"
                  presets={
                    deploying
                      ? [
                          { label: "99", value: 99 },
                          { label: "95", value: 95 },
                          { label: "90", value: 90 },
                        ]
                      : undefined
                  }
                  step={0.1}
                  suffix="of $100"
                  value={minimumProceedsPer100}
                  required
                />
              ) : null}

              <div className="grid grid-cols-2 gap-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--card)] px-3 py-3">
                <ResultTile
                  label="Lowest payout"
                  note="fee-inclusive, per $100"
                  origin={poolResultOrigin}
                  value={dollars(exit.lowestPayoutPer100)}
                />
                <ResultTile
                  label="Maximum discount"
                  note="derived pool floor"
                  origin={
                    exit.status === "recommended"
                      ? "recommended"
                      : "illustrative"
                  }
                  value={
                    exit.maximumDiscountPct === null
                      ? "—"
                      : `${fixed(exit.maximumDiscountPct, 2)}%`
                  }
                />
                <ResultTile
                  label="Expected proceeds"
                  note="from the promised sale"
                  origin={poolResultOrigin}
                  value={dollars(exit.proceeds)}
                />
                <ResultTile
                  label="Restocking begins"
                  note="pool used before refill pays"
                  origin={poolResultOrigin}
                  value={
                    exit.restockPoint === null
                      ? deploying
                        ? "Unresolved"
                        : "Advanced only"
                      : `${fixed(exit.restockPoint)}%`
                  }
                />
              </div>

              <div className="rounded-lg border border-dashed border-[var(--border-subtle)] px-3 py-2.5 text-[10.5px] leading-relaxed text-[var(--secondary)]">
                {exit.restockHurdleBps === null ? (
                  <>
                    The immediate quote is modeled here. In Deploy, the curve
                    must also pay for the minimum settlement delay,
                    collateral-conversion time and cost, and live swap fee.
                    Any additional oracle-gate wait is not modeled.
                  </>
                ) : (
                  <>
                    Restock hurdle:{" "}
                    <strong>{fixed(exit.restockHurdleBps, 0)} bps</strong>
                    {exit.restockOperationalHurdleBps === null
                      ? ""
                      : ` (${fixed(exit.restockOperationalHurdleBps, 0)} bps operations + ${fixed(exit.swapFeeBps, 0)} bps live fee)`}
                    .
                    {exit.restockMarginBps === null
                      ? ""
                      : ` Net refill margin after the promised sale: ${fixed(exit.restockMarginBps, 0)} bps.`}
                  </>
                )}
              </div>
            </section>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-4 sm:grid-cols-3">
            <ResultTile
              label="Sell at once"
              note="no pool exit promised"
              value="$0.0"
            />
            <ResultTile
              label="SLP required"
              note="per $100 Senior"
              value="$0.0"
            />
            <ResultTile
              label="Minimum Liquidity"
              note="deployment requirement"
              value="0.0%"
            />
          </div>
        )}

        <div
          aria-live="polite"
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3"
          data-status={exit.status}
          role="status"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 flex-1 text-[10.5px] leading-relaxed text-[var(--tertiary)]">
              {exit.message}
            </p>
            <span className="text-[10px] font-semibold text-[var(--tertiary)]">
              All amounts per $100 Senior
            </span>
          </div>
          {exit.status === "infeasible" ? (
            <p className="mt-3 rounded-lg border border-[color-mix(in_srgb,var(--theme-gold)_45%,transparent)] bg-[color-mix(in_srgb,var(--theme-gold)_10%,transparent)] px-3 py-2.5 text-[10.5px] font-medium leading-relaxed text-[var(--gold-emphasis)]">
              This is a completed solver result, not a missing input. Change the
              exit size, payout floor, settlement time, conversion time, or
              conversion cost above—or turn off the immediate pool exit.
            </p>
          ) : exit.status === "unresolved" && onRetryPoolDesign ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-[var(--border-subtle)] px-3 py-2.5">
              <span className="text-[10.5px] leading-relaxed text-[var(--secondary)]">
                Your inputs are saved. Re-run live validation after the
                canonical service reconnects.
              </span>
              <DayV3Button
                onClick={onRetryPoolDesign}
                size="sm"
                variant="secondary"
              >
                Retry live validation
              </DayV3Button>
            </div>
          ) : null}
        </div>

      </DayV3Group>
      ) : null}

      {deploying ? premiumCurveEditor : null}

      {deploying && !protectionDisabled ? (
        <DayV3Group
          collapsible
          defaultOpen={false}
          deployOnly
          docs="protectedExit"
          docsLabel="Protected Exit"
          id="day-v3-protected-exit-inputs"
          impactHref="#day-v3-risk-models"
          impactLabel="See protection impact"
          index={5 + indexOffset}
          status={
            protectedExit.status === "scenario-ready"
              ? { label: "Confirmed", tone: "complete" }
              : {
                  label: "Missing",
                  tone: "incomplete",
                  missing: ["Protected Exit trigger"],
                }
          }
          subtitle="Set the trigger and optional Junior-funded bonus"
          summary={`${protectedExit.thresholdPct === null ? "Trigger missing" : `${fixed(protectedExit.thresholdPct)}% coverage-left trigger`} · ${protectedExit.bonusPct === null ? "bonus unresolved" : `${fixed(protectedExit.bonusPct)}% bonus`}`}
          title="Protected Exit"
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] p-3.5">
              <div>
                <h4 className="text-[12.5px] font-semibold leading-tight">
                  Should this protected market include Protected Exit?
                </h4>
                <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--tertiary)]">
                  Protected Exit is part of a Junior-protected deployment. Turning it off also removes Junior protection so the exported contract terms remain valid.
                </p>
              </div>
              <DayV3SegmentedControl
                ariaLabel="Protected Exit configuration"
                onValueChange={(value) => {
                  if (value === "off") onDisableProtectedExit?.();
                }}
                options={[
                  { label: "Configure Protected Exit", value: "on" },
                  { label: "No Protected Exit or Junior", value: "off" },
                ]}
                value="on"
              />
            </div>
            <p className="text-[11.5px] leading-relaxed text-[var(--secondary)]">
              Every deployment needs a trigger that defines when Senior may use
              Protected Exit. The bonus is optional and remains 0% when no
              Junior-funded incentive budget is supplied.
            </p>
            <DayV3NumberField
              label="Compare a different Protected Exit trigger"
              max={89.99}
              min={0.01}
              note="Enter the percentage of Minimum Coverage still remaining. Leave blank to use a history-backed recommendation; any entry is marked as a manual override."
              onChange={onProtectedExitThreshold}
              origin="manual-override"
              placeholder="Use history"
              step={0.01}
              suffix="% left"
              value={protectedExitThresholdOverride}
            />
            <DayV3NumberField
              label="How much Junior-funded incentive should be available per $100 Senior redeemed?"
              max={99.99}
              min={0}
              note="Leave this blank for a 0% bonus. V3 will never infer a bonus from pool exit costs."
              onChange={onIncentiveBudgetPer100}
              origin={inputOrigin(inputOrigins.incentive)}
              placeholder="Optional"
              prefix="$"
              presets={[
                { label: "Off", value: 0 },
                { label: "$1 per $100", value: 1 },
                { label: "$2 per $100", value: 2 },
              ]}
              step={0.1}
              suffix="per $100"
              value={incentiveBudgetPer100}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <ResultTile
                label="Protected Exit trigger"
                note="required; history-backed when enough data exists"
                value={
                  protectedExit.thresholdPct === null
                    ? "Unresolved"
                    : `${fixed(protectedExit.thresholdPct)}%`
                }
              />
              <ResultTile
                label="Senior bonus"
                note="optional; 0% when no budget is supplied"
                value={
                  protectedExit.bonusPct === null
                    ? "Unresolved"
                    : `${fixed(protectedExit.bonusPct)}%`
                }
              />
              <ResultTile
                label="Modeled activation stress"
                note="source drawdown used to enter Protected Exit"
                value={
                  typeof protectedExit.activationStressPct === "number"
                    ? `${fixed(protectedExit.activationStressPct)}%`
                    : "Unresolved"
                }
              />
            </div>
            {protectedExit.comparisons &&
            protectedExit.comparisons.length > 0 ? (
              <section className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--foundation)] px-3.5 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <strong className="text-[11.5px] font-semibold">
                    Trigger comparisons
                  </strong>
                  <span className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--tertiary)]">
                    scenarios · not a recommendation
                  </span>
                </div>
                <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--tertiary)]">
                  There is not enough recovery evidence to select a trigger.
                  These exact accountant runs show how earlier and later
                  triggers behave with a 0% bonus.
                </p>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[600px] border-collapse text-left text-[10.5px]">
                    <thead className="text-[9px] font-semibold uppercase tracking-[0.07em] text-[var(--tertiary)]">
                      <tr>
                        <th className="border-b border-[var(--border-subtle)] px-2 py-2">
                          Coverage left trigger
                        </th>
                        <th className="border-b border-[var(--border-subtle)] px-2 py-2">
                          Activates after drawdown
                        </th>
                        <th className="border-b border-[var(--border-subtle)] px-2 py-2">
                          Payout at 100%
                        </th>
                        <th className="border-b border-[var(--border-subtle)] px-2 py-2">
                          Junior used
                        </th>
                        <th className="border-b border-[var(--border-subtle)] px-2 py-2">
                          Coverage left
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {protectedExit.comparisons.map((comparison) => (
                        <tr key={comparison.thresholdPct}>
                          <td className="border-b border-[var(--border-subtle)] px-2 py-2 font-mono tabular-nums">
                            {fixed(comparison.thresholdPct, 2)}%
                          </td>
                          <td className="border-b border-[var(--border-subtle)] px-2 py-2 font-mono tabular-nums">
                            {fixed(comparison.activationStressPct, 2)}%
                          </td>
                          <td className="border-b border-[var(--border-subtle)] px-2 py-2 font-mono tabular-nums">
                            {dollars(comparison.payoutPer100, 2)}
                          </td>
                          <td className="border-b border-[var(--border-subtle)] px-2 py-2 font-mono tabular-nums">
                            {dollars(comparison.juniorUsedPer100, 2)}
                          </td>
                          <td className="border-b border-[var(--border-subtle)] px-2 py-2 font-mono tabular-nums">
                            {fixed(comparison.remainingCoveragePct, 2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
            {protectedExit.scenarios.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {protectedExit.scenarios.map((scenario) => (
                  <section
                    className="rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-3.5 py-3"
                    key={scenario.redeemedPct}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2">
                      <strong className="font-mono text-[13px] tabular-nums">
                        {fixed(scenario.redeemedPct)}% redeemed
                      </strong>
                      <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--card)] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.07em] text-[var(--tertiary)]">
                        {scenario.capped ? "bonus capped" : "full bonus"}
                      </span>
                    </div>
                    <dl className="mt-2 flex flex-col gap-1.5 text-[10.5px]">
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-[var(--tertiary)]">
                          Actual payout
                        </dt>
                        <dd className="font-mono font-semibold tabular-nums">
                          {dollars(scenario.payoutPer100, 2)}
                        </dd>
                      </div>
                      {typeof scenario.bonusPaidPer100 === "number" ? (
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="text-[var(--tertiary)]">Bonus paid</dt>
                          <dd className="text-right font-mono font-semibold tabular-nums">
                            {dollars(scenario.bonusPaidPer100, 2)}
                            {typeof scenario.bonusPaidPctOfRedemption ===
                            "number"
                              ? ` · ${fixed(scenario.bonusPaidPctOfRedemption, 2)}%`
                              : ""}
                          </dd>
                        </div>
                      ) : null}
                      {typeof scenario.onChainBonusCapPer100 === "number" ? (
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="text-[var(--tertiary)]">
                            On-chain bonus cap
                          </dt>
                          <dd className="text-right font-mono font-semibold tabular-nums">
                            {dollars(scenario.onChainBonusCapPer100, 2)}
                            {typeof scenario.onChainBonusCapPctOfRedemption ===
                            "number"
                              ? ` · ${fixed(scenario.onChainBonusCapPctOfRedemption, 2)}%`
                              : ""}
                          </dd>
                        </div>
                      ) : null}
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-[var(--tertiary)]">Junior used</dt>
                        <dd className="font-mono font-semibold tabular-nums">
                          {dollars(scenario.juniorUsedPer100, 2)}
                        </dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-[var(--tertiary)]">
                          Coverage left
                        </dt>
                        <dd className="font-mono font-semibold tabular-nums">
                          {fixed(scenario.remainingCoveragePct)}%
                        </dd>
                      </div>
                    </dl>
                  </section>
                ))}
              </div>
            ) : null}
            <p className="text-[10.5px] leading-relaxed text-[var(--tertiary)]">
              {protectedExit.message}
            </p>
          </div>
        </DayV3Group>
      ) : null}
    </>
  );
}
