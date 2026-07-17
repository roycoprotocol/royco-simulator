import { runBacktest, type PricePoint } from '@/lib/try/backtest';
import type { MarketConfig } from '@/lib/try/engine';
import { WAD } from '@/lib/try/engine';
import { buildConfig } from '@/lib/try/scenarios';

export const OBSERVATION_DAYS_MIN = 7;
export const OBSERVATION_DAYS_MAX = 194;

export interface SimulatorParams {
  depositST: number;
  depositJT: number;
  seniorShareToJuniorPct: number;
  /** Junior yield share at the 100% utilization endpoint; defaults to the target share. */
  yieldShareAtFullUtilPct?: number;
  observationDays: number;
  minCoveragePct: number;
  exitBufferPct: number;
  /** Deploy-handoff term; the shared TRY accountant does not model this bonus. */
  selfLiquidationBonusPct?: number;
  linkJuniorToFirstLoss: boolean;
}

export interface SimulatorPreset {
  id: 'conservative' | 'balanced' | 'aggressive';
  label: string;
  params: SimulatorParams;
}

export interface SimulatorCopy {
  marketEyebrow: string;
  title: string;
  hero: string;
  loadedMarket: string;
  strategyLegend: string;
  seniorTrancheName: string;
  seniorTrancheSymbol: string;
  juniorTrancheName: string;
  juniorTrancheSymbol: string;
  integrationLabel: string;
  footerParagraphs: [string, string, string];
}

export interface SimulatorCertification {
  label: string;
  detail: string;
}

export interface SimulatorMarket {
  id: string;
  route: string;
  dataCadence: 'daily' | 'monthly';
  defaultParams: SimulatorParams;
  presets: SimulatorPreset[];
  series: PricePoint[];
  copy: SimulatorCopy;
  certification: SimulatorCertification;
}

export interface PresetScreenRow {
  id: SimulatorPreset['id'];
  label: string;
  pass: boolean;
  seniorMarkdownEvents: number;
  seniorMaxDrawdown: number;
  depositJT: number;
  observationDays: number;
  minCoveragePct: number;
  seniorShareToJuniorPct: number;
  genesisFirstLossPct: number;
  juniorEnd: number;
  seniorEnd: number;
  juniorAvgYr: number;
  seniorAvgYr: number;
  erasedRecoveryClaims: number;
}

export const utilWadFromBufferPct = (bufferPct: number): bigint =>
  (BigInt(Math.round((100 / Math.max(bufferPct, 0.01)) * 1e6)) * WAD) / 1_000_000n;

export const bufferPctFromUtilWad = (wad: bigint): number => 100 / (Number(wad) / 1e18);

export function juniorFromFirstLossPct(depositST: number, minCoveragePct: number): number {
  const denominator = 90 - minCoveragePct;
  if (denominator <= 0) return Infinity;
  return (depositST * minCoveragePct) / denominator;
}

export function buildSimulatorConfig(params: SimulatorParams): MarketConfig {
  const baseConfig = buildConfig({
    firstLossPct: (params.depositJT / (params.depositST + params.depositJT)) * 100,
    observationDays: params.observationDays,
    seniorShareToJuniorPct: params.seniorShareToJuniorPct,
    juniorBufferRemainingPct: params.minCoveragePct,
    seniorExitBonusPct: 0.25,
  });
  const pctToWad = (pct: number): bigint =>
    (BigInt(Math.round((pct / 100) * 1e6)) * WAD) / 1_000_000n;
  const targetShareWAD = pctToWad(params.seniorShareToJuniorPct);
  return {
    ...baseConfig,
    jtYDM: {
      ...baseConfig.jtYDM,
      yieldShareAtZeroUtilWAD: targetShareWAD,
      yieldShareAtTargetWAD: targetShareWAD,
      yieldShareAtFullUtilWAD: pctToWad(
        params.yieldShareAtFullUtilPct ?? params.seniorShareToJuniorPct,
      ),
    },
    coverageLiquidationUtilizationWAD: utilWadFromBufferPct(params.exitBufferPct),
  };
}

