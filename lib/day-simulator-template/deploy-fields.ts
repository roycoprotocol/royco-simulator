import type {
  DayDeploymentFieldId,
  DayDeploymentFieldValues,
} from '@/lib/day-simulator-template/config-export';

/**
 * Bounds, units, derived defaults and cross-field rules for the deployment
 * checklist, mirrored from the real deploy flow rather than invented here.
 *
 * Every bound in this file carries a `source` naming the constant or the
 * validation it came from in `royco-rwa-frontend`, because a bound with no
 * provenance is a number somebody will "tidy" later. The flow blocks Continue
 * on these, so a design that violates one is a design that cannot deploy, and
 * saying so here is the whole point of collecting the fields at all.
 *
 * Provenance:
 *   lib/deploy-market/pool-controls.ts        the pool sizing ranges
 *   lib/deploy-market/constants.ts            UINT24_MAX_SECONDS, the T+1
 *                                             floor, the expiry derivation,
 *                                             the YDM type list
 *   _components/steps/step-4-economics.tsx    the accountant cross-field rules
 *   _components/steps/step-5-yield.tsx        the caps-sum rule, model labels
 */

// ---------------------------------------------------------------------------
// Units and shared bounds
// ---------------------------------------------------------------------------

/** uint24 seconds (~194 days), the cap on every term and delay field.
 *  Source: constants.ts UINT24_MAX_SECONDS = 16_777_215. */
export const DAY_UINT24_DAYS = 16_777_215 / 86_400;

/** uint32 seconds, the cap on the two expiry fields. The max value itself is
 *  the "never expires" sentinel, surfaced as a choice and never as a number.
 *  Source: constants.ts UINT32_MAX = 4_294_967_295. */
export const DAY_UINT32_DAYS = 4_294_967_295 / 86_400;

/** The T+1 withdrawal floor. Royco mandates it, the chain does not.
 *  Source: constants.ts MIN_REDEMPTION_DELAY_SECONDS = 86_400. */
export const DAY_MIN_WITHDRAWAL_DELAY_DAYS = 1;

/** A week of headroom on top of whichever bound holds a queued request.
 *  Source: constants.ts EXPIRY_PAD_SECONDS = 604_800. */
export const DAY_EXPIRY_PAD_DAYS = 7;

/** Every deployed curve anchors its target at 90% utilization. Protocol
 *  policy, not a per-market choice.
 *  Source: YDMLib.YDM_TARGET_UTILIZATION_WAD, step-5-yield.tsx:147. */
export const DAY_TARGET_UTILIZATION_PCT = 90;

// ---------------------------------------------------------------------------
// The premium curve models
// ---------------------------------------------------------------------------

/** The four registered YDM shapes, in the flow's own order.
 *  Source: constants.ts YDM_TYPES. */
export const DAY_CURVE_MODELS = [
  'STATIC_CURVE',
  'ADAPTIVE_CURVE_V1',
  'ADAPTIVE_CURVE_V2',
  'FIXED',
] as const;

export type DayCurveModel = (typeof DAY_CURVE_MODELS)[number];

/** Labels verbatim from the flow's MODEL_LABELS, so the two pages name the
 *  same shape the same way. Source: step-5-yield.tsx:107. */
export const DAY_CURVE_MODEL_LABELS: Record<DayCurveModel, string> = {
  STATIC_CURVE: 'Static Curve',
  ADAPTIVE_CURVE_V1: 'Scaling Adaptive Curve',
  ADAPTIVE_CURVE_V2: 'Shifting Adaptive Curve',
  FIXED: 'Fixed Yield Share',
};

/** The flow preselects the shifting adaptive curve on both sides and calls it
 *  the standard choice. Source: step-5-yield.tsx:907. */
export const DAY_CURVE_MODEL_DEFAULT: DayCurveModel = 'ADAPTIVE_CURVE_V2';

/** This page prices the static shape only, so it has to say which models it
 *  is not pricing. The engine implements adaptive V2 semantics
 *  (lib/day/engine/ydm.ts) but /v2 does not run it. */
export const DAY_CURVE_MODEL_MODELED: DayCurveModel = 'STATIC_CURVE';

