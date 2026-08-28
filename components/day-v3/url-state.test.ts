import assert from "node:assert/strict";

import {
  applyDayV3StarterDefaults,
  buildDayV3Query,
  DAY_V3_STARTER_DEFAULTS,
  readDayV3UrlState,
} from "./url-state";

const emptyStarter = applyDayV3StarterDefaults(readDayV3UrlState(""), "");
assert.equal(emptyStarter.applied, true);
assert.deepEqual(
  {
    market: emptyStarter.state.market,
    sourceApyPct: emptyStarter.state.sourceApyPct,
    protectedDrawdownPct: emptyStarter.state.protectedDrawdownPct,
    recoveryDays: emptyStarter.state.recoveryDays,
    immediateExitSharePct: emptyStarter.state.immediateExitSharePct,
    minimumProceedsPer100: emptyStarter.state.minimumProceedsPer100,
    entryPointSettlementDays: emptyStarter.state.entryPointSettlementDays,
    collateralToExitDays: emptyStarter.state.collateralToExitDays,
    collateralToExitCostBps: emptyStarter.state.collateralToExitCostBps,
    fixedTermGraceDays: emptyStarter.state.fixedTermGraceDays,
    navUpdateDays: emptyStarter.state.navUpdateDays,
    depositDelaySeconds: emptyStarter.state.depositDelaySeconds,
    gateByOracleUpdate: emptyStarter.state.gateByOracleUpdate,
    incentiveBudgetPer100: emptyStarter.state.incentiveBudgetPer100,
    target: emptyStarter.state.target,
  },
  DAY_V3_STARTER_DEFAULTS,
);

const starterQuery = buildDayV3Query({
  ...emptyStarter.state,
  starterFields: emptyStarter.appliedFields,
});
assert.equal(starterQuery.includes("starter="), false);
assert.deepEqual(
  [...new URLSearchParams(starterQuery).keys()].sort(),
  [
    "apy",
    "convert",
    "convertCost",
    "exit",
    "m",
    "protect",
    "receive",
    "recover",
    "settle",
  ],
  "canonical links contain visible model inputs, not starter provenance",
);
const reloadedStarter = applyDayV3StarterDefaults(
  readDayV3UrlState(starterQuery),
  starterQuery,
);
assert.equal(reloadedStarter.state.sourceApyPct, emptyStarter.state.sourceApyPct);
assert.equal(
  reloadedStarter.state.protectedDrawdownPct,
  emptyStarter.state.protectedDrawdownPct,
);
assert.equal(
  reloadedStarter.state.immediateExitSharePct,
  emptyStarter.state.immediateExitSharePct,
);
assert.equal(reloadedStarter.applied, true);

const confirmedQuery = buildDayV3Query({
  ...emptyStarter.state,
  starterFields: [],
});
assert.equal(confirmedQuery, starterQuery);

const legacyStarter = applyDayV3StarterDefaults(
  readDayV3UrlState("m=custom&starter=source%2Cgrace"),
  "m=custom&starter=source%2Cgrace",
);
assert.equal(legacyStarter.appliedFields.includes("source"), true);
assert.equal(legacyStarter.appliedFields.includes("grace"), true);

const partialStarter = applyDayV3StarterDefaults(
  readDayV3UrlState("m=custom&apy=12&recover=30"),
  "m=custom&apy=12&recover=30",
);
assert.equal(partialStarter.applied, true);
assert.equal(partialStarter.state.sourceApyPct, 12);
assert.equal(partialStarter.state.recoveryDays, 30);
assert.equal(
  partialStarter.state.protectedDrawdownPct,
  DAY_V3_STARTER_DEFAULTS.protectedDrawdownPct,
);

const explicitInvalid = applyDayV3StarterDefaults(
  readDayV3UrlState("m=custom&apy=NaN&protect=999"),
  "m=custom&apy=NaN&protect=999",
);
assert.equal(explicitInvalid.state.sourceApyPct, null);
assert.equal(explicitInvalid.state.protectedDrawdownPct, null);

