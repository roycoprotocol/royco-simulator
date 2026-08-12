import assert from 'node:assert/strict';

import {
  DAY_CURVE_MODELS,
  DAY_CURVE_MODEL_DEFAULT,
  DAY_DEPLOY_FIELD_RULES,
  DAY_MIN_WITHDRAWAL_DELAY_DAYS,
  DAY_UINT24_DAYS,
  dayAbsoluteFromExitBufferPct,
  dayAdaptationSpeedApplies,
  dayCurveModelIsAdaptive,
  dayDerivedExpiryDays,
  dayExitBufferPctFromAbsolute,
  dayRestockHurdleBps,
  dayValidateDeployFields,
} from '@/lib/day-simulator-template/deploy-fields';
import {
  DAY_DEPLOYMENT_INPUT_IDS,
  EMPTY_DAY_DEPLOYMENT_FIELDS,
  type DayDeploymentFieldValues,
} from '@/lib/day-simulator-template/config-export';

let passed = 0;
const check = (label: string, condition: boolean, detail = '') => {
  assert.ok(condition, `${label}${detail ? ` :: ${detail}` : ''}`);
  passed += 1;
};

const fields = (patch: Partial<DayDeploymentFieldValues>): DayDeploymentFieldValues => ({
  ...EMPTY_DAY_DEPLOYMENT_FIELDS,
  ...patch,
});

const base = { coveragePct: 10, observationDays: 30 };

// ---------------------------------------------------------------------------
// The unit conversion, which is the whole reason this module exists
// ---------------------------------------------------------------------------

// The engine takes liquidationUtilization = 100 / exitBufferPct and the flow
// stores minCoverage / remaining, and both feed the same on-chain field.
// Equating them gives remaining = coverage * exitBufferPct / 100, so the two
// round-trip and the identity below has to hold for any coverage.
for (const coveragePct of [1, 5, 10, 20, 66.67]) {
  for (const bufferPct of [1, 5, 50, 99.91]) {
    const absolute = dayAbsoluteFromExitBufferPct(bufferPct, coveragePct);
    const back = dayExitBufferPctFromAbsolute(absolute, coveragePct);
    check(
      `threshold round-trips at coverage ${coveragePct} buffer ${bufferPct}`,
      Math.abs(back - bufferPct) < 1e-9,
      `got ${back}`,
    );
    // Both express the same on-chain multiple.
    const engineMultiple = 100 / bufferPct;
    const flowMultiple = coveragePct / absolute;
    check(
      `both units give the same liquidation multiple (${coveragePct}, ${bufferPct})`,
      Math.abs(engineMultiple - flowMultiple) < 1e-9,
      `engine ${engineMultiple} flow ${flowMultiple}`,
    );
  }
}

// The concrete case the audit turned on: at 10% coverage a market shipping
// exitBufferPct 1 arms at 0.1% absolute coverage, not 1%.
check(
  'exitBufferPct 1 at 10% coverage is 0.1% absolute',
  Math.abs(dayAbsoluteFromExitBufferPct(1, 10) - 0.1) < 1e-12,
  String(dayAbsoluteFromExitBufferPct(1, 10)),
);

// A zero coverage setting has no threshold to express, and must not divide.
check(
  'zero coverage yields zero rather than a division by zero',
  dayExitBufferPctFromAbsolute(5, 0) === 0,
);

// ---------------------------------------------------------------------------
// Derivations mirrored from the flow
// ---------------------------------------------------------------------------

// derivedDefaultExpirySeconds = max(staleness, observation) + 604800.
check('expiry pads the longer bound by a week', dayDerivedExpiryDays(30, 14) === 37);
check('expiry takes the observation period when it is longer', dayDerivedExpiryDays(7, 60) === 67);
check('both bounds zero collapses to exactly one week', dayDerivedExpiryDays(0, 0) === 7);

// profileForDays: at most 3 is Days, at most 14 is Weeks, longer is Months.
check('hurdle band, days', dayRestockHurdleBps(0) === 5 && dayRestockHurdleBps(3) === 5);
check('hurdle band, weeks', dayRestockHurdleBps(4) === 10 && dayRestockHurdleBps(14) === 10);
check('hurdle band, months', dayRestockHurdleBps(15) === 30 && dayRestockHurdleBps(365) === 30);

