/**
 * Will anyone refill the exit pool?
 *
 * A Senior sale pushes the pool below NAV. Nothing in the contract restores it.
 * It resets only because an outside desk buys the discounted Senior, redeems it
 * for the underlying at NAV, and pockets the difference. That trade happens
 * only when the discount pays for the desk's money over the redemption wait,
 * plus the fee it pays to trade back in.
 *
 * **The discount is read off the pool, because that is what an arbitrageur
 * actually trades against.** Two earlier versions got this wrong in opposite
 * directions: one quoted the shared engine's fallback pool while the fallback
 * band was pinned to a market constant, so the payout floor moved nothing; the
 * other used the canonical service's lowest modeled payout, a scalar that
 * barely moves because the solver returns the *cheapest* pool clearing the
 * floor. Either way an issuer could drag the floor from $99 to $50 and watch
 * the arbitrage economics sit still.
 *
 * Both discounts now come from one engine run against one pool: the deepest
 * fill it can do, and the fill the promised exit actually takes. Nothing here
 * re-derives a price.
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
/** The fields this module reads off a shared-engine secondary-sale quote. */
export interface DayV3RestockQuote {
  effectiveInputNAV: number;
  stableOutNAV: number;
}

/**
 * The discount to NAV the pool's own curve created, in basis points.
 *
 * The swap fee is deliberately excluded. `slippage` on an engine quote is what
 * the *seller* gave up, and part of that is the fee, which stays in the pool
 * rather than sitting there as a mispricing anyone can buy. The engine charges
 * the fee on the way in and prices `effectiveInputNAV` against the curve, so
 * the curve's own move is exactly `1 - stableOutNAV / effectiveInputNAV`. The
 * fee the arbitrageur pays to trade back in is on the cost side of the hurdle,
 * which is how the canonical service decomposes it too.
 */
export function dayV3QuoteDiscountBps(
  quote: DayV3RestockQuote | null,
): number | null {
  if (
    quote === null ||
    !(quote.effectiveInputNAV > 0) ||
    !Number.isFinite(quote.stableOutNAV)
  ) {
    return null;
  }
  const discount = 1 - quote.stableOutNAV / quote.effectiveInputNAV;
  return Number.isFinite(discount) ? Math.max(0, discount) * 10_000 : null;
}

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
  /** The selected market pool fee the desk pays to trade back in. */
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
 * Nothing is floored. Net carry goes negative when Senior out-earns the cost of
 * capital, and the hurdle follows it below zero, which is the true statement:
 * the wait more than pays for itself and the trade is worth doing at any
 * discount at all. Flooring the hurdle at zero while the card drew the raw
 * components made the bars and the total describe different arithmetic — at 8%
 * cost of capital over 90 days against a 12% Senior, the steps summed to 146
 * bps under a total reading 58.
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
    hurdleBps: netCarryBps + swapFeeBps,
  };
}

export interface DayV3RestockCheckInputs {
  /** Discount at the deepest fill the pool can do, from its own quote. */
  worstCaseDiscountBps: number | null;
  /** Discount at the fill the promised exit takes, from the same pool. */
  selectedDiscountBps: number | null;
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
  const { hurdle, selectedDiscountBps, worstCaseDiscountBps } = inputs;
  if (worstCaseDiscountBps === null || !Number.isFinite(hurdle.hurdleBps)) {
    return {
      status: "unavailable",
      worstCaseDiscountBps: null,
      worstCaseMarginBps: null,
      selectedDiscountBps: null,
      selectedMarginBps: null,
    };
  }

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