const listedSource = applyDayV3StarterDefaults(
  readDayV3UrlState("m=jbbb"),
  "m=jbbb",
);
assert.equal(listedSource.applied, true);
assert.equal(listedSource.state.sourceApyPct, null);
assert.equal(
  listedSource.state.protectedDrawdownPct,
  15,
);
assert.equal(listedSource.state.recoveryDays, 23);
assert.equal(listedSource.state.immediateExitSharePct, 0);
assert.equal(listedSource.state.minimumProceedsPer100, 95);
assert.equal(listedSource.state.quoteAssetLabel, "sr-srRoyUSDC");
assert.equal(listedSource.state.quoteAssetYieldPct, 4);
assert.equal(listedSource.state.poolTurnoverPerYear, 2);
assert.equal(listedSource.state.swapFeeBps, 5);
assert.equal(listedSource.state.marketMakerCostOfCapitalPct, 12);
assert.equal(listedSource.state.redemptionDays, 7);
assert.deepEqual(listedSource.state.overrides, {
  jrYieldShareAtZeroPct: 7.5,
  jrYieldShareAtTargetPct: 14.4,
  jrYieldShareAtFullPct: 67,
  slpYieldShareAtZeroPct: 0,
  slpYieldShareAtTargetPct: 0,
  slpYieldShareAtFullPct: 0,
  coveragePct: null,
  minimumLiquidityPct: null,
  maximumDiscountPct: null,
  depthAtNav: null,
  maximumPremiumPct: null,
  protectedExitThresholdPct: null,
  protectedExitBonusPct: null,
  poolCapitalPer100: null,
});
assert.equal(listedSource.state.entryPointSettlementDays, null);
assert.deepEqual(listedSource.state.target, DAY_V3_STARTER_DEFAULTS.target);
assert.deepEqual(listedSource.appliedFields, [
  "drawdown",
  "recovery",
  "exit-amount",
  "payout",
  "target",
]);
const listedSourceQuery = buildDayV3Query({
  ...listedSource.state,
  starterFields: listedSource.appliedFields,
});
for (const expected of [
  "m=jbbb",
  "protect=15",
  "recover=23",
  "exit=0",
  "receive=0",
  "jr0=7.5",
  "jr90=14.4",
  "jr100=67",
  "slp0=0",
  "slp90=0",
  "slp100=0",
]) {
  assert.equal(listedSourceQuery.includes(expected), true, expected);
}

const explicitJbbbTerms = applyDayV3StarterDefaults(
  readDayV3UrlState("m=jbbb&recover=30&fee=7&jr90=18"),
  "m=jbbb&recover=30&fee=7&jr90=18",
);
assert.equal(explicitJbbbTerms.state.recoveryDays, 30);
assert.equal(explicitJbbbTerms.state.swapFeeBps, 7);
assert.equal(explicitJbbbTerms.state.overrides.jrYieldShareAtTargetPct, 18);
assert.equal(explicitJbbbTerms.state.overrides.jrYieldShareAtZeroPct, null);
assert.equal(explicitJbbbTerms.state.overrides.slpYieldShareAtFullPct, null);

