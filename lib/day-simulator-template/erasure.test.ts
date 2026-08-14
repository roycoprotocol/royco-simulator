import { Sim, defaultConfig } from '../day/engine/runner';
import { MarketState } from '../day/engine/types';
import { buildDayErasureEvent, formatDayErasureLabel } from './erasure';
import { shouldRefillJunior } from './refill';

let passed = 0;
let failed = 0;

const approx = (actual: number, expected: number, tolerance = 1e-9) =>
  Math.abs(actual - expected) <= tolerance;

const check = (label: string, condition: boolean, detail = '') => {
  if (condition) {
    passed += 1;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    failed += 1;
    console.error(`  \x1b[31m✗\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

console.log('\nDay erasure chart adapter — structured amount and pre-refill geometry');

check(
  'ordinary PERPETUAL checkpoints do not trigger a Junior refill',
  !shouldRefillJunior(true, MarketState.PERPETUAL, MarketState.PERPETUAL),
);
check(
  'entering an observation does not trigger a Junior refill',
  !shouldRefillJunior(true, MarketState.PERPETUAL, MarketState.FIXED_TERM),
);
check(
  'closing an observation triggers a Junior refill when enabled',
  shouldRefillJunior(true, MarketState.FIXED_TERM, MarketState.PERPETUAL),
);
check(
  'the user toggle disables an otherwise eligible post-observation refill',
  !shouldRefillJunior(false, MarketState.FIXED_TERM, MarketState.PERPETUAL),
);

const coverage = 0.03;
const cfg = defaultConfig({
  coverage,
  beta: 1,
  fixedTermDurationSec: 7 * 86_400,
  liquidationUtilization: 100,
});
const senior = 1_000;
const junior = (senior * coverage) / (cfg.targetUtilization - coverage);
const sim = new Sim(cfg, { st: senior, jt: junior, lt: senior * (0.15 / 0.9) });
const first = sim.last();

sim.step({ dtSec: 86_400, stReturn: -0.01, jtReturn: -0.01 });
check('covered loss enters the observation period', sim.last().state === MarketState.FIXED_TERM);

const eventStart = sim.events.length;
sim.step({ dtSec: 8 * 86_400, stReturn: 0, jtReturn: 0 });
const preRefill = sim.last();
const stepEvents = sim.events.slice(eventStart);
const erasure = stepEvents.find((event) => event.kind === 'jt-il-erased');
const observationExit = stepEvents.find((event) => event.kind === 'exit-fixed-term');
const erasedAmount = erasure?.amountNAV ?? 0;
const navPerIndexPoint = (sim.state.jtShares * first.jtPrice) / 100;

check(
  'engine emits an exact structured erased amount',
  approx(erasedAmount, (senior + junior) * 0.01),
  `amount=${erasedAmount}`,
);
check('engine emits a structured Observation Period exit reason', observationExit?.observationExitReason === 'period-ended');
check('display text formatting is not used as accounting data', erasure?.msg.includes('$10') === true);

const numerator =
  coverage * (sim.state.stRawNAV + sim.state.jtRawNAV) -
  cfg.targetUtilization * sim.state.jtEffectiveNAV;
const denominator = cfg.targetUtilization - coverage;
const refill = numerator / denominator;
sim.step({
  dtSec: 0,
  stReturn: 0,
  jtReturn: 0,
  op: { type: 'jtDeposit', amount: refill },
});
const postRefill = sim.last();
const juniorIndex = (postRefill.jtPrice / first.jtPrice) * 100;
const event = buildDayErasureEvent({
  index: 2,
  date: '2025-01-10',
  currentJuniorIndex: juniorIndex,
  erasedAmount,
  preRefillJuniorNAV: preRefill.jtEffectiveNAV,
  navPerIndexPoint,
  reason: 'observation period ended',
});

const expectedPreRefillPct = (erasedAmount / preRefill.jtEffectiveNAV) * 100;
const incorrectPostRefillPct = (erasedAmount / postRefill.jtEffectiveNAV) * 100;
check('same-timestamp refill increases Junior NAV', postRefill.jtEffectiveNAV > preRefill.jtEffectiveNAV);
check(
  'tooltip percentage uses pre-refill Junior NAV',
  approx(event.forfeitPctOfJuniorNav, expectedPreRefillPct),
  `actual=${event.forfeitPctOfJuniorNav} expected=${expectedPreRefillPct}`,
);
check(
  'tooltip percentage does not use post-refill Junior NAV',
  !approx(event.forfeitPctOfJuniorNav, incorrectPostRefillPct),
);
check('I-beam has non-zero height', event.forfeitIndexPts > 0);
check(
  'I-beam lower endpoint lands on the Junior index',
  approx(event.top - event.forfeitIndexPts, juniorIndex),
);
check(
  'material erasures retain the Dawn percentage label',
  formatDayErasureLabel(event.forfeitPctOfJuniorNav) === `erased −${event.forfeitPctOfJuniorNav.toFixed(0)}%`,
);
check(
  'sub-4% realized losses still receive an erased label',
  formatDayErasureLabel(0.1) === 'erased −0.1%',
);
check(
  'very small realized losses never render as erased −0%',
  formatDayErasureLabel(0.004) === 'erased <0.01%',
);

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
