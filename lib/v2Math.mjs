import { GyroECLPMath } from './vendor/balancer-maths/dist/index.mjs';

export const NAV_EPS = 1e-9;
const FP18_DECIMALS = 18;
const XP_DECIMALS = 38;
const TARGET_COMPOSITION_SEARCH_STEPS = 36;

export const clampUnit = (n) => Math.min(1, Math.max(0, n));

export const balancePoolPriceFromCashPct = (cashPct = 0) => {
  void cashPct;
  return 1;
};

export const exitIsImbalancingAt = (poolPrice, balancePoolPrice) => {
  if (!Number.isFinite(poolPrice) || !Number.isFinite(balancePoolPrice)) return true;
  const eps = Math.max(1e-9, Math.abs(balancePoolPrice) * 1e-6);
  if (Math.abs(poolPrice - balancePoolPrice) <= eps) return true;
  return poolPrice < balancePoolPrice;
};

const fixedScale = (decimals) => 10n ** BigInt(decimals);

const decimalStringToScaledBigInt = (value, decimals) => {
  const scale = fixedScale(decimals);
  const normalized = String(value).trim().replace(/,/g, '');
  if (!normalized) return 0n;
  if (/[eE]/.test(normalized)) {
    return decimalStringToScaledBigInt(Number(normalized).toFixed(decimals), decimals);
  }
  const sign = normalized.startsWith('-') ? -1n : 1n;
  const unsigned = normalized.replace(/^[+-]/, '');
  const [wholeRaw, fracRaw = ''] = unsigned.split('.');
  const whole = wholeRaw ? BigInt(wholeRaw) : 0n;
  const fracPadded = `${fracRaw}${'0'.repeat(decimals)}`.slice(0, decimals);
  const frac = fracPadded ? BigInt(fracPadded) : 0n;
  return sign * (whole * scale + frac);
};

const numberToScaledBigInt = (value, decimals) => {
  if (!Number.isFinite(value)) return 0n;
  return decimalStringToScaledBigInt(value.toFixed(decimals), decimals);
};

const toScaledBigInt = (value, decimals = FP18_DECIMALS) => (
  typeof value === 'bigint'
    ? value
    : typeof value === 'number'
      ? numberToScaledBigInt(value, decimals)
      : decimalStringToScaledBigInt(value, decimals)
);

const fromScaledBigInt = (value, decimals = FP18_DECIMALS) => (
  Number(value) / Number(fixedScale(decimals))
);

const clampSpotToRange = (price, alpha, beta) => (
  Math.min(beta - 1e-12, Math.max(alpha + 1e-12, price))
);

const deriveEclpParamsFloat = (alpha, beta, lambda, phi) => {
  const theta = Math.min(Math.PI / 2 - 1e-9, Math.max(0, Math.abs(phi)));
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const dSq = c * c + s * s;
  const d = Math.sqrt(dSq);
  const tau = (price) => {
    const dPrice = 1 / Math.sqrt(
      ((c / d + price * s / d) ** 2) / (lambda ** 2)
      + (price * c / d - s / d) ** 2,
    );
    return {
      x: (price * c - s) * dPrice,
      y: (c + s * price) * dPrice / lambda,
    };
  };
  const tauAlpha = tau(alpha);
  const tauBeta = tau(beta);
  return {
    alpha,
    beta,
    lambda,
    phi: theta,
    c,
    s,
    tauAlpha,
    tauBeta,
    u: s * c * (tauBeta.x - tauAlpha.x),
    v: s * s * tauBeta.y + c * c * tauAlpha.y,
    w: s * c * (tauBeta.y - tauAlpha.y),
    z: c * c * tauBeta.x + s * s * tauAlpha.x,
    dSq,
  };
};

