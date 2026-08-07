export type DayIssuerPresetId = 'st-stability' | 'st-yield' | 'st-liquidity';

export type DayIssuerPresetValues = {
  coveragePct: number;
  minLiquidityPct: number;
  eclpBandWidthPct: number;
  riskSharePct: number;
  liqSharePct: number;
  observationDays: number;
  maintainCoverage: boolean;
};

export type DayIssuerPreset = {
  id: DayIssuerPresetId;
  label: string;
  caption: string;
  rationale: string;
  values: DayIssuerPresetValues;
};

export const DAY_ISSUER_PRESETS: readonly DayIssuerPreset[] = [
  {
    id: 'st-stability',
    label: 'Lower ST volatility',
    caption: 'Deep JT buffer, tight peg band, long recovery window',
    rationale:
      'A 25% minimum coverage requirement sizes the largest JT first-loss buffer the market allows, a 1% E-CLP band keeps modeled pool prices close to $1, and a 90-day Observation Period gives the source time to recover before a covered loss is finalized.',
    values: {
      coveragePct: 25,
      minLiquidityPct: 20,
      eclpBandWidthPct: 1,
      riskSharePct: 50,
      liqSharePct: 20,
      observationDays: 90,
      maintainCoverage: true,
    },
  },
  {
    id: 'st-yield',
    label: 'Maximize ST yield',
    caption: 'Thin buffers, minimal premiums paid out of ST yield',
    rationale:
      'ST keeps the source yield left after premiums, so a 10% coverage requirement and a 5% SLP pool floor keep the paid-out risk and liquidity premiums (12% and 5% of ST yield) as small as the structure allows.',
    values: {
      coveragePct: 10,
      minLiquidityPct: 5,
      eclpBandWidthPct: 10,
      riskSharePct: 12,
      liqSharePct: 5,
      observationDays: 60,
      maintainCoverage: true,
    },
  },
  {
    id: 'st-liquidity',
    label: 'Maximize ST liquidity',
    caption: 'Deep SLP pool, wide band, short observation lockups',
    rationale:
      'A 30% SLP pool floor and a 10% downside band let a larger share of ST sell in one transaction, paid for with a 45% liquidity premium, and a 14-day Observation Period keeps fixed-term lockups short.',
    values: {
      coveragePct: 15,
      minLiquidityPct: 30,
      eclpBandWidthPct: 10,
      riskSharePct: 20,
      liqSharePct: 45,
      observationDays: 14,
      maintainCoverage: true,
    },
  },
];

export function matchDayIssuerPreset(
  values: DayIssuerPresetValues,
): DayIssuerPresetId | null {
  const match = DAY_ISSUER_PRESETS.find((preset) =>
    preset.values.coveragePct === values.coveragePct
    && preset.values.minLiquidityPct === values.minLiquidityPct
    && Math.abs(preset.values.eclpBandWidthPct - values.eclpBandWidthPct) <= 1e-9
    && preset.values.riskSharePct === values.riskSharePct
    && preset.values.liqSharePct === values.liqSharePct
    && preset.values.observationDays === values.observationDays
    && preset.values.maintainCoverage === values.maintainCoverage);
  return match?.id ?? null;
}
