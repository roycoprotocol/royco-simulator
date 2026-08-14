/**
 * Will anyone refill the exit pool?
 *
 * A Senior sale pushes the pool below NAV. Nothing in the contract restores it.
 * It resets only because an outside desk buys the discounted Senior, redeems it
 * for the underlying at NAV, and pockets the difference. That trade happens
 * only when the discount pays for the desk's money over the redemption wait,
 * plus the fee it pays to trade back in.
 *
 * **The discount here is the design's own worst case, not a reading off the
 * illustrative pool.** An earlier version priced it by quoting sales into the
 * shared engine's fallback pool, which is far shallower than any real design:
 * at a $95 payout floor it reported 50 bps where the floor itself permits 500.
 * The floor is the promise the deployed pool has to honour, so it is what an
 * arbitrageur can expect to be paid at the deepest point.
 *
 * Nothing here re-derives pool prices. Both discounts come from figures the
 * exit design already produced — the live template's lowest modeled payout and
 * its proceeds for the selected sale, or the issuer's own payout floor until
 * that resolves. This module only turns them into a desk's return on capital.
 * The canonical RWA service answers the same question at deployment as
 * `restockHurdleBps` / `restockMarginAfterPromisedExitBps`, using real
 * settlement and conversion facts; this is the scenario version, with the
 * desk's cost of capital stated on screen instead of assumed.
 */

export const DAY_V3_DAYS_PER_YEAR = 365;
/** Every payout and sale in V3 is quoted against 100 Senior. */
export const DAY_V3_RESTOCK_SENIOR_BASIS = 100;

/**
 * The discount to NAV implied by a fee-inclusive payout, in basis points.
 *
 * `payoutPer100` is what a seller receives for `soldPer100` of Senior NAV, so
 * the gap between them is the discount. Both figures come from the exit design;
 * nothing is priced here.
 */
export function dayV3DiscountBps(
  payoutPer100: number | null,
  soldPer100: number = DAY_V3_RESTOCK_SENIOR_BASIS,
): number | null {
  if (
    payoutPer100 === null ||
    !Number.isFinite(payoutPer100) ||
    !Number.isFinite(soldPer100) ||
    soldPer100 <= 0
  ) {
    return null;
  }
  return Math.max(0, 1 - payoutPer100 / soldPer100) * 10_000;
}

export interface DayV3RestockHurdleInputs {
  /** The desk's annual cost of capital, in percent. */
  costOfCapitalPct: number;
  /** Days from buying the Senior share to receiving the underlying at NAV. */
  redemptionDays: number;
  /** Senior's modeled annual return, earned by whoever holds it while waiting. */
  seniorApyPct: number;
  /** The live pool fee the desk pays to trade back in. */
  swapFeeBps: number;
}

export interface DayV3RestockHurdle {
  /** Cost of the desk's money over the wait. */
  financingBps: number;
  /** Senior yield the desk collects over the same wait. */
  seniorCarryBps: number;
  /** Financing net of the Senior yield earned while holding. */
  netCarryBps: number;
  /** The fee paid to trade back into the pool. */
  swapFeeBps: number;
  /** Everything the discount has to clear before the trade is worth doing. */
  hurdleBps: number;
}

/**
 * The all-in cost of the refill trade, in basis points of the Senior bought.
 *
 * The fee sits on the cost side rather than being netted out of the discount,
 * which is how the canonical service decomposes it (`restockHurdleBps` =
 * operational hurdle + `restockSwapFeeBps`). Keeping the same split means the
 * two models line up when Royco Deploy resolves the real one.
 *
 * Net carry can go negative when Senior out-earns the desk's cost of capital.
 * That is a real result — the wait pays for itself — so it is not floored here;
 * only the resulting hurdle is, because a desk still will not pay a fee to make
 * nothing.
 */
export function dayV3RestockHurdle(
  inputs: DayV3RestockHurdleInputs,
): DayV3RestockHurdle {
  const years = Math.max(0, inputs.redemptionDays) / DAY_V3_DAYS_PER_YEAR;
  const financingBps = Math.max(0, inputs.costOfCapitalPct) * 100 * years;
  const seniorCarryBps = inputs.seniorApyPct * 100 * years;
  const netCarryBps = financingBps - seniorCarryBps;
  const swapFeeBps = Math.max(0, inputs.swapFeeBps);
  return {
    financingBps,
    seniorCarryBps,
    netCarryBps,
    swapFeeBps,
    hurdleBps: Math.max(0, netCarryBps + swapFeeBps),
  };
}

export interface DayV3RestockCheckInputs {
  /**
   * The lowest fee-inclusive payout per $100 of Senior the design permits. The
   * live template's modeled worst case when it has resolved, otherwise the
   * issuer's own payout floor, which the deployed pool must still honour.
   */
  worstPayoutPer100: number | null;
  /** Proceeds actually received for the selected sale, when the pool is sized. */
  selectedSaleProceeds: number | null;
  /** The selected immediate exit, per $100 Senior. */
  selectedSalePer100: number | null;
  hurdle: DayV3RestockHurdle;
}

export interface DayV3RestockCheck {
  /**
   * `unavailable` means no worst case is known yet, which is different from a
   * refill that does not pay. `no-selected-sale` means the deepest point has
   * been priced but the selected exit has not.
   */
  status:
    | "unavailable"
    | "no-selected-sale"
    | "profitable"
    | "unprofitable";
  /** Discount at the deepest point the design permits. */
  worstCaseDiscountBps: number | null;
  /** That discount less the hurdle. Positive means a refill pays there. */
  worstCaseMarginBps: number | null;
  /** Discount reached by the selected sale, once the pool has been sized. */
  selectedDiscountBps: number | null;
  /** Selected-sale discount less the hurdle. */
  selectedMarginBps: number | null;
}

/**
 * Does the discount this design permits pay for the wait it implies?
 *
 * Two readings, because they answer different questions. The **worst case** is
 * the deepest the design ever lets Senior trade below NAV — if a refill does
 * not pay there, it never pays, and the pool only comes back if the SLP carries
 * it. The **selected sale** is the exit actually offered: it can fall short of
 * the hurdle even when the worst case clears, because a smaller sale prices
 * nearer to NAV.
 */
export function dayV3RestockCheck(
  inputs: DayV3RestockCheckInputs,
): DayV3RestockCheck {
  const { hurdle, selectedSalePer100, selectedSaleProceeds, worstPayoutPer100 } =
    inputs;
  const worstCaseDiscountBps = dayV3DiscountBps(worstPayoutPer100);
  if (worstCaseDiscountBps === null || !Number.isFinite(hurdle.hurdleBps)) {
    return {
      status: "unavailable",
      worstCaseDiscountBps: null,
      worstCaseMarginBps: null,
      selectedDiscountBps: null,
      selectedMarginBps: null,
    };
  }

  const selectedDiscountBps =
    selectedSalePer100 === null || selectedSalePer100 <= 0
      ? null
      : dayV3DiscountBps(selectedSaleProceeds, selectedSalePer100);

  return {
    status:
      selectedDiscountBps === null
        ? "no-selected-sale"
        : selectedDiscountBps >= hurdle.hurdleBps
          ? "profitable"
          : "unprofitable",
    worstCaseDiscountBps,
    worstCaseMarginBps: worstCaseDiscountBps - hurdle.hurdleBps,
    selectedDiscountBps,
    selectedMarginBps:
      selectedDiscountBps === null
        ? null
        : selectedDiscountBps - hurdle.hurdleBps,
  };
}
