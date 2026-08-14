"use client";

import DayV3Button from "@/components/day-v3/DayV3Button";
import DayV3Disclosure from "@/components/day-v3/DayV3Disclosure";
import DayV3NumberField from "@/components/day-v3/DayV3NumberField";
import DayV3Origin from "@/components/day-v3/DayV3Origin";
import DayV3SegmentedControl from "@/components/day-v3/DayV3SegmentedControl";
import { Badge } from "@/components/ui/badge";
import type { DayV3ExpiryPolicy } from "@/lib/day-v3/types";

const DAY_SECONDS = 86_400;
const UINT24_MAX_SECONDS = 16_777_215;
const UINT32_FINITE_MAX_SECONDS = 4_294_967_294;

const expiryDays = (value: DayV3ExpiryPolicy | null) =>
  typeof value === "number" ? value / DAY_SECONDS : null;

function ExpiryControl({
  label,
  onChange,
  recoveryDays,
  value,
}: {
  label: string;
  onChange: (value: DayV3ExpiryPolicy | null) => void;
  recoveryDays: number | null;
  value: DayV3ExpiryPolicy | null;
}) {
  const finite = typeof value === "number";
  const recoveryPlanningFloorDays = (recoveryDays ?? 0) + 7;
  const tooShort =
    finite && value < recoveryPlanningFloorDays * DAY_SECONDS;

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-[12.5px] font-semibold">{label}</strong>
        <DayV3Origin origin="your-answer" />
      </div>
      <DayV3SegmentedControl
        ariaLabel={`${label} mode`}
        onValueChange={(mode) =>
          onChange(mode === "no-expiry" ? "no-expiry" : null)
        }
        options={[
          { label: "Finite window", value: "finite" },
          { label: "No expiry", value: "no-expiry" },
        ]}
        size="sm"
        value={value === "no-expiry" ? "no-expiry" : finite ? "finite" : ""}
      />
      {value !== "no-expiry" ? (
        <DayV3NumberField
          label="How long should the request remain executable?"
          max={Math.floor(UINT32_FINITE_MAX_SECONDS / DAY_SECONDS)}
          min={1}
          note={`V3's recovery-only planning floor is ${recoveryPlanningFloorDays} days: the ${recoveryDays ?? 0}-day recovery window plus one week to execute. Royco Deploy may require a longer window after it resolves the selected oracle's worst-case update wait and the final fixed term.`}
          onChange={(days) =>
            onChange(days === null ? null : Math.round(days) * DAY_SECONDS)
          }
          placeholder="Enter days"
          presets={[
            {
              label: `${recoveryPlanningFloorDays} days`,
              value: recoveryPlanningFloorDays,
            },
            { label: "30 days", value: 30 },
            { label: "90 days", value: 90 },
          ]}
          suffix="days"
          value={expiryDays(value)}
          wholeNumber
          required
        />
      ) : (
        <p className="text-[10.5px] leading-relaxed text-[var(--tertiary)]">
          The request stays executable until it is executed or cancelled. Royco
          Deploy maps this explicit choice to the contract’s no-expiry sentinel.
        </p>
      )}
      {tooShort ? (
        <p className="rounded-lg border border-[color-mix(in_srgb,var(--theme-gold)_45%,var(--border-subtle))] px-3 py-2 text-[10.5px] leading-relaxed text-[var(--gold-emphasis)]">
          This window can close while recovery is still running. Use at least
          {` ${recoveryPlanningFloorDays} days`} for this planning check, or
          choose no expiry. Royco Deploy may require longer after the oracle is
          selected.
        </p>
      ) : null}
    </div>
  );
}

