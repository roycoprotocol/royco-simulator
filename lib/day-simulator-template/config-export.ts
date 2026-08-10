import type { DayIssuerPresetId } from '@/lib/day-simulator-template/issuer-presets';
import { DAY_ISSUER_PRESETS } from '@/lib/day-simulator-template/issuer-presets';

export const DAY_CONFIG_EXPORT_SCHEMA_VERSION = 2;

export const DAY_DEPLOYMENT_INPUT_IDS = [
  'tokenContractSource',
  'tokenContractAddress',
  'chain',
  'adaptationSpeed',
  // Liquidity venue — required by the deploy flow, not modeled by the accountant.
  'exitAsset',
  'exitAssetStatic',
  'exitLiquidity',
  'navUpdateCadence',
  'redemptionDelay',
  'restockHurdle',
  'maximumDiscount',
  'maximumPremium',
  'depthAtNav',
  'reinvestmentSlippageTolerance',
] as const;

export const DAY_DEPLOYMENT_TERM_IDS = [
  'yieldShareAtFullUtilization',
  'protectedExitThreshold',
  'selfLiquidationBonus',
] as const;

export type DayDeploymentInputId = (typeof DAY_DEPLOYMENT_INPUT_IDS)[number];

export type DayDeploymentTermId = (typeof DAY_DEPLOYMENT_TERM_IDS)[number];

export type DayDeploymentFieldId = DayDeploymentInputId | DayDeploymentTermId;

export type DayDeploymentInputValues = Record<DayDeploymentInputId, string>;

export type DayDeploymentFieldValues = Record<DayDeploymentFieldId, string>;

export const EMPTY_DAY_DEPLOYMENT_INPUTS: DayDeploymentInputValues = {
  tokenContractSource: '',
  tokenContractAddress: '',
  chain: '',
  adaptationSpeed: '',
  exitAsset: '',
  exitAssetStatic: '',
  exitLiquidity: '',
  navUpdateCadence: '',
  redemptionDelay: '',
  restockHurdle: '',
  maximumDiscount: '',
  maximumPremium: '',
  depthAtNav: '',
  reinvestmentSlippageTolerance: '',
};

export const EMPTY_DAY_DEPLOYMENT_FIELDS: DayDeploymentFieldValues = {
  ...EMPTY_DAY_DEPLOYMENT_INPUTS,
  yieldShareAtFullUtilization: '',
  protectedExitThreshold: '',
  selfLiquidationBonus: '',
};

/**
 * Percent-unit bounds for the deployment-checklist terms that feed the accountant.
 * protectedExitThreshold mirrors the 1-99.91% exitBufferPct range enforced for markets.
 */
export const DAY_DEPLOYMENT_TERM_BOUNDS: Record<
  DayDeploymentTermId,
  { min: number; max: number }
> = {
  yieldShareAtFullUtilization: { min: 0, max: 100 },
  protectedExitThreshold: { min: 1, max: 99.91 },
  selfLiquidationBonus: { min: 0, max: 50 },
};

/** Blank or unparseable input keeps the simulation on its current value; anything else is clamped. */
export function parseDayDeploymentTerm(
  raw: string,
  fallbackPct: number,
  bounds: { min: number; max: number },
): number {
  const trimmed = raw.trim();
  const parsed = Number(trimmed);
  if (trimmed === '' || !Number.isFinite(parsed)) return fallbackPct;
  return Math.min(bounds.max, Math.max(bounds.min, parsed));
}

export type DayConfigExportInput = {
  exportedAt: string;
  market: {
    id: string;
    name: string;
    asset: string;
    variant: string;
  };
  presetId: DayIssuerPresetId | null;
  terms: {
    coveragePct: number;
    minLiquidityPct: number;
    eclpBandWidthPct: number;
    riskSharePct: number;
    liqSharePct: number;
    observationDays: number;
    sourceApyPct: number;
    maintainCoverage: boolean;
    y100SharePct: number;
    exitBufferPct: number;
    selfLiquidationBonusPct: number;
  };
  // Conditions the modeled outcomes were produced under. Kept out of `terms`
  // because a hypothetical shock is not a deployable market parameter — but it
  // must travel with the export, or `modeled` misattributes shocked results to
  // unshocked terms.
  scenario: {
    sourceStressPct: number;
  };
  modeled: {
    seniorApy: number;
    juniorApy: number;
    liquidityApy: number;
    coverageLossLimit: number;
    referenceSellShareOfSenior: number;
    boundarySellShareOfSenior: number;
  };
  deploymentInputs: DayDeploymentInputValues;
};

