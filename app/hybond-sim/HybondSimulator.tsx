'use client';

import MarketSimulator from '@/components/simulator/MarketSimulator';
import { HYBOND_MARKET } from '@/lib/hybond/market';
import type { InitialQuery } from '@/lib/simulator-template/permalink';

export type { InitialQuery };

export default function HybondSimulator({ initialQuery }: { initialQuery: InitialQuery }) {
  return <MarketSimulator initialQuery={initialQuery} market={HYBOND_MARKET} />;
}
