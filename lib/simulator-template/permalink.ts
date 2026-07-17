import {
  OBSERVATION_DAYS_MAX,
  OBSERVATION_DAYS_MIN,
  findMarketPreset,
  juniorFromFirstLossPct,
  type SimulatorMarket,
  type SimulatorParams,
} from './market';
import { normalizeRange, type IndexRange } from '@/lib/hybond/timeframe';

export interface Query {
  get(key: string): string | null;
}

export type InitialQuery = Record<string, string | string[] | undefined>;

export const queryFromRecord = (record: InitialQuery): Query => ({
  get: (key) => {
    const raw = record[key];
    return Array.isArray(raw) ? raw[0] ?? null : raw ?? null;
  },
});

export interface PermalinkState {
  params: SimulatorParams;
  maintain: boolean;
  range: IndexRange;
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));
const snap = (value: number, step: number, low: number, high: number): number =>
  clamp(Math.round(value / step) * step, low, high);

export function createPermalinkCodec(market: SimulatorMarket) {
  const fullRange: IndexRange = { a: 0, b: market.series.length - 1 };

  const stateFromQuery = (query: Query): PermalinkState => {
    const preset = market.presets.find((candidate) => candidate.id === query.get('preset'));
    const params: SimulatorParams = preset
      ? { ...preset.params }
      : { ...market.defaultParams };
    const numberValue = (key: string): number | null => {
      const raw = query.get(key);
      if (raw === null) return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    };
    const coverage = numberValue('coverage');
    if (coverage !== null) params.minCoveragePct = clamp(Math.round(coverage), 8, 65);
    const observation = numberValue('obs');
    if (observation !== null) {
      params.observationDays = clamp(
        Math.round(observation),
        OBSERVATION_DAYS_MIN,
        OBSERVATION_DAYS_MAX,
      );
    }
    const yieldShare = numberValue('yieldShare');
    if (yieldShare !== null) params.seniorShareToJuniorPct = clamp(Math.round(yieldShare), 20, 80);
    const exitBuffer = numberValue('exitBuffer');
    if (exitBuffer !== null) params.exitBufferPct = clamp(exitBuffer, 1, 99.91);
    const senior = numberValue('st');
    if (senior !== null) params.depositST = snap(senior, 100, 100, 10000);
    const link = query.get('link');
    if (link !== null) params.linkJuniorToFirstLoss = link !== '0';
    if (params.linkJuniorToFirstLoss) {
      params.depositJT = juniorFromFirstLossPct(params.depositST, params.minCoveragePct);
    } else {
      params.depositJT = snap(numberValue('jt') ?? params.depositJT, 50, 50, 10000);
    }
    const indexForDate = (date: string | null, fallback: number): number => {
      if (date === null) return fallback;
      const index = market.series.findIndex((point) => point.date === date);
      return index >= 0 ? index : fallback;
    };
    const range = normalizeRange(
      indexForDate(query.get('from'), fullRange.a),
      indexForDate(query.get('to'), fullRange.b),
      fullRange.b,
    );
    return { params, maintain: query.get('maintain') !== '0', range };
  };

  const queryFromState = (
    params: SimulatorParams,
    maintain: boolean,
    range: IndexRange = fullRange,
  ): string => {
    const legalRange = normalizeRange(range.a, range.b, fullRange.b);
    const query = new URLSearchParams({
      preset: findMarketPreset(market, params)?.id ?? 'custom',
      coverage: String(params.minCoveragePct),
      obs: String(params.observationDays),
      yieldShare: String(params.seniorShareToJuniorPct),
      exitBuffer: String(params.exitBufferPct),
      maintain: maintain ? '1' : '0',
      st: String(params.depositST),
      link: params.linkJuniorToFirstLoss ? '1' : '0',
      from: market.series[legalRange.a].date,
      to: market.series[legalRange.b].date,
    });
    if (!params.linkJuniorToFirstLoss) query.set('jt', String(params.depositJT));
    return query.toString();
  };

  return { fullRange, stateFromQuery, queryFromState };
}
