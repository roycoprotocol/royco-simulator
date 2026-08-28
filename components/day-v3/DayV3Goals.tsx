"use client";

import DayV3Button from "@/components/day-v3/DayV3Button";
import DayV3Group from "@/components/day-v3/DayV3Group";
import DayV3NumberField from "@/components/day-v3/DayV3NumberField";
import type { DayV3VisibleOrigin } from "@/components/day-v3/DayV3Origin";
import DayV3QuoteAsset from "@/components/day-v3/DayV3QuoteAsset";
import DayV3SegmentedControl from "@/components/day-v3/DayV3SegmentedControl";
import {
  dayV3ExitInputReadiness,
  dayV3MissingPreview,
} from "@/lib/day-v3/input-readiness";
import {
  dayV3DepthAtNavBps,
  dayV3ExitSharePctFromDepthBps,
  dayV3MaximumDiscountBps,
  dayV3MinimumProceedsPer100FromDiscountBps,
} from "@/lib/day-v3/exit-units";

type MaybeNumber = number | null;

export type DayV3ProtectionView = {
  coveragePct: MaybeNumber;
  juniorPer100: MaybeNumber;
  juniorApy: MaybeNumber;
  status:
    | "disabled"
    | "missing-goal"
    | "recommended"
    | "infeasible"
    | "unresolved";
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
  /** Time/carry and external-conversion hurdle before the live pool fee. */
  restockOperationalHurdleBps: MaybeNumber;
  /** All-in hurdle used by the canonical pool-design calculation. */
  restockHurdleBps: MaybeNumber;
  /** Net refill margin at the state reached by the selected sale. */
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

/** Retained for the deployment handoff while its UI is moved out of inputs. */
export type DayV3ProtectedExitView = {
  thresholdPct: MaybeNumber;
  bonusPct: MaybeNumber;
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
  comparisons?: Array<{
    thresholdPct: number;
    activationStressPct: number;
    payoutPer100: number;
    juniorUsedPer100: number;
    remainingCoveragePct: number;
  }>;
};

/** Retained for historical-model state while recovery is removed from inputs. */
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

const fixed = (value: MaybeNumber, digits = 1) =>
  value === null ? "—" : value.toFixed(digits);

const dollars = (value: MaybeNumber, digits = 1) =>
  value === null ? "—" : `$${value.toFixed(digits)}`;

export default function DayV3Goals({
  drawdownPct,
  exit,
  exitSharePct,
  indexOffset = 0,
  inputOrigins = {},
  minimumProceedsPer100,
  onDrawdownPct,
  onExitSharePct,
  onMinimumProceedsPer100,
  onPoolTurnoverPerYear,
  onQuoteAssetLabel,
  onQuoteAssetYieldPct,
  onRecoveryDays,
  onRecoveryMode,
  onResetExit,
  onResetProtection,
  poolPremiumEdited = false,
  poolTurnoverPerYear,
  defaultPremiumBps,
  onPoolPremiumBps,
  poolPremiumBps,
  restingSeniorWeight,
  onSwapFeeBps,
  protection,
  quoteAssetLabel,
  quoteAssetYieldPct,
  recoveryDays,
  recoveryMode,
  swapFeeBps,
}: {
  drawdownPct: MaybeNumber;
  exit: DayV3ExitView;
  exitSharePct: MaybeNumber;
  indexOffset?: number;
  inputOrigins?: Partial<{
    drawdown: DayV3VisibleOrigin;
    exitAmount: DayV3VisibleOrigin;
    payout: DayV3VisibleOrigin;
    quoteAsset: DayV3VisibleOrigin;
  }>;
  minimumProceedsPer100: MaybeNumber;
  onDrawdownPct: (value: MaybeNumber) => void;
  onExitSharePct: (value: MaybeNumber) => void;
  onMinimumProceedsPer100: (value: MaybeNumber) => void;
  onPoolTurnoverPerYear: (value: MaybeNumber) => void;
  onQuoteAssetLabel: (value: string) => void;
  onQuoteAssetYieldPct: (value: MaybeNumber) => void;
  onRecoveryDays: (value: MaybeNumber) => void;
  onRecoveryMode: (value: "none" | "window") => void;
  onResetExit: () => void;
  onResetProtection: () => void;
  poolTurnoverPerYear: MaybeNumber;
  onSwapFeeBps: (value: MaybeNumber) => void;
  protection: DayV3ProtectionView;
  quoteAssetLabel: string;
  quoteAssetYieldPct: MaybeNumber;
  recoveryDays: MaybeNumber;
  recoveryMode: "none" | "window" | null;
  /** The issuer's own pool fee. `null` inherits the live template's. */
  swapFeeBps: MaybeNumber;
  defaultPremiumBps: MaybeNumber;
  onPoolPremiumBps: (value: number | null) => void;
  poolPremiumEdited?: boolean;
  poolPremiumBps: MaybeNumber;
  restingSeniorWeight: MaybeNumber;
}) {
  const inputOrigin = (origin: DayV3VisibleOrigin | undefined) =>
    origin ?? "your-answer";
  const protectionDisabled = drawdownPct === 0;
  const exitDisabled = exitSharePct === 0;
  const protectionComplete =
    drawdownPct !== null &&
    (protectionDisabled ||
      (recoveryDays !== null && protection.status === "recommended"));
  const exitInputReadiness = dayV3ExitInputReadiness({
    enabled: !exitDisabled,
    exitSharePct,
    minimumProceedsPer100,
  });
  const depthAtNavBps =
    exitSharePct === null ? null : dayV3DepthAtNavBps(exitSharePct);
  const maximumDiscountBps =
    minimumProceedsPer100 === null
      ? null
      : dayV3MaximumDiscountBps(minimumProceedsPer100);
  const exitStatus = !exitInputReadiness.complete
    ? ({
        label: "Missing",
        tone: "incomplete",
        missing: exitInputReadiness.missing,
      } as const)
    : exit.status === "infeasible"
      ? ({ label: "Needs changes", tone: "blocked" } as const)
      : ({ label: "Set", tone: "complete" } as const);

  return (
    <>
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
        index={1 + indexOffset}
        status={
          protectionComplete
            ? { label: "Set", tone: "complete" }
            : {
                label: "Missing",
                tone: "incomplete",
                missing: [
                  ...(drawdownPct === null ? ["Protection choice"] : []),
                  ...(!protectionDisabled && recoveryDays === null
                    ? ["Observation mode"]
                    : []),
                ],
              }
        }
        subtitle="Choose whether Senior needs protection and the loss it should survive"
        summary={
          protectionDisabled
            ? "Protection off · no Junior"
            : drawdownPct === null
              ? "Choose a protected drawdown"
              : `Goal: ${fixed(drawdownPct)}% source drawdown · Contract: ${
                  protection.coveragePct === null
                    ? "coverage pending"
                    : `${fixed(protection.coveragePct)}% Minimum Coverage`
                }${
                  protection.juniorPer100 === null
                    ? ""
                    : ` · ${dollars(protection.juniorPer100)} Junior at 90% target`
                } · ${
                  recoveryMode === "none"
                    ? "losses realize immediately"
                    : recoveryMode === "window" && recoveryDays !== null
                      ? `${recoveryDays}-day observation period`
                      : "observation mode missing"
                }`
        }
        title="Senior protection"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-3 py-3">
          <div className="min-w-0 flex-1">
            <h4 className="text-[12px] font-semibold leading-tight">
              Should Senior have first-loss protection?
            </h4>
            <p className="mt-0.5 text-[10px] leading-snug text-[var(--tertiary)]">
              Off removes Junior capital, lets Senior absorb source losses
              directly, and greys out every Junior model below.
            </p>
          </div>
          <DayV3SegmentedControl
            ariaLabel="Senior first-loss protection"
            className="shrink-0"
            onValueChange={(value) => {
              if (value === "off") {
                onDrawdownPct(0);
                return;
              }
              if (drawdownPct === null || protectionDisabled) {
                onDrawdownPct(15);
              }
            }}
            options={[
              { label: "Add protection", value: "on" },
              { label: "No protection", value: "off" },
            ]}
            size="sm"
            value={protectionDisabled ? "off" : "on"}
          />
        </div>

        {!protectionDisabled ? (
          <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
            <DayV3NumberField
              label="What source drawdown should Senior survive without losing principal?"
              max={95}
              min={0.01}
              note="The protection goal, tested at the 100%-utilized boundary, then sized at the 90% target."
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

            <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-3 py-3">
              <div>
                <h4 className="text-[12px] font-semibold leading-tight">
                  How should temporary losses be observed?
                </h4>
                <p className="mt-0.5 text-[10px] leading-snug text-[var(--tertiary)]">
                  Controls when a covered loss becomes permanent. It does not
                  change the amount of Junior required.
                </p>
              </div>
              <DayV3SegmentedControl
                ariaLabel="Observation mode"
                size="sm"
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
                  label="How long should a temporary loss have to recover?"
                  max={194}
                  min={1}
                  note="Becomes Observation Period Duration. Withdrawals pause while it runs; a recovery restores Junior first."
                  onChange={onRecoveryDays}
                  placeholder="Enter days"
                  presets={[
                    { label: "7 days", value: 7 },
                    { label: "30 days", value: 30 },
                    { label: "90 days", value: 90 },
                  ]}
                  suffix="days"
                  value={recoveryDays}
                  wholeNumber
                  required
                />
              ) : null}
            </div>
          </div>
        ) : null}

        {/* The result band that used to sit here repeated Minimum Coverage
            and Junior capital, both of which the capital stack states with
            their 100%-utilized floors beside them. What is not stated
            elsewhere is whether the goal was met, so that is all that stays. */}
        <p
          aria-live="polite"
          className="rounded-xl border border-dashed border-[var(--border-subtle)] px-3 py-3 text-[10.5px] leading-snug text-[var(--secondary)]"
          data-status={protection.status}
          role="status"
        >
          {protection.status === "missing-goal"
            ? "Choose a protected drawdown and observation mode to size the Junior capital required."
            : protection.message}
        </p>
      </DayV3Group>

      <DayV3Group
        action={
          <DayV3Button
            onClick={onResetExit}
            size="sm"
            variant="quiet"
          >
            Reset exit
          </DayV3Button>
        }
        collapsible
        defaultOpen={false}
        docs="liquidity"
        docsLabel="How Senior exits"
        id="day-v3-exit-inputs"
        index={2 + indexOffset}
        status={exitStatus}
        subtitle="Choose whether Senior needs an immediate exit and how it should perform"
        summary={
          exitDisabled
            ? "Immediate exit off · no SLP"
            : `${
                exitSharePct === null
                  ? "Depth at NAV missing"
                  : `${fixed(depthAtNavBps, 0)} bps depth at NAV`
              } → ${
                exit.slpPer100 === null
                  ? "SLP basis unavailable"
                  : `${dollars(exit.slpPer100)} SLP`
              }${
                exit.proceeds === null
                  ? ""
                  : ` · ${dollars(exit.proceeds)} proceeds`
              } · ${
                minimumProceedsPer100 === null
                  ? "maximum discount missing"
                  : `${fixed(maximumDiscountBps, 0)} bps maximum discount`
              }${
                !exitInputReadiness.complete
                  ? ` · missing ${dayV3MissingPreview(exitInputReadiness.missing)}`
                  : exit.status === "infeasible"
                    ? " · no feasible pool"
                    : ""
              }`
        }
        title="Senior exit"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-3 py-3">
          <div className="min-w-0 flex-1">
            <h4 className="text-[12px] font-semibold leading-tight">
              Should Senior have an immediate pool exit?
            </h4>
            <p className="mt-0.5 text-[10px] leading-snug text-[var(--tertiary)]">
              Off removes the SLP and immediate pool exit, and greys out every
              SLP model below.
            </p>
          </div>
          <DayV3SegmentedControl
            ariaLabel="Senior immediate pool exit"
            className="shrink-0"
            onValueChange={(value) => {
              if (value === "off") {
                onExitSharePct(0);
                onMinimumProceedsPer100(0);
                return;
              }
              if (exitSharePct === null || exitDisabled) {
                onExitSharePct(10);
                onMinimumProceedsPer100(95);
              }
            }}
            options={[
              { label: "Add immediate exit", value: "on" },
              { label: "No immediate exit", value: "off" },
            ]}
            size="sm"
            value={exitDisabled ? "off" : "on"}
          />
        </div>

        {!exitDisabled ? (
          <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
              <DayV3NumberField
                label="How much Senior depth should be available at NAV?"
                max={10_000}
                min={1}
                note="Basis points of the Senior position sellable in one trade from rest, not a lifetime cap. This sets the SLP capital; arbitrage can push the pool back to rest afterwards."
                onChange={(value) =>
                  onExitSharePct(
                    value === null
                      ? null
                      : dayV3ExitSharePctFromDepthBps(value),
                  )
                }
                origin={inputOrigin(inputOrigins.exitAmount)}
                placeholder="Choose depth"
                presets={[
                  { label: "500 bps", value: 500 },
                  { label: "1,000 bps", value: 1_000 },
                  { label: "2,000 bps", value: 2_000 },
                ]}
                step={50}
                suffix="bps"
                value={depthAtNavBps}
                required
              />
              <DayV3NumberField
                label="What is the maximum discount to NAV?"
                max={10_000}
                min={0}
                note="Worst case, not expected: the fee-inclusive discount for a seller taking the full depth above in one trade. Smaller sales price nearer NAV. A tighter maximum costs more SLP capital."
                onChange={(value) =>
                  onMinimumProceedsPer100(
                    value === null
                      ? null
                      : dayV3MinimumProceedsPer100FromDiscountBps(value),
                  )
                }
                origin={inputOrigin(inputOrigins.payout)}
                placeholder="Choose a maximum discount"
                presets={[
                  { label: "100 bps", value: 100 },
                  { label: "500 bps", value: 500 },
                  { label: "1,000 bps", value: 1_000 },
                ]}
                step={10}
                suffix="bps"
                value={maximumDiscountBps}
                required
              />
            <DayV3QuoteAsset
              label={quoteAssetLabel}
              onLabel={onQuoteAssetLabel}
              defaultPremiumBps={defaultPremiumBps}
              onPoolPremiumBps={onPoolPremiumBps}
              poolPremiumEdited={poolPremiumEdited}
              poolPremiumBps={poolPremiumBps}
              restingSeniorWeight={restingSeniorWeight}
              onSwapFeeBps={onSwapFeeBps}
              onTurnoverPerYear={onPoolTurnoverPerYear}
              onYieldPct={onQuoteAssetYieldPct}
              swapFeeBps={swapFeeBps}
              turnoverPerYear={poolTurnoverPerYear}
              yieldOrigin={inputOrigin(inputOrigins.quoteAsset)}
              yieldPct={quoteAssetYieldPct}
            />
          </div>
        ) : null}

        {/* Same reasoning: SLP funding and Minimum Liquidity are stated in the
            capital stack, the payout floor and proceeds in the exit model. Only
            the status of the design belongs beside the inputs. */}
        {exitDisabled ? (
          <p className="rounded-xl border border-dashed border-[var(--border-subtle)] px-3 py-3 text-[10.5px] leading-snug text-[var(--secondary)]">
            Immediate exit is off, so this design requires no SLP funding.
          </p>
        ) : exit.status === "missing-goal" ? (
          <p className="rounded-xl border border-dashed border-[var(--border-subtle)] px-3 py-3 text-[10.5px] leading-snug text-[var(--secondary)]">
            Choose the exit amount and payout above to size the pool.
          </p>
        ) : null}

        {exit.status === "infeasible" ? (
          <p
            aria-live="polite"
            className="rounded-lg border border-[color-mix(in_srgb,var(--theme-gold)_45%,transparent)] bg-[color-mix(in_srgb,var(--theme-gold)_10%,transparent)] px-3 py-3 text-[10.5px] font-medium leading-relaxed text-[var(--gold-emphasis)]"
          >
            These inputs do not produce a viable immediate exit. Reduce the
            depth at NAV, allow a larger maximum discount, or turn off the
            immediate exit.
          </p>
        ) : null}
      </DayV3Group>
    </>
  );
}
