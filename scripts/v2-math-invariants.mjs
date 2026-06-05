#!/usr/bin/env node

import {
  balancePoolPriceFromCashPct,
  computeEclpSpotPrice,
  makeEclpConfig,
  rawNavFromState,
  syncAccountingOnBefore,
  syncAccountingOnAfter,
  simulateTrade,
  initialPoolState,
  translateTargetCashToEclpBounds,
} from '../lib/v2Math.mjs';

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function randRange(rng, lo, hi) {
  return lo + (hi - lo) * rng();
}

function assertFinite(v, name) {
  if (!Number.isFinite(v)) throw new Error(`non-finite ${name}`);
}

function run() {
  const SCENARIOS = 250;
  const STEPS = 120;
  const failures = [];
  let acceptedTrades = 0;
  let skippedTrades = 0;

  for (let s = 0; s < SCENARIOS; s++) {
    const rng = mulberry32(0xA11CE + s * 9973);

    const senior = randRange(rng, 1_000_000, 60_000_000);
    const junior = randRange(rng, 200_000, 12_000_000);
    const cashPct = randRange(rng, 0.55, 0.95);
    const assetPrice = randRange(rng, 0.97, 1.03);
    const quotePrice = randRange(rng, 0.97, 1.03);
    const minCoverage = randRange(rng, 0.05, 0.25);
    const ydmShare = randRange(rng, 0.05, 0.80);

    const balancePoolPrice = balancePoolPriceFromCashPct(cashPct);
    const tol = randRange(rng, 0.02, 0.30);
    const lambda = randRange(rng, 10, 2500);
    const phi = randRange(rng, 0, 0.25);
    const translatedBounds = translateTargetCashToEclpBounds(cashPct * 100, tol * 100, lambda, phi, 1);
    if (!translatedBounds) {
      skippedTrades += STEPS;
      continue;
    }
    const alpha = translatedBounds.alpha;
    const beta = translatedBounds.beta;
    const eclpConfig = makeEclpConfig(alpha, beta, lambda, phi);
    if (!eclpConfig) {
      skippedTrades += STEPS;
      continue;
    }
    const swapFeeRate = randRange(rng, 0.0001, 0.005);

    let state = initialPoolState(senior, junior, cashPct, assetPrice, quotePrice);

    for (let i = 0; i < STEPS; i++) {
      const beforeSync = syncAccountingOnBefore(state, assetPrice, quotePrice, ydmShare, eclpConfig);
      const rawBefore = rawNavFromState(beforeSync, assetPrice, quotePrice, eclpConfig);

      const direction = rng() < 0.72 ? 'exit' : 'enter';
      const maxExit = rawBefore.externalShares * rawBefore.perShareRaw;
      const maxEnter = rawBefore.shareNavInPool;
      const hardCap = Math.max(1, rawBefore.poolSizeNav * 0.4);
      const maxT = direction === 'exit'
        ? Math.max(0, Math.min(maxExit * 0.7, hardCap))
        : Math.max(0, Math.min(maxEnter * 0.7, hardCap));
      if (!(maxT > 1)) {
        skippedTrades++;
        continue;
      }
      const tNav = randRange(rng, 1, maxT);

      const trade = simulateTrade(
        beforeSync,
        tNav,
        direction,
        rawBefore.perShareRaw,
        quotePrice,
        swapFeeRate,
        eclpConfig,
        balancePoolPrice,
      );

      const postShareNav = trade.newState.internalShares * rawBefore.perShareRaw;
      const postQuoteNav = trade.newState.quoteReserves * quotePrice;
      const postPrice = computeEclpSpotPrice(postShareNav, postQuoteNav, alpha, beta, lambda, phi);
      const rangeEps = Math.max(1e-9, Math.abs(beta - alpha) * 1e-6);
      const inRange = postPrice >= alpha - rangeEps && postPrice <= beta + rangeEps;
      if (!trade.feasible || !inRange) {
        skippedTrades++;
        state = beforeSync;
        continue;
      }

      state = syncAccountingOnAfter(beforeSync, trade.newState, assetPrice, quotePrice, ydmShare, eclpConfig);
      acceptedTrades++;

      const raw = rawNavFromState(state, assetPrice, quotePrice, eclpConfig);
      const conservation = raw.ST_RAW_NAV + raw.JT_RAW_NAV - raw.totalNav;
      const effTotal = state.stEffectiveNav + state.jtEffectiveNav;
      const rawTotal = raw.ST_RAW_NAV + raw.JT_RAW_NAV;

      // Spec: ST_RAW is exogenous to swaps; JT_RAW only grows by captured fee+σ.
      // Tolerance is relative (1e-4) to absorb invariant-recovery numerical noise;
      // it is still orders of magnitude below the LIVE model's drift (~tNav per
      // swap), so it cleanly distinguishes "conservative" from "live".
      const stRawDrift = raw.ST_RAW_NAV - rawBefore.ST_RAW_NAV;
      const jtRawGain = raw.JT_RAW_NAV - rawBefore.JT_RAW_NAV;
      const tol = Math.max(1, rawBefore.totalNav * 1e-4);

      try {
        assertFinite(state.internalShares, 'internalShares');
        assertFinite(state.quoteReserves, 'quoteReserves');
        assertFinite(state.stEffectiveNav, 'stEffectiveNav');
        assertFinite(state.jtEffectiveNav, 'jtEffectiveNav');
        assertFinite(state.stIL, 'stIL');
        assertFinite(state.jtIL, 'jtIL');

        if (state.internalShares < -1e-7 || state.internalShares > state.stShares + 1e-7) {
          throw new Error(`internalShares out of bounds: ${state.internalShares} vs stShares ${state.stShares}`);
        }
        if (state.quoteReserves < -1e-7) {
          throw new Error(`negative quote reserves: ${state.quoteReserves}`);
        }
        if (Math.abs(conservation) > 1e-5) {
          throw new Error(`NAV conservation drift: ${conservation}`);
        }
        if (Math.abs(effTotal - rawTotal) > 1e-5) {
          throw new Error(`effective/raw total mismatch: ${effTotal - rawTotal}`);
        }
        if (state.stIL < -1e-7 || state.jtIL < -1e-7) {
          throw new Error(`negative IL: stIL=${state.stIL}, jtIL=${state.jtIL}`);
        }
        if (Math.abs(stRawDrift) > tol + Math.abs(jtRawGain)) {
          throw new Error(`ST_RAW not exogenous to swap: drift ${stRawDrift}`);
        }
        if (jtRawGain < -tol) {
          throw new Error(`JT_RAW decreased on a swap: ${jtRawGain}`);
        }
      } catch (err) {
        failures.push({
          scenario: s,
          step: i,
          direction,
          tNav,
          message: String(err.message || err),
          snapshot: {
            senior,
            junior,
            cashPct,
            assetPrice,
            quotePrice,
            minCoverage,
            alpha,
            beta,
            lambda,
            phi,
            swapFeeRate,
            state,
            raw,
          },
        });
        break;
      }
    }
  }

  const summary = {
    scenarios: SCENARIOS,
    stepsPerScenario: STEPS,
    acceptedTrades,
    skippedTrades,
    failures: failures.length,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (failures.length > 0) {
    console.error('\nFirst failure:');
    console.error(JSON.stringify(failures[0], null, 2));
    process.exit(1);
  }
}

run();
