// Backward-compatible HYBond exports backed by the shared simulator permalink codec.
import { HYBOND_MARKET } from './market';
import { findMarketPreset, type SimulatorParams } from '@/lib/simulator-template/market';
import {
  createPermalinkCodec,
  queryFromRecord,
  type InitialQuery,
  type PermalinkState,
  type Query,
} from '@/lib/simulator-template/permalink';

export type { InitialQuery, PermalinkState, Query };
export { queryFromRecord };

const codec = createPermalinkCodec(HYBOND_MARKET);

export const stateFromQuery = codec.stateFromQuery;
export const queryFromState = codec.queryFromState;
export const findPreset = (params: SimulatorParams) => findMarketPreset(HYBOND_MARKET, params);