export function dayCurveModelIsAdaptive(model: string): boolean {
  return model === 'ADAPTIVE_CURVE_V1' || model === 'ADAPTIVE_CURVE_V2';
}

/** Which curve anchors a shape actually takes. A reader who picks Fixed is
 *  not asked for three anchors, and the sliders on this page only describe
 *  the two curve shapes that have a target anchor.
 *  Source: constants.ts YDM_CURVE_PARAM_KEYS. */
export const DAY_CURVE_MODEL_ANCHORS: Record<DayCurveModel, readonly string[]> = {
  STATIC_CURVE: ['Share at 0%', 'Share at target', 'Share at 100%'],
  ADAPTIVE_CURVE_V1: ['Share at target', 'Share at 100%'],
  ADAPTIVE_CURVE_V2: ['Share at 0%', 'Share at target', 'Share at 100%'],
  FIXED: ['Fixed share'],
};

// ---------------------------------------------------------------------------
// Derivations the flow performs, mirrored so a placeholder stops guessing
// ---------------------------------------------------------------------------

/**
 * The flow's default request expiry: the longer of the two bounds that can
 * hold a queued request, plus a week to execute. A fixed-term freeze holds it
 * for up to the observation period, and with the price gate armed it cannot
 * execute until the oracle posts, which can take up to the staleness bound.
 * Source: constants.ts derivedDefaultExpirySeconds.
 */
export function dayDerivedExpiryDays(
  navStalenessDays: number,
  observationDays: number,
): number {
  return Math.max(navStalenessDays, observationDays) + DAY_EXPIRY_PAD_DAYS;
}

/**
 * The restock hurdle bands. Stepped across three bands rather than
 * interpolated, keyed on how long a desk is stuck in the redemption queue.
 * Source: pool-controls.ts PROFILES + profileForDays.
 */
export function dayRestockHurdleBps(redemptionDelayDays: number): number {
  if (redemptionDelayDays <= 3) return 5;
  if (redemptionDelayDays <= 14) return 10;
  return 30;
}

/**
 * The protected exit threshold in the two units that both describe it.
 *
 * The engine takes `exitBufferPct` and computes
 *   liquidationUtilization = 100 / exitBufferPct
 * while the deploy flow stores
 *   coverageLiquidationUtilizationWAD = minCoverage / remaining
 * and both feed the same on-chain field. Coverage utilization is
 * `exposure * coverage / jtEffective` (engine.ts coverageUtilizationWad), so
 * with `R` the coverage actually standing, utilization is `coverage / R` and
 * the exit arms at `R <= coverage / liquidationUtilization`. Substituting each
 * formula gives the conversion below: the flow's field is an ABSOLUTE coverage
 * level bounded by the requirement, and `exitBufferPct` is that same level
 * expressed as a percentage OF the requirement. They differ by a factor of the
 * coverage setting, so the two are not interchangeable and a value typed in
 * one unit cannot be handed to the other.
 */
export function dayExitBufferPctFromAbsolute(
  absolutePct: number,
  coveragePct: number,
): number {
  if (coveragePct <= 0) return 0;
  return (absolutePct / coveragePct) * 100;
}

export function dayAbsoluteFromExitBufferPct(
  exitBufferPct: number,
  coveragePct: number,
): number {
  return (exitBufferPct / 100) * coveragePct;
}

// ---------------------------------------------------------------------------
// Field rules
// ---------------------------------------------------------------------------

export type DayDeployFieldRule =
  | {
      kind: 'number';
      /** Unit the box speaks. Percent for shares, bps where the app already
       *  speaks bps, days for durations. WAD never reaches the reader. */
      unit: '%' | 'bps' | 'days' | 'hours' | '$' | '';
      min: number;
      max: number;
      /** True when the bound is `min < value`, not `min <= value`. */
      exclusiveMin?: boolean;
      integer?: boolean;
      /** Where the bound came from. Never edit one without re-reading this. */
      source: string;
    }
  | {
      kind: 'choice';
      options: readonly { value: string; label: string }[];
      source: string;
    };

const YES_NO = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
] as const;

export const DAY_DEPLOY_FIELD_RULES: Partial<
  Record<DayDeploymentFieldId, DayDeployFieldRule>
