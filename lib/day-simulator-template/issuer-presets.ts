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

// Single source of truth for how a requirement prices its premium. Each tranche
// is paid in proportion to what it supplies: Jr at 1x the coverage requirement,
// SLP at 0.5x the liquidity requirement. The shipped market defaults, the preset
// buttons in the simulator, and the issuer presets below all derive from these,
// so the three cannot drift apart.
export const DAY_JR_PREMIUM_PER_COVERAGE = 1;
export const DAY_SLP_PREMIUM_PER_LIQUIDITY = 0.5;

export const DAY_ISSUER_PRESETS: readonly DayIssuerPreset[] = [
  {
    id: 'st-stability',
    label: 'Lower Sr volatility',
    caption: 'Deep Jr buffer, tight peg band, long recovery window',
    rationale:
      'A 25% minimum coverage requirement sizes the largest Jr first-loss buffer the market allows, a 1% E-CLP band keeps modeled pool prices close to $1, and a 90-day Observation Period gives the source time to recover before a covered loss is finalized. Jr is paid 25% of Sr yield and SLP 10%, in proportion to what each supplies.',
    values: {
      coveragePct: 25,
      minLiquidityPct: 20,
      eclpBandWidthPct: 1,
      riskSharePct: 25,
      liqSharePct: 10,
      observationDays: 90,
      maintainCoverage: true,
    },
  },
  {
    id: 'st-yield',
    label: 'Maximize Sr yield',
    caption: 'Thin buffers, minimal premiums paid out of Sr yield',
    rationale:
      'Sr keeps the source yield left after premiums, so a 10% coverage requirement and a 5% SLP pool floor keep the paid-out risk and liquidity premiums (10% and 2.5% of Sr yield) as small as the structure allows.',
    values: {
      coveragePct: 10,
      minLiquidityPct: 5,
      eclpBandWidthPct: 5,
      riskSharePct: 10,
      liqSharePct: 2.5,
      observationDays: 60,
      maintainCoverage: true,
    },
  },
  {
    id: 'st-liquidity',
    label: 'Maximize Sr liquidity',
    caption: 'Deep SLP pool, widest deployable band, short observation lockups',
    rationale:
      'A 25% SLP pool floor and the deploy flow’s widest supported 5% downside band let a larger share of Sr sell in one transaction, paid for with a 12.5% liquidity premium, and a 14-day Observation Period keeps fixed-term lockups short.',
    values: {
      coveragePct: 15,
      minLiquidityPct: 25,
      eclpBandWidthPct: 5,
      riskSharePct: 15,
      liqSharePct: 12.5,
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
