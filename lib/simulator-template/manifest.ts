import {
  juniorFromFirstLossPct,
  makePreset,
  type SimulatorMarket,
  type SimulatorParams,
} from './market';
import type { PricePoint } from '@/lib/try/backtest';

export interface MarketManifest {
  id: string;
  route: string;
  dataCadence: 'daily' | 'monthly';
  copy: SimulatorMarket['copy'];
  defaults: Omit<SimulatorParams, 'depositJT'> & { depositJT?: number };
  presets: {
    conservative: PresetManifestValues;
    balanced: PresetManifestValues;
    aggressive: PresetManifestValues;
  };
  certification: SimulatorMarket['certification'];
  provenance: {
    source: string;
    sourceUrl?: string;
    retrievedAt?: string;
    priceType: 'nav' | 'total-return-index' | 'price';
    feesIncluded: boolean | 'unknown';
    notes: string;
  };
}

interface PresetManifestValues {
  minimumCoveragePct: number;
  observationDays: number;
  seniorYieldShareToJuniorPct: number;
  exitBufferPct?: number;
  yieldShareAtFullUtilPct?: number;
  selfLiquidationBonusPct?: number;
}

export function marketFromManifest(
  manifest: MarketManifest,
  rawSeries: { date: string; price: number }[],
): SimulatorMarket {
  const defaultParams: SimulatorParams = {
    ...manifest.defaults,
    depositJT:
      manifest.defaults.depositJT ??
      juniorFromFirstLossPct(manifest.defaults.depositST, manifest.defaults.minCoveragePct),
  };
  const preset = (
    id: 'conservative' | 'balanced' | 'aggressive',
    label: string,
  ) => {
    const values = manifest.presets[id];
    return makePreset(
      defaultParams,
      id,
      label,
      values.minimumCoveragePct,
      values.observationDays,
      values.seniorYieldShareToJuniorPct,
      values,
    );
  };
  return {
    id: manifest.id,
    route: manifest.route,
    dataCadence: manifest.dataCadence,
    copy: manifest.copy,
    defaultParams,
    presets: [
      preset('conservative', 'Conservative'),
      preset('balanced', 'Balanced'),
      preset('aggressive', 'Aggressive'),
    ],
    series: rawSeries.map((point): PricePoint => ({ date: point.date, price: point.price })),
    certification: manifest.certification,
  };
}