// ---------------------------------------------------------------------------
// Per-field bounds
// ---------------------------------------------------------------------------

check('a blank box is not an error', dayValidateDeployFields(fields({}), base).issues.length === 0);

check(
  'a discount below the flow range is refused',
  dayValidateDeployFields(fields({ maximumDiscount: '10' }), base).byField.maximumDiscount !==
    undefined,
);
check(
  'a discount inside the flow range passes',
  dayValidateDeployFields(fields({ maximumDiscount: '200' }), base).byField.maximumDiscount ===
    undefined,
);
check(
  'lambda must be whole',
  dayValidateDeployFields(fields({ poolLambda: '300.5' }), base).byField.poolLambda !== undefined,
);
check(
  'the T+1 withdrawal floor is enforced',
  dayValidateDeployFields(fields({ withdrawalSettlementDelay: '0.5' }), base).byField
    .withdrawalSettlementDelay !== undefined,
);
check(
  'the deposit delay has no floor, zero included',
  dayValidateDeployFields(fields({ depositSettlementDelay: '0' }), base).byField
    .depositSettlementDelay === undefined,
);
check(
  'the uint24 duration cap is enforced',
  dayValidateDeployFields(fields({ observationGracePeriod: '200' }), base).byField
    .observationGracePeriod !== undefined,
);
check(
  'a grace period inside the uint24 cap passes',
  dayValidateDeployFields(fields({ observationGracePeriod: '194' }), base).byField
    .observationGracePeriod === undefined,
);
check('the uint24 cap is about 194 days', Math.floor(DAY_UINT24_DAYS) === 194);
check('the withdrawal floor is one day', DAY_MIN_WITHDRAWAL_DELAY_DAYS === 1);
check(
  'text in a number box is refused',
  dayValidateDeployFields(fields({ exitLiquidity: 'lots' }), base).byField.exitLiquidity !==
    undefined,
);
check(
  'a dollar amount with separators parses',
  dayValidateDeployFields(fields({ exitLiquidity: '$10,000,000' }), base).byField.exitLiquidity ===
    undefined,
);
check(
  'an unknown choice is refused',
  dayValidateDeployFields(fields({ valuationUnit: 'GBP' }), base).byField.valuationUnit !==
    undefined,
);
check(
  'a known choice passes',
  dayValidateDeployFields(fields({ valuationUnit: 'ETH' }), base).byField.valuationUnit ===
    undefined,
);

// ---------------------------------------------------------------------------
// Cross-field rules the flow blocks Continue on
// ---------------------------------------------------------------------------

// step-4-economics: the threshold must be below the coverage requirement, and
// the ceiling moves with the slider rather than sitting at a static 99.91%.
check(
  'a threshold at the coverage requirement is refused',
  dayValidateDeployFields(fields({ protectedExitThreshold: '10' }), base).byField
    .protectedExitThreshold !== undefined,
);
check(
  'a threshold below the coverage requirement passes',
  dayValidateDeployFields(fields({ protectedExitThreshold: '5' }), base).byField
    .protectedExitThreshold === undefined,
);
check(
  'the ceiling follows the coverage slider up',
  dayValidateDeployFields(fields({ protectedExitThreshold: '15' }), {
    ...base,
    coveragePct: 20,
  }).byField.protectedExitThreshold === undefined,
);
check(
  'the ceiling follows the coverage slider down',
  dayValidateDeployFields(fields({ protectedExitThreshold: '5' }), {
    ...base,
    coveragePct: 2,
  }).byField.protectedExitThreshold !== undefined,
);
check(
  'with coverage off there is no threshold to set',
  dayValidateDeployFields(fields({ protectedExitThreshold: '1' }), {
    ...base,
    coveragePct: 0,
  }).byField.protectedExitThreshold !== undefined,
);

// A bonus above the threshold could not be paid in full when the exit arms.
check(
  'a bonus above the threshold is refused',
  dayValidateDeployFields(
    fields({ protectedExitThreshold: '5', selfLiquidationBonus: '6' }),
    base,
  ).byField.selfLiquidationBonus !== undefined,
);
check(
  'a bonus at the threshold passes',
  dayValidateDeployFields(
    fields({ protectedExitThreshold: '5', selfLiquidationBonus: '5' }),
    base,
  ).byField.selfLiquidationBonus === undefined,
);