const query = buildDayV3Query({
  market: "custom",
  mode: "deploy",
  sourceApyPct: 8.25,
  quoteAssetLabel: "sUSDS",
  quoteAssetYieldPct: 4.5,
  poolTurnoverPerYear: 8,
  swapFeeBps: 30,
  poolPremiumBps: null,
  marketMakerCostOfCapitalPct: 12,
  redemptionDays: 7,
  protectedDrawdownPct: 18,
  recoveryDays: 45,
  immediateExitSharePct: 10,
  minimumProceedsPer100: 98.5,
  entryPointSettlementDays: 7,
  collateralToExitDays: 2,
  collateralToExitCostBps: 35,
  fixedTermGraceDays: 0,
  navUpdateDays: 1,
  depositDelaySeconds: 300,
  depositExpirySeconds: 1_814_400,
  withdrawalExpirySeconds: "no-expiry",
  gateByOracleUpdate: true,
  maxReinvestmentSlippageBps: 50,
  incentiveBudgetPer100: 2,
  target: { chainId: 1, templateId: "day-template" },
  overrides: {
    coveragePct: 16,
    minimumLiquidityPct: 12,
    maximumDiscountPct: 2.5,
    depthAtNav: 300,
    maximumPremiumPct: 0.08,
    protectedExitThresholdPct: 10,
    protectedExitBonusPct: 1,
    poolCapitalPer100: 13,
    jrYieldShareAtZeroPct: 2,
    jrYieldShareAtTargetPct: 12,
    jrYieldShareAtFullPct: 18,
    slpYieldShareAtZeroPct: 1,
    slpYieldShareAtTargetPct: 5,
    slpYieldShareAtFullPct: 14,
  },
  starterFields: ["source", "target"],
});
const parsed = readDayV3UrlState(query);
assert.equal(parsed.market, "custom");
assert.equal(parsed.mode, null);
assert.equal(parsed.protectedDrawdownPct, 18);
assert.equal(parsed.recoveryDays, 45);
assert.equal(parsed.immediateExitSharePct, 10);
assert.equal(parsed.minimumProceedsPer100, 98.5);
assert.equal(parsed.entryPointSettlementDays, 7);
assert.equal(parsed.collateralToExitDays, 2);
assert.equal(parsed.collateralToExitCostBps, 35);
assert.equal(parsed.overrides.jrYieldShareAtTargetPct, 12);
assert.equal(parsed.overrides.slpYieldShareAtTargetPct, 5);
assert.deepEqual(
  [...new URLSearchParams(query).keys()].sort(),
  [
    "apy",
    "convert",
    "convertCost",
    "exit",
    "fee",
    "jr0",
    "jr100",
    "jr90",
    "m",
    "mmCost",
    "mmDays",
    "protect",
    "quote",
    "quoteApy",
    "receive",
    "recover",
    "settle",
    "slp0",
    "slp100",
    "slp90",
    "turnover",
  ],
  "the canonical writer strips hidden state while retaining all visible curve anchors",
);
for (const hidden of [
  "mode",
  "grace",
  "nav",
  "depDelay",
  "depExpiry",
  "wdExpiry",
  "priceGate",
  "reinvestSlip",
  "incentive",
  "target",
  "cov",
  "liq",
  "discount",
  "lambda",
  "premium",
  "pexit",
  "bonus",
  "pool",
  "starter",
]) {
  assert.equal(new URLSearchParams(query).has(hidden), false, hidden);
}

// Reported live-state regression: zero is a deliberate value for same-day
// conversion and no incentive, while every other operational fact round-trips
// independently. None may be treated as missing because it is falsy.
const reported = readDayV3UrlState(
  "m=custom&apy=6&protect=15&recover=20&exit=10&receive=95&settle=90&convert=0&convertCost=50&grace=14&nav=1&incentive=0&target=1%3Abalancer-v3-eclp",
);
assert.deepEqual(
  {
    market: reported.market,
    sourceApyPct: reported.sourceApyPct,
    protectedDrawdownPct: reported.protectedDrawdownPct,
    recoveryDays: reported.recoveryDays,
    immediateExitSharePct: reported.immediateExitSharePct,
    minimumProceedsPer100: reported.minimumProceedsPer100,
    entryPointSettlementDays: reported.entryPointSettlementDays,
    collateralToExitDays: reported.collateralToExitDays,
    collateralToExitCostBps: reported.collateralToExitCostBps,
    fixedTermGraceDays: reported.fixedTermGraceDays,
    navUpdateDays: reported.navUpdateDays,
    depositDelaySeconds: reported.depositDelaySeconds,
    depositExpirySeconds: reported.depositExpirySeconds,
    withdrawalExpirySeconds: reported.withdrawalExpirySeconds,
    gateByOracleUpdate: reported.gateByOracleUpdate,
    maxReinvestmentSlippageBps: reported.maxReinvestmentSlippageBps,
    incentiveBudgetPer100: reported.incentiveBudgetPer100,
    target: reported.target,
  },
  {
    market: "custom",
    sourceApyPct: 6,
    protectedDrawdownPct: 15,
    recoveryDays: 20,
    immediateExitSharePct: 10,
    minimumProceedsPer100: 95,
    entryPointSettlementDays: 90,
    collateralToExitDays: 0,
    collateralToExitCostBps: 50,
    fixedTermGraceDays: 14,
    navUpdateDays: 1,
    depositDelaySeconds: null,
    depositExpirySeconds: null,
    withdrawalExpirySeconds: null,
    gateByOracleUpdate: null,
    maxReinvestmentSlippageBps: null,
    incentiveBudgetPer100: 0,
    target: { chainId: 1, templateId: "balancer-v3-eclp" },
  },
);
assert.equal(buildDayV3Query(reported).includes("convert=0"), true);
assert.equal(buildDayV3Query(reported).includes("settle=90"), true);
assert.equal(buildDayV3Query(reported).includes("convertCost=50"), true);
assert.equal(buildDayV3Query(reported).includes("recover=20"), true);
assert.equal(buildDayV3Query(reported).includes("incentive=0"), false);

