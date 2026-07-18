import manifest from './market.json';
import series from './series.json';
import { marketFromManifest, type MarketManifest } from '@/lib/simulator-template/manifest';

export const MARKET = marketFromManifest(manifest as MarketManifest, series);
