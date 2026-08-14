import type { DayV3ExitView } from "@/components/day-v3/DayV3Goals";
import DayV3DocsLink from "@/components/day-v3/DayV3DocsLink";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type MaybeNumber = number | null;

const dollars = (value: MaybeNumber, digits = 1) =>
  value === null ? "—" : `$${value.toFixed(digits)}`;

const width = (value: MaybeNumber) =>
  value === null ? "0%" : `${Math.max(0, Math.min(100, value))}%`;

function ComparisonBar({
  requested,
  requestedLabel,
  modeled,
  modeledLabel,
}: {
  requested: MaybeNumber;
  requestedLabel: string;
  modeled: MaybeNumber;
  modeledLabel: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 text-[10.5px]">
        <span className="font-semibold text-[var(--secondary)]">
          {requestedLabel}
        </span>
        <span className="font-mono tabular-nums text-[var(--tertiary)]">
          {dollars(requested)}
        </span>
      </div>
      <div
        aria-hidden="true"
        className="relative h-3 overflow-hidden rounded-full bg-[var(--foundation)]"
      >
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-[color-mix(in_srgb,var(--theme-navy)_32%,transparent)]"
          style={{ width: width(requested) }}
        />
        <span
          className="absolute inset-y-[3px] left-0 rounded-full bg-[var(--theme-green)]"
          style={{ width: width(modeled) }}
        />
      </div>
      <div className="flex items-baseline justify-between gap-3 text-[10.5px]">
        <span className="font-semibold text-[var(--foreground)]">
          {modeledLabel}
        </span>
        <span className="font-mono font-semibold tabular-nums">
          {dollars(modeled)}
        </span>
      </div>
    </div>
  );
}

function Outcome({
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

/**
 * Visualizes either the canonical pool-design response or the shared Day
 * engine's explicitly illustrative simulation default. Bar widths are
 * presentation-only on the already normalized 0–100 Senior basis.
 */
export default function DayV3ExitModel({
  exit,
  minimumProceedsPer100,
  promisedExitSharePct,
}: {
  exit: DayV3ExitView;
  minimumProceedsPer100: MaybeNumber;
  promisedExitSharePct: MaybeNumber;
}) {
  const modeled =
    exit.status === "recommended" || exit.status === "illustrative";
  const illustrative = exit.status === "illustrative";
  const disabled = exit.status === "disabled";
  const needsInputs = exit.status === "missing-goal";

  return (
    <Card
      data-model-state={exit.status}
      data-model-source={
        disabled
          ? "issuer-goal-no-immediate-exit"
          : illustrative
            ? "shared-day-engine-illustrative-default"
            : "canonical-rwa-eclp-service"
      }
    >
      <CardHeader>
        <div className="flex items-baseline justify-between gap-2">
          <CardTitle className="text-[17px]">Exit promise model</CardTitle>
          <DayV3DocsLink label="SLP mechanics" topic="slpTranche" />
        </div>
        <CardDescription>
          {disabled
            ? "Immediate Senior exit is off, so this design has no SLP or pool execution promise."
            : illustrative
              ? "Shows how the selected exit size and payout affect one trade, per $100 Senior."
              : "Shows the fee-inclusive result for one Senior sale using the selected market terms, per $100 Senior. Larger sales move farther through the pool and receive a larger discount. Arbitrageurs can later buy discounted Senior, redeem it for the underlying asset, and refill the SLP when that trade covers their time, costs, and fees."}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {!disabled ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <ComparisonBar
              requested={promisedExitSharePct}
              requestedLabel="Selected sale / $100"
              modeled={modeled ? exit.sellablePer100 : null}
              modeledLabel="Modeled capacity / $100"
            />
            <ComparisonBar
              requested={minimumProceedsPer100}
              requestedLabel="Minimum payout / $100"
              modeled={modeled ? exit.lowestPayoutPer100 : null}
              modeledLabel="Lowest modeled payout / $100"
            />
          </div>
        ) : null}

        {disabled ? (
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-3">
            <Outcome
              label="Sell-now promise"
              note="no immediate pool exit"
              value="$0.00"
            />
            <Outcome
              label="SLP required"
              note="funding per $100 Senior"
              value="$0.00"
            />
            <Outcome
              label="Minimum Liquidity"
              note="deployment requirement"
              value="0.00%"
            />
          </div>
        ) : modeled ? (
          <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
            <Outcome
              label={illustrative ? "Modeled capacity" : "Promised sale"}
              note={
                illustrative ? "one-trade pool limit" : "Senior sold at once"
              }
              value={dollars(exit.sellablePer100, 2)}
            />
            <Outcome
              label="Proceeds"
              note={
                illustrative
                  ? "after the modeled swap fee"
                  : "after the live swap fee"
              }
              value={dollars(exit.proceeds, 2)}
            />
            <Outcome
              label="SLP required"
              note="funding per $100 Senior"
              value={dollars(exit.slpPer100, 2)}
            />
            <Outcome
              label="Refill pays after"
              note="% of Senior sold under the timing and conversion assumptions"
              value={
                exit.restockPoint === null
                  ? illustrative
                    ? "Needs market terms"
                    : "unresolved"
                  : `${exit.restockPoint.toFixed(1)}%`
              }
            />
          </div>
        ) : needsInputs ? (
          <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--foundation)] px-4 py-5 text-center">
            <strong className="text-[13px] font-semibold">
              Complete the exit promise above
            </strong>
            <p className="mx-auto mt-1 max-w-[58ch] text-[11.5px] leading-relaxed text-[var(--secondary)]">
              Choose the amount Senior can sell and the minimum payout. This
              model will then show capacity, proceeds, SLP funding, and the pool
              curve without a row of empty values.
            </p>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-[var(--border-subtle)] px-3.5 py-3 text-[11.5px] leading-relaxed text-[var(--secondary)]">
            {exit.status === "resolving"
              ? "Refreshing the live template and recalculating this model…"
              : exit.message}
          </p>
        )}

        {!disabled ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--border-subtle)] pt-3 text-[10px] text-[var(--tertiary)]">
            <span>
              Swap fee:{" "}
              {exit.swapFeeBps === null
                ? "unresolved"
                : `${exit.swapFeeBps} bps`}
            </span>
            <span>
              Minimum liquidity:{" "}
              {exit.minimumLiquidityPct === null
                ? "unresolved"
                : `${exit.minimumLiquidityPct.toFixed(2)}%`}
            </span>
            <span>
              Maximum discount:{" "}
              {exit.maximumDiscountPct === null
                ? "unresolved"
                : `${exit.maximumDiscountPct.toFixed(2)}%`}
            </span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