const settlementPolicy = readDayV3UrlState(
  "depDelay=0&depExpiry=604800&wdExpiry=none&priceGate=0&reinvestSlip=25",
);
assert.equal(settlementPolicy.depositDelaySeconds, 0);
assert.equal(settlementPolicy.depositExpirySeconds, 604_800);
assert.equal(settlementPolicy.withdrawalExpirySeconds, "no-expiry");
assert.equal(settlementPolicy.gateByOracleUpdate, false);
assert.equal(settlementPolicy.maxReinvestmentSlippageBps, 25);
assert.equal(buildDayV3Query(settlementPolicy).includes("wdExpiry=none"), false);
assert.equal(readDayV3UrlState("depExpiry=4294967295").depositExpirySeconds, null);
assert.equal(readDayV3UrlState("reinvestSlip=10000").maxReinvestmentSlippageBps, null);

const overridden = readDayV3UrlState(
  `${query}&cov=20&liq=12&discount=2.5&lambda=300&premium=0.08&pexit=10&bonus=1&pool=13&jr0=2&jr90=12&jr100=18&slp0=1&slp90=5&slp100=14`,
);
assert.deepEqual(overridden.overrides, {
  coveragePct: 20,
  minimumLiquidityPct: 12,
  maximumDiscountPct: 2.5,
  depthAtNav: 300,
  maximumPremiumPct: 0.08,
  protectedExitThresholdPct: 10,
  protectedExitBonusPct: 1,
  poolCapitalPer100: 13,
  jrYieldShareAtZeroPct: 2,
  jrYieldShareAtTargetPct: 12,
  jrYieldShareAtFullPct: 18,
  slpYieldShareAtZeroPct: 1,
  slpYieldShareAtTargetPct: 5,
  slpYieldShareAtFullPct: 14,
});
const curveRoundTrip = buildDayV3Query(overridden);
for (const field of [
  "jr0=2",
  "jr90=12",
  "jr100=18",
  "slp0=1",
  "slp90=5",
  "slp100=14",
]) {
  assert.equal(curveRoundTrip.includes(field), true);
}
const simpleYieldSplit = readDayV3UrlState("m=custom&apy=8&jr90=20&slp90=10");
assert.deepEqual(
  {
    jr0: simpleYieldSplit.overrides.jrYieldShareAtZeroPct,
    jr90: simpleYieldSplit.overrides.jrYieldShareAtTargetPct,
    jr100: simpleYieldSplit.overrides.jrYieldShareAtFullPct,
    slp0: simpleYieldSplit.overrides.slpYieldShareAtZeroPct,
    slp90: simpleYieldSplit.overrides.slpYieldShareAtTargetPct,
    slp100: simpleYieldSplit.overrides.slpYieldShareAtFullPct,
  },
  {
    jr0: null,
    jr90: 20,
    jr100: null,
    slp0: null,
    slp90: 10,
    slp100: null,
  },
  "Simple target-share links preserve their two visible APY inputs",
);
assert.match(buildDayV3Query(simpleYieldSplit), /jr90=20/);
assert.match(buildDayV3Query(simpleYieldSplit), /slp90=10/);