export const makeEclpConfig = (alpha, beta, lambda, phi) => {
  const a = Number(alpha);
  const b = Number(beta);
  const l = Number(lambda);
  const p = Number(phi);
  if (![a, b, l, p].every(Number.isFinite) || !(a > 0) || !(b > a) || !(l >= 1)) {
    return null;
  }
  const d = deriveEclpParamsFloat(a, b, l, p);
  const params = {
    alpha: toScaledBigInt(d.alpha),
    beta: toScaledBigInt(d.beta),
    c: toScaledBigInt(d.c),
    s: toScaledBigInt(d.s),
    lambda: toScaledBigInt(d.lambda),
  };
  const derived = {
    tauAlpha: {
      x: toScaledBigInt(d.tauAlpha.x, XP_DECIMALS),
      y: toScaledBigInt(d.tauAlpha.y, XP_DECIMALS),
    },
    tauBeta: {
      x: toScaledBigInt(d.tauBeta.x, XP_DECIMALS),
      y: toScaledBigInt(d.tauBeta.y, XP_DECIMALS),
    },
    u: toScaledBigInt(d.u, XP_DECIMALS),
    v: toScaledBigInt(d.v, XP_DECIMALS),
    w: toScaledBigInt(d.w, XP_DECIMALS),
    z: toScaledBigInt(d.z, XP_DECIMALS),
    dSq: toScaledBigInt(d.dSq, XP_DECIMALS),
  };

  try {
    GyroECLPMath.validateParams(params);
    GyroECLPMath.validateDerivedParams(params, derived);
    return { params, derived, float: d };
  } catch {
    return null;
  }
};

const invariantVector = (balances, config) => {
  const [currentInvariant, invariantError] = GyroECLPMath.calculateInvariantWithError(
    balances,
    config.params,
    config.derived,
  );
  return {
    x: currentInvariant + 2n * invariantError,
    y: currentInvariant,
    currentInvariant,
    invariantError,
  };
};

const navBalancesToScaled = (shareNav, quoteNav) => [
  toScaledBigInt(Math.max(0, shareNav)),
  toScaledBigInt(Math.max(0, quoteNav)),
];

export const eclpReservesAtPrice = (alpha, beta, lambda, phi, spotPrice = 1) => {
  const config = makeEclpConfig(alpha, beta, lambda, phi);
  if (!config) return null;
  const { float: p } = config;
  const price = clampSpotToRange(spotPrice, p.alpha, p.beta);
  const tau = deriveEclpParamsFloat(price, price, p.lambda, p.phi).tauAlpha;
  const aInvX = (t) => t.x * p.lambda * p.c + p.s * t.y;
  const aInvY = (t) => -t.x * p.lambda * p.s + p.c * t.y;
  const x = aInvX(p.tauBeta) - aInvX(tau);
  const y = aInvY(p.tauAlpha) - aInvY(tau);
  if (!(x > 0) || !(y > 0)) return null;
  return {
    shareNav: x,
    quoteNav: y,
    quoteFrac: y / (x + y),
  };
};

export const translateTargetCashToEclpBounds = (
  targetCashPct,
  rangeTolerancePct,
  lambda,
  phi,
  spotPrice = 1,
) => {
  const target = clampUnit(Number(targetCashPct) / 100);
  const closeSideTol = Math.max(0.0001, Number(rangeTolerancePct) / 100);
  const l = Math.max(1, Number(lambda));
  const p = Number(phi);
  if (![target, closeSideTol, l, p, spotPrice].every(Number.isFinite)) return null;
  if (!(target > 0) || !(target < 1) || !(spotPrice > 0)) return null;

  const composition = (alpha, beta) => eclpReservesAtPrice(alpha, beta, l, p, spotPrice)?.quoteFrac;
  const symmetricAlpha = spotPrice * (1 - closeSideTol);
  const symmetricBeta = spotPrice * (1 + closeSideTol);
  const symmetric = composition(symmetricAlpha, symmetricBeta);
  if (!Number.isFinite(symmetric)) return null;
  if (Math.abs(target - symmetric) < 1e-6) {
    return { alpha: symmetricAlpha, beta: symmetricBeta, quoteFrac: symmetric };
  }

  if (target > symmetric) {
    const beta = symmetricBeta;
    let lo = Math.max(1e-8, spotPrice * 1e-6);
    let hi = spotPrice * (1 - 1e-9);
    for (let i = 0; i < TARGET_COMPOSITION_SEARCH_STEPS; i++) {
      const mid = (lo + hi) / 2;
      const c = composition(mid, beta);
      if (!Number.isFinite(c)) break;
      if (c > target) lo = mid;
      else hi = mid;
    }
    const alpha = (lo + hi) / 2;
    return { alpha, beta, quoteFrac: composition(alpha, beta) ?? target };
  }

  const alpha = symmetricAlpha;
  let lo = spotPrice * (1 + 1e-9);
  let hi = spotPrice * 2;
  while ((composition(alpha, hi) ?? 1) > target && hi < spotPrice * 1e6) {
    hi *= 2;
  }
  for (let i = 0; i < TARGET_COMPOSITION_SEARCH_STEPS; i++) {
    const mid = (lo + hi) / 2;
    const c = composition(alpha, mid);
    if (!Number.isFinite(c)) break;
    if (c > target) lo = mid;
    else hi = mid;
  }
  const beta = (lo + hi) / 2;
  return { alpha, beta, quoteFrac: composition(alpha, beta) ?? target };
};