> = {
  // --- Coverage and liquidity (accountant economics) ---
  observationGracePeriod: {
    kind: 'number',
    unit: 'days',
    min: 0,
    max: DAY_UINT24_DAYS,
    source: 'uint24 seconds, step-4-economics.tsx:539',
  },
  // Bounded against the coverage setting at validation time, not here: the
  // ceiling moves with the slider. See dayValidateDeployFields.
  protectedExitThreshold: {
    kind: 'number',
    unit: '%',
    min: 0,
    max: 100,
    exclusiveMin: true,
    source: 'step-4-economics.tsx setRemainingCoverage, bounds 0 < v < minCoverage',
  },
  selfLiquidationBonus: {
    kind: 'number',
    unit: '%',
    min: 0,
    max: 100,
    source: 'MarketDeploymentValidationLogic.sol:117, bonus < 1e18',
  },
  juniorYieldShareCap: {
    kind: 'number',
    unit: '%',
    min: 0,
    max: 100,
    source: 'MarketDeploymentValidationLogic.sol:181, the two caps sum to at most 1e18',
  },
  seniorLpYieldShareCap: {
    kind: 'number',
    unit: '%',
    min: 0,
    max: 100,
    source: 'MarketDeploymentValidationLogic.sol:181, the two caps sum to at most 1e18',
  },

  // --- Yield split ---
  jrCurveModel: {
    kind: 'choice',
    options: DAY_CURVE_MODELS.map((model) => ({
      value: model,
      label: DAY_CURVE_MODEL_LABELS[model],
    })),
    source: 'constants.ts YDM_TYPES, step-5-yield.tsx MODEL_LABELS',
  },
  slpCurveModel: {
    kind: 'choice',
    options: DAY_CURVE_MODELS.map((model) => ({
      value: model,
      label: DAY_CURVE_MODEL_LABELS[model],
    })),
    source: 'constants.ts YDM_TYPES, step-5-yield.tsx MODEL_LABELS',
  },
  adaptationSpeed: {
    kind: 'number',
    unit: '',
    min: 0,
    max: 10,
    source: 'engine YDMConfig.maxAdaptSpeedPerYear, adaptive shapes only',
  },

  // --- Exit pool (modeling assumptions, not on-chain) ---
  exitLiquidity: {
    kind: 'number',
    unit: '$',
    min: 1_000_000,
    max: 50_000_000,
    source: 'pool-controls.ts EXIT_LIQUIDITY_M 1 to 50 million',
  },
  poolLambda: {
    kind: 'number',
    unit: '',
    min: 100,
    max: 1000,
    integer: true,
    source: 'pool-controls.ts LAMBDA_RANGE',
  },
  maximumDiscount: {
    kind: 'number',
    unit: 'bps',
    min: 50,
    max: 500,
    integer: true,
    source: 'pool-controls.ts DISCOUNT_BP',
  },
  maximumPremium: {
    kind: 'number',
    unit: 'bps',
    min: 0,
    max: 50,
    source: 'pool-controls.ts PREMIUM_BP',
  },
  exitAssetYield: {
    kind: 'number',
    unit: '%',
    min: 0,
    max: 15,
    source: 'pool-controls.ts STABLE_YIELD_PCT',
  },
  redemptionDelay: {
    kind: 'number',
    unit: 'days',
    min: 0,
    max: 365,
    integer: true,
    source: 'pool-controls.ts DELAY_DAYS, 0 is a valid entry',
  },
  restockHurdle: {
    kind: 'number',
    unit: 'bps',
    min: 2,
    max: 50,
    source: 'pool-controls.ts HURDLE_BP',
  },
  navUpdateCadence: {
    kind: 'number',
    unit: 'days',
    min: 1,
    max: 365,
    integer: true,
    source: 'pool-controls.ts CADENCE_DAYS, the floor keeps the per-year division finite',
  },
  reinvestmentSlippageTolerance: {
    kind: 'number',
    unit: 'bps',
    min: 0,
    max: 9999,
    source: 'maxReinvestmentSlippageWAD < 1e18',
  },

  // --- Pricing ---
  navStalenessBound: {
    kind: 'number',
    unit: 'days',
    min: 0,
    max: DAY_UINT32_DAYS,
    source: 'oracle recipe staleness, constants.ts navStalenessSecondsFromOracle',
  },
  valuationUnit: {
    kind: 'choice',
    options: [
      { value: 'USD', label: 'USD' },
      { value: 'BTC', label: 'BTC' },
      { value: 'ETH', label: 'ETH' },
    ],
    source: 'types.ts VALUATION_UNITS',
  },

  // --- Settlement ---
  depositSettlementDelay: {
    kind: 'number',
    unit: 'days',
    min: 0,
    max: DAY_UINT24_DAYS,
    source: 'constants.ts, no floor on the deposit delay, zero included',
  },
  withdrawalSettlementDelay: {
    kind: 'number',
    unit: 'days',
    min: DAY_MIN_WITHDRAWAL_DELAY_DAYS,
    max: DAY_UINT24_DAYS,
    source: 'constants.ts MIN_REDEMPTION_DELAY_SECONDS, the T+1 floor',
  },
  depositExpiry: {
    kind: 'number',
    unit: 'days',
    min: 0,
    max: DAY_UINT32_DAYS,
    source: 'uint32 seconds, the max itself is the no-expiry sentinel',
  },
  withdrawalExpiry: {
    kind: 'number',
    unit: 'days',
    min: 0,
    max: DAY_UINT32_DAYS,
    source: 'uint32 seconds, the max itself is the no-expiry sentinel',
  },
  gateByPriceUpdates: {
    kind: 'choice',
    options: [...YES_NO],
    source: 'constants.ts settlementQueueConfig, the gate defaults on',
  },

  // --- Genesis ---
  genesisSeedQuote: {
    kind: 'number',
    unit: '$',
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    source: 'seed-liquidity-section.tsx, only the quote amount is entered',
  },
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type DayDeployContext = {
  /** The live coverage slider, which is the ceiling on the exit threshold. */
  coveragePct: number;
  /** The live observation slider, one input to the expiry derivation. */
  observationDays: number;
};

export type DayDeployIssue = {
  /** The field the message hangs off, or null for a rule spanning two. */
  field: DayDeploymentFieldId | null;
  message: string;
};

const parse = (raw: string): number | null => {
  const trimmed = raw.trim().replace(/[$,\s]/g, '');
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
};

/** A blank box is not an error, it is an undeclared field. Only a value that
 *  is present and wrong produces a message. */
function checkOne(
  id: DayDeploymentFieldId,
  raw: string,
): string | null {
  const rule = DAY_DEPLOY_FIELD_RULES[id];
  if (!rule) return null;
  if (raw.trim() === '') return null;

  if (rule.kind === 'choice') {
    return rule.options.some((option) => option.value === raw)
      ? null
      : `Pick one of ${rule.options.map((option) => option.label).join(', ')}.`;
  }

  const value = parse(raw);
  if (value === null) return 'Enter a number.';
  if (rule.exclusiveMin && value <= rule.min) {
    return `Must be above ${fmtBound(rule.min, rule.unit)}.`;
  }
  if (!rule.exclusiveMin && value < rule.min) {
    return `Must be at least ${fmtBound(rule.min, rule.unit)}.`;
  }
  if (value > rule.max) return `Must be at most ${fmtBound(rule.max, rule.unit)}.`;
  if (rule.integer && !Number.isInteger(value)) return 'Must be a whole number.';
  return null;
}

function fmtBound(value: number, unit: string): string {
  if (unit === '$') {
    return value >= 1_000_000
      ? `$${(value / 1_000_000).toFixed(0)}M`
      : `$${value.toLocaleString('en-US')}`;
  }
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return unit === '' ? rounded : `${rounded}${unit === '%' ? '%' : ` ${unit}`}`;
}

/**
 * Every rule the flow blocks Continue on, checked against what has been
 * declared so far. Per-field bounds first, then the cross-field rules that no
 * single box can see on its own. Returns one issue per broken rule, and a
 * per-field index so a box can carry its own message.
 */
export function dayValidateDeployFields(
  values: DayDeploymentFieldValues,
  context: DayDeployContext,
): { issues: DayDeployIssue[]; byField: Partial<Record<DayDeploymentFieldId, string>> } {
  const issues: DayDeployIssue[] = [];
  const byField: Partial<Record<DayDeploymentFieldId, string>> = {};

  const add = (field: DayDeploymentFieldId | null, message: string) => {
    issues.push({ field, message });
    if (field && !byField[field]) byField[field] = message;
  };

  for (const id of Object.keys(DAY_DEPLOY_FIELD_RULES) as DayDeploymentFieldId[]) {
    const message = checkOne(id, values[id] ?? '');
    if (message) add(id, message);
  }

  const threshold = parse(values.protectedExitThreshold ?? '');
  const bonus = parse(values.selfLiquidationBonus ?? '');
  const jrCap = parse(values.juniorYieldShareCap ?? '');
  const slpCap = parse(values.seniorLpYieldShareCap ?? '');

  // The exit threshold is an absolute coverage level and the flow bounds it by
  // the requirement, so the ceiling moves with the coverage slider. A market
  // whose threshold sits at or above its coverage cannot deploy: the stored
  // utilization multiple would land at or below 1e18.
  // Source: step-4-economics.tsx errors, "must be below the Minimum Coverage".
  if (threshold !== null && byField.protectedExitThreshold === undefined) {
    if (context.coveragePct <= 0) {
      add(
        'protectedExitThreshold',
        'Coverage is off, so there is no protected exit to configure.',
      );
    } else if (threshold >= context.coveragePct) {
      add(
        'protectedExitThreshold',
        `Must be below the ${context.coveragePct.toFixed(1)}% coverage requirement. It is the coverage level left standing when the exit arms, not a share of the requirement.`,
      );
    }
  }

  // The payable bonus is clamped on chain to the coverage-neutral maximum, so
  // a bonus above the threshold could not be paid in full the moment the exit
  // arms. The flow surfaces this rather than letting it clamp silently.
  // Source: step-4-economics.tsx, SelfLiquidationLogic.sol:63-73 and :90.
  if (
    bonus !== null &&
    threshold !== null &&
    byField.selfLiquidationBonus === undefined &&
    byField.protectedExitThreshold === undefined &&
    bonus > threshold
  ) {
    add(
      'selfLiquidationBonus',
      'Cannot exceed the protected exit threshold. A larger bonus could not be paid in full when the threshold is breached.',
    );
  }

  // The contract derives each cap from the peak of its own curve and rejects a
  // market whose two caps exceed 100% together.
  // Source: MarketDeploymentValidationLogic.sol:181.
  if (
    jrCap !== null &&
    slpCap !== null &&
    byField.juniorYieldShareCap === undefined &&
    byField.seniorLpYieldShareCap === undefined &&
    jrCap + slpCap > 100
  ) {
    const message = `The Jr and SLP caps sum to ${(jrCap + slpCap).toFixed(1)}%. The contract rejects a market whose two caps exceed 100% together.`;
    add('juniorYieldShareCap', message);
    byField.seniorLpYieldShareCap = message;
  }

  // The market fails shut between routine updates if the oracle goes stale
  // sooner than the asset publishes. This is the coupling /v2's own cadence
  // hint already describes, now checked.
  const cadence = parse(values.navUpdateCadence ?? '');
  const staleness = parse(values.navStalenessBound ?? '');
  if (
    cadence !== null &&
    staleness !== null &&
    byField.navUpdateCadence === undefined &&
    byField.navStalenessBound === undefined &&
    staleness < cadence
  ) {
    add(
      'navStalenessBound',
      `Must be at least the ${cadence} day publication cadence, or the market fails shut between routine updates.`,
    );
  }

  // Adaptation speed only means something on an adaptive shape. Declaring one
  // against two static curves is a value nothing will read.
  const anyAdaptive =
    dayCurveModelIsAdaptive(values.jrCurveModel ?? '') ||
    dayCurveModelIsAdaptive(values.slpCurveModel ?? '');
  if (!anyAdaptive && (values.adaptationSpeed ?? '').trim() !== '') {
    add(
      'adaptationSpeed',
      'Only the two adaptive shapes adapt. Pick an adaptive curve model above or leave this blank.',
    );
  }

  return { issues, byField };
}

/** True when the adaptation speed is a live question for this design. */
export function dayAdaptationSpeedApplies(values: DayDeploymentFieldValues): boolean {
  return (
    dayCurveModelIsAdaptive(values.jrCurveModel ?? '') ||
    dayCurveModelIsAdaptive(values.slpCurveModel ?? '')
  );
}
