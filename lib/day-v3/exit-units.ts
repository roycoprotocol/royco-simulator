/**
 * Presentation adapters for the issuer-facing exit goals.
 *
 * The model sizes exits as a share of each 100 Senior and stores the payout as
 * proceeds per 100. The UI states both price and depth in basis points so the
 * issuer does not have to translate dollar examples into deployment terms.
 */
export const dayV3DepthAtNavBps = (exitSharePct: number): number =>
  exitSharePct * 100;

export const dayV3ExitSharePctFromDepthBps = (depthBps: number): number =>
  depthBps / 100;

export const dayV3MaximumDiscountBps = (
  minimumProceedsPer100: number,
): number => (100 - minimumProceedsPer100) * 100;

export const dayV3MinimumProceedsPer100FromDiscountBps = (
  discountBps: number,
): number => 100 - discountBps / 100;