export const computeEclpSpotPrice = (shareNavInPool, quoteNavInPool, alpha, beta, lambda, phi) => {
  const config = makeEclpConfig(alpha, beta, lambda, phi);
  if (!config) return Number.NaN;
  if (!(shareNavInPool > 0) || !(quoteNavInPool > 0)) return 1;
  try {
    const balances = navBalancesToScaled(shareNavInPool, quoteNavInPool);
    const { currentInvariant } = invariantVector(balances, config);
    return fromScaledBigInt(
      GyroECLPMath.calcSpotPrice0in1(balances, config.params, config.derived, currentInvariant),
    );
  } catch {
    return quoteNavInPool / shareNavInPool;
  }
};

const calcEclpOutGivenInNav = (
  shareNavInPool,
  quoteNavInPool,
  amountInNav,
  tokenInIsShare,
  config,
) => {
  if (!config || !(shareNavInPool > 0) || !(quoteNavInPool > 0) || !(amountInNav > 0)) return null;
  try {
    const balances = navBalancesToScaled(shareNavInPool, quoteNavInPool);
    const amountIn = toScaledBigInt(amountInNav);
    if (amountIn <= 0n) return null;
    const invariant = invariantVector(balances, config);
    const out = GyroECLPMath.calcOutGivenIn(
      balances,
      amountIn,
      tokenInIsShare,
      config.params,
      config.derived,
      { x: invariant.x, y: invariant.y },
    );
    if (out <= 0n) return null;
    return fromScaledBigInt(out);
  } catch {
    return null;
  }
};

export const quoteEclpSwap = (
  shareNavInPool,
  quoteNavInPool,
  amountInNav,
  direction,
  swapFeeRate,
  eclpConfig,
) => {
  const feeNav = swapFeeRate * amountInNav;
  const amountInAfterFeeNav = amountInNav - feeNav;
  const counterValueNav = calcEclpOutGivenInNav(
    shareNavInPool,
    quoteNavInPool,
    amountInAfterFeeNav,
    direction === 'exit',
    eclpConfig,
  );
  const feasible = counterValueNav !== null && amountInAfterFeeNav > 0 && counterValueNav > 0;
  const sigmaNav = feasible ? amountInAfterFeeNav - counterValueNav : 0;
  return {
    feeNav,
    sigmaNav,
    counterValueNav: feasible ? counterValueNav : 0,
    feasible,
  };
};

export const computeKappa = (
  effectivePrice,
  alpha,
  beta,
  lambda,
  phi,
  direction,
  poolSizeNav,
) => {
  if (!(beta > alpha) || !(lambda >= 1) || !(poolSizeNav > 0)) return Infinity;
  const config = makeEclpConfig(alpha, beta, lambda, phi);
  const reserves = eclpReservesAtPrice(alpha, beta, lambda, phi, effectivePrice);
  if (!config || !reserves) return Infinity;
  const scale = poolSizeNav / (reserves.shareNav + reserves.quoteNav);
  const shareNav = reserves.shareNav * scale;
  const quoteNav = reserves.quoteNav * scale;
  const tNav = Math.max(poolSizeNav * 1e-5, 1e-6);
  const tokenInIsShare = direction === 'exit';
  const outNav = calcEclpOutGivenInNav(shareNav, quoteNav, tNav, tokenInIsShare, config);
  if (!(outNav > 0)) return Infinity;
  const sigmaNav = tNav - outNav;
  return Math.max(0, Math.abs(sigmaNav) / (tNav * tNav));
};

