export type Direction = 'exit' | 'enter';

export type PoolState = {
  internalShares: number;
  quoteReserves: number;
  stShares: number;
  stRawCheckpoint: number;
  jtRawCheckpoint: number;
  stEffectiveNav: number;
  jtEffectiveNav: number;
  stIL: number;
  jtIL: number;
};

export type RawNavSnapshot = {
  ST_RAW_NAV: number;
  JT_RAW_NAV: number;
  totalNav: number;
  stAssets: number;
  perShareRaw: number;
  externalShares: number;
  effectiveSupply: number;
  shareNavInPool: number;
  quoteNavInPool: number;
  poolSizeNav: number;
  poolPrice: number;
};

export type EclpConfig = {
  params: {
    alpha: bigint;
    beta: bigint;
    c: bigint;
    s: bigint;
    lambda: bigint;
  };
  derived: {
    tauAlpha: { x: bigint; y: bigint };
    tauBeta: { x: bigint; y: bigint };
    u: bigint;
    v: bigint;
    w: bigint;
    z: bigint;
    dSq: bigint;
  };
  float: {
    alpha: number;
    beta: number;
    lambda: number;
    phi: number;
    c: number;
    s: number;
    tauAlpha: { x: number; y: number };
    tauBeta: { x: number; y: number };
    u: number;
    v: number;
    w: number;
    z: number;
    dSq: number;
  };
};

export const NAV_EPS: number;

export function clampUnit(n: number): number;
export function balancePoolPriceFromCashPct(cashPct: number): number;
export function exitIsImbalancingAt(poolPrice: number, balancePoolPrice: number): boolean;
export function makeEclpConfig(alpha: number, beta: number, lambda: number, phi: number): EclpConfig | null;
export function eclpReservesAtPrice(
  alpha: number,
  beta: number,
  lambda: number,
  phi: number,
  spotPrice?: number,
): { shareNav: number; quoteNav: number; quoteFrac: number } | null;
export function translateTargetCashToEclpBounds(
  targetCashPct: number,
  rangeTolerancePct: number,
  lambda: number,
  phi: number,
  spotPrice?: number,
): { alpha: number; beta: number; quoteFrac: number } | null;
export function computeEclpSpotPrice(
  shareNavInPool: number,
  quoteNavInPool: number,
  alpha: number,
  beta: number,
  lambda: number,
  phi: number,
): number;
export function quoteEclpSwap(
  shareNavInPool: number,
  quoteNavInPool: number,
  amountInNav: number,
  direction: Direction,
  swapFeeRate: number,
  eclpConfig: EclpConfig | null,
): {
  feeNav: number;
  sigmaNav: number;
  counterValueNav: number;
  feasible: boolean;
};

export function computeKappa(
  effectivePrice: number,
  alpha: number,
  beta: number,
  lambda: number,
  phi: number,
  direction: Direction,
  poolSizeNav: number,
): number;

export function rawNavFromState(
  state: PoolState,
  assetPrice: number,
  quotePrice: number,
  eclpConfig?: EclpConfig | null,
): RawNavSnapshot;

export function poolReservesAtBalance(
  shareNavInPool: number,
  quoteNavInPool: number,
  eclpConfig: EclpConfig | null,
  balancePoolPrice?: number,
): { balShareNav: number; balQuoteNav: number };

export function coverageNavAtBalance(
  state: PoolState,
  assetPrice: number,
  quotePrice: number,
  eclpConfig: EclpConfig | null,
  balancePoolPrice?: number,
): number;

export function applyDuskWaterfall(
  checkpoint: Pick<PoolState, 'stRawCheckpoint' | 'jtRawCheckpoint' | 'stEffectiveNav' | 'jtEffectiveNav' | 'stIL' | 'jtIL'>,
  currentRaw: RawNavSnapshot,
  ydmShare: number,
): Pick<PoolState, 'stEffectiveNav' | 'jtEffectiveNav' | 'stIL' | 'jtIL'>;

export function syncAccountingOnBefore(
  state: PoolState,
  assetPrice: number,
  quotePrice: number,
  ydmShare: number,
  eclpConfig?: EclpConfig | null,
): PoolState;

export function syncAccountingOnAfter(
  before: PoolState,
  afterMutation: PoolState,
  assetPrice: number,
  quotePrice: number,
  ydmShare: number,
  eclpConfig?: EclpConfig | null,
): PoolState;

export function simulateTrade(
  state: PoolState,
  tNav: number,
  direction: Direction,
  perShareNav: number,
  quotePrice: number,
  swapFeeRate: number,
  eclpConfig: EclpConfig | null,
  balancePoolPrice: number,
): {
  feeNav: number;
  sigmaNav: number;
  isImbalancing: boolean;
  newState: PoolState;
  jtEffDelta: number;
  feasible: boolean;
};

export function initialPoolState(
  seniorTrancheSize: number,
  juniorTrancheSize: number,
  juniorCashPct: number,
  assetPrice: number,
  quotePrice: number,
): PoolState;
