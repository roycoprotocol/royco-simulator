"use client";

import { useId } from "react";

import DayV3Button from "@/components/day-v3/DayV3Button";
import DayV3Disclosure from "@/components/day-v3/DayV3Disclosure";
import DayV3Group from "@/components/day-v3/DayV3Group";
import DayV3SegmentedControl from "@/components/day-v3/DayV3SegmentedControl";
import type { DayV3PoolDesignTarget } from "@/lib/day-v3/pool-design";
import { roundDayV3WholeDays } from "@/lib/day-v3/url-state";

type MaybeNumber = number | null;

export type DayV3ProtectionView = {
  coveragePct: MaybeNumber;
  juniorPer100: MaybeNumber;
  juniorApy: MaybeNumber;
  status: "missing-goal" | "recommended" | "infeasible" | "unresolved";
  message: string;
};

export type DayV3ExitView = {
  status:
    "missing-goal" | "resolving" | "recommended" | "infeasible" | "unresolved";
  message: string;
  sellablePer100: MaybeNumber;
  proceeds: MaybeNumber;
  lowestPayoutPer100: MaybeNumber;
  slpPer100: MaybeNumber;
  restockPoint: MaybeNumber;
  minimumLiquidityPct: MaybeNumber;
  maximumDiscountPct: MaybeNumber;
  lambda: MaybeNumber;
  maximumPremiumBps: MaybeNumber;
  exitAssetSeedPct: MaybeNumber;
  seniorSeedPct: MaybeNumber;
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
    "no-history" | "no-observation-periods" | "sparse-history" | "recommended";
  suggestedDays: MaybeNumber;
  recoveredEpisodeCount: number;
  observedDays: number[];
  message: string;
};

function GoalNumberField({
  label,
  max,
  min,
  note,
  onChange,
  placeholder,
  step = 1,
  suffix,
  value,
  wholeNumber = false,
}: {
  label: string;
  max: number;
  min: number;
  note: string;
  onChange: (value: MaybeNumber) => void;
  placeholder: string;
  step?: number;
  suffix: string;
  value: MaybeNumber;
  wholeNumber?: boolean;
}) {
  const id = useId();
  return (
    <label
      className="flex min-w-0 flex-col gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3 transition-[border-color,box-shadow] hover:border-[var(--secondary)] focus-within:border-[var(--foreground)] focus-within:shadow-[0_2px_10px_-4px_rgba(23,25,31,0.24)]"
      htmlFor={id}
    >
      <span className="text-[12.5px] font-semibold leading-snug">{label}</span>
      <span className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--foundation)] px-3 py-2 focus-within:border-[var(--foreground)]">
        <input
          className="min-w-0 flex-1 bg-transparent font-mono text-[20px] font-bold leading-none tabular-nums outline-none placeholder:font-sans placeholder:text-[13px] placeholder:font-normal placeholder:text-[var(--tertiary)]"
          id={id}
          inputMode={wholeNumber ? "numeric" : "decimal"}
          max={max}
          min={min}
          onChange={(event) => {
            const raw = event.target.value;
            if (raw === "") {
              onChange(null);
              return;
            }
            const next = Number(raw);
            const normalized = wholeNumber ? roundDayV3WholeDays(next) : next;
            onChange(
              Number.isFinite(next) && next >= min && next <= max
                ? normalized
                : null,
            );
          }}
          placeholder={placeholder}
          step={step}
          type="number"
          value={value ?? ""}
        />
        <span className="shrink-0 text-[11px] font-semibold text-[var(--tertiary)]">
          {suffix}
        </span>
      </span>
      <span className="text-[10.5px] leading-relaxed text-[var(--tertiary)]">
        {note}
      </span>
    </label>
  );
}

