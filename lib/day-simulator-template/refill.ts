import { MarketState } from '../day/engine/types';

/** Fresh Junior capital is modeled only after an observation has closed. */
export const shouldRefillJunior = (
  enabled: boolean,
  previousState: MarketState,
  nextState: MarketState,
): boolean =>
  enabled &&
  previousState === MarketState.FIXED_TERM &&
  nextState === MarketState.PERPETUAL;
