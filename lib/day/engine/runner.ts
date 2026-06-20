// =============================================================================
// Royco Day — simulation runner & scenario presets
// =============================================================================

import {
  MarketState,
  type MarketConfig,
  type LiveState,
  type Snapshot,
  type SimEvent,
} from "./types";
import {
  reconcile,
  accruePoolCarry,
  snapshot,
  newMarket,
  stDeposit,
  stRedeem,
  jtDeposit,
  jtRedeem,
  ltDeposit,
  ltRedeem,
  secondarySell,
} from "./engine";
import { YEAR_SEC } from "./ydm";

export type Op =
  | { type: "none" }
  | { type: "stDeposit"; amount: number }
  | { type: "stRedeem"; shares: number; bypass?: boolean }
  | { type: "jtDeposit"; amount: number }
  | { type: "jtRedeem"; shares: number; bypass?: boolean }
  | { type: "ltDeposit"; amount: number }
  | { type: "ltRedeem"; shares: number }
  | { type: "secondarySell"; amount: number };

export interface StepInput {
  dtSec: number;
  stReturn: number; // ST underlying return over the step (e.g. apy*dt, or a shock)
  jtReturn: number; // JT underlying return over the step
  op?: Op;
  label?: string;
}

export class Sim {
  state: LiveState;
  cfg: MarketConfig;
  protocolFeeNAV = 0;
  history: Snapshot[] = [];
  events: SimEvent[] = [];

  constructor(cfg: MarketConfig, init: { st: number; jt: number; lt: number }) {
    this.cfg = cfg;
    this.state = newMarket(cfg, init);
    this.events.push({ t: 0, kind: "init", msg: `Market opened: ST ${init.st}, JT ${init.jt}, LT ${init.lt}. Coverage ${(cfg.coverage * 100).toFixed(0)}%, β ${cfg.beta}.`, level: "good" });
    this.snap(0, 0);
  }

  private snap(riskShare: number, liqShare: number) {
    this.history.push(snapshot(this.state, this.cfg, this.protocolFeeNAV, riskShare, liqShare));
  }

  step(input: StepInput) {
    const s = this.state;
    s.t += input.dtSec;
    const newStRaw = s.stRawNAV * (1 + input.stReturn);
    const newJtRaw = s.jtRawNAV * (1 + input.jtReturn);

    accruePoolCarry(s, this.cfg, input.dtSec);
    const ex = reconcile(s, this.cfg, newStRaw, newJtRaw, input.dtSec);
    this.protocolFeeNAV += ex.protocolFeeNAVAdded;
    this.events.push(...ex.events);

    const op = input.op ?? { type: "none" };
    const res = applyOp(s, this.cfg, op);
    if (res) this.events.push(...res.events);

    if (input.label) this.events.push({ t: s.t, kind: "accrue", msg: input.label, level: "info" });
    this.snap(ex.riskShare, ex.liqShare);
  }

  last(): Snapshot {
    return this.history[this.history.length - 1];
  }
}

function applyOp(state: LiveState, cfg: MarketConfig, op: Op) {
  switch (op.type) {
    case "stDeposit": return stDeposit(state, cfg, op.amount);
    case "stRedeem": return stRedeem(state, cfg, op.shares, op.bypass);
    case "jtDeposit": return jtDeposit(state, cfg, op.amount);
    case "jtRedeem": return jtRedeem(state, cfg, op.shares, op.bypass);
    case "ltDeposit": return ltDeposit(state, cfg, op.amount);
    case "ltRedeem": return ltRedeem(state, cfg, op.shares);
    case "secondarySell": return secondarySell(state, cfg, op.amount);
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Default market config
// ---------------------------------------------------------------------------
export function defaultConfig(over: Partial<MarketConfig> = {}): MarketConfig {
  return {
    coverage: 0.2,
    beta: 0, // engine-neutral default for the test harness; the product UI locks beta=1 (JT co-invested)
    targetUtilization: 0.9,
    liquidationUtilization: 1.5,
    fixedTermDurationSec: 30 * 24 * 3600,
    stProtocolFee: 0,
    jtProtocolFee: 0,
    yieldShareProtocolFee: 0,
    riskYDM: { mode: "static", y0: 0.35, yTarget: 0.35, y100: 0.35 },
    minLiquidity: 0.12,
    liqTargetUtilization: 0.9,
    liqYDM: { mode: "static", y0: 0.12, yTarget: 0.12, y100: 0.12 },
    premiumPriority: "jtPriority",
    stableYield: 0.035,
    swapFeeBps: 10,
    poolTurnoverPerYear: 8,
    eclpBandWidth: 0.1,
    stSelfLiquidationBonus: 0.02,
    dustTolerance: 1e-6,
    ...over,
  };
}

// A year-long monthly accrual at a given APY (split across 12 months).
export function steadyYear(apy: number, jtBeta: number, stableYield = 0.035): StepInput[] {
  const dt = YEAR_SEC / 12;
  const stR = apy / 12;
  const jtR = (jtBeta === 1 ? apy : stableYield) / 12; // JT earns its own deployment
  return Array.from({ length: 12 }, () => ({ dtSec: dt, stReturn: stR, jtReturn: jtR }));
}