const slpOnlyQuery = buildDayV3Query({
  ...reported,
  protectedDrawdownPct: 0,
  recoveryDays: null,
  fixedTermGraceDays: null,
  overrides: {
    ...reported.overrides,
    jrYieldShareAtTargetPct: 12,
    slpYieldShareAtTargetPct: 5,
  },
});
const slpOnly = readDayV3UrlState(slpOnlyQuery);
assert.equal(new URLSearchParams(slpOnlyQuery).get("recover"), "0");
assert.equal(new URLSearchParams(slpOnlyQuery).has("grace"), false);
assert.equal(new URLSearchParams(slpOnlyQuery).has("jr90"), false);
assert.equal(slpOnly.overrides.jrYieldShareAtTargetPct, null);
assert.equal(slpOnly.overrides.slpYieldShareAtTargetPct, 5);

const juniorOnlyQuery = buildDayV3Query({
  ...reported,
  immediateExitSharePct: 0,
  minimumProceedsPer100: null,
  overrides: {
    ...reported.overrides,
    jrYieldShareAtTargetPct: 12,
    slpYieldShareAtTargetPct: 5,
  },
});
const juniorOnly = readDayV3UrlState(juniorOnlyQuery);
assert.equal(new URLSearchParams(juniorOnlyQuery).get("receive"), "0");
assert.equal(new URLSearchParams(juniorOnlyQuery).get("recover"), "20");
assert.equal(new URLSearchParams(juniorOnlyQuery).has("slp90"), false);
assert.equal(new URLSearchParams(juniorOnlyQuery).has("settle"), false);
assert.equal(new URLSearchParams(juniorOnlyQuery).has("convert"), false);
assert.equal(new URLSearchParams(juniorOnlyQuery).has("convertCost"), false);
assert.equal(juniorOnly.overrides.jrYieldShareAtTargetPct, 12);
assert.equal(juniorOnly.overrides.slpYieldShareAtTargetPct, null);

const immediateObservationQuery = buildDayV3Query({
  ...reported,
  recoveryDays: 0,
});
assert.equal(
  new URLSearchParams(immediateObservationQuery).get("recover"),
  "0",
  "the unified simulator preserves deliberate realize-immediately observation",
);

const unresolvedObservationQuery = buildDayV3Query({
  ...reported,
  recoveryDays: null,
});
assert.equal(
  new URLSearchParams(unresolvedObservationQuery).has("recover"),
  false,
  "the unified simulator omits observation duration until one is chosen",
);

assert.equal(
  readDayV3UrlState("jr90=70&slp90=40").overrides
    .jrYieldShareAtTargetPct,
  null,
  "over-budget Simple target shares are rejected",
);
assert.equal(
  Object.values(
    readDayV3UrlState("jr0=-1&jr90=NaN&jr100=101&slp0=-1&slp90=x&slp100=101")
      .overrides,
  )
    .slice(-6)
    .every((value) => value === null),
  true,
);
for (const invalidCurves of [
  "jr0=12&jr90=4&jr100=18&slp0=1&slp90=5&slp100=14",
  "jr0=2&jr90=12&jr100=70&slp0=1&slp90=5&slp100=40",
  "jr0=2&jr90=12&jr100=18",
]) {
  assert.equal(
    Object.values(readDayV3UrlState(invalidCurves).overrides)
      .slice(-6)
      .every((value) => value === null),
    true,
  );
}

const malformed = readDayV3UrlState(
  "m=custom&apy=NaN&protect=999&recover=1.5&exit=-1&receive=101&target=bad",
);
assert.equal(malformed.sourceApyPct, null);
assert.equal(malformed.protectedDrawdownPct, null);
assert.equal(malformed.recoveryDays, null);
assert.equal(malformed.immediateExitSharePct, null);
assert.equal(malformed.minimumProceedsPer100, null);
assert.equal(malformed.target, null);
assert.equal(readDayV3UrlState("exit=0").immediateExitSharePct, 0);
assert.equal(readDayV3UrlState("protect=0").protectedDrawdownPct, 0);
const disabledFeatures = readDayV3UrlState(
  buildDayV3Query({
    ...reported,
    protectedDrawdownPct: 0,
    recoveryDays: 0,
    immediateExitSharePct: 0,
    minimumProceedsPer100: 0,
  }),
);
assert.equal(disabledFeatures.protectedDrawdownPct, 0);
assert.equal(disabledFeatures.recoveryDays, 0);
assert.equal(disabledFeatures.fixedTermGraceDays, null);
assert.equal(disabledFeatures.immediateExitSharePct, 0);
assert.equal(disabledFeatures.minimumProceedsPer100, 0);
assert.equal(disabledFeatures.overrides.jrYieldShareAtTargetPct, null);
assert.equal(disabledFeatures.overrides.slpYieldShareAtTargetPct, null);
assert.equal(
  readDayV3UrlState("settle=0&convert=-1&convertCost=10000&grace=195")
    .entryPointSettlementDays,
  null,
);

