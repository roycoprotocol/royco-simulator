"use client";

import DayV3NumberField from "@/components/day-v3/DayV3NumberField";
import {
  Card,
  CardContent,
  CardNote,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  DayV3RestockCheck as DayV3RestockResult,
  DayV3RestockHurdle,
} from "@/lib/day-v3/restock-arbitrage";

export type DayV3RestockView = {
  check: DayV3RestockResult | null;
  hurdle: DayV3RestockHurdle | null;
  /** Where the worst case came from, so the panel never overstates it. */
  worstCaseBasis: "modeled" | "floor" | "unresolved";
  worstPayoutPer100: number | null;
  selectedSalePer100: number | null;
};

const bps = (value: number | null, digits = 0) =>
  value === null || !Number.isFinite(value)
    ? "—"
    : `${value.toFixed(digits)} bps`;

const dollars = (value: number | null, digits = 2) =>
  value === null || !Number.isFinite(value) ? "—" : `$${value.toFixed(digits)}`;

function Line({
  label,
  note,
  value,
}: {
  label: string;
  note?: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 border-b border-[var(--border-subtle)] py-1.5 last:border-b-0">
      <span className="text-[11px] font-medium text-[var(--secondary)]">
        {label}
      </span>
      <span className="row-span-2 font-mono text-[11.5px] font-semibold tabular-nums whitespace-nowrap">
        {value}
      </span>
      {note ? (
        <span className="mt-0.5 text-[9.5px] leading-snug text-[var(--tertiary)]">
          {note}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Does this design work for arbitrageurs?
 *
 * Nothing in the contract refills the exit pool. After a sale it sits below NAV
 * until an outside desk buys the discounted Senior, redeems it for the
 * underlying at NAV, and keeps the difference. That only happens when the
 * discount is worth more than the desk's money over the redemption wait, plus
 * the fee it pays to trade back in.
 *
 * This is a result, not an input: the discounts come from the exit design
 * above. The cost of capital and the wait describe an outside party, so they
 * are stated on screen rather than assumed, and they change nothing about the
 * market being designed.
 */
export default function DayV3RestockCheck({
  costOfCapitalPct,
  onCostOfCapitalPct,
  onRedemptionDays,
  redemptionDays,
  view,
}: {
  costOfCapitalPct: number | null;
  onCostOfCapitalPct: (value: number | null) => void;
  onRedemptionDays: (value: number | null) => void;
  redemptionDays: number | null;
  view: DayV3RestockView;
}) {
  const { check, hurdle, selectedSalePer100, worstCaseBasis, worstPayoutPer100 } =
    view;
  const missingInputs = costOfCapitalPct === null || redemptionDays === null;
  const resolved =
    !missingInputs &&
    hurdle !== null &&
    check !== null &&
    check.status !== "unavailable";
  const worstCasePays = resolved && (check.worstCaseMarginBps ?? -1) >= 0;
  const selectedPays = resolved && check.status === "profitable";
  const unpriced = resolved && check.status === "no-selected-sale";
  const worstCaseSource =
    worstCaseBasis === "modeled"
      ? "the live template's lowest modeled payout"
      : `your ${dollars(worstPayoutPer100)} payout floor per $100`;

  return (
    <Card
      data-model-source={
        worstCaseBasis === "modeled"
          ? "canonical-rwa-eclp-service"
          : "issuer-payout-floor"
      }
      data-restock-status={
        missingInputs ? "missing-inputs" : (check?.status ?? "unavailable")
      }
    >
      <CardHeader className="gap-0.5 px-4 pt-3.5">
        <CardTitle className="text-[13.5px]">
          Test whether this works for arbitrageurs
        </CardTitle>
        <CardNote>
          A sale leaves the pool below NAV until an outside desk buys the
          discounted Senior and redeems it at NAV. Describe that desk; this
          checks whether the trade pays and changes nothing above.
        </CardNote>
      </CardHeader>

      <CardContent className="px-4 pb-4 flex flex-col gap-4">
        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
          <DayV3NumberField
            className="bg-[var(--foundation)]"
            label="What does that desk's capital cost, a year?"
            max={100}
            min={0}
            note="What it needs on money tied up in the trade. Higher cost, deeper discount before it bothers."
            onChange={onCostOfCapitalPct}
            placeholder="Enter a rate"
            presets={[
              { label: "8%", value: 8 },
              { label: "12%", value: 12 },
              { label: "20%", value: 20 },
              { label: "30%", value: 30 },
            ]}
            step={0.5}
            suffix="% a year"
            value={costOfCapitalPct}
          />
          <DayV3NumberField
            className="bg-[var(--foundation)]"
            label="How long until it gets NAV back for that Senior?"
            max={365}
            min={0}
            note="Queue plus settlement, from buying the Senior share to holding the underlying."
            onChange={onRedemptionDays}
            placeholder="Enter days"
            presets={[
              { label: "1 day", value: 1 },
              { label: "7 days", value: 7 },
              { label: "30 days", value: 30 },
              { label: "90 days", value: 90 },
            ]}
            suffix="days"
            value={redemptionDays}
            wholeNumber
          />
        </div>

        {missingInputs ? (
          <p className="rounded-lg border border-dashed border-[var(--border-subtle)] px-3 py-2.5 text-[11px] leading-relaxed text-[var(--secondary)]">
            Enter a cost of capital and a redemption wait to check whether the
            discount this design permits is enough to attract a refill.
          </p>
        ) : !resolved ? (
          <p className="rounded-lg border border-dashed border-[var(--border-subtle)] px-3 py-2.5 text-[11px] leading-relaxed text-[var(--secondary)]">
            Set the exit amount and payout floor above. The worst-case discount
            they define is what a desk would be arbitraging.
          </p>
        ) : (
          <>
            <div
              aria-live="polite"
              className="rounded-lg border px-3.5 py-3"
              role="status"
              style={
                worstCasePays
                  ? {
                      background:
                        "color-mix(in srgb, var(--theme-green) 10%, transparent)",
                      borderColor:
                        "color-mix(in srgb, var(--theme-green) 45%, transparent)",
                    }
                  : {
                      background:
                        "color-mix(in srgb, var(--theme-gold) 10%, transparent)",
                      borderColor:
                        "color-mix(in srgb, var(--theme-gold) 45%, transparent)",
                    }
              }
            >
              <strong
                className="text-[12.5px] font-semibold"
                style={{
                  color: worstCasePays
                    ? "var(--theme-green)"
                    : "var(--gold-emphasis)",
                }}
              >
                {!worstCasePays
                  ? "No discount this design permits pays for a refill"
                  : `Arbitrage pays by ${bps(check.worstCaseMarginBps)} at the worst case`}
              </strong>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--secondary)]">
                {!worstCasePays
                  ? `At its deepest this design lets Senior trade ${bps(check.worstCaseDiscountBps)} below NAV, against a ${bps(hurdle.hurdleBps)} hurdle. Nothing brings this desk in at any depth. Shorten the redemption wait, allow a deeper payout floor, or expect the SLP to carry the position rather than see it arbitraged back.`
                  : `At its deepest this design lets Senior trade ${bps(check.worstCaseDiscountBps)} below NAV, which clears the ${bps(hurdle.hurdleBps)} this desk needs. It is paid to buy that Senior and redeem it, which is what puts the pool back and restores capacity for the next seller.${
                      worstCaseBasis === "floor"
                        ? " That is the deepest your payout floor permits, not a depth the pool has been shown to reach: a sized pool usually prices nearer to NAV, so treat this as provisional until the live template resolves."
                        : ""
                    }${
                      unpriced
                        ? " The selected sale has not been priced yet, so it is not yet known whether it reaches that depth on its own."
                        : selectedPays
                          ? ` The selected ${dollars(selectedSalePer100)} sale already clears it by ${bps(check.selectedMarginBps)}, so the pool resets without waiting for a deeper seller.`
                          : ` The selected ${dollars(selectedSalePer100)} sale only reaches ${bps(check.selectedDiscountBps)}, short of the hurdle, so a single exit of that size does not attract a refill on its own.`
                    }`}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <section className="rounded-lg border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2">
                <h4 className="border-b border-[var(--border-subtle)] pb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.11em] text-[var(--tertiary)]">
                  What the desk is paid
                </h4>
                <Line
                  label="Worst-case Senior discount"
                  note={`the deepest this design permits, from ${worstCaseSource}`}
                  value={bps(check.worstCaseDiscountBps)}
                />
                <Line
                  label="Discount at the selected sale"
                  note={
                    unpriced
                      ? "priced once the live template sizes the pool"
                      : `${dollars(selectedSalePer100)} of every $100 Senior, sold at once`
                  }
                  value={bps(check.selectedDiscountBps)}
                />
              </section>

              <section className="rounded-lg border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2">
                <h4 className="border-b border-[var(--border-subtle)] pb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.11em] text-[var(--tertiary)]">
                  What the trade costs it
                </h4>
                <Line
                  label="Cost of capital over the wait"
                  note={`${costOfCapitalPct.toFixed(1)}% a year for ${redemptionDays} ${redemptionDays === 1 ? "day" : "days"}`}
                  value={bps(hurdle.financingBps)}
                />
                <Line
                  label="Senior yield earned while waiting"
                  note="the desk holds Senior until it redeems, so it collects Senior's rate"
                  value={`-${bps(hurdle.seniorCarryBps)}`}
                />
                <Line
                  label="Fee to trade back in"
                  note="the live pool fee, paid on the way in"
                  value={bps(hurdle.swapFeeBps)}
                />
                <div className="flex items-center justify-between gap-3 pt-2">
                  <span className="text-[11px] font-semibold">
                    Discount it needs
                  </span>
                  <span className="font-mono text-[12.5px] font-bold tabular-nums">
                    {bps(hurdle.hurdleBps)}
                  </span>
                </div>
              </section>
            </div>

            <p className="text-[9.5px] leading-snug text-[var(--tertiary)]">
              Both discounts are fee-inclusive payouts from the exit design
              above.{" "}
              {worstCaseBasis === "modeled"
                ? "The worst case is the live template's lowest modeled payout."
                : "Until the template sizes the pool, it is the floor you set."}{" "}
              The Senior offset assumes the source performs at its modeled rate.
              Royco Deploy revalidates against the real settlement schedule.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
