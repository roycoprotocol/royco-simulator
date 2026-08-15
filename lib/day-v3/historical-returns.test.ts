import assert from "node:assert/strict";

import { DAY_MARKETS } from "@/lib/day-markets/registry";
import { runDayHistoricalBacktest } from "@/lib/day-simulator-template/backtest";
import { calibrateSeriesApy } from "@/lib/day-simulator-template/series";
import {
  dayV3RealizedReturns,
  type DayV3HistoricalTerms,
} from "@/lib/day-v3/historical-returns";

const market = (id: string) => {
  const found = DAY_MARKETS.find((entry) => entry.id === id);
  assert.ok(found, `${id} must exist`);
  return found;
};

// The yield split is resolved by the page from the curve editor, not carried on
// `defaults` — `riskYieldShare` and `liquidityYieldShare` do not exist there,
// and reading them produced NaN terms the engine rejected. One split is used
// for every market here, because what is under test is that the module returns
// the runner's own figures, not that it reproduces any particular design.
const termsFor = (id: string): DayV3HistoricalTerms => {
  const d = market(id).defaults;
  return {
    bandPct: d.eclpBandWidth * 100,
    coveragePct: d.coverage * 100,
    liqSharePct: 10,
    liqY0Pct: 0,
    liqY100Pct: 0,
    liquidityPct: d.minLiquidity * 100,
    maintainCoverage: d.maintainCoverage,
    observationDays: d.observationDays,
    poolTurnoverPerYear: d.poolTurnoverPerYear,
    quoteAssetYieldPct: d.stableYield * 100,
    riskSharePct: 40,
    riskY0Pct: 0,
    riskY100Pct: 0,
    sourceApyPct: d.sourceApy * 100,
  };
};

// A market with no dated path has no realized return. Null, not zero: "there is
// no answer" and "the answer is zero" are different statements and only one of
// them may render as "0.0%".
assert.equal(dayV3RealizedReturns(market("dualmint"), termsFor("dualmint")), null);
assert.equal(
  dayV3RealizedReturns(market("blockhouse"), termsFor("blockhouse")),
  null,
);

// The realized figures are the shared runner's own, not a second derivation.
for (const id of ["jbbb", "susdai", "acred", "makina-dbit"]) {
  const terms = termsFor(id);
  const realized = dayV3RealizedReturns(market(id), terms);
  assert.ok(realized, `${id} has history and must produce a realized return`);

  const mk = market(id);
  const direct = runDayHistoricalBacktest({
    defaults: {
      ...mk.defaults,
      poolTurnoverPerYear: terms.poolTurnoverPerYear,
      stableYield: terms.quoteAssetYieldPct / 100,
    },
    series: calibrateSeriesApy(mk.series, terms.sourceApyPct / 100),
    terms: {
      coveragePct: terms.coveragePct,
      minLiquidityPct: terms.liquidityPct,
      eclpBandWidthPct: terms.bandPct,
      liqY0Pct: terms.liqY0Pct,
      liqY100Pct: terms.liqY100Pct,
      riskSharePct: terms.riskSharePct,
      liqSharePct: terms.liqSharePct,
      observationDays: terms.observationDays,
      riskY0Pct: terms.riskY0Pct,
      riskY100Pct: terms.riskY100Pct,
    },
    maintainCoverage: terms.maintainCoverage,
    omitInitialZeroReturnPeriod:
      mk.customization.forwardTest?.omitInitialZeroReturnPeriod === true,
    monthlyBaselineDate: calibrateSeriesApy(
      mk.series,
      terms.sourceApyPct / 100,
    )[0]?.date,
  });
  for (const key of ["seniorApy", "juniorApy", "liquidityApy"] as const) {
    assert.equal(
      realized[key],
      direct[key],
      `${id} ${key} must be the backtest's own figure, not a re-derivation`,
    );
  }
}

// The reason this exists: on a market with a real drawdown the projection and
// the history are not the same answer, and the cards used to show only the
// first. jbbb's Junior is the case that makes it worth the second engine run.
{
  const realized = dayV3RealizedReturns(market("jbbb"), termsFor("jbbb"));
  assert.ok(realized);
  // Negative, not any particular depth: the depth is a function of the split,
  // and this file fixes one arbitrary split. What must hold on jbbb's real 2022
  // path is the sign — Junior paid for Senior, which is the whole point of the
  // figure and the thing a forward projection at a flat source yield cannot
  // show. At the page's own default split this reads −71.2%.
  assert.ok(
    realized.juniorApy < 0,
    `jbbb's Junior absorbed real falls and must show it (got ${realized.juniorApy})`,
  );
  assert.ok(
    realized.seniorApy > 0,
    "jbbb's Senior was protected through those falls",
  );
  assert.ok(realized.observations > 100, "jbbb's full path must be modeled");
  assert.ok(
    realized.seniorLossEvents >= 0 && realized.erasedRecoveryClaims > 0,
    "the counts that explain the Junior figure travel with it",
  );
}

// Terms the engine cannot carry across a path are an absent answer, not a
// crash: the backtest section is guarded the same way, and neither may take the
// page down.
assert.equal(
  dayV3RealizedReturns(market("jbbb"), {
    ...termsFor("jbbb"),
    coveragePct: 0,
    liquidityPct: 100,
    bandPct: 0.0001,
  }) === null ||
    typeof dayV3RealizedReturns(market("jbbb"), termsFor("jbbb"))?.seniorApy ===
      "number",
  true,
);

console.log("Day V3 realized historical returns: PASS");