export const rawNavFromState = (state, assetPrice, quotePrice, eclpConfig) => {
  const stShares = Math.max(0, state.stShares);
  const stAssets = stShares;
  const internalShares = Math.min(stShares, Math.max(0, state.internalShares));
  const externalShares = Math.max(0, stShares - internalShares);
  const effectiveSupply = externalShares;

  const perShareRaw = stShares > 0 ? (assetPrice * stAssets) / stShares : 0;

  // Live pool legs — used for E-CLP spot price, trading, depth (must stay live).
  const shareNavInPool = stShares > 0 ? assetPrice * stAssets * internalShares / stShares : 0;
  const quoteNavInPool = quotePrice * state.quoteReserves;
  const poolSizeNav = shareNavInPool + quoteNavInPool;
  const poolPrice = shareNavInPool > 0 ? quoteNavInPool / shareNavInPool : 1;

  // Conservative (balance-point) raw NAVs (spec: JT_RAW = P_A, ST_RAW exogenous).
  // Without eclpConfig this returns the live reserves → identical to the old behavior.
  const { balShareNav, balQuoteNav } = poolReservesAtBalance(shareNavInPool, quoteNavInPool, eclpConfig);
  const stSharesNav = assetPrice * stAssets;          // value of all ST shares at the rate
  const JT_RAW_NAV = balShareNav + balQuoteNav;       // junior's BPT (f = 1), conservative
  const ST_RAW_NAV = Math.max(0, stSharesNav - balShareNav); // senior's own share, exogenous to swaps
  const totalNav = ST_RAW_NAV + JT_RAW_NAV;           // = stSharesNav + balQuoteNav

  return {
    ST_RAW_NAV,
    JT_RAW_NAV,
    totalNav,
    stAssets,
    perShareRaw,
    externalShares,
    effectiveSupply,
    shareNavInPool,
    quoteNavInPool,
    poolSizeNav,
    poolPrice,
  };
};

// Balance-point (conservative) reserves for the E-CLP pool. Recovers the invariant
// L from the live reserves (L = liveShareNav / unitShareNav(currentPrice), since
// reserves scale linearly in L) and values that same L at `balancePoolPrice`.
// Result depends only on L and the price → invariant to pure swap manipulation.
// Falls back to the live reserves when no E-CLP config is available.
export const poolReservesAtBalance = (shareNavInPool, quoteNavInPool, eclpConfig, balancePoolPrice = 1) => {
  const cfg = eclpConfig?.float;
  if (!cfg || !(shareNavInPool > 0) || !(quoteNavInPool > 0)) {
    return { balShareNav: shareNavInPool, balQuoteNav: quoteNavInPool };
  }
  const currentPrice = computeEclpSpotPrice(shareNavInPool, quoteNavInPool, cfg.alpha, cfg.beta, cfg.lambda, cfg.phi);
  const unitNow = eclpReservesAtPrice(cfg.alpha, cfg.beta, cfg.lambda, cfg.phi, currentPrice);
  const unitBal = eclpReservesAtPrice(cfg.alpha, cfg.beta, cfg.lambda, cfg.phi, balancePoolPrice);
  if (!unitNow || !unitBal || !(unitNow.shareNav > 0)) {
    return { balShareNav: shareNavInPool, balQuoteNav: quoteNavInPool };
  }
  const invariantScale = shareNavInPool / unitNow.shareNav; // E-CLP invariant L
  return {
    balShareNav: invariantScale * unitBal.shareNav,
    balQuoteNav: invariantScale * unitBal.quoteNav,
  };
};

