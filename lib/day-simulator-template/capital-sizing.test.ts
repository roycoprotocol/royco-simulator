import assert from 'node:assert/strict';

import { Sim } from '@/lib/day/engine/runner';
import { DAY_MARKETS } from '@/lib/day-markets/registry';
import {
  dayCapitalAtUtilization,
  dayCapitalInYieldSource,
  dayPoolSeniorWeight,
} from '@/lib/day-simulator-template/capital-sizing';
import {
  buildDayInitialBalances,
  buildDayMarketConfig,
} from '@/lib/day-simulator-template/runtime';

let passed = 0;
const check = (label: string, condition: boolean, detail = '') => {
  assert.ok(condition, `${label}${detail ? ` :: ${detail}` : ''}`);
  passed += 1;
};

const TARGET = 0.9;
const rel = (a: number, b: number) => (b === 0 ? Math.abs(a) : Math.abs(a - b) / Math.abs(b));

// ---------------------------------------------------------------------------
// The public target-sizing paths agree across every market
// ---------------------------------------------------------------------------
// The runtime factory delegates to the exact engine inversion. Keep that
// contract pinned so future wiring changes cannot size the rendered market and
// the capital table through different paths.
for (const market of DAY_MARKETS) {
  const defaults = market.defaults;
  for (const coverage of [0, 0.01, 0.05, 0.1, 0.2, 0.25]) {
    for (const minLiquidity of [0, 0.05, 0.1, 0.25]) {
      const terms = { coverage, minLiquidity };
      const engine = buildDayInitialBalances(defaults, terms);
      const solved = dayCapitalAtUtilization(defaults, terms, TARGET);
      check(
        `${market.id} cov=${coverage} liq=${minLiquidity}: Jr matches the engine at the target`,
        rel(solved.jt, engine.jt) < 1e-9,
        `solved ${solved.jt} vs engine ${engine.jt}`,
      );
      check(
        `${market.id} cov=${coverage} liq=${minLiquidity}: pool matches the engine at the target`,
        rel(solved.lt, engine.lt) < 1e-9,
        `solved ${solved.lt} vs engine ${engine.lt}`,
      );
      check(
        `${market.id} cov=${coverage} liq=${minLiquidity}: Sr is untouched`,
        solved.st === engine.st,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// The floor is below the target, and is the requirement met exactly
// ---------------------------------------------------------------------------
const jbbb = DAY_MARKETS.find((m) => m.id === 'jbbb')!.defaults;

// Decimal requirements close to the 90% target used to be sized a few wei
// short by the UI's float formula, even though the exact engine inversion found
// a valid stack. These are the manual-override values that previously crashed
// during server rendering.
for (const coverage of [0.5001, 0.8, 0.8999]) {
  const terms = {
    coverage,
    minLiquidity: 0.1,
    eclpBandWidth: jbbb.eclpBandWidth,
    observationDays: jbbb.observationDays,
    riskYieldShare: jbbb.riskYDM.yTarget,
    liquidityYieldShare: jbbb.liqYDM.yTarget,
  };
  const balances = buildDayInitialBalances(jbbb, terms);
  const cfg = buildDayMarketConfig(jbbb, terms);
  assert.doesNotThrow(() => new Sim(cfg, balances));
  assert.doesNotThrow(() => dayPoolSeniorWeight(cfg));
  check(
    `cov=${coverage}: exact target balances and pool probe initialize a valid market`,
    balances.jt > 0 && Math.abs(dayPoolSeniorWeight(cfg) - 0.1) < 1e-8,
  );
}

for (const coverage of [0.05, 0.1, 0.2, 0.25]) {
  const terms = { coverage, minLiquidity: 0.1 };
  const target = dayCapitalAtUtilization(jbbb, terms, TARGET);
  const floor = dayCapitalAtUtilization(jbbb, terms, 1);
  check(
    `cov=${coverage}: the 100% floor needs less Junior than the 90% target`,
    floor.jt < target.jt,
    `${floor.jt} vs ${target.jt}`,
  );
  // At 100% utilization the Junior standing is exactly the requirement applied
  // to the exposure it covers: jt = (st + jt) * coverage.
  const exposure = floor.st + floor.jt;
  check(
    `cov=${coverage}: at the floor, Junior is exactly the requirement on the exposure`,
    rel(floor.jt, exposure * coverage) < 1e-6,
    `${floor.jt} vs ${exposure * coverage}`,
  );
}

for (const minLiquidity of [0.05, 0.1, 0.25]) {
  const terms = { coverage: 0.2, minLiquidity };
  const target = dayCapitalAtUtilization(jbbb, terms, TARGET);
  const floor = dayCapitalAtUtilization(jbbb, terms, 1);
  check(
    `liq=${minLiquidity}: the 100% floor needs a smaller pool than the 90% target`,
    floor.lt < target.lt,
    `${floor.lt} vs ${target.lt}`,
  );
  // At 100% the pool is exactly the requirement applied to Senior.
  check(
    `liq=${minLiquidity}: at the floor, the pool is exactly the requirement on Sr`,
    rel(floor.lt, floor.st * minLiquidity) < 1e-6,
    `${floor.lt} vs ${floor.st * minLiquidity}`,
  );
  // And the target sizing carries real headroom over it, which is the reason
  // for showing both.
  check(
    `liq=${minLiquidity}: the target carries headroom over the floor`,
    target.lt / floor.lt > 1.1 && target.lt / floor.lt < 1.12,
    `ratio ${target.lt / floor.lt}`,
  );
}

// ---------------------------------------------------------------------------
// Degenerate settings
// ---------------------------------------------------------------------------
{
  const off = dayCapitalAtUtilization(jbbb, { coverage: 0, minLiquidity: 0 }, 1);
  check('coverage off funds no Junior', off.jt === 0);
  check('liquidity off funds no pool', off.lt === 0);
  check('Senior still stands', off.st === jbbb.initialST);
}

// A market that does not link Junior to the requirement keeps its own size.
{
  const unlinked = { ...jbbb, linkJuniorToFirstLoss: false, initialJT: 1234 };
  const sized = dayCapitalAtUtilization(unlinked, { coverage: 0.2, minLiquidity: 0.1 }, 1);
  check('an unlinked market keeps its shipped Junior size', sized.jt === 1234);
}

console.log(`capital-sizing: ${passed} checks passed`);

// ---------------------------------------------------------------------------
// The pool is not all exit asset
// ---------------------------------------------------------------------------
// A funded pool is partly Senior shares, so it is partly in the yield source.
// Read the composition from the configured E-CLP rather than restating it.
{
  const cfg = buildDayMarketConfig(jbbb, {
    coverage: 0.2,
    minLiquidity: 0.1,
    riskYieldShare: jbbb.riskYDM.yTarget,
    liquidityYieldShare: jbbb.liqYDM.yTarget,
    observationDays: jbbb.observationDays,
    sourceApy: jbbb.sourceApy,
    eclpBandWidth: jbbb.eclpBandWidth,
    maintainCoverage: jbbb.maintainCoverage,
  } as never);
  const weight = dayPoolSeniorWeight(cfg);
  check('the fallback pool is approximately one tenth Senior shares', Math.abs(weight - 0.1) < 1e-8, String(weight));

  const balances = { st: 100, jt: 28.6, lt: 11.1 };
  const inSource = dayCapitalInYieldSource(balances, weight);
  check(
    'in-source capital counts Sr, Jr and the pool Senior leg only',
    Math.abs(inSource - (100 + 28.6 + 11.1 * weight)) < 1e-9,
    String(inSource),
  );
  check(
    'in-source capital is below the total standing',
    inSource < balances.st + balances.jt + balances.lt,
  );
  check(
    'an unfunded pool leaves in-source capital at Sr plus Jr',
    dayCapitalInYieldSource({ st: 100, jt: 28.6, lt: 0 }, weight) === 128.6,
  );
}

console.log(`capital-sizing: ${passed} checks passed (with pool weight)`);
