// =============================================================================
// Royco Day — simulation runner & scenario presets
// =============================================================================

import {
  type MarketConfig,
  type LiveState,
  type PublicLiveState,
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
  previewSecondarySell,
  protocolFeeValue,
  publicState,
} from "./engine";
import { YEAR_SEC } from "./ydm";
import { applyReturn } from "./wad";

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
  private _state: LiveState;
  cfg: MarketConfig;
  history: Snapshot[] = [];
  events: SimEvent[] = [];

  get state(): PublicLiveState {
    return publicState(this._state);
  }

  get protocolFeeNAV() {
    return protocolFeeValue(this._state, this.cfg);
  }

  previewSecondarySell(amount: number) {
    return previewSecondarySell(this._state, this.cfg, amount);
  }

  constructor(cfg: MarketConfig, init: { st: number; jt: number; lt: number }) {
    this.cfg = cfg;
    this._state = newMarket(cfg, init);
    this.events.push({ t: 0, kind: "init", msg: `Market opened: ST ${init.st}, JT ${init.jt}, SLP ${init.lt}. Coverage ${(cfg.coverage * 100).toFixed(0)}%, β ${cfg.beta}.`, level: "good" });
    this.snap(0, 0);
  }

  private snap(riskShare: number, liqShare: number) {
    this.history.push(snapshot(this._state, this.cfg, riskShare, liqShare));
  }

  step(input: StepInput) {
    if (input.dtSec < 0) throw new Error("INVALID_STEP: elapsed time cannot be negative");
    if (input.stReturn < -1 || input.jtReturn < -1) {
      throw new Error("INVALID_STEP: a tranche raw NAV cannot fall below zero");
    }
    const s = this._state;
    s.t += BigInt(Math.round(input.dtSec));
    const newStRaw = applyReturn(s.stRawNAV, input.stReturn);
    const newJtRaw = applyReturn(s.jtRawNAV, input.jtReturn);

    accruePoolCarry(s, this.cfg, input.dtSec);
    const ex = reconcile(s, this.cfg, newStRaw, newJtRaw);
    this.events.push(...ex.events);

    const op = input.op ?? { type: "none" };
    const res = applyOp(s, this.cfg, op);
    if (res) this.events.push(...res.events);

    if (input.label) this.events.push({ t: Number(s.t), kind: "accrue", msg: input.label, level: "info" });
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
  const cfg: MarketConfig = {
    coverage: 0.2,
    beta: 0, // engine-neutral default for the test harness; the product UI locks beta=1 (JT co-invested)
    targetUtilization: 0.9,
    liquidationUtilization: 1.5,
    fixedTermDurationSec: 30 * 24 * 3600,
    stProtocolFee: 0,
    jtProtocolFee: 0,
    yieldShareProtocolFee: 0,
    ltYieldShareProtocolFee: 0,
    riskYDM: { mode: "static", y0: 0.35, yTarget: 0.35, y100: 0.35 },
    maxJTYieldShare: 0.35,
    minLiquidity: 0.12,
    liqTargetUtilization: 0.9,
    liqYDM: { mode: "static", y0: 0.12, yTarget: 0.12, y100: 0.12 },
    maxLTYieldShare: 0.12,
    stableYield: 0.035,
    swapFeeBps: 10,
    poolTurnoverPerYear: 8,
    eclpBandWidth: 0.1,
    reinvestLiquidityPremium: true,
    stSelfLiquidationBonus: 0.02,
    dustTolerance: 1e-6,
    ...over,
  };
  // When a caller replaces a curve but omits the contract cap, derive the
  // least-restrictive cap that preserves every configured curve endpoint.
  if (over.maxJTYieldShare === undefined) {
    cfg.maxJTYieldShare = Math.max(cfg.riskYDM.y0, cfg.riskYDM.yTarget, cfg.riskYDM.y100);
  }
  if (over.maxLTYieldShare === undefined) {
    cfg.maxLTYieldShare = Math.max(cfg.liqYDM.y0, cfg.liqYDM.yTarget, cfg.liqYDM.y100);
  }
  if (cfg.maxJTYieldShare + cfg.maxLTYieldShare > 1 + 1e-12) {
    throw new Error("INVALID_YIELD_SHARE_CONFIG: maximum JT and SLP shares exceed 100%");
  }
  return cfg;
}

// A year-long monthly accrual at a given APY (split across 12 months).
export function steadyYear(apy: number, jtBeta: number, stableYield = 0.035): StepInput[] {
  const dt = YEAR_SEC / 12;
  const stR = Math.pow(1 + apy, 1 / 12) - 1;
  const jtAnnualReturn = jtBeta === 1 ? apy : stableYield;
  const jtR = Math.pow(1 + jtAnnualReturn, 1 / 12) - 1;
  return Array.from({ length: 12 }, () => ({ dtSec: dt, stReturn: stR, jtReturn: jtR }));
}