export default function DayV3DeploymentPolicy({
  depositDelaySeconds,
  depositExpirySeconds,
  gateByOracleUpdate,
  maxReinvestmentSlippageBps,
  onDepositDelaySeconds,
  onDepositExpirySeconds,
  onGateByOracleUpdate,
  onMaxReinvestmentSlippageBps,
  onWithdrawalExpirySeconds,
  recoveryDays,
  withdrawalDelayDays,
  withdrawalExpirySeconds,
}: {
  depositDelaySeconds: number | null;
  depositExpirySeconds: DayV3ExpiryPolicy | null;
  gateByOracleUpdate: boolean | null;
  maxReinvestmentSlippageBps: number | null;
  onDepositDelaySeconds: (value: number | null) => void;
  onDepositExpirySeconds: (value: DayV3ExpiryPolicy | null) => void;
  onGateByOracleUpdate: (value: boolean | null) => void;
  onMaxReinvestmentSlippageBps: (value: number | null) => void;
  onWithdrawalExpirySeconds: (value: DayV3ExpiryPolicy | null) => void;
  recoveryDays: number | null;
  withdrawalDelayDays: number | null;
  withdrawalExpirySeconds: DayV3ExpiryPolicy | null;
}) {
  const values = [
    depositDelaySeconds,
    depositExpirySeconds,
    gateByOracleUpdate,
    maxReinvestmentSlippageBps,
    withdrawalExpirySeconds,
  ];
  const missing = values.filter((value) => value === null).length;

  return (
      <div className="flex flex-col gap-3" id="day-v3-deployment-policy">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-[12.5px] font-semibold">
              One schedule applies to all three positions
            </strong>
            <DayV3Origin origin="product-policy" />
          </div>
          <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--tertiary)]">
            This is the current Royco Deploy product policy. The contracts store
            separate Senior, Junior, and Senior LP configs, but deployment writes
            the same issuer-approved schedule to each one.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <DayV3NumberField
            label="How long should a deposit wait before it can execute?"
            max={UINT24_MAX_SECONDS / 60}
            min={0}
            note="Zero permits immediate execution. Royco Deploy's current product default is 5 minutes; the price-update gate can still hold the request."
            onChange={(minutes) =>
              onDepositDelaySeconds(
                minutes === null ? null : Math.round(minutes * 60),
              )
            }
            origin={
              depositDelaySeconds === 300 ? "product-policy" : "your-answer"
            }
            placeholder="Enter minutes"
            presets={[
              { label: "Immediate", value: 0 },
              { label: "5 min", value: 5 },
              { label: "1 hour", value: 60 },
              { label: "1 day", value: 1_440 },
            ]}
            step={1}
            suffix="minutes"
            value={
              depositDelaySeconds === null ? null : depositDelaySeconds / 60
            }
            required
          />

          <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3">
            <span className="flex items-start justify-between gap-3">
              <strong className="text-[12.5px] font-semibold leading-snug">
                Withdrawal settlement delay
              </strong>
              <DayV3Origin origin="your-answer" />
            </span>
            <span className="rounded-lg border border-[var(--border-subtle)] bg-[var(--foundation)] px-3 py-2 font-mono text-[20px] font-bold tabular-nums">
              {withdrawalDelayDays === null
                ? "Unresolved"
                : `${withdrawalDelayDays} days`}
            </span>
            <span className="text-[10.5px] leading-relaxed text-[var(--tertiary)]">
              Uses the withdrawal timing entered above. The selected Balancer
              V3 deployment template enforces at least 24 hours, and this
              schedule applies to all three positions.
            </span>
          </div>

          <ExpiryControl
            label="Deposit execution window"
            onChange={onDepositExpirySeconds}
            recoveryDays={recoveryDays}
            value={depositExpirySeconds}
          />
          <ExpiryControl
            label="Withdrawal execution window"
            onChange={onWithdrawalExpirySeconds}
            recoveryDays={recoveryDays}
            value={withdrawalExpirySeconds}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-[12.5px] font-semibold">
                {gateByOracleUpdate === null ? (
                  <span className="mr-1 text-[var(--red-emphasis)]">*</span>
                ) : null}
                Require a post-request oracle update before execution?
              </strong>
              <span className="flex items-center gap-2">
                {gateByOracleUpdate === null ? (
                  <Badge
                    className="border-[color-mix(in_srgb,var(--theme-red)_40%,transparent)] bg-[color-mix(in_srgb,var(--theme-red)_8%,transparent)] text-[var(--red-emphasis)]"
                    tone="caution"
                  >
                    Missing
                  </Badge>
                ) : null}
                <DayV3Origin origin="your-answer" />
              </span>
            </div>
            <DayV3SegmentedControl
              ariaLabel="Price-update gate"
              onValueChange={(value) => onGateByOracleUpdate(value === "on")}
              options={[
                { label: "Gate on", value: "on" },
                { label: "Gate off", value: "off" },
              ]}
              size="sm"
              value={
                gateByOracleUpdate === null
                  ? ""
                  : gateByOracleUpdate
                    ? "on"
                    : "off"
              }
            />
            <p className="text-[10.5px] leading-relaxed text-[var(--tertiary)]">
              Gate on means a request must satisfy both clocks: its settlement
              delay must pass, and the oracle must publish a timestamp after the
              request was queued. EntryPoint does not compare the old and new
              price values; whether a timestamp advances without a price move
              depends on the selected oracle recipe. Gate off uses the
              settlement delay without that extra freshness check. The same
              choice is applied to deposits and withdrawals for Senior, Junior,
              and SLP.
            </p>
          </div>

          <DayV3NumberField
            label="How much value may SLP reinvestment give up?"
            max={99.99}
            min={0}
            note="This is an on-chain ceiling, not a forecast. A reinvestment below the floor reverts and waits. Royco Deploy rechecks it against the final E-CLP and exit asset."
            onChange={(pct) =>
              onMaxReinvestmentSlippageBps(
                pct === null ? null : Math.round(pct * 100),
              )
            }
            placeholder="Choose a ceiling"
            presets={[
              { label: "0.10%", value: 0.1 },
              { label: "0.25%", value: 0.25 },
              { label: "0.50%", value: 0.5 },
              { label: "1.00%", value: 1 },
            ]}
            step={0.01}
            suffix="%"
            value={
              maxReinvestmentSlippageBps === null
                ? null
                : maxReinvestmentSlippageBps / 100
            }
            required
          />
        </div>

        <DayV3Disclosure
          description="What Royco Deploy still validates after this simulator"
          summary="Why some deployment details stay downstream"
          variant="inline"
        >
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <p className="rounded-xl border border-dashed border-[var(--border-subtle)] px-4 py-3 text-[10.5px] leading-relaxed text-[var(--secondary)]">
              <strong className="block text-[11px] text-[var(--foreground)]">
                Oracle dependency
              </strong>
              V3 does not ask for oracle addresses or pricing recipes. Royco
              Deploy selects them, compares freshness bounds with the recovery
              window, and revalidates each finite expiry. NAV cadence above
              remains a modeling fact, not an EntryPoint contract field.
            </p>
            <p className="rounded-xl border border-dashed border-[var(--border-subtle)] px-4 py-3 text-[10.5px] leading-relaxed text-[var(--secondary)]">
              <strong className="block text-[11px] text-[var(--foreground)]">
                Exit-asset dependency
              </strong>
              Royco Deploy selects the exit token and rate provider, rebuilds
              the canonical pool, and confirms the slippage ceiling against the
              final venue. Addresses, seed amounts, blacklist administration,
              and the deployer remain downstream-only.
            </p>
          </div>
        </DayV3Disclosure>

        {missing > 0 ? (
          <p className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-4 py-3 text-[10.5px] text-[var(--secondary)]">
            <span>
              Resolve every field here before the V3 handoff can continue to
              deployment revalidation.
            </span>
            <DayV3Button
              onClick={() => {
                onDepositExpirySeconds("no-expiry");
                onWithdrawalExpirySeconds("no-expiry");
              }}
              size="sm"
              variant="secondary"
            >
              Use no-expiry windows
            </DayV3Button>
          </p>
        ) : null}
      </div>
  );
}