// Existing V3 mode and `redeem` links remain readable. Canonical links omit
// mode and use only the precise, model-driving settlement name.
assert.equal(readDayV3UrlState("mode=deploy").mode, "deploy");
assert.equal(query.includes("mode="), false);
assert.equal(readDayV3UrlState("redeem=7").entryPointSettlementDays, 7);
assert.equal(query.includes("settle=7"), true);
assert.equal(query.includes("redeem="), false);


// The quote asset, its yield, and the refill-check terms are modeled inputs:
// they move SLP carry, the position comparison, and the refill verdict, so a
// link that dropped them would describe a different market.
const quote = readDayV3UrlState(query);
assert.equal(quote.quoteAssetLabel, "sUSDS");
assert.equal(quote.quoteAssetYieldPct, 4.5);
assert.equal(quote.marketMakerCostOfCapitalPct, 12);
assert.equal(quote.redemptionDays, 7);

// Free text is the only string this contract carries and it is rendered back
// into the page, so it is bounded and stripped rather than trusted.
assert.equal(
  readDayV3UrlState("quote=%3Cscript%3Ealert(1)%3C%2Fscript%3E").quoteAssetLabel,
  "scriptalert1script",
);
assert.equal(readDayV3UrlState("quote=%20%20").quoteAssetLabel, null);
assert.equal(
  readDayV3UrlState(`quote=${"A".repeat(80)}`).quoteAssetLabel?.length,
  24,
);
assert.equal(readDayV3UrlState("quoteApy=-1&mmCost=101&mmDays=400").quoteAssetYieldPct, null);

// The pool fee's bounds are what keep `previewSecondarySell` from throwing
// INVALID_SWAP_FEE inside a render-time memo, so they are asserted at the edge
// rather than assumed. Zero is out of range: a zero-fee pool is not a design
// this simulator offers, and 0.01 is the canonical service's own floor.
assert.equal(readDayV3UrlState("fee=30").swapFeeBps, 30);
assert.equal(readDayV3UrlState("fee=0").swapFeeBps, null);
assert.equal(readDayV3UrlState("fee=0.01").swapFeeBps, 0.01);
assert.equal(readDayV3UrlState("fee=1000").swapFeeBps, 1_000);
assert.equal(readDayV3UrlState("fee=1001").swapFeeBps, null);
assert.equal(readDayV3UrlState("fee=-5").swapFeeBps, null);
assert.equal(readDayV3UrlState("fee=abc").swapFeeBps, null);
assert.equal(readDayV3UrlState("").swapFeeBps, null);
assert.equal(
  buildDayV3Query({ ...reported, swapFeeBps: null }).includes("fee="),
  false,
  "an inherited fee is never written as a stated one",
);
assert.equal(
  new URLSearchParams(buildDayV3Query({ ...reported, swapFeeBps: 0.01 })).get(
    "fee",
  ),
  "0.01",
);
assert.equal(readDayV3UrlState("mmCost=101").marketMakerCostOfCapitalPct, null);
assert.equal(readDayV3UrlState("mmDays=400").redemptionDays, null);
assert.equal(readDayV3UrlState("mmDays=7.5").redemptionDays, null);

// With no immediate exit there is no pool, no quote side, and nothing to
// arbitrage, so none of it belongs in the link.
const noExitQuery = buildDayV3Query({
  ...readDayV3UrlState(query),
  immediateExitSharePct: 0,
});
for (const dropped of ["quote", "quoteApy", "fee", "mmCost", "mmDays"]) {
  assert.equal(
    new URLSearchParams(noExitQuery).has(dropped),
    false,
    `${dropped} must not survive an exit-off design`,
  );
}