export type DayConfigExportPayload = {
  schemaVersion: number;
  source: 'day-simulator';
  exportedAt: string;
  market: DayConfigExportInput['market'];
  preset: { id: DayIssuerPresetId | null; label: string };
  terms: {
    coverage: number;
    minLiquidity: number;
    eclpBandWidth: number;
    riskYieldShare: number;
    liquidityYieldShare: number;
    observationDays: number;
    fixedTermDurationSec: number;
    sourceApy: number;
    maintainCoverage: boolean;
    riskYieldShareAtFullUtilization: number;
    exitBufferPct: number;
    selfLiquidationBonus: number;
  };
  termsPct: {
    coveragePct: number;
    minLiquidityPct: number;
    eclpBandWidthPct: number;
    riskSharePct: number;
    liqSharePct: number;
    observationDays: number;
    sourceApyPct: number;
    y100SharePct: number;
    exitBufferPct: number;
    selfLiquidationBonusPct: number;
  };
  scenario: {
    sourceStressPct: number;
    sourceStressApplied: boolean;
    note: string;
  };
  modeled: DayConfigExportInput['modeled'];
  deploymentInputs: DayDeploymentInputValues;
};

export function buildDayConfigExport(input: DayConfigExportInput): DayConfigExportPayload {
  const preset = DAY_ISSUER_PRESETS.find((candidate) => candidate.id === input.presetId);
  return {
    schemaVersion: DAY_CONFIG_EXPORT_SCHEMA_VERSION,
    source: 'day-simulator',
    exportedAt: input.exportedAt,
    market: { ...input.market },
    preset: { id: preset?.id ?? null, label: preset?.label ?? 'Custom' },
    terms: {
      coverage: input.terms.coveragePct / 100,
      minLiquidity: input.terms.minLiquidityPct / 100,
      eclpBandWidth: input.terms.eclpBandWidthPct / 100,
      riskYieldShare: input.terms.riskSharePct / 100,
      liquidityYieldShare: input.terms.liqSharePct / 100,
      observationDays: input.terms.observationDays,
      fixedTermDurationSec: input.terms.observationDays * 86_400,
      sourceApy: input.terms.sourceApyPct / 100,
      maintainCoverage: input.terms.maintainCoverage,
      riskYieldShareAtFullUtilization: input.terms.y100SharePct / 100,
      exitBufferPct: input.terms.exitBufferPct,
      selfLiquidationBonus: input.terms.selfLiquidationBonusPct / 100,
    },
    termsPct: {
      coveragePct: input.terms.coveragePct,
      minLiquidityPct: input.terms.minLiquidityPct,
      eclpBandWidthPct: input.terms.eclpBandWidthPct,
      riskSharePct: input.terms.riskSharePct,
      liqSharePct: input.terms.liqSharePct,
      observationDays: input.terms.observationDays,
      sourceApyPct: input.terms.sourceApyPct,
      y100SharePct: input.terms.y100SharePct,
      exitBufferPct: input.terms.exitBufferPct,
      selfLiquidationBonusPct: input.terms.selfLiquidationBonusPct,
    },
    scenario: {
      sourceStressPct: input.scenario.sourceStressPct,
      sourceStressApplied: input.scenario.sourceStressPct > 0,
      note: input.scenario.sourceStressPct > 0
        ? `Modeled outcomes include a hypothetical ${input.scenario.sourceStressPct}% source drawdown and recovery overlaid on the source history. This shock is not part of the source data and is not a market term.`
        : 'Modeled outcomes use the source history as-is, with no hypothetical shock.',
    },
    modeled: { ...input.modeled },
    deploymentInputs: { ...input.deploymentInputs },
  };
}

export function dayConfigExportSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function dayConfigExportFilename(name: string, exportedAt: string): string {
  const slug = dayConfigExportSlug(name) || 'day-market';
  return `day-market-config_${slug}_${exportedAt.slice(0, 10)}.json`;
}