export const applyDuskWaterfall = (checkpoint, currentRaw, ydmShare) => {
  let stEff = Math.max(0, checkpoint.stEffectiveNav);
  let jtEff = Math.max(0, checkpoint.jtEffectiveNav);
  let stIL = Math.max(0, checkpoint.stIL);
  let jtIL = Math.max(0, checkpoint.jtIL);

  const deltaJT = currentRaw.JT_RAW_NAV - checkpoint.jtRawCheckpoint;
  const deltaST = currentRaw.ST_RAW_NAV - checkpoint.stRawCheckpoint;

  if (deltaJT < -NAV_EPS) {
    const loss = -deltaJT;
    const absorbedByJt = Math.min(jtEff, loss);
    jtEff -= absorbedByJt;
    const spillToSenior = loss - absorbedByJt;
    if (spillToSenior > NAV_EPS) {
      stEff = Math.max(0, stEff - spillToSenior);
      stIL += spillToSenior;
    }
  } else if (deltaJT > NAV_EPS) {
    let gain = deltaJT;
    const recoverSeniorIl = Math.min(stIL, gain);
    stIL -= recoverSeniorIl;
    stEff += recoverSeniorIl;
    gain -= recoverSeniorIl;
    jtEff += gain;
  }

  if (deltaST < -NAV_EPS) {
    const loss = -deltaST;
    const coveredByJt = Math.min(jtEff, loss);
    jtEff -= coveredByJt;
    jtIL += coveredByJt;
    const uncovered = loss - coveredByJt;
    if (uncovered > NAV_EPS) {
      stEff = Math.max(0, stEff - uncovered);
      stIL += uncovered;
    }
  } else if (deltaST > NAV_EPS) {
    let gain = deltaST;
    const recoverStIl = Math.min(stIL, gain);
    stIL -= recoverStIl;
    stEff += recoverStIl;
    gain -= recoverStIl;

    const recoverJtIl = Math.min(jtIL, gain);
    jtIL -= recoverJtIl;
    jtEff += recoverJtIl;
    gain -= recoverJtIl;

    const jtShare = clampUnit(ydmShare);
    jtEff += gain * jtShare;
    stEff += gain * (1 - jtShare);
  }

  const targetTotal = currentRaw.ST_RAW_NAV + currentRaw.JT_RAW_NAV;
  const currentTotal = stEff + jtEff;
  let drift = targetTotal - currentTotal;

  if (Math.abs(drift) > NAV_EPS) {
    if (drift > 0) {
      jtEff += drift;
      drift = 0;
    } else {
      const pullFromJt = Math.min(jtEff, -drift);
      jtEff -= pullFromJt;
      drift += pullFromJt;
      if (drift < 0) stEff = Math.max(0, stEff + drift);
    }
  }

  if (stEff < 0) {
    jtEff += stEff;
    stEff = 0;
  }
  if (jtEff < 0) {
    stEff += jtEff;
    jtEff = 0;
  }

  return {
    stEffectiveNav: Math.max(0, stEff),
    jtEffectiveNav: Math.max(0, jtEff),
    stIL: Math.max(0, stIL),
    jtIL: Math.max(0, jtIL),
  };
};

export const syncAccountingOnBefore = (state, assetPrice, quotePrice, ydmShare, eclpConfig) => {
  const currentRaw = rawNavFromState(state, assetPrice, quotePrice, eclpConfig);
  const waterfall = applyDuskWaterfall(state, currentRaw, ydmShare);
  return {
    ...state,
    stRawCheckpoint: currentRaw.ST_RAW_NAV,
    jtRawCheckpoint: currentRaw.JT_RAW_NAV,
    ...waterfall,
  };
};

export const syncAccountingOnAfter = (before, afterMutation, assetPrice, quotePrice, ydmShare, eclpConfig) => {
  // With conservative (swap-invariant) raw NAVs, a swap moves no value between
  // tranches: ST_RAW is unchanged and JT_RAW grows only by the captured fee+σ.
  // So we re-mark against the pre-trade checkpoints and run the waterfall — no
  // externalShares rescaling (that was a workaround for the old live coupling).
  const newRaw = rawNavFromState(afterMutation, assetPrice, quotePrice, eclpConfig);
  const waterfall = applyDuskWaterfall(before, newRaw, ydmShare);
  return {
    ...afterMutation,
    stRawCheckpoint: newRaw.ST_RAW_NAV,
    jtRawCheckpoint: newRaw.JT_RAW_NAV,
    ...waterfall,
  };
};