// Moving one yield-split slider writes one parameter, because the writer only
// serializes an override the reader actually made. Requiring the other tranche's
// target to be present threw that link's only override away on reload.
{
  const jrOnly = readDayV3UrlState("m=custom&apy=8&protect=20&exit=10&jr90=20");
  assert.equal(
    jrOnly.overrides.jrYieldShareAtTargetPct,
    20,
    "a Junior-only target must survive a market that also has an exit",
  );
  assert.equal(jrOnly.overrides.slpYieldShareAtTargetPct, null);

  const slpOnly = readDayV3UrlState("m=custom&apy=8&protect=20&exit=10&slp90=15");
  assert.equal(
    slpOnly.overrides.slpYieldShareAtTargetPct,
    15,
    "an SLP-only target must survive a market that also has protection",
  );
  assert.equal(slpOnly.overrides.jrYieldShareAtTargetPct, null);

  // The over-budget guard still applies to whatever the link does carry.
  assert.equal(
    readDayV3UrlState("m=custom&apy=8&protect=20&exit=10&jr90=120")
      .overrides.jrYieldShareAtTargetPct,
    null,
    "an out-of-range target is still rejected",
  );
}

// A swap fee arriving by link is bounded exactly like the field, because a link
// is a way into the app and not a way around it. 10000 bps compounded modeled
// fee income past what the engine can hold and took the backtest down.
assert.equal(readDayV3UrlState("m=custom&apy=8&fee=10000").swapFeeBps, null);

// The pool's balance point, carried as the premium that sets it. Bounded to the
// range the deploy step accepts, so a link cannot describe a market that cannot
// ship. Pinned in both directions: without this, deleting either the reader or
// the writer left the whole suite green while a shared link silently reverted
// the pool.
assert.equal(readDayV3UrlState("premiumBps=30").poolPremiumBps, 30);
assert.equal(readDayV3UrlState("premiumBps=0.01").poolPremiumBps, 0.01);
assert.equal(readDayV3UrlState("premiumBps=50").poolPremiumBps, 50);
assert.equal(readDayV3UrlState("premiumBps=50.1").poolPremiumBps, null);
assert.equal(readDayV3UrlState("premiumBps=0").poolPremiumBps, null);
assert.equal(readDayV3UrlState("premiumBps=-5").poolPremiumBps, null);
assert.equal(readDayV3UrlState("premiumBps=abc").poolPremiumBps, null);
assert.equal(readDayV3UrlState("m=custom&apy=8").poolPremiumBps, null);
{
  const written = buildDayV3Query({ ...reported, poolPremiumBps: 30 });
  assert.match(written, /premiumBps=30/);
  assert.equal(readDayV3UrlState(written).poolPremiumBps, 30);
  assert.ok(
    !buildDayV3Query({ ...reported, poolPremiumBps: null }).includes("premiumBps="),
    "an unset premium is never serialized",
  );
}

// The pricing-model explorer's two contract-shape selections are shareable
// design state. The presentation-only premium and pressure toggles stay local.
{
  const modelState = readDayV3UrlState(
    "m=custom&jrModel=ADAPTIVE_CURVE_V1&slpModel=FIXED",
  );
  assert.equal(modelState.jrCurveModel, "ADAPTIVE_CURVE_V1");
  assert.equal(modelState.slpCurveModel, "FIXED");

  const modelQuery = buildDayV3Query({
    ...modelState,
    jrCurveModel: "ADAPTIVE_CURVE_V2",
    slpCurveModel: "STATIC_CURVE",
  });
  const modelParams = new URLSearchParams(modelQuery);
  assert.equal(modelParams.get("jrModel"), "ADAPTIVE_CURVE_V2");
  assert.equal(modelParams.get("slpModel"), "STATIC_CURVE");
  assert.equal(readDayV3UrlState(modelQuery).jrCurveModel, "ADAPTIVE_CURVE_V2");
  assert.equal(readDayV3UrlState(modelQuery).slpCurveModel, "STATIC_CURVE");
  assert.equal(readDayV3UrlState("jrModel=not-a-model").jrCurveModel, undefined);
}

console.log("Day V3 independent goal URL state: PASS");