export const effectiveYieldShareAtFullUtilPct = (params: SimulatorParams): number =>
  params.yieldShareAtFullUtilPct ?? params.seniorShareToJuniorPct;

export const effectiveSelfLiquidationBonusPct = (params: SimulatorParams): number =>
  params.selfLiquidationBonusPct ?? 0.25;

export function findMarketPreset(market: SimulatorMarket, params: SimulatorParams) {
  const fullUtilShare = effectiveYieldShareAtFullUtilPct(params);
  const selfLiquidationBonus = effectiveSelfLiquidationBonusPct(params);
  return market.presets.find(
    (preset) =>
      preset.params.depositST === params.depositST &&
      preset.params.depositJT === params.depositJT &&
      preset.params.seniorShareToJuniorPct === params.seniorShareToJuniorPct &&
      effectiveYieldShareAtFullUtilPct(preset.params) === fullUtilShare &&
      preset.params.observationDays === params.observationDays &&
      preset.params.minCoveragePct === params.minCoveragePct &&
      preset.params.exitBufferPct === params.exitBufferPct &&
      effectiveSelfLiquidationBonusPct(preset.params) === selfLiquidationBonus,
  );
}

export function screenMarketPresets(
  market: SimulatorMarket,
  series: PricePoint[] = market.series,
): PresetScreenRow[] {
  return market.presets.map((preset) => {
    const run = (maintainJuniorCoverage: boolean) =>
      runBacktest({
        config: buildSimulatorConfig(preset.params),
        depositST: preset.params.depositST,
        depositJT: preset.params.depositJT,
        series,
        maintainJuniorCoverage,
      });
    const maintained = run(true);
    const exposed = run(false);
    const first = maintained.steps[0];
    const last = maintained.steps[maintained.steps.length - 1];
    const seniorMarkdownEvents = Math.max(
      maintained.seniorMarkdownEvents,
      exposed.seniorMarkdownEvents,
    );
    const seniorMaxDrawdown = Math.max(maintained.seniorMaxDrawdown, exposed.seniorMaxDrawdown);
    return {
      id: preset.id,
      label: preset.label,
      pass: seniorMarkdownEvents === 0 && seniorMaxDrawdown < 0.0005,
      seniorMarkdownEvents,
      seniorMaxDrawdown,
      depositJT: preset.params.depositJT,
      observationDays: preset.params.observationDays,
      minCoveragePct: preset.params.minCoveragePct,
      seniorShareToJuniorPct: preset.params.seniorShareToJuniorPct,
      genesisFirstLossPct:
        ((first ? Number(first.jtEff) / 1e18 : preset.params.depositJT) /
          (preset.params.depositST + preset.params.depositJT)) *
        100,
      juniorEnd: last?.jtIndex ?? 100,
      seniorEnd: last?.stIndex ?? 100,
      juniorAvgYr: maintained.juniorAvgYr,
      seniorAvgYr: maintained.seniorAvgYr,
      erasedRecoveryClaims: maintained.erasureEvents.length,
    };
  });
}

export function makePreset(
  base: SimulatorParams,
  id: SimulatorPreset['id'],
  label: string,
  minimumCoveragePct: number,
  observationDays: number,
  seniorYieldShareToJuniorPct: number,
  overrides: Partial<Pick<
    SimulatorParams,
    'exitBufferPct' | 'yieldShareAtFullUtilPct' | 'selfLiquidationBonusPct'
  >> = {},
): SimulatorPreset {
  return {
    id,
    label,
    params: {
      ...base,
      ...overrides,
      depositJT: juniorFromFirstLossPct(base.depositST, minimumCoveragePct),
      minCoveragePct: minimumCoveragePct,
      observationDays,
      seniorShareToJuniorPct: seniorYieldShareToJuniorPct,
      linkJuniorToFirstLoss: true,
    },
  };
}
