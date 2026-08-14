"use client";

import DayV3Button from "@/components/day-v3/DayV3Button";
import DayV3Group from "@/components/day-v3/DayV3Group";
import DayV3NumberField from "@/components/day-v3/DayV3NumberField";
import DayV3Origin, {
  type DayV3VisibleOrigin,
} from "@/components/day-v3/DayV3Origin";
import DayV3SegmentedControl from "@/components/day-v3/DayV3SegmentedControl";
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
  onRecoveryDays,
  onRecoveryMode,
  onResetExit,
  onResetProtection,
  protection,
  recoveryDays,
  recoveryMode,
}: {
  drawdownPct: MaybeNumber;
  exit: DayV3ExitView;
  exitSharePct: MaybeNumber;
  indexOffset?: number;
  inputOrigins?: Partial<{
    drawdown: DayV3VisibleOrigin;
    exitAmount: DayV3VisibleOrigin;
    payout: DayV3VisibleOrigin;
  }>;
  minimumProceedsPer100: MaybeNumber;
  onDrawdownPct: (value: MaybeNumber) => void;
  onExitSharePct: (value: MaybeNumber) => void;
  onMinimumProceedsPer100: (value: MaybeNumber) => void;
  onRecoveryDays: (value: MaybeNumber) => void;
  onRecoveryMode: (value: "none" | "window") => void;
  onResetExit: () => void;
  onResetProtection: () => void;
  protection: DayV3ProtectionView;
  recoveryDays: MaybeNumber;
  recoveryMode: "none" | "window" | null;
}) {
  const inputOrigin = (origin: DayV3VisibleOrigin | undefined) =>
    origin ?? "your-answer";
  const poolResultOrigin: DayV3VisibleOrigin =
    exit.status === "recommended" ? "derived" : "illustrative";
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
            value={protectionDisabled ? "off" : "on"}
          />
        </div>

        {!protectionDisabled ? (
          <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
            <DayV3NumberField
              label="What source drawdown should Senior survive without losing principal?"
              max={95}
              min={0.01}
              note="This is the protection goal. We test it at the 100%-utilized boundary, then size opening Junior capital at the 90% target."
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

            <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] p-3.5">
              <div>
                <h4 className="text-[12.5px] font-semibold leading-tight">
                  How should temporary losses be observed?
                </h4>
                <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--tertiary)]">
                  This controls when a covered loss becomes permanent. It does
                  not change the amount of Junior required.
                </p>
              </div>
              <DayV3SegmentedControl
                ariaLabel="Observation mode"
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
                  note="This becomes Observation Period Duration. While it runs, withdrawals pause; a recovery restores Junior before the loss becomes permanent."
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

        {protection.status === "recommended" ||
        protection.status === "disabled" ? (
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
                Per $100 Senior
              </span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ResultTile
                label="On-chain Minimum Coverage"
                note="contract ratio · tested at 100% utilization"
                origin="recommended"
                value={`${fixed(protection.coveragePct ?? 0)}%`}
              />
              <ResultTile
                label="Junior to open"
                note="per $100 Senior at the 90% operating target"
                value={dollars(protection.juniorPer100 ?? 0)}
              />
            </div>
            <p className="mt-3 text-[10.5px] leading-relaxed text-[var(--tertiary)]">
              {protection.message}
            </p>
          </div>
        ) : (
          <p
            aria-live="polite"
            className="rounded-xl border border-dashed border-[var(--border-subtle)] px-4 py-3 text-[10.5px] leading-relaxed text-[var(--secondary)]"
            role="status"
          >
            {protection.status === "missing-goal"
              ? "Choose a protected drawdown and observation mode to calculate the Junior capital required."
              : protection.message}
          </p>
        )}
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
                  ? "Exit amount missing"
                  : `${dollars(exitSharePct)} immediate exit`
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
                  ? "payout floor missing"
                  : `${dollars(minimumProceedsPer100)} floor`
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
        <div className="flex flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-[12.5px] font-semibold leading-tight">
                Should Senior have an immediate pool exit?
              </h4>
              <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--tertiary)]">
                Turning this off removes the SLP and immediate pool exit.
              </p>
            </div>
            <DayV3Origin origin={inputOrigin(inputOrigins.exitAmount)} />
          </div>
          <DayV3SegmentedControl
            ariaLabel="Senior immediate pool exit"
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
            value={exitDisabled ? "off" : "on"}
          />
        </div>

        {!exitDisabled ? (
          <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
            <DayV3NumberField
              label="Out of every $100 Senior, how much should be sellable right away?"
              max={100}
              min={0.01}
              note="This determines the SLP capital required for one sale into a pool at rest; it is not a lifetime withdrawal limit."
              onChange={onExitSharePct}
              origin={inputOrigin(inputOrigins.exitAmount)}
              placeholder="Choose an amount"
              prefix="$"
              presets={[
                { label: "$5", value: 5 },
                { label: "$10", value: 10 },
                { label: "$20", value: 20 },
              ]}
              step={0.5}
              suffix="of $100"
              value={exitSharePct}
              required
            />
            <DayV3NumberField
              label="What is the least a seller should receive for $100 Senior?"
              max={100}
              min={0}
              note="This fee-inclusive floor determines how much price impact the immediate exit may create."
              onChange={onMinimumProceedsPer100}
              origin={inputOrigin(inputOrigins.payout)}
              placeholder="Choose a payout floor"
              prefix="$"
              presets={[
                { label: "$99", value: 99 },
                { label: "$95", value: 95 },
                { label: "$90", value: 90 },
              ]}
              step={0.1}
              suffix="of $100"
              value={minimumProceedsPer100}
              required
            />
          </div>
        ) : null}

        {exitDisabled ? (
          <p className="rounded-xl border border-dashed border-[var(--border-subtle)] px-4 py-3 text-[10.5px] leading-relaxed text-[var(--secondary)]">
            Immediate exit is off, so this design requires no SLP funding.
          </p>
        ) : exit.status === "recommended" || exit.status === "illustrative" ? (
          <div className="grid grid-cols-2 gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-4 sm:grid-cols-4">
            <ResultTile
              label="SLP required"
              note="per $100 Senior"
              origin={poolResultOrigin}
              value={dollars(exit.slpPer100)}
            />
            <ResultTile
              label="Minimum Liquidity"
              note="deployment requirement"
              origin={poolResultOrigin}
              value={`${fixed(exit.minimumLiquidityPct, 2)}%`}
            />
            <ResultTile
              label="Lowest payout"
              note="fee-inclusive, per $100"
              origin={poolResultOrigin}
              value={dollars(exit.lowestPayoutPer100)}
            />
            <ResultTile
              label="Expected proceeds"
              note="received for the selected sale"
              origin={poolResultOrigin}
              value={dollars(exit.proceeds)}
            />
          </div>
        ) : exit.status === "resolving" ? (
          <div className="grid grid-cols-2 gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-4">
            <ResultTile
              label="Illustrative SLP"
              note="per $100 Senior"
              origin="illustrative"
              value={dollars(exit.slpPer100)}
            />
            <ResultTile
              label="Illustrative liquidity"
              note="used for scenario APY"
              origin="illustrative"
              value={`${fixed(exit.minimumLiquidityPct, 2)}%`}
            />
          </div>
        ) : exit.status === "missing-goal" ? (
          <p className="rounded-xl border border-dashed border-[var(--border-subtle)] px-4 py-3 text-[10.5px] leading-relaxed text-[var(--secondary)]">
            Choose the exit amount and payout above to check the exact pool result.
          </p>
        ) : null}

        {exit.status === "infeasible" ? (
          <p
            aria-live="polite"
            className="rounded-lg border border-[color-mix(in_srgb,var(--theme-gold)_45%,transparent)] bg-[color-mix(in_srgb,var(--theme-gold)_10%,transparent)] px-3 py-2.5 text-[10.5px] font-medium leading-relaxed text-[var(--gold-emphasis)]"
          >
            These inputs do not produce a viable immediate exit. Reduce the
            exit size, lower the payout floor, or turn off the immediate exit.
          </p>
        ) : null}
      </DayV3Group>
    </>
  );
}