function ResultTile({
  label,
  note,
  value,
}: {
  label: string;
  note: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border-t border-[var(--border-subtle)] pt-3">
      <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
        {label}
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

export function DayV3OperationalFacts({
  navUpdateDays,
  onNavUpdateDays,
  onRedemptionDays,
  redemptionDays,
}: {
  navUpdateDays: MaybeNumber;
  onNavUpdateDays: (value: MaybeNumber) => void;
  onRedemptionDays: (value: MaybeNumber) => void;
  redemptionDays: MaybeNumber;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-[var(--border-subtle)] pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <strong className="text-[12px] font-semibold">
          How the source operates
        </strong>
        <span className="text-[10.5px] text-[var(--tertiary)]">
          Required for exit and recovery design
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <GoalNumberField
          label="After someone buys Senior, how many days until it can be redeemed into the exit asset?"
          max={365}
          min={0}
          note="Use the actual redemption timing for the underlying asset."
          onChange={onRedemptionDays}
          placeholder="Enter days"
          suffix="days"
          value={redemptionDays}
          wholeNumber
        />
        <GoalNumberField
          label="How often will Senior’s published value be refreshed?"
          max={365}
          min={1}
          note="For a daily NAV, enter 1. For a weekly NAV, enter 7."
          onChange={onNavUpdateDays}
          placeholder="Enter days"
          suffix="days"
          value={navUpdateDays}
          wholeNumber
        />
      </div>
      {redemptionDays === null || navUpdateDays === null ? (
        <p className="text-[10.5px] leading-relaxed text-[var(--tertiary)]">
          No timing is assumed. Add both operating facts before the exit design
          can be resolved.
        </p>
      ) : null}
    </div>
  );
}

export default function DayV3Goals({
  drawdownPct,
  exit,
  exitSharePct,
  incentiveBudgetPer100,
  minimumProceedsPer100,
  onDrawdownPct,
  onExitSharePct,
  onIncentiveBudgetPer100,
  onMinimumProceedsPer100,
  onProtectedExitThreshold,
  onRecoveryDays,
  onRecoveryMode,
  onTarget,
  protectedExit,
  protectedExitThresholdOverride,
  protection,
  recovery,
  recoveryDays,
  recoveryMode,
  selectedTarget,
  targetMessage,
  targets,
}: {
  drawdownPct: MaybeNumber;
  exit: DayV3ExitView;
  exitSharePct: MaybeNumber;
  incentiveBudgetPer100: MaybeNumber;
  minimumProceedsPer100: MaybeNumber;
  onDrawdownPct: (value: MaybeNumber) => void;
  onExitSharePct: (value: MaybeNumber) => void;
  onIncentiveBudgetPer100: (value: MaybeNumber) => void;
  onMinimumProceedsPer100: (value: MaybeNumber) => void;
  onProtectedExitThreshold: (value: MaybeNumber) => void;
  onRecoveryDays: (value: MaybeNumber) => void;
  onRecoveryMode: (value: "none" | "window") => void;
  onTarget: (value: { chainId: number; templateId: string } | null) => void;
  protectedExit: DayV3ProtectedExitView;
  protectedExitThresholdOverride: MaybeNumber;
  protection: DayV3ProtectionView;
  recovery: DayV3RecoveryView;
  recoveryDays: MaybeNumber;
  recoveryMode: "none" | "window" | null;
  selectedTarget: { chainId: number; templateId: string } | null;
  targetMessage: string;
  targets: DayV3PoolDesignTarget[];
}) {
  return (
    <>
      <DayV3Group
        docs="coverage"
        docsLabel="How Junior protects Senior"
        index={2}
        subtitle="Turn the protection promise into a Minimum Coverage requirement"
        title="Choose Senior protection"
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <GoalNumberField
            label="How large a source drawdown should Senior be protected through?"
            max={95}
            min={0}
            note="We find the smallest coverage level that keeps Senior whole through this drop."
            onChange={onDrawdownPct}
            placeholder="Choose a drawdown"
            step={0.5}
            suffix="%"
            value={drawdownPct}
          />

          <div className="flex flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3">
            <span className="text-[12.5px] font-semibold leading-snug">
              Should a temporary drawdown have time to recover?
            </span>
            <DayV3SegmentedControl
              ariaLabel="Temporary drawdown recovery window"
              onValueChange={(value) =>
                onRecoveryMode(value as "none" | "window")
              }
              options={[
                { label: "No recovery window", value: "none" },
                { label: "Give it time", value: "window" },
              ]}
              value={recoveryMode ?? ""}
            />
            {recoveryMode === "window" ? (
              <GoalNumberField
                label="How long should it have to recover?"
                max={194}
                min={0}
                note="This becomes Observation Period Duration in deployment."
                onChange={onRecoveryDays}
                placeholder="Enter days"
                suffix="days"
                value={recoveryDays}
                wholeNumber
              />
            ) : null}
            <p className="text-[10.5px] leading-relaxed text-[var(--tertiary)]">
              Junior covers a drop immediately. While this timer runs, Senior
              withdrawals pause and a recovery can restore Junior. If the drop
              has not recovered when time runs out, Junior’s loss becomes
              permanent.
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
            ) : null}
          </div>
        </div>

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
              Normalized to 100 Senior
            </span>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <ResultTile
              label="Minimum Coverage"
              note="deployment requirement"
              value={
                protection.coveragePct === null
                  ? "—"
                  : `${fixed(protection.coveragePct)}%`
              }
            />
            <ResultTile
              label="Junior required"
              note="per 100 Senior"
              value={fixed(protection.juniorPer100)}
            />
            <ResultTile
              label="Junior return"
              note="modeled annual rate"
              value={
                protection.juniorApy === null
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

      <DayV3Group
        docs="liquidity"
        docsLabel="How Senior exits"
        index={3}
        subtitle="Set the promise; the pool design is derived behind it"
        title="Define the exit promise"
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <GoalNumberField
            label="Out of every 100 of Senior, how much should one holder be able to sell right away?"
            max={100}
            min={0}
            note="This is a single sale into a pool at rest, not a lifetime limit."
            onChange={onExitSharePct}
            placeholder="Choose an amount"
            step={0.5}
            suffix="of 100"
            value={exitSharePct}
          />
          <GoalNumberField
            label="Even when liquidity is low, what is the least they should receive for 100 of Senior?"
            max={100}
            min={0}
            note="We use this as the lowest acceptable payout across the modeled pool curve."
            onChange={onMinimumProceedsPer100}
            placeholder="Choose a payout"
            step={0.1}
            suffix="of 100"
            value={minimumProceedsPer100}
          />
        </div>

        <div
          aria-live="polite"
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-4"
          data-status={exit.status}
          role="status"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <strong className="text-[12px] font-semibold">Exit design</strong>
            <span className="text-[10.5px] text-[var(--tertiary)]">
              Normalized to 100 Senior
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-5">
            <ResultTile
              label="Sell at once"
              note="Senior per 100"
              value={fixed(exit.sellablePer100)}
            />
            <ResultTile
              label="Expected proceeds"
              note="for that sale"
              value={fixed(exit.proceeds)}
            />
            <ResultTile
              label="Lowest payout"
              note="per 100 sold"
              value={fixed(exit.lowestPayoutPer100)}
            />
            <ResultTile
              label="SLP required"
              note="per 100 Senior"
              value={fixed(exit.slpPer100)}
            />
            <ResultTile
              label="Refill becomes economic"
              note="exit asset sold from pool"
              value={
                exit.restockPoint === null
                  ? "—"
                  : `${fixed(exit.restockPoint)}%`
              }
            />
          </div>
          <p className="mt-3 text-[10.5px] leading-relaxed text-[var(--tertiary)]">
            {exit.message}
          </p>
        </div>

        <DayV3Disclosure
          description="The contract and Balancer fields behind the exit promise"
          summary="Deployment mapping"
        >
          <div className="flex flex-col gap-3">
            <label className="flex min-w-0 flex-col gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-4 py-3">
              <span className="text-[12.5px] font-semibold leading-snug">
                Deployment chain and template
              </span>
              <select
                className="min-h-11 w-full cursor-pointer rounded-lg border border-[var(--border-subtle)] bg-[var(--card)] px-3 text-[12px] font-semibold outline-none transition-colors focus:border-[var(--foreground)]"
                disabled={targets.length === 0}
                onChange={(event) => {
                  const selected = targets.find(
                    (target) =>
                      `${target.chainId}:${target.templateId}` ===
                      event.target.value,
                  );
                  onTarget(
                    selected
                      ? {
                          chainId: selected.chainId,
                          templateId: selected.templateId,
                        }
                      : null,
                  );
                }}
                value={
                  selectedTarget
                    ? `${selectedTarget.chainId}:${selectedTarget.templateId}`
                    : ""
                }
              >
                <option value="">Choose a live target</option>
                {selectedTarget &&
                !targets.some(
                  (target) =>
                    target.chainId === selectedTarget.chainId &&
                    target.templateId === selectedTarget.templateId,
                ) ? (
                  <option
                    value={`${selectedTarget.chainId}:${selectedTarget.templateId}`}
                  >
                    {selectedTarget.chainId}:{selectedTarget.templateId} ·
                    unavailable
                  </option>
                ) : null}
                {targets.map((target) => (
                  <option
                    key={`${target.chainId}:${target.templateId}`}
                    value={`${target.chainId}:${target.templateId}`}
                  >
                    {target.chainName} · {target.templateName}
                  </option>
                ))}
              </select>
              <span className="text-[10.5px] leading-relaxed text-[var(--tertiary)]">
                {targetMessage} The swap fee is read live from this template and
                is never assumed.
              </span>
            </label>

            <p className="rounded-lg border border-dashed border-[var(--border-subtle)] px-3.5 py-2.5 text-[11px] leading-relaxed text-[var(--secondary)]">
              Fixed market policy: the pool rests at 90% exit asset and 10%
              Senior at NAV, while Junior and SLP capital are sized at a 90%
              operating target. The solver derives the remaining deployment
              fields from the two exit goals above.
            </p>
          </div>

          <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Minimum Liquidity Requirement", exit.minimumLiquidityPct, "%"],
              ["Maximum Discount", exit.maximumDiscountPct, "%"],
              ["Depth at NAV", exit.lambda, " λ"],
              ["Maximum Premium", exit.maximumPremiumBps, " bps"],
              ["Exit-asset seed", exit.exitAssetSeedPct, "%"],
              ["Senior seed", exit.seniorSeedPct, "%"],
              ["Swap Fee", exit.swapFeeBps, " bps"],
            ].map(([label, value, suffix]) => (
              <div
                className="border-t border-[var(--border-subtle)] pt-2"
                key={String(label)}
              >
                <dt className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--tertiary)]">
                  {label}
                </dt>
                <dd className="mt-1 font-mono text-[15px] font-bold tabular-nums">
                  {typeof value === "number"
                    ? `${fixed(value, 2)}${suffix}`
                    : "Unresolved"}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[10.5px] leading-relaxed text-[var(--tertiary)]">
            {exit.feeSource
              ? `Swap fee policy: ${exit.feeSource}`
              : "Swap fee remains unresolved until a chain and active deployment template are selected. No fallback fee is used."}
          </p>
        </DayV3Disclosure>
      </DayV3Group>

      <DayV3Disclosure
        description="Required trigger · optional Junior-funded redemption bonus"
        summary="Protected Exit"
      >
        <div className="flex flex-col gap-4">
          <p className="text-[11.5px] leading-relaxed text-[var(--secondary)]">
            Every deployment needs a trigger that defines when Senior may use
            Protected Exit. The bonus is optional and remains 0% when no
            Junior-funded incentive budget is supplied.
          </p>
          <GoalNumberField
            label="Compare a different Protected Exit trigger"
            max={89.99}
            min={0.01}
            note="Enter the percentage of Minimum Coverage still remaining. Leave blank to use a history-backed recommendation; any entry is marked as a manual override."
            onChange={onProtectedExitThreshold}
            placeholder="Use history"
            step={0.01}
            suffix="% left"
            value={protectedExitThresholdOverride}
          />
          <GoalNumberField
            label="How much Junior-funded incentive should be available per 100 Senior redeemed?"
            max={99.99}
            min={0}
            note="Leave this blank for a 0% bonus. V3 will never infer a bonus from pool exit costs."
            onChange={onIncentiveBudgetPer100}
            placeholder="Optional"
            step={0.1}
            suffix="per 100"
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
          {protectedExit.comparisons && protectedExit.comparisons.length > 0 ? (
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
                There is not enough recovery evidence to select a trigger. These
                exact accountant runs show how earlier and later triggers behave
                with a 0% bonus.
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
                          {fixed(comparison.payoutPer100, 2)}
                        </td>
                        <td className="border-b border-[var(--border-subtle)] px-2 py-2 font-mono tabular-nums">
                          {fixed(comparison.juniorUsedPer100, 2)}
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
                      <dt className="text-[var(--tertiary)]">Actual payout</dt>
                      <dd className="font-mono font-semibold tabular-nums">
                        {fixed(scenario.payoutPer100, 2)}
                      </dd>
                    </div>
                    {typeof scenario.bonusPaidPer100 === "number" ? (
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-[var(--tertiary)]">Bonus paid</dt>
                        <dd className="text-right font-mono font-semibold tabular-nums">
                          {fixed(scenario.bonusPaidPer100, 2)}
                          {typeof scenario.bonusPaidPctOfRedemption === "number"
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
                          {fixed(scenario.onChainBonusCapPer100, 2)}
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
                        {fixed(scenario.juniorUsedPer100, 2)}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-[var(--tertiary)]">Coverage left</dt>
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
      </DayV3Disclosure>
    </>
  );
}
