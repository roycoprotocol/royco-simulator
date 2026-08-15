import { Sim } from '@/lib/day/engine/runner';
import type { MarketConfig, SecondaryExitQuote } from '@/lib/day/engine/types';

export const ARBITRAGE_REFERENCE_SLIPPAGE = 0.01;
export const DAY_COVERAGE_COMPARISON_MAX_LOSS = 0.75;

export type DayInitialState = { st: number; jt: number; lt: number };

export type CoverageLossPoint = {
  loss: number;
  seniorBalancePer100: number;
};

export type LiquidityCurvePoint = {
  sellNAV: number;
  effectiveInputNAV: number;
  swapFeeNAV: number;
  executionPrice: number;
  slippage: number;
};

export type DayExplainerMetrics = {
  liquidity: {
    arbitrageReference: number;
    referenceSellNAV: number;
    referenceSellShareOfSenior: number;
    referenceQuote: SecondaryExitQuote;
    boundarySellNAV: number;
    boundarySellShareOfSenior: number;
    boundaryQuote: SecondaryExitQuote;
    curve: LiquidityCurvePoint[];
  };
  coverage: {
    coverageLossLimit: number;
    displayMaxLoss: number;
    endingSeniorBalancePer100: number;
    points: CoverageLossPoint[];
  };
};

function shockSeniorBalance(
  cfg: MarketConfig,
  initial: DayInitialState,
  loss: number,
): number {
  const sim = new Sim(cfg, initial);
  const genesis = sim.last().stEffectiveNAV;
  sim.step({ dtSec: 0, stReturn: -loss, jtReturn: -loss });
  return genesis > 0 ? (sim.last().stEffectiveNAV / genesis) * 100 : 0;
}

function findCoverageLossLimit(cfg: MarketConfig, initial: DayInitialState): number {
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 72; iteration += 1) {
    const middle = (low + high) / 2;
    if (shockSeniorBalance(cfg, initial, middle) >= 100 - 1e-10) low = middle;
    else high = middle;
  }
  return low;
}

function findPoolBoundary(sim: Sim): SecondaryExitQuote {
  const opening = sim.last();
  let requested = Math.max(opening.stEffectiveNAV, opening.ltRawNAV, 1);
  let quote = sim.previewSecondarySell(requested);
  for (let iteration = 0; iteration < 64 && quote.unfilledNAV <= 1e-9; iteration += 1) {
    requested *= 2;
    quote = sim.previewSecondarySell(requested);
  }
  return quote;
}

function findSellAtSlippage(
  sim: Sim,
  boundary: SecondaryExitQuote,
  target: number,
): { sellNAV: number; quote: SecondaryExitQuote } {
  // The exact-input fee alone reaches the reference at this point; every
  // positive E-CLP trade adds some curve impact, so no positive trade can
  // honestly be described as meeting the target.
  if (sim.cfg.swapFeeBps / 10_000 >= target) {
    return { sellNAV: 0, quote: sim.previewSecondarySell(0) };
  }
  if (boundary.slippage <= target) {
    return { sellNAV: boundary.filledNAV, quote: sim.previewSecondarySell(boundary.filledNAV) };
  }
  let low = 0;
  let high = boundary.filledNAV;
  for (let iteration = 0; iteration < 72; iteration += 1) {
    const middle = (low + high) / 2;
    const quote = sim.previewSecondarySell(middle);
    if (quote.slippage <= target) low = middle;
    else high = middle;
  }
  return { sellNAV: low, quote: sim.previewSecondarySell(low) };
}

export function buildDayExplainerMetrics(
  cfg: MarketConfig,
  initial: DayInitialState,
): DayExplainerMetrics {
  const opening = new Sim(cfg, initial);
  const openingSeniorNAV = opening.last().stEffectiveNAV;
  const boundaryQuote = findPoolBoundary(opening);
  const reference = findSellAtSlippage(
    opening,
    boundaryQuote,
    ARBITRAGE_REFERENCE_SLIPPAGE,
  );
  const curve = Array.from({ length: 25 }, (_, index) => {
    const sellNAV = (boundaryQuote.filledNAV * (index + 1)) / 25;
    const quote = opening.previewSecondarySell(sellNAV);
    return {
      sellNAV: quote.filledNAV,
      effectiveInputNAV: quote.effectiveInputNAV,
      swapFeeNAV: quote.swapFeeNAV,
      executionPrice: quote.executionPrice,
      slippage: quote.slippage,
    };
  });
  curve.push({
    sellNAV: reference.sellNAV,
    effectiveInputNAV: reference.quote.effectiveInputNAV,
    swapFeeNAV: reference.quote.swapFeeNAV,
    executionPrice: reference.quote.executionPrice,
    slippage: reference.quote.slippage,
  });
  curve.sort((a, b) => a.sellNAV - b.sellNAV);

  const coverageLossLimit = findCoverageLossLimit(cfg, initial);
  const boundarySellShareOfSenior = openingSeniorNAV > 0
    ? boundaryQuote.filledNAV / openingSeniorNAV
    : 0;
  const displayMaxLoss = Math.max(DAY_COVERAGE_COMPARISON_MAX_LOSS, coverageLossLimit);
  const losses = Array.from({ length: 41 }, (_, index) => (displayMaxLoss * index) / 40);
  losses.push(coverageLossLimit);
  losses.sort((a, b) => a - b);
  const points = losses
    .filter((loss, index) => index === 0 || Math.abs(loss - losses[index - 1]) > 1e-12)
    .map((loss) => ({
      loss,
      seniorBalancePer100: shockSeniorBalance(cfg, initial, loss),
    }));

  return {
    liquidity: {
      arbitrageReference: ARBITRAGE_REFERENCE_SLIPPAGE,
      referenceSellNAV: reference.sellNAV,
      referenceSellShareOfSenior: openingSeniorNAV > 0 ? reference.sellNAV / openingSeniorNAV : 0,
      referenceQuote: reference.quote,
      boundarySellNAV: boundaryQuote.filledNAV,
      boundarySellShareOfSenior,
      boundaryQuote: opening.previewSecondarySell(boundaryQuote.filledNAV),
      curve,
    },
    coverage: {
      coverageLossLimit,
      displayMaxLoss,
      endingSeniorBalancePer100: points[points.length - 1]?.seniorBalancePer100 ?? 100,
      points,
    },
  };
}