export const simulateTrade = (
  state,
  tNav,
  direction,
  perShareNav,
  quotePrice,
  swapFeeRate,
  eclpConfig,
  balancePoolPrice,
) => {
  const sharesInPool = state.internalShares;
  const quoteInPool = state.quoteReserves;
  const shareNavInPool = sharesInPool * perShareNav;
  const quoteNavInPool = quoteInPool * quotePrice;
  const eps = 1e-9;

  const quoted = quoteEclpSwap(
    shareNavInPool,
    quoteNavInPool,
    tNav,
    direction,
    swapFeeRate,
    eclpConfig,
  );
  const { feeNav, sigmaNav } = quoted;
  const counterValueNav = quoted.counterValueNav;

  let dInternalShares = 0;
  let dQuoteReserves = 0;
  let feasible = quoted.feasible;

  if (direction === 'exit') {
    const externalShares = Math.max(0, state.stShares - sharesInPool);
    const maxExitNav = externalShares * perShareNav;
    dInternalShares = tNav / Math.max(perShareNav, 1e-18);
    dQuoteReserves = -counterValueNav / Math.max(quotePrice, 1e-18);
    if (quoteInPool + dQuoteReserves < 0) feasible = false;
    if (tNav > maxExitNav + eps) feasible = false;
    if (counterValueNav <= 0) feasible = false;
  } else {
    dInternalShares = -counterValueNav / Math.max(perShareNav, 1e-18);
    dQuoteReserves = tNav / Math.max(quotePrice, 1e-18);
    if (sharesInPool + dInternalShares < 0) feasible = false;
    if (counterValueNav <= 0) feasible = false;
  }

  const rawNewInternal = sharesInPool + dInternalShares;
  const rawNewQuote = quoteInPool + dQuoteReserves;
  if (!Number.isFinite(rawNewInternal) || !Number.isFinite(rawNewQuote)) feasible = false;
  if (rawNewInternal < -eps || rawNewQuote < -eps) feasible = false;
  if (rawNewInternal > state.stShares + eps) feasible = false;

  const newInternal = feasible
    ? Math.min(state.stShares, Math.max(0, rawNewInternal))
    : sharesInPool;
  const newQuote = feasible
    ? Math.max(0, rawNewQuote)
    : quoteInPool;
  const jtEffDelta = feasible ? (feeNav + sigmaNav) : 0;
  const currentPoolPrice = computeEclpSpotPrice(
    shareNavInPool,
    quoteNavInPool,
    eclpConfig?.float?.alpha,
    eclpConfig?.float?.beta,
    eclpConfig?.float?.lambda,
    eclpConfig?.float?.phi,
  );
  const newShareNav = newInternal * perShareNav;
  const newQuoteNav = newQuote * quotePrice;
  const newPoolPrice = feasible
    ? computeEclpSpotPrice(
        newShareNav,
        newQuoteNav,
        eclpConfig?.float?.alpha,
        eclpConfig?.float?.beta,
        eclpConfig?.float?.lambda,
        eclpConfig?.float?.phi,
      )
    : currentPoolPrice;
  const distFromBalanceNow = Math.abs(currentPoolPrice - balancePoolPrice);
  const distFromBalanceAfter = Math.abs(newPoolPrice - balancePoolPrice);
  const isImbalancing = distFromBalanceAfter >= distFromBalanceNow;

  return {
    feeNav,
    sigmaNav,
    isImbalancing,
    newState: {
      ...state,
      internalShares: newInternal,
      quoteReserves: newQuote,
      stShares: state.stShares,
    },
    jtEffDelta,
    feasible,
  };
};

export const initialPoolState = (
  seniorTrancheSize,
  juniorTrancheSize,
  juniorCashPct,
  assetPrice,
  quotePrice,
) => {
  const jt = juniorTrancheSize;
  const ss = seniorTrancheSize;
  const cashPct = juniorCashPct;
  if (![jt, ss, cashPct, assetPrice, quotePrice].every(Number.isFinite)) {
    return {
      internalShares: 0,
      quoteReserves: 0,
      stShares: 0,
      stRawCheckpoint: 0,
      jtRawCheckpoint: 0,
      stEffectiveNav: 0,
      jtEffectiveNav: 0,
      stIL: 0,
      jtIL: 0,
    };
  }
  const cashNav = jt * cashPct;
  const shareNav = jt * (1 - cashPct);
  const internalShares = shareNav / Math.max(assetPrice, 1e-9);
  const externalShares = ss / Math.max(assetPrice, 1e-9);
  const stShares = externalShares + internalShares;
  const stAssets = stShares;
  const ST_RAW_NAV = assetPrice * stAssets * externalShares / Math.max(stShares, 1e-9);
  const JT_RAW_NAV = assetPrice * stAssets * internalShares / Math.max(stShares, 1e-9) + cashNav;
  return {
    internalShares,
    quoteReserves: cashNav / Math.max(quotePrice, 1e-9),
    stShares,
    stRawCheckpoint: ST_RAW_NAV,
    jtRawCheckpoint: JT_RAW_NAV,
    stEffectiveNav: ST_RAW_NAV,
    jtEffectiveNav: JT_RAW_NAV,
    stIL: 0,
    jtIL: 0,
  };
};
