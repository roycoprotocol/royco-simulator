/**
 * Will anyone refill the exit pool?
 *
 * A Senior sale pushes the pool below NAV. Nothing in the contract restores it.
 * It resets only because an outside desk buys the discounted Senior, redeems it
 * for the underlying at NAV, and pockets the difference. That trade happens
 * only when the discount pays for the desk's money over the redemption wait,
 * plus the fee it pays to trade back in.
 *
 * Nothing here re-derives pool prices. Every discount is read from a quote the
 * shared Day engine produced (`previewSecondarySell`), and this module only
 * turns those quotes into a desk's return on capital. The canonical RWA service
 * answers the same question at deployment as `restockHurdleBps` /
 * `restockMarginAfterPromisedExitBps`, using the issuer's real settlement and
 * conversion facts; this is the scenario version of that check, with the
 * desk's own cost of capital stated on screen instead of assumed.
 */

export const DAY_V3_DAYS_PER_YEAR = 365;

/** The fields this module reads off a shared-engine secondary-sale quote. */
export interface DayV3RestockQuote {
  filledNAV: number;
  effectiveInputNAV: number;
  stableOutNAV: number;
  unfilledNAV: number;
}

/**
 * The average discount to NAV on the Senior the pool just absorbed, in basis
 * points, measured across the whole trade.
 *
 * The swap fee is deliberately excluded. `slippage` on the engine quote is what
 * the *seller* gave up, and part of that is the fee, which stays in the pool
 * rather than sitting there as a mispricing someone can buy. What a refilling
 * desk can capture is the curve movement alone: the engine charges the fee on
 * the way in (`effectiveInputNAV = filledNAV - swapFeeNAV`) and then prices
 * `effectiveInputNAV` against the curve, so the curve's own move is exactly
 * `1 - stableOutNAV / effectiveInputNAV`.
 */
export function dayV3PoolDiscountBps(quote: DayV3RestockQuote): number | null {
  if (!(quote.effectiveInputNAV > 0) || !Number.isFinite(quote.stableOutNAV)) {
    return null;
  }
  const discount = 1 - quote.stableOutNAV / quote.effectiveInputNAV;
  if (!Number.isFinite(discount)) return null;
  return Math.max(0, discount) * 10_000;
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
  /** A read-only shared-engine quote for selling `nav` of Senior at rest. */
  quoteSell: (nav: number) => DayV3RestockQuote;
  /** Opening Senior NAV, so per-$100 sizes can be quoted back. */
  openingSeniorNAV: number;
  /** The largest Senior NAV the pool can absorb in one trade. */
  capacityNAV: number;
  /** The issuer's selected immediate exit, per $100 Senior. */
  selectedSalePer100: number | null;
  hurdle: DayV3RestockHurdle;
}

export interface DayV3RestockCheck {
  /**
   * `no-selected-sale` is distinct from `unprofitable`: with no exit amount
   * chosen there is no trade to price yet, and reporting that as a failed
   * refill would be an answer to a question nobody asked.
   */
  status:
    | "unavailable"
    | "no-selected-sale"
    | "profitable"
    | "unprofitable";
  /** Discount reached by the selected sale. */
  selectedDiscountBps: number | null;
  /** Discount at the point the pool can absorb no more — the deepest it goes. */
  worstCaseDiscountBps: number | null;
  /** Selected-sale discount less the hurdle. Positive means the refill pays. */
  selectedMarginBps: number | null;
  /** Worst-case discount less the hurdle. */
  worstCaseMarginBps: number | null;
  /**
   * The smallest sale, per $100 Senior, that leaves enough discount to pay for
   * the refill. `null` when no sale the pool can absorb ever does.
   */
  breakEvenSalePer100: number | null;
  /** One-trade pool capacity, per $100 Senior. */
  capacityPer100: number | null;
}

const per100 = (nav: number, openingSeniorNAV: number) =>
  openingSeniorNAV > 0 ? (nav / openingSeniorNAV) * 100 : null;

/**
 * Answer the two questions an issuer actually has: does the exit they selected
 * leave enough discount to attract a refill, and if not, how deep does the pool
 * have to be drawn before one arrives.
 *
 * The discount rises with sale size, so the crossing point is found by
 * bisection over sale size using the engine's own quote function. No price
 * curve is reconstructed here.
 */
export function dayV3RestockCheck(
  inputs: DayV3RestockCheckInputs,
): DayV3RestockCheck {
  const { capacityNAV, hurdle, openingSeniorNAV, selectedSalePer100, quoteSell } =
    inputs;
  const unavailable: DayV3RestockCheck = {
    status: "unavailable",
    selectedDiscountBps: null,
    worstCaseDiscountBps: null,
    selectedMarginBps: null,
    worstCaseMarginBps: null,
    breakEvenSalePer100: null,
    capacityPer100: null,
  };
  if (
    !(openingSeniorNAV > 0) ||
    !(capacityNAV > 0) ||
    !Number.isFinite(hurdle.hurdleBps)
  ) {
    return unavailable;
  }

  const discountAt = (nav: number) => dayV3PoolDiscountBps(quoteSell(nav));
  const worstCaseDiscountBps = discountAt(capacityNAV);
  if (worstCaseDiscountBps === null) return unavailable;

  const selectedNAV =
    selectedSalePer100 === null
      ? null
      : Math.min((selectedSalePer100 / 100) * openingSeniorNAV, capacityNAV);
  const selectedDiscountBps =
    selectedNAV === null || selectedNAV <= 0 ? null : discountAt(selectedNAV);

  let breakEvenNAV: number | null = null;
  if (worstCaseDiscountBps >= hurdle.hurdleBps) {
    let low = 0;
    let high = capacityNAV;
    for (let iteration = 0; iteration < 60; iteration += 1) {
      const middle = (low + high) / 2;
      const discount = discountAt(middle);
      if (discount !== null && discount >= hurdle.hurdleBps) high = middle;
      else low = middle;
    }
    breakEvenNAV = high;
  }

  return {
    status:
      selectedDiscountBps === null
        ? "no-selected-sale"
        : selectedDiscountBps >= hurdle.hurdleBps
          ? "profitable"
          : "unprofitable",
    selectedDiscountBps,
    worstCaseDiscountBps,
    selectedMarginBps:
      selectedDiscountBps === null
        ? null
        : selectedDiscountBps - hurdle.hurdleBps,
    worstCaseMarginBps: worstCaseDiscountBps - hurdle.hurdleBps,
    breakEvenSalePer100:
      breakEvenNAV === null ? null : per100(breakEvenNAV, openingSeniorNAV),
    capacityPer100: per100(capacityNAV, openingSeniorNAV),
  };
}