// MarketDeploymentValidationLogic:181, the two caps sum to at most 1e18.
{
  const result = dayValidateDeployFields(
    fields({ juniorYieldShareCap: '70', seniorLpYieldShareCap: '40' }),
    base,
  );
  check('caps over 100 together are refused', result.byField.juniorYieldShareCap !== undefined);
  check('both cap boxes carry the message', result.byField.seniorLpYieldShareCap !== undefined);
}
check(
  'caps summing to exactly 100 pass',
  dayValidateDeployFields(
    fields({ juniorYieldShareCap: '60', seniorLpYieldShareCap: '40' }),
    base,
  ).byField.juniorYieldShareCap === undefined,
);

// The staleness bound has to cover the publication cadence or the market fails
// shut between routine updates.
check(
  'a staleness bound tighter than the cadence is refused',
  dayValidateDeployFields(
    fields({ navUpdateCadence: '30', navStalenessBound: '7' }),
    base,
  ).byField.navStalenessBound !== undefined,
);
check(
  'a staleness bound at the cadence passes',
  dayValidateDeployFields(
    fields({ navUpdateCadence: '30', navStalenessBound: '30' }),
    base,
  ).byField.navStalenessBound === undefined,
);

// ---------------------------------------------------------------------------
// Curve models
// ---------------------------------------------------------------------------

check('four registered shapes', DAY_CURVE_MODELS.length === 4);
check('the flow default is the shifting adaptive curve', DAY_CURVE_MODEL_DEFAULT === 'ADAPTIVE_CURVE_V2');
check(
  'both adaptive shapes read as adaptive',
  dayCurveModelIsAdaptive('ADAPTIVE_CURVE_V1') && dayCurveModelIsAdaptive('ADAPTIVE_CURVE_V2'),
);
check(
  'static and fixed do not',
  !dayCurveModelIsAdaptive('STATIC_CURVE') && !dayCurveModelIsAdaptive('FIXED'),
);
check(
  'adaptation speed applies when either side is adaptive',
  dayAdaptationSpeedApplies(fields({ jrCurveModel: 'ADAPTIVE_CURVE_V2' })) &&
    dayAdaptationSpeedApplies(fields({ slpCurveModel: 'ADAPTIVE_CURVE_V1' })),
);
check(
  'adaptation speed does not apply to two held-still curves',
  !dayAdaptationSpeedApplies(fields({ jrCurveModel: 'STATIC_CURVE', slpCurveModel: 'FIXED' })),
);
check(
  'an adaptation speed against static curves is called out',
  dayValidateDeployFields(
    fields({ jrCurveModel: 'STATIC_CURVE', slpCurveModel: 'STATIC_CURVE', adaptationSpeed: '1' }),
    base,
  ).byField.adaptationSpeed !== undefined,
);
check(
  'an adaptation speed against an adaptive curve is fine',
  dayValidateDeployFields(
    fields({ jrCurveModel: 'ADAPTIVE_CURVE_V2', adaptationSpeed: '1' }),
    base,
  ).byField.adaptationSpeed === undefined,
);

// ---------------------------------------------------------------------------
// The rule table itself
// ---------------------------------------------------------------------------

// A rule keyed on a field that no longer exists is dead weight nobody notices.
const knownIds = new Set<string>([
  ...DAY_DEPLOYMENT_INPUT_IDS,
  'yieldShareAtFullUtilization',
  'protectedExitThreshold',
  'selfLiquidationBonus',
]);
for (const id of Object.keys(DAY_DEPLOY_FIELD_RULES)) {
  check(`rule ${id} names a real field`, knownIds.has(id));
}

// Every bound has to say where it came from, or the next reader tidies it.
for (const [id, rule] of Object.entries(DAY_DEPLOY_FIELD_RULES)) {
  check(`rule ${id} carries a source`, Boolean(rule && rule.source.trim().length > 0));
  if (rule && rule.kind === 'number') {
    check(`rule ${id} has a coherent range`, rule.min < rule.max, `${rule.min}..${rule.max}`);
  }
}

console.log(`deploy-fields: ${passed} checks passed`);
