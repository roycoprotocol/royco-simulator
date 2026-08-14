"use client";

import DayV3NumberField from "@/components/day-v3/DayV3NumberField";
import type {
  DayV3RestockCheck as DayV3RestockResult,
  DayV3RestockHurdle,
} from "@/lib/day-v3/restock-arbitrage";

export type DayV3RestockView = {
  /** `illustrative` means the live template has not priced this pool yet. */
  basis: "live" | "illustrative";
  check: DayV3RestockResult | null;
  hurdle: DayV3RestockHurdle | null;
  selectedSalePer100: number | null;
  seniorApyPct: number | null;
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
 * Does anyone have a reason to put the pool back?
 *
 * Nothing in the contract refills the exit pool. After a sale it sits below
 * NAV until an outside desk buys the discounted Senior, redeems it for the
 * underlying at NAV, and keeps the difference. That only happens when the
 * discount is worth more than the desk's money over the redemption wait, plus
 * the fee it pays to trade back in — which is what this asks.
 *
 * Every discount here is a quote the shared Day engine produced for the pool
 * currently on screen. The cost of capital and the wait are the reader's own
 * assumptions about an outside party, so they are stated rather than assumed,
 * and they change nothing about the market being designed.
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
  const { basis, check, hurdle, selectedSalePer100 } = view;
  const missingInputs = costOfCapitalPct === null || redemptionDays === null;
  const resolved =
    !missingInputs &&
    hurdle !== null &&
    check !== null &&
    check.status !== "unavailable";
  const pays = resolved && check.status === "profitable";
  const everPays = resolved && check.breakEvenSalePer100 !== null;
  const unpriced = resolved && check.status === "no-selected-sale";

  return (
    <section
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3"
      data-restock-status={
        missingInputs ? "missing-inputs" : (check?.status ?? "unavailable")
      }
    >
      <div className="min-w-0">
        <h4 className="text-[12.5px] font-semibold leading-tight">
          Will the pool be refilled after a sale?
        </h4>
        <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--tertiary)]">
          A sale leaves the pool below NAV, and it stays there until an outside
          desk buys the discounted Senior and redeems it at NAV. Describe that
          desk and this checks whether the trade pays. It does not change the
          market you are designing.
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
        <DayV3NumberField
          className="bg-[var(--foundation)]"
          label="What does that desk's capital cost, a year?"
          max={100}
          min={0}
          note="The return it needs on money tied up in the trade. A higher cost means it needs a deeper discount before it bothers."
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
          note="Queue plus settlement: from buying the Senior share to holding the underlying. This is the wait its capital has to be paid for."
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
        <p className="rounded-lg border border-dashed border-[var(--border-subtle)] px-3 py-2.5 text-[10.5px] leading-relaxed text-[var(--secondary)]">
          Enter a cost of capital and a redemption wait to check whether the
          discount this design creates is enough to attract a refill.
        </p>
      ) : !resolved ? (
        <p className="rounded-lg border border-dashed border-[var(--border-subtle)] px-3 py-2.5 text-[10.5px] leading-relaxed text-[var(--secondary)]">
          No pool is funded at these terms, so there is no discount to
          arbitrage.
        </p>
      ) : (
        <>
          <div
            aria-live="polite"
            className="rounded-lg border px-3.5 py-3"
            role="status"
            style={
              pays
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
              className="text-[12px] font-semibold"
              style={{
                color: pays ? "var(--theme-green)" : "var(--gold-emphasis)",
              }}
            >
              {pays
                ? `Refill pays by ${bps(check.selectedMarginBps)} after the selected sale`
                : !everPays
                  ? "No sale this pool can absorb pays for a refill"
                  : unpriced
                    ? `Refill pays once ${dollars(check.breakEvenSalePer100)} of every $100 Senior has been sold`
                    : `Refill does not pay until ${dollars(check.breakEvenSalePer100)} of every $100 Senior has been sold`}
            </strong>
            <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--secondary)]">
              {pays
                ? `Selling ${dollars(selectedSalePer100)} of every $100 Senior leaves the pool ${bps(check.selectedDiscountBps)} below NAV, against a ${bps(hurdle.hurdleBps)} hurdle. A desk on these terms is paid to buy that Senior and redeem it, which is what puts the pool back and restores capacity for the next seller.`
                : !everPays
                  ? `Even fully drained the pool is only ${bps(check.worstCaseDiscountBps)} below NAV, against a ${bps(hurdle.hurdleBps)} hurdle. Nothing brings this desk in. Shorten the redemption wait, allow a deeper payout floor, or expect the SLP to carry the position rather than see it arbitraged back.`
                  : unpriced
                    ? `Choose an exit amount above to see whether the sale you choose reaches that depth on its own.`
                    : `The selected ${dollars(selectedSalePer100)} sale only moves the pool ${bps(check.selectedDiscountBps)} below NAV, short of the ${bps(hurdle.hurdleBps)} hurdle. The pool has to be drawn deeper before a refill is worth doing, so capacity does not come back on its own after a sale of the size you selected.`}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <section className="rounded-lg border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2">
              <h5 className="border-b border-[var(--border-subtle)] pb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.11em] text-[var(--tertiary)]">
                What the desk is paid
              </h5>
              <Line
                label="Discount after the selected sale"
                note={
                  unpriced
                    ? "choose an exit amount above"
                    : `the pool's own move on ${dollars(selectedSalePer100)} of every $100 Senior`
                }
                value={bps(check.selectedDiscountBps)}
              />
              <Line
                label="Discount when fully drained"
                note={`the deepest this design goes · capacity ${dollars(check.capacityPer100)} per $100`}
                value={bps(check.worstCaseDiscountBps)}
              />
            </section>

            <section className="rounded-lg border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2">
              <h5 className="border-b border-[var(--border-subtle)] pb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.11em] text-[var(--tertiary)]">
                What the trade costs it
              </h5>
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

          <p className="text-[9.5px] leading-relaxed text-[var(--tertiary)]">
            Discounts are quotes from the shared Day accountant for{" "}
            {basis === "live"
              ? "the live template's pool"
              : "the disclosed illustrative pool, until the live template resolves"}
            , measured across the reversing trade and excluding the swap fee the
            seller already paid, which stays with the pool. The Senior yield
            offset assumes the source performs at its modeled rate over the
            wait. Royco Deploy revalidates this against the real settlement and
            conversion schedule.
          </p>
        </>
      )}
    </section>
  );
}
