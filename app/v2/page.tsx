'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  Legend,
} from 'recharts';
import {
  NAV_EPS,
  clampUnit,
  initialPoolState,
  rawNavFromState,
  coverageNavAtBalance,
  syncAccountingOnBefore,
  syncAccountingOnAfter,
  balancePoolPriceFromCashPct,
  exitIsImbalancingAt,
  computeEclpSpotPrice,
  eclpReservesAtPrice,
  makeEclpConfig,
  quoteEclpSwap,
  translateTargetCashToEclpBounds,
  simulateTrade,
} from '@/lib/v2Math.mjs';

const ResponsiveContainerNoSSR = dynamic(
  () => import('recharts').then((mod) => mod.ResponsiveContainer),
  { ssr: false },
);

// =============================================================================
// Royco Dusk v2 Simulator
//
// Models Dusk's new mechanics on top of Dawn:
//   * Junior Tranche capital is an E-CLP BPT (quote + ST-share reserves).
//   * effectiveSupply = totalSupply − internalShares (shares in pool excluded).
//   * Coverage β fixed at 100% — we conservatively assume Junior could be fully
//     ST-share exposed, so utilization is independent of the cash/stablecoin split.
//   * E-CLP parameters (α, β, λ, φ) drive the pool's slippage profile (κ).
//   * Exit-direction swaps are unconditionally non-increasing in utilization
//     (Section 11 Theorem) — the fee dominates slippage for imbalancing trades.
// =============================================================================


type Direction = 'exit' | 'enter';

type PoolState = {
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

// The four user-facing inputs (the "mental model" of an advanced DeFi user).
// Everything else (stShares, stAssets, internalShares, quoteReserves, etc.)
// is derived from these — the user should not have to think about kernel
// share-counting to model a pool.
type SetupInputs = {
  underlyingYield: string;       // % APY on the underlying asset
  seniorTrancheSize: string;     // $ — external Senior NAV (ST_RAW_NAV)
  juniorTrancheSize: string;     // $ — JT pool TVL (JT_RAW_NAV)
  juniorCashPct: string;         // % of Junior allocated to quote (vs ST shares)
  // Protocol parameters (defaults usually fine)
  quoteYield: string;            // % APY on the quote asset
  minCoverage: string;           // %
  ydmY0: string;
  ydmYT: string;
  ydmYFull: string;
  jtFee: string;
  stFee: string;
  ysFee: string;
  // Advanced overrides (rarely changed)
  assetPrice: string;
  quotePrice: string;
};

type EclpParams = {
  alpha: string;            // lower price bound (quote per share)
  beta: string;             // upper price bound (quote per share)
  lambda: string;           // concentration
  phi: string;              // rotation [-1, 1]
  swapFeeRate: string;      // bps as %
};

const DEFAULT_SETUP: SetupInputs = {
  underlyingYield: '9',
  seniorTrancheSize: '10,000,000',
  juniorTrancheSize: '1,123,596',
  juniorCashPct: '90',
  quoteYield: '4',
  minCoverage: '10',
  ydmY0: '15',
  ydmYT: '15',
  ydmYFull: '40',
  jtFee: '0',
  stFee: '0',
  ysFee: '0',
  assetPrice: '1.00',
  quotePrice: '1.00',
};

// Compute the initial pool state from the simple inputs.
// Junior tranche × (1 - cash%) → goes into ST shares (at perShareRaw = assetPrice).
// Junior tranche × cash% → goes into quote (at quotePrice).
const initialPoolFromSetup = (s: SetupInputs): PoolState => {
  const jt = parseFloat(s.juniorTrancheSize.replace(/,/g, ''));
  const ss = parseFloat(s.seniorTrancheSize.replace(/,/g, ''));
  const cashPct = parseFloat(s.juniorCashPct) / 100;
  const aP = parseFloat(s.assetPrice) || 1;
  const qP = parseFloat(s.quotePrice) || 1;
  return initialPoolState(ss, jt, cashPct, aP, qP);
};

// PDF YDM piecewise linear curve (kink at 90% util). Inputs are fractions.
// Past 100% util the pool is in breach — Junior is fully exposed and Senior
// isn't even covered, so Junior takes 100% of yield (no more discount for
// being "protected" — the protection has lapsed).
const ydmYieldShare = (util: number, y0: number, yT: number, yFull: number): number => {
  if (util > 1) return 1; // only a true deficit (util > 100%) routes all yield to Junior
  // At exactly 100% util the pool is exactly covered (not in drawdown), so the
  // curve returns Y_full — not a forced 100%.
  const u = Math.min(Math.max(util, 0), 1);
  const discount = yT - y0;
  const premium = yFull - yT;
  const result = u < 0.9
    ? yT + ((u - 0.9) / 0.9) * discount
    : yT + ((u - 0.9) / 0.1) * premium;
  return Math.min(1, Math.max(0, result));
};

const DEFAULT_ECLP: EclpParams = {
  alpha: '0.97',
  beta: '1.03',
  lambda: '100',            // valid with the default 90/10 target and ±3% close-side tolerance
  phi: '0.05',             // rotation angle (radians-ish); real Gyro E-CLPs use 0.001–0.1
  swapFeeRate: '0.05',     // 5 bps
};

const parseNum = (v: string): number => parseFloat(v.replace(/,/g, ''));

const fmtCommas = (v: string): string => {
  const num = v.replace(/,/g, '');
  if (!num) return '';
  const parts = num.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
};

const fmtNav = (n: number, digits = 2) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);

const safeYdmShare = (ytPctInput: string, fallback = 0.15): number => {
  const parsed = parseNum(ytPctInput) / 100;
  return Number.isFinite(parsed) ? clampUnit(parsed) : clampUnit(fallback);
};

// Compact dollar format for tight KPI tiles: $2.0M, $1.5K, $123
const fmtCompact = (n: number): string => {
  if (!Number.isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${abs.toFixed(0)}`;
};

const fmtPct = (n: number, digits = 2) =>
  `${(n * 100).toFixed(digits)}%`;


export default function DuskV2Simulator() {
  const [setup, setSetup] = useState<SetupInputs>(DEFAULT_SETUP);
  const [eclp, setEclp] = useState<EclpParams>(DEFAULT_ECLP);

  // Cumulative pool state — starts at the user's initial values, updated on
  // every "Execute trade".
  const [pool, setPool] = useState<PoolState>(() => initialPoolFromSetup(DEFAULT_SETUP));

  // Cumulative trade accumulators — fees and slippage residuals captured by the
  // pool over the simulation session. These add directly to JT_EFFECTIVE_NAV
  // and represent extra yield the Junior tranche earns from market-making.
  const [cumFees, setCumFees] = useState<number>(0);
  const [cumSigma, setCumSigma] = useState<number>(0);
  const [cumVolume, setCumVolume] = useState<number>(0);
  const [tradeCount, setTradeCount] = useState<number>(0);
  type TradeHistoryEntry = {
    id: number;
    direction: Direction;
    size: number;
    fee: number;
    sigma: number;
    utilDelta: number;
    jtNavDelta: number;
    isImbalancing: boolean;
  };
  const [tradeHistory, setTradeHistory] = useState<TradeHistoryEntry[]>([]);
  // Volume forecast for annualizing fees + slippage gains.
  // Default annual volume = 100% of Junior tranche → daily = JT / 365
  const [assumedDailyVolume, setAssumedDailyVolume] = useState<string>(() => {
    const jt = parseFloat(DEFAULT_SETUP.juniorTrancheSize.replace(/,/g, ''));
    return Number.isFinite(jt) ? fmtCommas((jt / 365).toFixed(0)) : '3,078';
  });
  // Default avg trade = 1/5 of junior tranche size (auto-syncs unless overridden via URL)
  const [avgTradeSize, setAvgTradeSize] = useState<string>(() => {
    const jt = parseFloat(DEFAULT_SETUP.juniorTrancheSize.replace(/,/g, ''));
    return Number.isFinite(jt) ? fmtCommas((jt / 5).toFixed(0)) : '10,000';
  });
  const [pctImbalancing, setPctImbalancing] = useState<string>('60');
  // Concentration sizing for RWAs: MMs need slippage ≥ hurdle × (days/365) to
  // clear their cost of capital while holding to redemption.
  const [redemptionDays, setRedemptionDays] = useState<string>('30');
  const [mmHurdle, setMmHurdle] = useState<string>('20');
  // Toggle to exclude trading yield (fees + σ) from Junior APY. σ is
  // state-dependent and speculative; some users want to see "guaranteed"
  // yield only (own + YDM premium).
  const [includeTradingYield, setIncludeTradingYield] = useState<boolean>(true);

  // Pending trade preview state.
  const [tradeDirection, setTradeDirection] = useState<Direction>('exit');
  const [tradeSize, setTradeSize] = useState<string>('100,000');

  const [showProtocolDefaults, setShowProtocolDefaults] = useState(false);
  const [showAdvancedSetup, setShowAdvancedSetup] = useState(false);
  // YDM adaptation slider — shifts the whole curve up/down (like v1).
  // `adaptYdmPct` holds the effective Y_T (0–100%); the slider displays the signed
  // shift from the base Y_T set in PROTOCOL, so 0% = no translation.
  const [adaptYdmPct, setAdaptYdmPct] = useState<number>(15);
  const baseYTPct = Number.isFinite(parseNum(setup.ydmYT)) ? parseNum(setup.ydmYT) : 15;
  const translateDelta = Math.round(adaptYdmPct - baseYTPct); // signed shift shown on the slider
  // Target pool composition translator: "I want a 90/10 pool" → α, β.
  const [targetSharesPct, setTargetSharesPct] = useState<string>('50');
  const [rangeTolerance, setRangeTolerance] = useState<string>('3');
  type ChartTab = 'apy' | 'depth' | 'tune';
  const [activeChart, setActiveChart] = useState<ChartTab>('apy');
  // Single state — both breakdowns expand/collapse together so users can
  // compare Senior + Junior side-by-side.
  const [breakdownExpanded, setBreakdownExpanded] = useState<boolean>(false);
  const seniorExpanded = breakdownExpanded;
  const juniorExpanded = breakdownExpanded;
  const setSeniorExpanded = setBreakdownExpanded;
  const setJuniorExpanded = setBreakdownExpanded;
  const [showEclpDesign, setShowEclpDesign] = useState<boolean>(false);
  const [urlHydrated, setUrlHydrated] = useState<boolean>(false);

  // === URL STATE: read on mount ===
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    const get = (k: string, fallback: string) => p.get(k) ?? fallback;
    const getNum = (k: string, fallback: string) => {
      const v = p.get(k);
      return v && Number.isFinite(parseFloat(v)) ? v : fallback;
    };
    const numWithCommas = (k: string, fallback: string) => {
      const v = p.get(k);
      return v && Number.isFinite(parseFloat(v)) ? fmtCommas(v) : fallback;
    };
    const loadedSetup: SetupInputs = {
      underlyingYield: getNum('y', DEFAULT_SETUP.underlyingYield),
      seniorTrancheSize: numWithCommas('s', DEFAULT_SETUP.seniorTrancheSize),
      juniorTrancheSize: numWithCommas('j', DEFAULT_SETUP.juniorTrancheSize),
      juniorCashPct: getNum('c', DEFAULT_SETUP.juniorCashPct),
      quoteYield: getNum('qy', DEFAULT_SETUP.quoteYield),
      minCoverage: getNum('mc', DEFAULT_SETUP.minCoverage),
      ydmY0: getNum('y0', DEFAULT_SETUP.ydmY0),
      ydmYT: getNum('yt', DEFAULT_SETUP.ydmYT),
      ydmYFull: getNum('yf', DEFAULT_SETUP.ydmYFull),
      jtFee: getNum('jtf', DEFAULT_SETUP.jtFee),
      stFee: getNum('stf', DEFAULT_SETUP.stFee),
      ysFee: getNum('ysf', DEFAULT_SETUP.ysFee),
      assetPrice: getNum('ap', DEFAULT_SETUP.assetPrice),
      quotePrice: getNum('qp', DEFAULT_SETUP.quotePrice),
    };
    setSetup(loadedSetup);
    // Critical: also rebuild pool state directly from loaded setup. The
    // reset useEffect only fires on a subset of fields, so without this an
    // unchanged Senior/Junior would leave pool.stShares at the default value
    // while `derived` would null-out (returning early).
    setPool(initialPoolFromSetup(loadedSetup));
    setEclp({
      alpha: getNum('a', DEFAULT_ECLP.alpha),
      beta: getNum('b', DEFAULT_ECLP.beta),
      lambda: getNum('l', DEFAULT_ECLP.lambda),
      phi: getNum('phi', DEFAULT_ECLP.phi),
      swapFeeRate: getNum('fee', DEFAULT_ECLP.swapFeeRate),
    });
    const adapt = parseFloat(getNum('ad', '15'));
    if (Number.isFinite(adapt)) setAdaptYdmPct(adapt);
    const ch = get('ch', '');
    if (['apy', 'depth', 'tune'].includes(ch)) {
      setActiveChart(ch as ChartTab);
    }
    setRangeTolerance(getNum('rt', '3'));
    // Defaults derived from Junior tranche: daily = JT/365, avg trade = JT/5
    const jtForDefaults = parseFloat((numWithCommas('j', DEFAULT_SETUP.juniorTrancheSize)).replace(/,/g, ''));
    const dvDefault = Number.isFinite(jtForDefaults) ? fmtCommas(Math.round(jtForDefaults / 365).toString()) : '3,078';
    const atDefault = Number.isFinite(jtForDefaults) ? fmtCommas(Math.round(jtForDefaults / 5).toString()) : '224,719';
    setAssumedDailyVolume(numWithCommas('dv', dvDefault));
    setAvgTradeSize(numWithCommas('at', atDefault));
    setPctImbalancing(getNum('pi', '60'));
    setRedemptionDays(getNum('rd', '30'));
    setMmHurdle(getNum('mh', '20'));
    setUrlHydrated(true);
  }, []);

  // === URL STATE: write on change (replaceState so no history spam) ===
  useEffect(() => {
    if (!urlHydrated || typeof window === 'undefined') return;
    const p = new URLSearchParams();
    const stripCommas = (s: string) => s.replace(/,/g, '');
    p.set('y', setup.underlyingYield);
    p.set('s', stripCommas(setup.seniorTrancheSize));
    p.set('j', stripCommas(setup.juniorTrancheSize));
    p.set('c', setup.juniorCashPct);
    p.set('qy', setup.quoteYield);
    p.set('mc', setup.minCoverage);
    p.set('y0', setup.ydmY0);
    p.set('yt', setup.ydmYT);
    p.set('yf', setup.ydmYFull);
    if (setup.jtFee !== '0') p.set('jtf', setup.jtFee);
    if (setup.stFee !== '0') p.set('stf', setup.stFee);
    if (setup.ysFee !== '0') p.set('ysf', setup.ysFee);
    if (setup.assetPrice !== '1.00') p.set('ap', setup.assetPrice);
    if (setup.quotePrice !== '1.00') p.set('qp', setup.quotePrice);
    p.set('a', eclp.alpha);
    p.set('b', eclp.beta);
    p.set('l', eclp.lambda);
    p.set('phi', eclp.phi);
    p.set('fee', eclp.swapFeeRate);
    if (rangeTolerance !== '3') p.set('rt', rangeTolerance);
    p.set('ad', adaptYdmPct.toString());
    if (activeChart !== 'apy') p.set('ch', activeChart);
    p.set('dv', stripCommas(assumedDailyVolume));
    p.set('at', stripCommas(avgTradeSize));
    p.set('pi', pctImbalancing);
    if (redemptionDays !== '30') p.set('rd', redemptionDays);
    if (mmHurdle !== '20') p.set('mh', mmHurdle);
    const url = `${window.location.pathname}?${p.toString()}`;
    window.history.replaceState(null, '', url);
  }, [setup, eclp, rangeTolerance, adaptYdmPct, activeChart, assumedDailyVolume, avgTradeSize, pctImbalancing, redemptionDays, mmHurdle, urlHydrated]);

  // Auto-translate target reserve composition → α, β at oracle par.
  const applyTargetComposition = () => {
    const sharePct = parseNum(targetSharesPct) / 100;
    if (!(sharePct > 0 && sharePct < 1)) return;
    const translated = translateTargetCashToEclpBounds(
      (1 - sharePct) * 100,
      parseNum(rangeTolerance),
      parseFloat(eclp.lambda),
      parseFloat(eclp.phi),
      1,
    );
    if (!translated) return;
    setEclp((e) => ({
      ...e,
      alpha: translated.alpha.toFixed(4),
      beta: translated.beta.toFixed(4),
    }));
  };

  const resetPool = () => {
    setPool(initialPoolFromSetup(setup));
    setCumFees(0);
    setCumSigma(0);
    setCumVolume(0);
    setTradeCount(0);
    setTradeHistory([]);
  };

  // Auto-sync the live pool with the simple setup inputs. When user types a new
  // Senior/Junior/Cash% value, the pool resets to that configuration AND we
  // clear session accumulators so the KPI bar / Junior card don't show stale
  // totals from a different pool state.
  useEffect(() => {
    const seedSetup: SetupInputs = {
      ...DEFAULT_SETUP,
      seniorTrancheSize: setup.seniorTrancheSize,
      juniorTrancheSize: setup.juniorTrancheSize,
      juniorCashPct: setup.juniorCashPct,
      assetPrice: setup.assetPrice,
      quotePrice: setup.quotePrice,
    };
    setPool(initialPoolFromSetup(seedSetup));
    setCumFees(0);
    setCumSigma(0);
    setCumVolume(0);
    setTradeCount(0);
    setTradeHistory([]);
  }, [setup.seniorTrancheSize, setup.juniorTrancheSize, setup.juniorCashPct, setup.assetPrice, setup.quotePrice]);

  // Auto-sync trading forecast assumptions to Junior tranche size:
  //   avg trade = 1/5 of JT (~20% of pool TVL)
  //   daily volume = JT / 365 (= 100% annual turnover)
  // Keeps the pool-parameter recommendation calibrated to realistic flow.
  useEffect(() => {
    const jt = parseNum(setup.juniorTrancheSize);
    if (!Number.isFinite(jt) || jt <= 0) return;
    setAvgTradeSize(fmtCommas(Math.round(jt / 5).toString()));
    setAssumedDailyVolume(fmtCommas(Math.round(jt / 365).toString()));
  }, [setup.juniorTrancheSize]);

  // Keep target share % in sync with junior cash allocation, and solve the
  // E-CLP price bounds that place that reserve composition at oracle par.
  useEffect(() => {
    const cashPct = parseNum(setup.juniorCashPct);
    if (!Number.isFinite(cashPct) || cashPct <= 0 || cashPct >= 100) return;
    const newTarget = (100 - cashPct).toString();
    setTargetSharesPct(newTarget);
    const lambda = parseFloat(eclp.lambda);
    const phi = parseFloat(eclp.phi);
    const translated = translateTargetCashToEclpBounds(cashPct, parseNum(rangeTolerance), lambda, phi, 1);
    if (!translated) return;
    setEclp((e) => ({
      ...e,
      alpha: translated.alpha.toFixed(4),
      beta: translated.beta.toFixed(4),
    }));
  }, [setup.juniorCashPct, rangeTolerance, eclp.lambda, eclp.phi]);

  const eclpConfig = useMemo(
    () => makeEclpConfig(
      parseFloat(eclp.alpha),
      parseFloat(eclp.beta),
      parseFloat(eclp.lambda),
      parseFloat(eclp.phi),
    ),
    [eclp.alpha, eclp.beta, eclp.lambda, eclp.phi],
  );

  const eclpRepair = useMemo(() => {
    const currentLambda = parseFloat(eclp.lambda);
    const cashPct = parseNum(setup.juniorCashPct);
    const phi = parseFloat(eclp.phi);
    const tolPct = parseNum(rangeTolerance);
    if (![currentLambda, cashPct, phi, tolPct].every(Number.isFinite) || currentLambda <= 1) return null;
    if (eclpConfig) return null;

    const validAt = (lam: number) => {
      const translated = translateTargetCashToEclpBounds(cashPct, tolPct, lam, phi, 1);
      if (!translated) return null;
      const cfg = makeEclpConfig(translated.alpha, translated.beta, lam, phi);
      return cfg ? translated : null;
    };

    if (!validAt(1)) return null;
    let lo = 1;
    let hi = currentLambda;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (validAt(mid)) lo = mid;
      else hi = mid;
    }
    const safeLambda = Math.max(1, Math.floor(lo - 1e-6));
    const translated = validAt(safeLambda);
    return translated
      ? { lambda: safeLambda, alpha: translated.alpha, beta: translated.beta }
      : null;
  }, [eclp.lambda, eclp.phi, eclpConfig, rangeTolerance, setup.juniorCashPct]);

  const applyEclpRepair = () => {
    if (!eclpRepair) return;
    setEclp((e) => ({
      ...e,
      lambda: eclpRepair.lambda.toFixed(0),
      alpha: eclpRepair.alpha.toFixed(4),
      beta: eclpRepair.beta.toFixed(4),
    }));
  };

  // ---------- Derived quantities ----------
  const derived = useMemo(() => {
    const assetPrice = parseNum(setup.assetPrice);
    const quotePrice = parseNum(setup.quotePrice);
    const minCoverage = parseNum(setup.minCoverage) / 100;

    if (
      !Number.isFinite(assetPrice) || assetPrice <= 0 ||
      !Number.isFinite(quotePrice) || quotePrice <= 0 ||
      !Number.isFinite(minCoverage) || minCoverage < 0
    ) {
      return null;
    }

    if (!(pool.stShares > 0)) return null;
    const raw = rawNavFromState(pool, assetPrice, quotePrice);

    const stShares = pool.stShares;
    const stAssets = raw.stAssets;
    const internalShares = Math.max(0, pool.internalShares);
    const externalShares = raw.externalShares;
    const effectiveSupply = raw.effectiveSupply;
    const ST_RAW_NAV = raw.ST_RAW_NAV;
    const JT_RAW_NAV = raw.JT_RAW_NAV;
    const totalNav = raw.totalNav;
    const conservationError = ST_RAW_NAV + JT_RAW_NAV - totalNav;

    const perShareRaw = raw.perShareRaw;
    const ST_EFFECTIVE_NAV = Math.max(0, pool.stEffectiveNav);
    const JT_EFFECTIVE_NAV = Math.max(0, pool.jtEffectiveNav);
    const perExternalEffective = effectiveSupply > 0 ? ST_EFFECTIVE_NAV / effectiveSupply : perShareRaw;

    // β fixed at 100%: for coverage/utilization we conservatively assume Junior's
    // entire NAV could be in ST shares (vs the PDF §09 composition-weighted β).
    // This also makes utilization independent of the Junior cash/stablecoin split.
    const beta = 1;

    // Coverage basis is valued at the pool's balance point so utilization doesn't
    // slide as swaps push cash in/out of the pool (β = 1 ⇒ basis = totalNav at balance).
    const requiredCoverage = coverageNavAtBalance(pool, assetPrice, quotePrice, eclpConfig) * minCoverage;
    const utilization = JT_EFFECTIVE_NAV > 0
      ? requiredCoverage / JT_EFFECTIVE_NAV
      : 0;

    const shareNavInPool = raw.shareNavInPool;
    const quoteNavInPool = raw.quoteNavInPool;
    const poolSizeNav = raw.poolSizeNav;
    const reserveRatio = raw.poolPrice;
    const poolPrice = eclpConfig
      ? computeEclpSpotPrice(
          shareNavInPool,
          quoteNavInPool,
          parseFloat(eclp.alpha),
          parseFloat(eclp.beta),
          parseFloat(eclp.lambda),
          parseFloat(eclp.phi),
        )
      : Number.NaN;
    const compositionFracQuote = poolSizeNav > 0 ? quoteNavInPool / poolSizeNav : 0;

    // Rate-provider branch (PDF §14)
    let rateBranch: string;
    let rateReturn: number;
    if (stShares === 0 || stAssets === 0) {
      rateBranch = 'pre-bootstrap → WAD';
      rateReturn = 1;
    } else if (effectiveSupply === 0) {
      rateBranch = 'post-bootstrap (all internal) → perShareRaw';
      rateReturn = perShareRaw;
    } else {
      rateBranch = 'normal → ST_EFFECTIVE_NAV / effectiveSupply';
      rateReturn = perExternalEffective;
    }

    return {
      assetPrice, stAssets, stShares, quotePrice, minCoverage,
      internalShares, externalShares, effectiveSupply,
      ST_RAW_NAV, JT_RAW_NAV, ST_EFFECTIVE_NAV, JT_EFFECTIVE_NAV,
      totalNav, conservationError,
      perShareRaw, perExternalEffective,
      beta, requiredCoverage, utilization,
      poolPrice, reserveRatio, poolSizeNav, shareNavInPool, quoteNavInPool, compositionFracQuote,
      stIL: Math.max(0, pool.stIL),
      jtIL: Math.max(0, pool.jtIL),
      rateBranch, rateReturn,
    };
  }, [setup, pool, eclp, eclpConfig]);

  // Single source of truth for "balanced composition" in this simulator:
  // the target implied by Junior cash allocation.
  const balancePoolPrice = useMemo(
    () => balancePoolPriceFromCashPct(parseNum(setup.juniorCashPct) / 100),
    [setup.juniorCashPct],
  );

  // ---------- Yields (mirrors v1's math, with dynamic β from `derived`) -----
  const yields = useMemo(() => {
    if (!derived) return null;
    const r = parseNum(setup.underlyingYield) / 100;
    const rQ = parseNum(setup.quoteYield) / 100;
    const y0 = parseNum(setup.ydmY0) / 100;
    const yT = parseNum(setup.ydmYT) / 100;
    const yFull = parseNum(setup.ydmYFull) / 100;
    const fJt = parseNum(setup.jtFee) / 100;
    const fSt = parseNum(setup.stFee) / 100;
    const fYs = parseNum(setup.ysFee) / 100;
    if (![r, rQ, y0, yT, yFull, fJt, fSt, fYs].every(Number.isFinite)) return null;

    const seniorCapital = derived.ST_EFFECTIVE_NAV; // redeemable Senior effective NAV
    const juniorCapital = derived.JT_EFFECTIVE_NAV; // redeemable Junior effective NAV

    // Senior yield pool: raw external Senior NAV × underlying APY.
    const totalSeniorYield = r * derived.ST_RAW_NAV;

    // Junior's own yield: shares-in-pool earn underlying, quote earns its rate
    const juniorOwnYield = derived.shareNavInPool * r + derived.quoteNavInPool * rQ;
    const ownAfterJt = juniorOwnYield * (1 - fJt);

    // YDM adaptation: shift the whole curve up/down by user's slider input
    // (Y_T jumps to the slider value; Y₀ and Y_full shift by the same delta).
    const adaptDelta = (adaptYdmPct / 100) - yT;
    const effY0 = Math.max(0, Math.min(1, y0 + adaptDelta));
    const effYT = adaptYdmPct / 100;
    const effYFull = Math.max(0, Math.min(1, yFull + adaptDelta));
    const ydmShareAdapted = ydmYieldShare(derived.utilization, effY0, effYT, effYFull);
    const juniorRiskPremiumAdapted = ydmShareAdapted * totalSeniorYield;
    const seniorYieldGrossAdapted = totalSeniorYield - juniorRiskPremiumAdapted;
    const riskAfterYsAdapted = juniorRiskPremiumAdapted * (1 - fYs);
    const riskAfterJtAdapted = riskAfterYsAdapted * (1 - fJt);
    const juniorNetYieldAdapted = ownAfterJt + riskAfterJtAdapted;
    const seniorNetYieldAdapted = seniorYieldGrossAdapted * (1 - fSt);
    const baseJuniorAPYAdapted = juniorCapital > 0 ? juniorNetYieldAdapted / juniorCapital : 0;
    const seniorAPYAdapted = seniorCapital > 0 ? seniorNetYieldAdapted / seniorCapital : 0;

    // Fee waterfall (same shape as v1) — computed from the adapted YDM share so
    // fees stay consistent with the net yields above.
    const protocolFees =
      juniorOwnYield * fJt + juniorRiskPremiumAdapted * fYs +
      riskAfterYsAdapted * fJt + seniorYieldGrossAdapted * fSt;

    // ----- Annualized trading economics ----------------------------------
    // Inputs: daily volume, avg trade size, % of volume that's imbalancing.
    const daily = parseNum(assumedDailyVolume);
    const avgT = parseNum(avgTradeSize);
    const pImb = parseNum(pctImbalancing) / 100;
    const feeRate = parseFloat(eclp.swapFeeRate) / 100;

    // (1) Fees: independent of trade size — fee × daily volume × 365.
    const annualFeeRevenue = Number.isFinite(daily) && Number.isFinite(feeRate)
      ? daily * feeRate * 365
      : 0;
    const tradeFeeAPY = juniorCapital > 0 ? annualFeeRevenue / juniorCapital : 0;

    // (2) Slippage residuals σ, quoted through the exact Balancer E-CLP path.
    const exitIsImb = exitIsImbalancingAt(derived.poolPrice, balancePoolPrice);

    const tradesPerDay = avgT > 0 && Number.isFinite(avgT) ? daily / avgT : 0;
    const exitSigmaTrade = eclpConfig
      ? simulateTrade(pool, avgT, 'exit', derived.perShareRaw, derived.quotePrice, 0, eclpConfig, balancePoolPrice)
      : null;
    const enterSigmaTrade = eclpConfig
      ? simulateTrade(pool, avgT, 'enter', derived.perShareRaw, derived.quotePrice, 0, eclpConfig, balancePoolPrice)
      : null;
    const sigmaPerImbTrade = exitIsImb
      ? (exitSigmaTrade?.feasible ? exitSigmaTrade.sigmaNav : 0)
      : (enterSigmaTrade?.feasible ? enterSigmaTrade.sigmaNav : 0);
    const sigmaPerBalTrade = exitIsImb
      ? (enterSigmaTrade?.feasible ? enterSigmaTrade.sigmaNav : 0)
      : (exitSigmaTrade?.feasible ? exitSigmaTrade.sigmaNav : 0);
    const annualSigmaImb = tradesPerDay * pImb * sigmaPerImbTrade * 365;
    const annualSigmaBal = tradesPerDay * (1 - pImb) * sigmaPerBalTrade * 365;
    const annualSigma = annualSigmaImb + annualSigmaBal;
    const sigmaAPY = juniorCapital > 0 ? annualSigma / juniorCapital : 0;

    // Trading yield (fees + σ) is optional — user can toggle off to see
    // "guaranteed" base APY only.
    const tradingBoost = includeTradingYield ? (tradeFeeAPY + sigmaAPY) : 0;
    const tradingDollar = includeTradingYield ? (annualFeeRevenue + annualSigma) : 0;
    const juniorAPY = baseJuniorAPYAdapted + tradingBoost;
    const juniorTotalNetYield = juniorNetYieldAdapted + tradingDollar;

    return {
      r, rQ, y0, yT, yFull, fJt, fSt, fYs,
      ydmShare: ydmShareAdapted, effY0, effYT, effYFull,
      seniorCapital, juniorCapital,
      totalSeniorYield, juniorRiskPremiumGross: juniorRiskPremiumAdapted,
      seniorYieldGross: seniorYieldGrossAdapted,
      juniorOwnYield, juniorNetYield: juniorNetYieldAdapted,
      seniorNetYield: seniorNetYieldAdapted,
      juniorAPY, seniorAPY: seniorAPYAdapted, protocolFees,
      annualFeeRevenue, tradeFeeAPY, juniorTotalNetYield,
      baseJuniorAPY: baseJuniorAPYAdapted,
      annualSigma, annualSigmaImb, annualSigmaBal, sigmaAPY,
      exitIsImb,
    };
  }, [derived, setup, assumedDailyVolume, avgTradeSize, pctImbalancing, eclp, eclpConfig, pool, adaptYdmPct, includeTradingYield, balancePoolPrice]);

  // ---------- Trade preview ----------
  const tradePreview = useMemo(() => {
    if (!derived) return null;
    const t = parseNum(tradeSize);
    if (!Number.isFinite(t) || t <= 0) return null;

    const alpha = parseFloat(eclp.alpha);
    const beta = parseFloat(eclp.beta);
    const lambda = parseFloat(eclp.lambda);
    const phi = parseFloat(eclp.phi);
    const swapFeeRate = parseFloat(eclp.swapFeeRate) / 100;
    if (![alpha, beta, lambda, phi, swapFeeRate].every(Number.isFinite)) return null;
    if (!eclpConfig) return null;

    const ydmShareForAccounting = yields
      ? yields.ydmShare
      : safeYdmShare(setup.ydmYT);
    const syncedBefore = syncAccountingOnBefore(
      pool,
      derived.assetPrice,
      derived.quotePrice,
      ydmShareForAccounting,
    );

    const result = simulateTrade(
      syncedBefore,
      t,
      tradeDirection,
      derived.perShareRaw,
      derived.quotePrice,
      swapFeeRate,
      eclpConfig,
      balancePoolPrice,
    );
    const newShareNavInPool = result.newState.internalShares * derived.perShareRaw;
    const newQuoteNavInPool = result.newState.quoteReserves * derived.quotePrice;
    const newPoolPrice = computeEclpSpotPrice(newShareNavInPool, newQuoteNavInPool, alpha, beta, lambda, phi);
    const rangeEps = Math.max(1e-9, Math.abs(beta - alpha) * 1e-6);
    const inRange = newPoolPrice >= alpha - rangeEps && newPoolPrice <= beta + rangeEps;
    const feasible = result.feasible && inRange;
    const accountedState = feasible
      ? syncAccountingOnAfter(
          syncedBefore,
          result.newState,
          derived.assetPrice,
          derived.quotePrice,
          ydmShareForAccounting,
        )
      : syncedBefore;
    const newRaw = rawNavFromState(accountedState, derived.assetPrice, derived.quotePrice);

    // Post-trade derived state — same formulas as `derived`, on the synced state.
    const newInternal = accountedState.internalShares;
    const newExternal = newRaw.externalShares;
    const ST_RAW_NAV_new = newRaw.ST_RAW_NAV;
    const JT_RAW_NAV_new = newRaw.JT_RAW_NAV;
    // Post-trade coverage valued at the balance point (β = 1), so the preview
    // doesn't slide just because the trade left the pool off balance.
    const requiredCoverageNew = coverageNavAtBalance(accountedState, derived.assetPrice, derived.quotePrice, eclpConfig, balancePoolPrice) * derived.minCoverage;
    const util_new = accountedState.jtEffectiveNav > 0
      ? requiredCoverageNew / accountedState.jtEffectiveNav
      : 0;

    // Conservation check on the new state.
    const conservationErrorNew = ST_RAW_NAV_new + JT_RAW_NAV_new - newRaw.totalNav;
    const counterValueNav = Math.max(0, t - result.feeNav - result.sigmaNav);
    const jtEffDelta = accountedState.jtEffectiveNav - syncedBefore.jtEffectiveNav;

    return {
      tNav: t,
      feeNav: result.feeNav,
      sigmaNav: result.sigmaNav,
      jtEffDelta,
      isImbalancing: result.isImbalancing,
      feasible,
      newState: accountedState,
      newInternal, newExternal,
      ST_RAW_NAV_new, JT_RAW_NAV_new, util_new,
      utilDelta: util_new - derived.utilization,
      conservationErrorNew,
      counterValueNav,
    };
  }, [derived, pool, tradeSize, tradeDirection, eclp, eclpConfig, balancePoolPrice, yields, setup.ydmYT]);

  // Maximum currently executable Senior exit size, respecting:
  //  1) swap feasibility (cash + external shares + positive payout),
  //  2) E-CLP range bounds [α, β],
  //  3) post-trade Junior coverage.
  const maxSafeExitNow = useMemo(() => {
    if (!derived) return 0;

    const alpha = parseFloat(eclp.alpha);
    const beta = parseFloat(eclp.beta);
    const lambda = parseFloat(eclp.lambda);
    const phi = parseFloat(eclp.phi);
    const swapFeeRate = parseFloat(eclp.swapFeeRate) / 100;
    if (![alpha, beta, lambda, phi, swapFeeRate].every(Number.isFinite)) return 0;
    if (!eclpConfig) return 0;

    const ydmShareForAccounting = yields ? yields.ydmShare : safeYdmShare(setup.ydmYT);
    const syncedBefore = syncAccountingOnBefore(
      pool,
      derived.assetPrice,
      derived.quotePrice,
      ydmShareForAccounting,
    );
    const rangeEps = Math.max(1e-9, Math.abs(beta - alpha) * 1e-6);

    const isSafeExit = (tNav: number): boolean => {
      if (!(tNav > 0)) return true;
      const sim = simulateTrade(
        syncedBefore,
        tNav,
        'exit',
        derived.perShareRaw,
        derived.quotePrice,
        swapFeeRate,
        eclpConfig,
        balancePoolPrice,
      );
      if (!sim.feasible) return false;

      const postShareNav = sim.newState.internalShares * derived.perShareRaw;
      const postQuoteNav = sim.newState.quoteReserves * derived.quotePrice;
      const postPrice = computeEclpSpotPrice(postShareNav, postQuoteNav, alpha, beta, lambda, phi);
      const inRange = postPrice >= alpha - rangeEps && postPrice <= beta + rangeEps;
      if (!inRange) return false;

      const accounted = syncAccountingOnAfter(
        syncedBefore,
        sim.newState,
        derived.assetPrice,
        derived.quotePrice,
        ydmShareForAccounting,
      );
      const requiredCoveragePost = coverageNavAtBalance(accounted, derived.assetPrice, derived.quotePrice, eclpConfig, balancePoolPrice) * derived.minCoverage;
      return requiredCoveragePost <= accounted.jtEffectiveNav + NAV_EPS;
    };

    const externalShares = Math.max(0, syncedBefore.stShares - syncedBefore.internalShares);
    const maxExitBySupply = externalShares * derived.perShareRaw;
    const hiSeed = Math.max(0, Math.min(maxExitBySupply, Math.max(0, derived.poolSizeNav * 2)));
    if (!(hiSeed > 0)) return 0;
    if (isSafeExit(hiSeed)) return hiSeed;

    let lo = 0;
    let hi = hiSeed;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (isSafeExit(mid)) lo = mid;
      else hi = mid;
    }
    return lo;
  }, [derived, eclp, eclpConfig, pool, balancePoolPrice, yields, setup.ydmYT]);

  const executeTrade = () => {
    if (!tradePreview || !tradePreview.feasible) return;
    setPool(tradePreview.newState);
    setCumFees((f) => f + tradePreview.feeNav);
    setCumSigma((s) => s + tradePreview.sigmaNav);
    setCumVolume((v) => v + tradePreview.tNav);
    setTradeCount((c) => c + 1);
    setTradeHistory((h) => [
      {
        id: Date.now(),
        direction: tradeDirection,
        size: tradePreview.tNav,
        fee: tradePreview.feeNav,
        sigma: tradePreview.sigmaNav,
        utilDelta: tradePreview.utilDelta,
        jtNavDelta: tradePreview.jtEffDelta,
        isImbalancing: tradePreview.isImbalancing,
      },
      ...h,
    ].slice(0, 8));
  };

  // ---------- Charts ----------

  // YDM + Net APY chart — sweeps utilization from 0 to 1.
  const apyChartData = useMemo(() => {
    if (!derived || !yields) return [];
    const cov = derived.minCoverage;
    const r = yields.r;
    const data: Array<{
      util: number; ydm: number; juniorAPY: number; seniorAPY: number;
    }> = [];
    for (let i = 0; i <= 100; i++) {
      const u = i / 100;
      const ydm = ydmYieldShare(u, yields.effY0, yields.effYT, yields.effYFull);
      // At utilization u, with min coverage cov, the implied ratio of
      // ST:JT effective NAV is k = u/cov - 1 (in the simple Dawn model).
      // We use the same shape here to plot the curve across utilization.
      let juniorAPYpct: number;
      let seniorAPYpct: number;
      if (cov <= 0) {
        juniorAPYpct = r * 100 * (1 - yields.fJt);
        seniorAPYpct = 0;
      } else {
        const k = u / cov - 1;
        const ownAPY = r * 100;
        const riskAPY = ydm * r * k * 100;
        juniorAPYpct = ownAPY * (1 - yields.fJt)
                     + riskAPY * (1 - yields.fYs) * (1 - yields.fJt);
        seniorAPYpct = (1 - ydm) * r * 100 * (1 - yields.fSt);
      }
      data.push({
        util: u * 100,
        ydm: ydm * 100,
        juniorAPY: juniorAPYpct,
        seniorAPY: seniorAPYpct,
      });
    }
    return data;
  }, [derived, yields]);

  // ----- E-CLP depth chart -----------------------------------------------
  // For each price p ∈ [α, β], compute the maximum trade size that keeps
  // slippage σ/t below 50 bps. Higher value = more depth at that price.
  const depthChartData = useMemo(() => {
    if (!derived || activeChart !== 'depth') return [];
    const alpha = parseFloat(eclp.alpha);
    const beta = parseFloat(eclp.beta);
    const lambda = parseFloat(eclp.lambda);
    const phi = parseFloat(eclp.phi);
    if (![alpha, beta, lambda, phi].every(Number.isFinite) || !(beta > alpha)) return [];
    const SLIP_THRESHOLD_BPS = 50;
    const slipFrac = SLIP_THRESHOLD_BPS / 10000;
    const data: Array<{ price: number; depthExit: number; depthEnter: number; cashPct: number }> = [];
    const cfg = makeEclpConfig(alpha, beta, lambda, phi);
    if (!cfg) return [];
    const exactDepthAt = (price: number, direction: Direction): number => {
      const reserves = eclpReservesAtPrice(alpha, beta, lambda, phi, price);
      if (!reserves) return 0;
      const scale = derived.poolSizeNav / Math.max(reserves.shareNav + reserves.quoteNav, 1e-18);
      const shareNav = reserves.shareNav * scale;
      const quoteNav = reserves.quoteNav * scale;
      const withinThreshold = (t: number) => {
        const q = quoteEclpSwap(shareNav, quoteNav, t, direction, 0, cfg);
        return q.feasible && t > 0 && Math.abs(q.sigmaNav / t) <= slipFrac;
      };
      let hi = Math.max(derived.poolSizeNav * 0.05, 1);
      while (withinThreshold(hi) && hi < derived.poolSizeNav * 2) hi *= 2;
      hi = Math.min(hi, derived.poolSizeNav * 2);
      if (withinThreshold(hi)) return hi;
      let lo = 0;
      for (let j = 0; j < 16; j++) {
        const mid = (lo + hi) / 2;
        if (withinThreshold(mid)) lo = mid;
        else hi = mid;
      }
      return lo;
    };
    const POINTS = 16;
    for (let i = 0; i <= POINTS; i++) {
      const price = alpha + (beta - alpha) * (i / POINTS);
      const depthExit = exactDepthAt(price, 'exit');
      const depthEnter = exactDepthAt(price, 'enter');
      const cashPct = (eclpReservesAtPrice(alpha, beta, lambda, phi, price)?.quoteFrac ?? 0) * 100;
      data.push({ price, depthExit, depthEnter, cashPct });
    }
    return data;
  }, [derived, eclp, activeChart]);

  // ----- Pool parameter solver --------------------------------------------
  // Goal: derive deployable α/β/λ/tolerance params such that curve impact on a
  // typical Senior exit compensates a market maker holding to redemption.
  //   target_slippage_bps = hurdle_apr × (days / 365) × 10000
  // The old λ-only search was under-specified: for a fixed target composition,
  // the active price band is the missing degree of freedom. This jointly solves
  // the band and λ while keeping the reserve mix at oracle par.
  const poolParamTune = useMemo(() => {
    if (!derived || activeChart !== 'tune') return null;
    const currentLambda = Math.max(1, parseFloat(eclp.lambda));
    const phi = parseFloat(eclp.phi);
    const swapFeeRate = parseFloat(eclp.swapFeeRate) / 100;
    if (![currentLambda, phi, swapFeeRate].every(Number.isFinite)) return null;

    const direction: Direction = 'exit';

    const days = Math.max(0.01, parseNum(redemptionDays));
    const hurdle = Math.max(0.0001, parseNum(mmHurdle) / 100);
    const targetSlippageBps = hurdle * (days / 365) * 10000;

    const avgT = Math.max(1, parseNum(avgTradeSize));
    const targetCashPct = parseNum(setup.juniorCashPct);
    const currentTolerance = Math.max(0.01, parseNum(rangeTolerance));
    if (!(targetCashPct > 0 && targetCashPct < 100)) return null;

    type Candidate = {
      lambda: number;
      tolerance: number;
      alpha: number;
      beta: number;
      quoteFrac: number;
      slippageBps: number;
      errorBps: number;
      cfg: NonNullable<ReturnType<typeof makeEclpConfig>>;
    };

    const candidateCache = new Map<string, Candidate | null>();
    const evaluated: Candidate[] = [];

    const candidateAt = (candidateLambda: number, candidateTolerance: number): Candidate | null => {
      const lam = Math.max(1, candidateLambda);
      const tol = Math.max(0.05, candidateTolerance);
      const key = `${lam.toPrecision(12)}:${tol.toPrecision(10)}`;
      if (candidateCache.has(key)) return candidateCache.get(key) ?? null;

      const bounds = translateTargetCashToEclpBounds(targetCashPct, tol, lam, phi, 1);
      if (!bounds) {
        candidateCache.set(key, null);
        return null;
      }
      const quoteFrac = bounds.quoteFrac ?? Number.NaN;
      const targetQuoteFrac = targetCashPct / 100;
      if (!Number.isFinite(quoteFrac) || Math.abs(quoteFrac - targetQuoteFrac) > 0.0025) {
        candidateCache.set(key, null);
        return null;
      }

      const cfg = makeEclpConfig(bounds.alpha, bounds.beta, lam, phi);
      if (!cfg) {
        candidateCache.set(key, null);
        return null;
      }

      const sim = simulateTrade(
        pool,
        avgT,
        direction,
        derived.perShareRaw,
        derived.quotePrice,
        0,
        cfg,
        balancePoolPrice,
      );
      if (!sim.feasible) {
        candidateCache.set(key, null);
        return null;
      }

      const slippageBps = Math.max(0, (sim.sigmaNav / avgT) * 10000);
      const result = {
        lambda: lam,
        tolerance: tol,
        alpha: bounds.alpha,
        beta: bounds.beta,
        quoteFrac,
        slippageBps,
        errorBps: Math.abs(slippageBps - targetSlippageBps),
        cfg,
      };
      candidateCache.set(key, result);
      evaluated.push(result);
      return result;
    };

    const toleranceSamples = [
      0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3,
      3.5, 4, 4.5, 5, 5.5, 6, 7, 8, 9, 10, 12, 15, 18, 22, 28,
    ];

    const betterByError = (a: Candidate | null, b: Candidate | null): Candidate | null => {
      if (!a) return b;
      if (!b) return a;
      if (b.errorBps < a.errorBps - 1e-9) return b;
      if (Math.abs(b.errorBps - a.errorBps) <= 1e-9) {
        const aDistance = Math.abs(Math.log(a.lambda / currentLambda)) + Math.abs(a.tolerance - currentTolerance) / 10;
        const bDistance = Math.abs(Math.log(b.lambda / currentLambda)) + Math.abs(b.tolerance - currentTolerance) / 10;
        return bDistance < aDistance ? b : a;
      }
      return a;
    };

    const solveToleranceForLambda = (lam: number): Candidate | null => {
      let best: Candidate | null = null;
      let prev: Candidate | null = null;
      let bracket: [Candidate, Candidate] | null = null;

      for (const tol of toleranceSamples) {
        const candidate = candidateAt(lam, tol);
        best = betterByError(best, candidate);
        if (candidate && prev) {
          const prevDelta = prev.slippageBps - targetSlippageBps;
          const nextDelta = candidate.slippageBps - targetSlippageBps;
          if (prevDelta === 0 || nextDelta === 0 || prevDelta * nextDelta < 0) {
            bracket = bracket ?? [prev, candidate];
          }
        }
        if (candidate) prev = candidate;
      }

      if (bracket) {
        let [lo, hi] = bracket;
        for (let i = 0; i < 16; i++) {
          const midTol = (lo.tolerance + hi.tolerance) / 2;
          const mid = candidateAt(lam, midTol);
          if (!mid) break;
          best = betterByError(best, mid);
          const loDelta = lo.slippageBps - targetSlippageBps;
          const midDelta = mid.slippageBps - targetSlippageBps;
          if (loDelta === 0 || loDelta * midDelta <= 0) hi = mid;
          else lo = mid;
        }
      }

      return best;
    };

    const MATCH_TOLERANCE_BPS = 1.5;
    let recommended = solveToleranceForLambda(currentLambda);

    if (!recommended || recommended.errorBps > MATCH_TOLERANCE_BPS) {
      const lambdaSamples = [
        currentLambda,
        1, 2, 5, 10, 20, 35, 50, 75, 100, 125, 150, 200, 300, 500, 750, 1000,
      ].filter((lam, idx, arr) => (
        Number.isFinite(lam) &&
        lam >= 1 &&
        arr.findIndex((other) => Math.abs(other - lam) <= 1e-6) === idx
      ));

      let bestByScore: Candidate | null = recommended;
      lambdaSamples.forEach((lam) => {
        const candidate = solveToleranceForLambda(lam);
        if (!candidate) return;
        if (!bestByScore) {
          bestByScore = candidate;
          return;
        }
        const currentScore =
          bestByScore.errorBps +
          0.05 * Math.abs(Math.log(bestByScore.lambda / currentLambda)) +
          0.01 * Math.abs(bestByScore.tolerance - currentTolerance);
        const candidateScore =
          candidate.errorBps +
          0.05 * Math.abs(Math.log(candidate.lambda / currentLambda)) +
          0.01 * Math.abs(candidate.tolerance - currentTolerance);
        if (candidateScore < currentScore) bestByScore = candidate;
      });
      recommended = bestByScore;
    }

    if (!recommended) return null;

    const minAttainableBps = evaluated.length
      ? Math.min(...evaluated.map((candidate) => candidate.slippageBps))
      : recommended.slippageBps;
    const maxAttainableBps = evaluated.length
      ? Math.max(...evaluated.map((candidate) => candidate.slippageBps))
      : recommended.slippageBps;
    const tuneStatus: 'matched' | 'closest' | 'target-below-min' | 'target-above-max' =
      recommended.errorBps <= MATCH_TOLERANCE_BPS
        ? 'matched'
        : targetSlippageBps < minAttainableBps
          ? 'target-below-min'
          : targetSlippageBps > maxAttainableBps
            ? 'target-above-max'
            : 'closest';

    const lineSeeds: Array<{ label: string; lambda: number; tolerance: number }> = [
      { label: 'current inputs', lambda: currentLambda, tolerance: currentTolerance },
      { label: 'narrower band', lambda: recommended.lambda, tolerance: recommended.tolerance * 0.75 },
      { label: 'recommended', lambda: recommended.lambda, tolerance: recommended.tolerance },
      { label: 'wider band', lambda: recommended.lambda, tolerance: recommended.tolerance * 1.25 },
      { label: 'lower λ', lambda: Math.max(1, recommended.lambda / 2), tolerance: recommended.tolerance },
    ];
    const baseLineConfigs = lineSeeds
      .map((seed) => {
        const candidate = seed.label === 'recommended'
          ? recommended
          : candidateAt(seed.lambda, seed.tolerance);
        return candidate ? { ...candidate, label: seed.label } : null;
      })
      .filter((candidate, idx, arr): candidate is Candidate & { label: string } => (
        !!candidate &&
        arr.findIndex((other) => !!other && Math.abs(other.lambda - candidate.lambda) <= 1e-6 && Math.abs(other.tolerance - candidate.tolerance) <= 1e-6) === idx
      ));

    return {
      direction,
      targetSlippageBps,
      recommended,
      recommendedSlipBps: recommended.slippageBps,
      baseLineConfigs,
      avgT,
      days,
      hurdle,
      tuneStatus,
      minAttainableBps,
      maxAttainableBps,
      currentLambda,
      currentTolerance,
      targetCashPct,
    };
  }, [derived, eclp, setup.juniorCashPct, rangeTolerance, redemptionDays, mmHurdle, avgTradeSize, pool, balancePoolPrice, activeChart]);

  const poolParamChartData = useMemo(() => {
    if (!derived || !poolParamTune || activeChart !== 'tune') return [];
    const { direction, baseLineConfigs } = poolParamTune;
    const maxT = Math.max(derived.poolSizeNav * 0.5, parseNum(tradeSize) * 3, poolParamTune.avgT * 5, 100_000);
    const N = 18;
    const data: Array<{ t: number; [key: string]: number }> = [];
    for (let i = 1; i <= N; i++) {
      const t = (i / N) * maxT;
      const row: { t: number; [key: string]: number } = { t };
      baseLineConfigs.forEach(({ cfg }, idx) => {
        const sim = simulateTrade(
          pool,
          t,
          direction,
          derived.perShareRaw,
          derived.quotePrice,
          0,
          cfg,
          balancePoolPrice,
        );
        row[`line_${idx}`] = sim.feasible ? Math.max(0, (sim.sigmaNav / t) * 10000) : Number.NaN;
      });
      data.push(row);
    }
    return data;
  }, [derived, tradeSize, poolParamTune, pool, balancePoolPrice, activeChart]);

  // ===========================================================================
  // Render
  // ===========================================================================
  if (!derived) {
    return (
      <div className="min-h-screen bg-[#FBFBF8] py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <p className="text-[#9ca3af]">Enter valid setup values to continue.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen h-screen bg-[#0f1115] text-[#e5e7eb] flex flex-col overflow-hidden">
      {/* === STICKY HEADER (KPIs) === */}
      <header className="flex-shrink-0 bg-[#0a0c10] border-b border-[#1f242c]">
        <div className="px-3 py-2 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 mr-2">
            <span className="text-[10px] tracking-wide uppercase text-[#C8873E] bg-[#3a2410] border border-[#5a3a18] rounded px-2 py-0.5 font-semibold">DUSK</span>
            <span className="text-sm font-semibold text-white">Royco Dusk Simulator</span>
            <Link href="/" className="text-[10px] uppercase text-[#888] hover:text-white border border-[#2a2f38] rounded px-2 py-0.5">v1 →</Link>
          </div>
          {yields && (
            <>
              <KpiTile label="SENIOR APY" value={fmtPct(yields.seniorAPY)} accent="cyan" />
              <KpiTile label="JUNIOR APY" value={fmtPct(yields.juniorAPY)} accent="amber" />
              <KpiTile label="UTIL" value={fmtPct(derived.utilization)} accent={derived.utilization > 1 ? 'red' : undefined} />
              <KpiTile label="β" value={fmtPct(derived.beta)} />
              <KpiTile label="MARKET TVL" value={`$${fmtCompact(yields.seniorCapital + yields.juniorCapital)}`} />
              <KpiTile label="E-CLP TVL" value={`$${fmtCompact(derived.poolSizeNav)}`} />
              <KpiTile label="ST TVL" value={`$${fmtCompact(yields.seniorCapital)}`} />
              <KpiTile label="JT TVL" value={`$${fmtCompact(yields.juniorCapital)}`} />
              {cumVolume > 0 && (
                <KpiTile label="SESSION σ+FEES" value={`+$${fmtCompact(cumFees + cumSigma)}`} accent="green" />
              )}
            </>
          )}
        </div>
      </header>

      {/* === JUNIOR DEFICIT WARNING BANNER === */}
      {yields && derived.utilization > 1 && (
        <div className="flex-shrink-0 bg-gradient-to-r from-[#7f1d1d] via-[#dc2626] to-[#7f1d1d] border-b border-[#f87171] px-3 py-2 flex items-center gap-3 animate-pulse">
          <span className="text-2xl">⚠</span>
          <div className="flex-1">
            <div className="text-sm font-bold text-white uppercase tracking-wider">
              Junior tranche deficit — coverage breach
            </div>
            <div className="text-[11px] text-[#fecaca]">
              Required coverage <span className="font-mono font-semibold">${fmtNav(derived.requiredCoverage, 0)}</span> exceeds Junior effective NAV <span className="font-mono font-semibold">${fmtNav(derived.JT_EFFECTIVE_NAV, 0)}</span> — Junior is under-collateralized by{' '}
              <span className="font-mono font-bold text-white">${fmtNav(derived.requiredCoverage - derived.JT_EFFECTIVE_NAV, 0)}</span>.
              Increase Junior tranche size or reduce min coverage.
            </div>
          </div>
          <span className="text-[11px] font-mono text-white bg-[#7f1d1d]/60 border border-[#f87171] rounded px-2 py-1">
            util {fmtPct(derived.utilization)} &gt; 100%
          </span>
        </div>
      )}

      {/* === 3-COLUMN DASHBOARD === */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[320px_1fr_360px] overflow-hidden min-h-0">

        {/* ============= LEFT: INPUTS ============= */}
        <aside className="lg:border-r border-[#1f242c] overflow-y-auto p-3 space-y-4 bg-[#0c0e13]">
          {/* Market */}
          <div>
            <SidebarHeader badge="INPUT" badgeColor="green" title="Market" />
            <div className="space-y-2">
              <CompactInput label="Underlying APY" tip="Yield your token earns natively (9% for sUSDe, 0% for USDC)" value={setup.underlyingYield} onChange={(v) => setSetup((s) => ({ ...s, underlyingYield: v }))} suffix="%" />
              <CompactInput label="Senior tranche size" tip="External Senior NAV" value={setup.seniorTrancheSize} onChange={(v) => setSetup((s) => ({ ...s, seniorTrancheSize: fmtCommas(v.replace(/[^0-9.]/g, '')) }))} prefix="$" accent="cyan" />
              <CompactInput label="Junior tranche size" tip="JT pool TVL — what Junior deposited (cash + shares)" value={setup.juniorTrancheSize} onChange={(v) => setSetup((s) => ({ ...s, juniorTrancheSize: fmtCommas(v.replace(/[^0-9.]/g, '')) }))} prefix="$" accent="amber" />
              <CompactInput label="Junior cash allocation" tip="% of Junior deposited as quote (rest is ST shares). Changing this solves the E-CLP price bounds that put that reserve mix at spot price 1." value={setup.juniorCashPct} onChange={(v) => setSetup((s) => ({ ...s, juniorCashPct: v }))} suffix="%" />
              <CompactInput label="Min coverage" tip="Coverage Seniors require, as % of (ST + JT). β is fixed at 100% (Junior conservatively treated as fully ST-share exposed), so coverage and utilization ignore the cash split. Drives required coverage → utilization." value={setup.minCoverage} onChange={(v) => setSetup((s) => ({ ...s, minCoverage: v }))} suffix="%" />
                <CompactInput
                  label="Concentration (λ)"
                  tip="The single most important pool-design knob. Like Curve's A factor. Higher = deeper pool, less slippage. For RWAs, use the Pool parameters tab to derive α/β/λ from duration, MM hurdle, target cash mix, and average exit size. IMMUTABLE per PDF §03 — set once at pool deployment."
                value={eclp.lambda}
                onChange={(v) => setEclp((s) => ({ ...s, lambda: v }))}
                disabled={tradeCount > 0}
                lockedHint={tradeCount > 0 ? `Locked — ${tradeCount} trade${tradeCount === 1 ? '' : 's'} executed. λ is immutable per PDF §03. Reset session to edit.` : undefined}
              />
            </div>
            <div className="mt-2 text-[9px] font-mono text-[#6b7280] tabular-nums leading-relaxed">
              <div>ST shares total: <span className="text-white">{fmtNav(derived.stShares, 0)}</span></div>
              <div>internal / external: <span className="text-white">{fmtNav(derived.internalShares, 0)}</span> / <span className="text-white">{fmtNav(derived.externalShares, 0)}</span></div>
            </div>
          </div>

          {/* Live scrub controls */}
          {yields && (
            <div className="border-t border-[#1f242c] pt-3">
              <SidebarHeader badge="SCRUB" badgeColor="amber" title="Live state" />
              <div className="space-y-3">
                {/* Utilization slider */}
                {(() => {
                  const setUtil = (targetUtil: number) => {
                    const ss = parseNum(setup.seniorTrancheSize);
                    const mc = parseNum(setup.minCoverage) / 100;
                    const util = Math.min(1, targetUtil); // never scrub past 100% utilization
                    // β = 1 ⇒ utilization = ss·mc/jt + mc, so the floor (as jt → ∞) is mc.
                    const floor = mc;
                    if (!(util > floor)) return;
                    const newJtSize = ss * mc / (util - floor);
                    if (!Number.isFinite(newJtSize) || newJtSize <= 0) return;
                    setSetup((s) => ({ ...s, juniorTrancheSize: fmtCommas(newJtSize.toFixed(2)) }));
                  };
                  const snaps: Array<{ label: string; util: number; tone?: 'green' | 'amber' | 'red' }> = [
                    { label: '25%', util: 0.25 },
                    { label: '50%', util: 0.50 },
                    { label: '90%', util: 0.90, tone: 'green' },
                    { label: '100%', util: 1.00, tone: 'amber' },
                  ];
                  return (
                    <div>
                      <div className="flex justify-between items-baseline mb-1 text-[10px]">
                        <span className="text-[#9ca3af]">Utilization (adjusts Junior size)</span>
                        <span className={`font-mono tabular-nums ${derived.utilization > 1 ? 'text-[#f87171]' : 'text-white'}`}>{fmtPct(derived.utilization)}</span>
                      </div>
                      <input
                        type="range" min={5} max={100} step={1}
                        value={Math.min(100, Math.max(5, Math.round(derived.utilization * 100)))}
                        onChange={(e) => setUtil(parseInt(e.target.value) / 100)}
                        className="w-full utilization-slider"
                      />
                      <div className="flex justify-between text-[8px] text-[#6b7280] mt-0.5 tabular-nums">
                        <span>5%</span><span>50%</span><span className="text-[#fbbf24]">90% target</span><span className="text-[#f87171]">100% max</span>
                      </div>
                      <div className="flex items-center gap-1 mt-1.5">
                        <span className="text-[9px] text-[#6b7280] uppercase tracking-wider">snap:</span>
                        {snaps.map((s) => {
                          const active = Math.abs(derived.utilization - s.util) < 0.005;
                          // Active = bright tone color + bg fill + ring.
                          // Inactive = muted gray (regardless of tone) so the snap row doesn't
                          // look "pre-selected" when util has drifted.
                          const cls = active
                            ? (s.tone === 'green' ? 'border-[#34d399] text-[#34d399] bg-[#34d399]/15 ring-1 ring-[#34d399] font-bold'
                              : s.tone === 'amber' ? 'border-[#fbbf24] text-[#fbbf24] bg-[#fbbf24]/15 ring-1 ring-[#fbbf24] font-bold'
                              : s.tone === 'red' ? 'border-[#f87171] text-[#f87171] bg-[#f87171]/15 ring-1 ring-[#f87171] font-bold'
                              : 'border-white text-white bg-white/10 ring-1 ring-white font-bold')
                            : (s.tone === 'green' ? 'border-[#2a2f38] text-[#6b7280] hover:border-[#34d399] hover:text-[#34d399]'
                              : s.tone === 'amber' ? 'border-[#2a2f38] text-[#6b7280] hover:border-[#fbbf24] hover:text-[#fbbf24]'
                              : s.tone === 'red' ? 'border-[#2a2f38] text-[#6b7280] hover:border-[#f87171] hover:text-[#f87171]'
                              : 'border-[#2a2f38] text-[#6b7280] hover:border-white hover:text-white');
                          return (
                            <button
                              key={s.label}
                              onClick={() => setUtil(s.util)}
                              className={`flex-1 text-[10px] font-mono tabular-nums py-1 rounded border transition-colors ${cls}`}
                            >
                              {s.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
                {/* Adapt YDM — signed translate of the whole curve */}
                <div>
                  <div className="flex justify-between items-baseline mb-1 text-[10px]">
                    <span className="text-[#9ca3af]">Adapt YDM (translate curve)</span>
                    <span className="font-mono text-white tabular-nums">
                      {translateDelta > 0 ? '+' : ''}{translateDelta}%
                      {translateDelta !== 0 && (
                        <button onClick={() => setAdaptYdmPct(baseYTPct)}
                          className="ml-2 font-sans text-[#6b7280] hover:text-white" title="Reset translation">reset</button>
                      )}
                    </span>
                  </div>
                  <input type="range" min={0} max={100} step={1} value={adaptYdmPct}
                    onChange={(e) => setAdaptYdmPct(parseInt(e.target.value))}
                    className="w-full utilization-slider" />
                  <p className="text-[9px] text-[#6b7280] mt-1">Shifts the whole curve up/down; shape (slopes) set by Y₀/Y_T/Y_full below. Clamped to 0–100%.</p>
                </div>
              </div>
            </div>
          )}

          {/* Protocol */}
          <CollapsibleSection title="PROTOCOL" expanded={showProtocolDefaults} onToggle={() => setShowProtocolDefaults(v => !v)}>
            <div className="space-y-2">
              <CompactInput label="Quote APY" value={setup.quoteYield} onChange={(v) => setSetup(s => ({ ...s, quoteYield: v }))} suffix="%" />
              <div className="grid grid-cols-3 gap-1">
                <CompactInput label="Y₀" value={setup.ydmY0} onChange={(v) => setSetup(s => ({ ...s, ydmY0: v }))} suffix="%" />
                <CompactInput label="Y_T" value={setup.ydmYT} onChange={(v) => { setSetup(s => ({ ...s, ydmYT: v })); setAdaptYdmPct(Number.isFinite(parseNum(v)) ? parseNum(v) : 15); }} suffix="%" />
                <CompactInput label="Y_full" value={setup.ydmYFull} onChange={(v) => setSetup(s => ({ ...s, ydmYFull: v }))} suffix="%" />
              </div>
              <div className="grid grid-cols-3 gap-1">
                <CompactInput label="JT fee" value={setup.jtFee} onChange={(v) => setSetup(s => ({ ...s, jtFee: v }))} suffix="%" />
                <CompactInput label="ST fee" value={setup.stFee} onChange={(v) => setSetup(s => ({ ...s, stFee: v }))} suffix="%" />
                <CompactInput label="YS fee" value={setup.ysFee} onChange={(v) => setSetup(s => ({ ...s, ysFee: v }))} suffix="%" />
              </div>
            </div>
          </CollapsibleSection>

          {/* E-CLP Design */}
          <CollapsibleSection title="E-CLP POOL DESIGN" expanded={showEclpDesign} onToggle={() => setShowEclpDesign(v => !v)}>
            <p className="text-[10px] text-[#9ca3af] leading-snug mb-2">
              Balancer&apos;s E-CLP is like a <span className="text-white font-semibold">Curve stableswap with a hard price range</span>:
              all liquidity is concentrated inside [min price, max price]. Outside the range trades fail.
              <span className="text-[#fbbf24]"> Concentration</span> = Curve&apos;s A factor.
              <span className="text-[#fbbf24]"> Skew</span> rotates depth toward one side (Curve has no equivalent).
            </p>
            <div className="bg-[#0a0c10] border border-[#2a2f38] rounded p-2 mb-2">
              <div className="text-[9px] uppercase tracking-wider text-[#fbbf24] mb-1 font-semibold">Quick set: target pool mix</div>
              <p className="text-[9px] text-[#6b7280] mb-1.5 leading-snug">Want a 90/10 cash-heavy pool at par? Type 10% shares. Sets the Balancer price bounds automatically.</p>
              <div className="grid grid-cols-2 gap-1 mb-2">
                <CompactInput label="Target % shares" tip="At balance, the pool will hold this % in ST shares and the rest in cash." value={targetSharesPct} onChange={setTargetSharesPct} suffix="%" />
                <CompactInput label="Price tolerance" tip="Width on the close side of oracle par. The opposite side widens automatically to hit the target reserve composition." value={rangeTolerance} onChange={setRangeTolerance} suffix="%" />
              </div>
              <button onClick={applyTargetComposition} className="w-full bg-[#fbbf24] text-[#0a0c10] text-[10px] font-semibold py-1 rounded hover:bg-[#fcd34d]">
                Apply to min/max price
              </button>
              {(() => {
                const sp = parseNum(targetSharesPct) / 100;
                if (!(sp > 0 && sp < 1)) return null;
                const lambda = parseFloat(eclp.lambda);
                const phi = parseFloat(eclp.phi);
                const translated = translateTargetCashToEclpBounds((1 - sp) * 100, parseNum(rangeTolerance), lambda, phi, 1);
                if (!translated) {
                  return (
                    <div className="text-[9px] text-[#f87171] mt-1 text-center">
                      No Balancer-valid bounds for this target. Lower λ or widen price tolerance.
                    </div>
                  );
                }
                return <div className="text-[9px] font-mono text-[#6b7280] mt-1 text-center">→ α {translated.alpha.toFixed(4)} / β {translated.beta.toFixed(4)} at spot ≈ 1.0000</div>;
              })()}
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-1">
                <CompactInput
                  label="Min price (α)"
                  tip="Lowest pool price. Trades that would push price below this fail. In Curve terms: the floor of your concentrated range."
                  value={eclp.alpha}
                  onChange={(v) => setEclp(s => ({ ...s, alpha: v }))}
                />
                <CompactInput
                  label="Max price (β)"
                  tip="Highest pool price. Trades above this fail. Combined with min, defines the active liquidity range."
                  value={eclp.beta}
                  onChange={(v) => setEclp(s => ({ ...s, beta: v }))}
                />
              </div>
              <div className="grid grid-cols-3 gap-1">
                <CompactInput
                  label="Concentration"
                  tip="Like Curve's A factor. Higher = deeper liquidity near balance, less slippage on small trades. Balancer E-CLP λ must be ≥ 1. Default 100 because tighter 90/10 pools need lower λ or wider bounds to pass Balancer validation."
                  value={eclp.lambda}
                  onChange={(v) => setEclp(s => ({ ...s, lambda: v }))}
                  disabled={tradeCount > 0}
                  lockedHint={tradeCount > 0 ? `Locked — ${tradeCount} trade${tradeCount === 1 ? '' : 's'} executed. λ is immutable per PDF §03. Reset session to edit.` : undefined}
                />
                <CompactInput
                  label="Exit skew"
                  tip="Balancer rotation magnitude. 0 = symmetric (like Curve). Higher values skew the ellipse and change which side receives more depth. Curve has no equivalent."
                  value={eclp.phi}
                  onChange={(v) => setEclp(s => ({ ...s, phi: v }))}
                />
                <CompactInput
                  label="Swap fee"
                  tip="Pool fee on every trade. All fees accrue to Junior (no protocol cut at the pool level in Balancer V3)."
                  value={eclp.swapFeeRate}
                  onChange={(v) => setEclp(s => ({ ...s, swapFeeRate: v }))}
                  suffix="%"
                />
              </div>
              <div className="text-[9px] font-mono text-[#6b7280] tabular-nums leading-relaxed mt-2 space-y-0.5">
                {!eclpConfig ? (
                  <div className="rounded border border-[#7f1d1d] bg-[#2b1012] p-2 text-[#fca5a5] whitespace-normal">
                    Balancer rejects this α/β/λ/φ combo. Trades and depth are disabled because the pool could not be deployed with these parameters.
                    {eclpRepair && (
                      <button
                        type="button"
                        onClick={applyEclpRepair}
                        className="ml-2 rounded bg-[#f87171] px-2 py-0.5 text-[9px] font-semibold text-[#0a0c10] hover:bg-[#fca5a5]"
                      >
                        Use λ {eclpRepair.lambda.toFixed(0)}
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div>
                      current spot price:{' '}
                      <span className="text-white">{Number.isFinite(derived.poolPrice) ? derived.poolPrice.toFixed(4) : 'invalid'}</span>{' '}
                      {(Number.isFinite(derived.poolPrice) && derived.poolPrice >= parseFloat(eclp.alpha) && derived.poolPrice <= parseFloat(eclp.beta))
                        ? <span className="text-[#34d399]">✓ in range</span>
                        : <span className="text-[#f87171]">⚠ out of range — trades fail</span>}
                    </div>
                    <div>reserve ratio: <span className="text-white">{derived.reserveRatio.toFixed(4)}</span> quote/share NAV</div>
                    {(() => {
                      const avgT = Math.max(1, parseNum(avgTradeSize));
                      const exitQuote = quoteEclpSwap(derived.shareNavInPool, derived.quoteNavInPool, avgT, 'exit', 0, eclpConfig);
                      const enterQuote = quoteEclpSwap(derived.shareNavInPool, derived.quoteNavInPool, avgT, 'enter', 0, eclpConfig);
                      const bps = (q: { feasible: boolean; sigmaNav: number }) => q.feasible ? (q.sigmaNav / avgT) * 10000 : null;
                      const exitBps = bps(exitQuote);
                      const enterBps = bps(enterQuote);
                      return (
                        <>
                          <div title="Exact Balancer quote for the current avg trade size, excluding pool fee">exit impact @ avg trade: <span className="text-white">{exitBps === null ? 'infeasible' : `${exitBps.toFixed(1)} bps`}</span></div>
                          <div title="Exact Balancer quote for the current avg trade size, excluding pool fee">entry impact @ avg trade: <span className="text-white">{enterBps === null ? 'infeasible' : `${enterBps.toFixed(1)} bps`}</span></div>
                        </>
                      );
                    })()}
                  </>
                )}
              </div>
            </div>
          </CollapsibleSection>

          {/* Advanced */}
          <CollapsibleSection title="ADVANCED" expanded={showAdvancedSetup} onToggle={() => setShowAdvancedSetup(v => !v)}>
            <div className="grid grid-cols-2 gap-1">
              <CompactInput label="Asset price" value={setup.assetPrice} onChange={(v) => setSetup(s => ({ ...s, assetPrice: v }))} />
              <CompactInput label="Quote price" value={setup.quotePrice} onChange={(v) => setSetup(s => ({ ...s, quotePrice: v }))} />
            </div>
          </CollapsibleSection>

          <button onClick={resetPool} className="w-full text-[10px] text-[#9ca3af] hover:text-white bg-[#1a1d24] border border-[#2a2f38] rounded py-1.5 mt-2">
            Reset pool + session
          </button>
        </aside>

        {/* ============= CENTER: YIELDS + CHARTS ============= */}
        <main className="overflow-y-auto p-3 flex flex-col gap-3 min-w-0 min-h-0">
          {yields && (
            <>
              {/* Tranche cards */}
              <div className="grid grid-cols-2 gap-3">
                {/* Senior */}
                <div className="bg-[#13161c] border-l-2 border-l-[#22d3ee] border-y border-r border-[#2a2f38] rounded p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <div className="text-[10px] uppercase tracking-wider text-[#22d3ee] font-semibold">Senior Tranche</div>
                        {derived.utilization > 1 && (
                          <span className="text-[8px] font-bold uppercase tracking-wider bg-[#fbbf24] text-[#7f1d1d] px-1.5 py-0.5 rounded">⚠ UNDER-COVERED</span>
                        )}
                      </div>
                      <div className="text-[9px] text-[#6b7280]">Protected · paid first</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-white tabular-nums font-mono leading-none">{fmtPct(yields.seniorAPY)}</div>
                      <div className="text-[9px] text-[#6b7280] uppercase tracking-wider mt-0.5">net APY</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-[9px] pt-2 border-t border-[#2a2f38]">
                    <YieldSourceTile
                      label="Gross yield"
                      amount={yields.totalSeniorYield}
                      tip={`Senior's gross underlying yield before YDM redistribution. = capital ($${fmtNav(yields.seniorCapital, 0)}) × underlying APY (${(yields.r * 100).toFixed(2)}%).`}
                    />
                    <YieldSourceTile
                      label="− YDM cut"
                      amount={-yields.juniorRiskPremiumGross}
                      tip={`Portion diverted to Junior as risk premium. At ${(derived.utilization * 100).toFixed(1)}% util, ${(yields.ydmShare * 100).toFixed(2)}% of Senior's gross yield goes to Junior.`}
                    />
                    <YieldSourceTile
                      label="= Net"
                      amount={yields.seniorNetYield}
                      tip={`Senior's net annual yield after YDM cut and ST performance fee.`}
                    />
                  </div>
                  <button
                    onClick={() => setSeniorExpanded((v) => !v)}
                    className="mt-2 w-full text-[10px] text-[#6b7280] hover:text-[#22d3ee] flex items-center justify-center gap-1.5 py-1 border-t border-[#2a2f38] transition-colors"
                  >
                    {seniorExpanded ? '▲ Hide details' : '▼ Show full breakdown'}
                  </button>
                  {seniorExpanded && (
                    <div className="mt-2 pt-2 border-t border-[#2a2f38] space-y-0.5">
                      <BreakdownRow
                        label="Capital"
                        formula={`= Senior tranche size`}
                        amount={yields.seniorCapital}
                      />
                      <BreakdownRow
                        label="Gross underlying yield"
                        formula={`${(yields.r * 100).toFixed(2)}% × $${fmtCompact(yields.seniorCapital)}`}
                        amount={yields.totalSeniorYield}
                        relativeTo={yields.seniorCapital}
                      />
                      <BreakdownRow
                        label={`− YDM cut to Junior (${(yields.ydmShare * 100).toFixed(1)}%)`}
                        formula={`-${(yields.ydmShare * 100).toFixed(2)}% × $${fmtCompact(yields.totalSeniorYield)}`}
                        amount={-yields.juniorRiskPremiumGross}
                        relativeTo={yields.seniorCapital}
                        red
                      />
                      {yields.fSt > 0 && (
                        <BreakdownRow
                          label={`− ST performance fee (${(yields.fSt * 100).toFixed(2)}%)`}
                          formula={`-${(yields.fSt * 100).toFixed(2)}% × $${fmtCompact(yields.totalSeniorYield - yields.juniorRiskPremiumGross)}`}
                          amount={-(yields.totalSeniorYield - yields.juniorRiskPremiumGross) * yields.fSt}
                          relativeTo={yields.seniorCapital}
                          red
                        />
                      )}
                      <BreakdownRow
                        label="Net annual yield"
                        formula={`${fmtPct(yields.seniorAPY)} APY × $${fmtCompact(yields.seniorCapital)}`}
                        amount={yields.seniorNetYield}
                        relativeTo={yields.seniorCapital}
                        bold
                      />
                      <div className="mt-2 p-2 bg-[#0a0c10] rounded text-[10px] text-[#9ca3af] leading-relaxed">
                        <span className="text-[#22d3ee] font-semibold">How:</span>{' '}
                        Senior deposits underlying that earns {(yields.r * 100).toFixed(2)}% natively. At {(derived.utilization * 100).toFixed(1)}% util, the YDM curve diverts {(yields.ydmShare * 100).toFixed(2)}% of that yield to Junior as risk premium. Senior keeps the rest.
                      </div>
                    </div>
                  )}
                </div>

                {/* Junior */}
                <div className={`bg-[#13161c] border-l-2 ${derived.utilization > 1 ? 'border-l-[#f87171] ring-1 ring-[#f87171]/40' : 'border-l-[#fbbf24]'} border-y border-r border-[#2a2f38] rounded p-3 transition-all`}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <div className="text-[10px] uppercase tracking-wider text-[#fbbf24] font-semibold">Junior Tranche</div>
                        {derived.utilization > 1 && (
                          <span className="text-[8px] font-bold uppercase tracking-wider bg-[#f87171] text-[#7f1d1d] px-1.5 py-0.5 rounded">⚠ DEFICIT</span>
                        )}
                      </div>
                      <div className="text-[9px] text-[#6b7280]">First-loss · pool LP</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-2xl font-bold tabular-nums font-mono leading-none ${derived.utilization > 1 ? 'text-[#f87171]' : 'text-white'}`}>{fmtPct(yields.juniorAPY)}</div>
                      <div className="text-[9px] text-[#6b7280] uppercase tracking-wider mt-0.5">{derived.utilization > 1 ? 'pre-loss APY · ignore' : (includeTradingYield ? 'net APY incl. fees+σ' : 'net APY (own + YDM only)')}</div>
                    </div>
                  </div>
                  {/* Trading yield toggle */}
                  <div className="flex items-center justify-end gap-2 text-[10px] mt-1">
                    <span className="text-[#6b7280]">Include trading yield (③ fees + ④ σ)?</span>
                    <button
                      onClick={() => setIncludeTradingYield((v) => !v)}
                      className={`px-2 py-0.5 rounded border text-[9px] font-bold tabular-nums transition-colors ${
                        includeTradingYield
                          ? 'border-[#34d399] text-[#34d399] bg-[#34d399]/10'
                          : 'border-[#2a2f38] text-[#6b7280] hover:text-white'
                      }`}
                    >
                      {includeTradingYield ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-[9px] pt-2 border-t border-[#2a2f38]">
                    <YieldSourceTile
                      label="① Own"
                      amount={derived.shareNavInPool * yields.r + derived.quoteNavInPool * yields.rQ}
                      tip={`Yield on JT pool's holdings. Pool shares ($${fmtNav(derived.shareNavInPool, 0)}) × underlying APY (${(yields.r * 100).toFixed(2)}%) + pool cash ($${fmtNav(derived.quoteNavInPool, 0)}) × quote APY (${(yields.rQ * 100).toFixed(2)}%). Junior earns underlying yield on the internal Senior shares it holds.`}
                    />
                    <YieldSourceTile
                      label="② YDM"
                      amount={yields.juniorRiskPremiumGross}
                      tip={`Risk premium from Senior. At ${(derived.utilization * 100).toFixed(1)}% util, the YDM curve diverts ${(yields.ydmShare * 100).toFixed(2)}% of Senior's gross yield ($${fmtNav(yields.totalSeniorYield, 0)}) to Junior as compensation for first-loss coverage.`}
                    />
                    <YieldSourceTile
                      label="③ Fees"
                      amount={yields.annualFeeRevenue}
                      green
                      tip={`Annualized swap fees from market-making. Daily volume ($${fmtNav(parseNum(assumedDailyVolume), 0)}) × swap fee (${(parseFloat(eclp.swapFeeRate)).toFixed(3)}%) × 365 days. All fees accrue to JT BPT holders.`}
                    />
                    <YieldSourceTile
                      label="④ σ"
                      amount={yields.annualSigma}
                      green
                      tip={`Annualized slippage gains. Imbalancing trades (Senior exits into a share-heavy pool) pay a premium above oracle; balancing trades cost Junior. Net ≈ (imbalancing trades × κ × avg trade²) - (balancing trades × κ × avg trade²), × 365. Current: ${(parseNum(pctImbalancing)).toFixed(0)}% imbalancing.`}
                    />
                  </div>
                  <button
                    onClick={() => setJuniorExpanded((v) => !v)}
                    className="mt-2 w-full text-[10px] text-[#6b7280] hover:text-[#fbbf24] flex items-center justify-center gap-1.5 py-1 border-t border-[#2a2f38] transition-colors"
                  >
                    {juniorExpanded ? '▲ Hide details' : '▼ Show full breakdown'}
                  </button>
                  {juniorExpanded && (
                    <div className="mt-2 pt-2 border-t border-[#2a2f38] space-y-0.5">
                      <BreakdownRow
                        label="Pool TVL (capital)"
                        formula={`= ${fmtPct(derived.shareNavInPool / Math.max(derived.poolSizeNav, 1), 0)} shares + ${fmtPct(derived.quoteNavInPool / Math.max(derived.poolSizeNav, 1), 0)} cash`}
                        amount={yields.juniorCapital}
                      />
                      <div className="text-[9px] uppercase tracking-wider text-[#6b7280] font-semibold mt-2 mb-0.5">① Own underlying yield</div>
                      <BreakdownRow
                        label="Shares × underlying APY"
                        formula={`$${fmtCompact(derived.shareNavInPool)} × ${(yields.r * 100).toFixed(2)}%`}
                        amount={derived.shareNavInPool * yields.r}
                        relativeTo={yields.juniorCapital}
                      />
                      <BreakdownRow
                        label="Cash × quote APY"
                        formula={`$${fmtCompact(derived.quoteNavInPool)} × ${(yields.rQ * 100).toFixed(2)}%`}
                        amount={derived.quoteNavInPool * yields.rQ}
                        relativeTo={yields.juniorCapital}
                      />
                      {yields.fJt > 0 && (
                        <BreakdownRow
                          label={`− JT fee (${(yields.fJt * 100).toFixed(2)}%)`}
                          formula={`-${(yields.fJt * 100).toFixed(2)}% × own yield`}
                          amount={-yields.juniorOwnYield * yields.fJt}
                          relativeTo={yields.juniorCapital}
                          red
                        />
                      )}
                      <div className="text-[9px] uppercase tracking-wider text-[#6b7280] font-semibold mt-2 mb-0.5">② Risk premium (YDM)</div>
                      <BreakdownRow
                        label={`YDM share × Senior gross (${(yields.ydmShare * 100).toFixed(1)}%)`}
                        formula={`${(yields.ydmShare * 100).toFixed(2)}% × $${fmtCompact(yields.totalSeniorYield)}`}
                        amount={yields.juniorRiskPremiumGross}
                        relativeTo={yields.juniorCapital}
                      />
                      {yields.fYs > 0 && (
                        <BreakdownRow
                          label={`− Yield share fee (${(yields.fYs * 100).toFixed(2)}%)`}
                          formula={`-${(yields.fYs * 100).toFixed(2)}% × premium`}
                          amount={-yields.juniorRiskPremiumGross * yields.fYs}
                          relativeTo={yields.juniorCapital}
                          red
                        />
                      )}
                      {yields.fJt > 0 && (
                        <BreakdownRow
                          label={`− JT fee (${(yields.fJt * 100).toFixed(2)}%) on premium`}
                          formula={`-${(yields.fJt * 100).toFixed(2)}% × post-ys premium`}
                          amount={-(yields.juniorRiskPremiumGross * (1 - yields.fYs)) * yields.fJt}
                          relativeTo={yields.juniorCapital}
                          red
                        />
                      )}
                      <div className="text-[9px] uppercase tracking-wider text-[#6b7280] font-semibold mt-2 mb-0.5">③ Swap fees (annualized)</div>
                      <BreakdownRow
                        label="Daily volume × fee × 365"
                        formula={`$${fmtCompact(parseNum(assumedDailyVolume))} × ${parseFloat(eclp.swapFeeRate).toFixed(3)}% × 365`}
                        amount={yields.annualFeeRevenue}
                        relativeTo={yields.juniorCapital}
                        green
                      />
                      <div className="text-[9px] uppercase tracking-wider text-[#6b7280] font-semibold mt-2 mb-0.5">④ Slippage gains (σ)</div>
                        <BreakdownRow
                          label="Imbalancing premium"
                          formula={`tradesPerDay × ${parseNum(pctImbalancing).toFixed(0)}% × exact Balancer σ_exit/enter × 365`}
                        amount={yields.annualSigmaImb}
                        relativeTo={yields.juniorCapital}
                        green={yields.annualSigmaImb >= 0}
                      />
                        <BreakdownRow
                          label="Balancing cost"
                          formula={`tradesPerDay × ${(100 - parseNum(pctImbalancing)).toFixed(0)}% × exact Balancer σ_other side × 365`}
                        amount={yields.annualSigmaBal}
                        relativeTo={yields.juniorCapital}
                        red={yields.annualSigmaBal < 0}
                      />
                      <div className="mt-1 p-2 bg-[#0a0c10] border border-[#2a2f38] rounded text-[10px] text-[#9ca3af] leading-relaxed">
                        <span className="text-[#fbbf24] font-semibold">Why is balancing a cost to Junior?</span><br />
                        When a trade pulls the pool TOWARD its balance point, the E-CLP bonding curve <em>pays the trader a premium above the oracle rate</em> as a rebalancing incentive (per PDF §10). That premium comes out of Junior&apos;s pool NAV.<br />
                        <span className="text-[#34d399]">In practice</span>, a rational MM only takes a balancing trade if the discount they receive clears their cost of capital — so in a real market, balancing flow self-limits when it becomes too expensive for Junior. The simulator doesn&apos;t model that MM-side restraint; you can configure % imbalancing to reflect your expected flow mix.
                      </div>
                      <BreakdownRow
                        label="Net annual yield"
                        formula={`① + ② + ③ + ④ − fees`}
                        amount={yields.juniorTotalNetYield}
                        relativeTo={yields.juniorCapital}
                        bold
                      />
                      <div className="mt-2 p-2 bg-[#0a0c10] rounded text-[10px] text-[#9ca3af] leading-relaxed">
                        <span className="text-[#fbbf24] font-semibold">How:</span>{' '}
                        Junior holds a pool of ST shares + cash. Earns underlying APY on its shares (①), YDM risk premium from Senior (②), swap fees on every trade (③), and slippage gains when Senior exits into a share-heavy pool (④).
                        {derived.utilization > 1 && <><br /><span className="text-[#f87171] font-semibold">⚠ Currently in deficit — APY is theoretical; actual returns eroded by coverage shortfall.</span></>}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Chart panel */}
              <div className="bg-[#13161c] border border-[#2a2f38] rounded overflow-hidden flex-1 flex flex-col min-h-[480px]">
                <div className="border-b border-[#2a2f38] px-1 py-1 flex gap-0 bg-[#0c0e13] flex-wrap">
                  <ChartTabBtn label="📈 Yield curves" active={activeChart === 'apy'} onClick={() => setActiveChart('apy')} />
                  <ChartTabBtn label="🌊 Pool depth" active={activeChart === 'depth'} onClick={() => setActiveChart('depth')} />
                  <ChartTabBtn label="Pool parameters" active={activeChart === 'tune'} onClick={() => setActiveChart('tune')} />
                </div>
                <div className="p-3 flex-1 flex flex-col min-h-0">
                  {activeChart === 'apy' && (
                    <div className="flex-1 min-h-[420px] flex flex-col">
                      <div className="text-xs text-[#9ca3af] mb-2">YDM yield split + Senior/Junior APY across utilization. Dashed vertical = current util.</div>
                      <div className="flex-1 min-h-0"><ResponsiveContainerNoSSR width="100%" height="100%" minWidth={0} minHeight={320}>
                        <LineChart data={apyChartData} margin={{ top: 10, right: 60, left: 50, bottom: 50 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2a2f38" />
                          <XAxis dataKey="util" type="number" domain={[0, 100]}
                            label={{ value: 'Utilization (%)', position: 'insideBottom', offset: -10, fill: '#9ca3af', fontSize: 12 }}
                            stroke="#6b7280" tick={{ fontSize: 11 }} />
                          <YAxis label={{ value: 'APY / YDM share (%)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' }, fill: '#9ca3af', fontSize: 12 }} stroke="#6b7280" tick={{ fontSize: 11 }} />
                          <Tooltip contentStyle={{ background: '#0a0c10', border: '1px solid #2a2f38', borderRadius: 8, fontSize: 12 }}
                            formatter={(v: number) => `${v.toFixed(2)}%`} labelFormatter={(v: number) => `util = ${v.toFixed(0)}%`} />
                          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} verticalAlign="top" align="center" />
                          {/* Educational zones */}
                          <ReferenceArea x1={0} x2={90} fill="#22d3ee" fillOpacity={0.04} ifOverflow="hidden"
                            label={{ value: 'sub-target', position: 'insideTopLeft', fill: '#22d3ee', fontSize: 10, opacity: 0.6 }} />
                          <ReferenceArea x1={90} x2={100} fill="#fbbf24" fillOpacity={0.08} ifOverflow="hidden"
                            label={{ value: 'above target', position: 'insideTopRight', fill: '#fbbf24', fontSize: 10, opacity: 0.8 }} />
                          <ReferenceLine x={derived.utilization * 100} stroke="#fbbf24" strokeWidth={2} strokeDasharray="5 5"
                            label={{ value: `← you are here (${(derived.utilization * 100).toFixed(0)}% util)`, position: 'insideTopLeft', fill: '#fbbf24', fontSize: 10, fontWeight: 'bold', offset: 8 }} />
                          <ReferenceLine y={yields.r * 100} stroke="#6b7280" strokeDasharray="4 4" label={{ value: `r=${(yields.r * 100).toFixed(1)}%`, position: 'right', fill: '#6b7280', fontSize: 10 }} />
                          <Line type="monotone" dataKey="ydm" name="YDM yield share" stroke="#e5e7eb" strokeWidth={2} dot={false} isAnimationActive={false} />
                          <Line type="monotone" dataKey="juniorAPY" name="Junior APY (base)" stroke="#fbbf24" strokeWidth={3} dot={false} isAnimationActive={false} />
                          <Line type="monotone" dataKey="seniorAPY" name="Senior APY" stroke="#22d3ee" strokeWidth={3} dot={false} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainerNoSSR></div>
                    </div>
                  )}
                  {activeChart === 'depth' && (
                    <div className="flex-1 min-h-[420px] flex flex-col">
                      <div className="text-xs text-[#9ca3af] mb-2">Max trade size that keeps slippage under 50 bps, at each pool price. Dashed vertical = current price.</div>
                      <div className="flex-1 min-h-0"><ResponsiveContainerNoSSR width="100%" height="100%" minWidth={0} minHeight={320}>
                        <LineChart data={depthChartData} margin={{ top: 10, right: 30, left: 60, bottom: 50 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2a2f38" />
                          <XAxis dataKey="price" type="number" domain={['dataMin', 'dataMax']}
                            label={{ value: 'Spot price (quote/share NAV)', position: 'insideBottom', offset: -10, fill: '#9ca3af', fontSize: 12 }}
                            stroke="#6b7280" tick={{ fontSize: 11 }} tickFormatter={(v) => v.toFixed(3)} />
                          <YAxis label={{ value: 'Max trade ($, 50bps cap)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' }, fill: '#9ca3af', fontSize: 12 }} stroke="#6b7280" tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1e6 ? `$${(v/1e6).toFixed(1)}M` : `$${(v/1e3).toFixed(0)}K`} />
                          <Tooltip contentStyle={{ background: '#0a0c10', border: '1px solid #2a2f38', borderRadius: 8, fontSize: 12 }}
                            labelFormatter={(v: number) => `price ${v.toFixed(4)}`}
                            formatter={(v: number, name: string) => [`$${fmtNav(v, 0)}`, name]} />
                          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} verticalAlign="top" align="center" />
                          {/* Boundary danger zones */}
                          {(() => {
                            const a = parseFloat(eclp.alpha);
                            const b = parseFloat(eclp.beta);
                            const tol = (b - a) * 0.15;
                            return (
                              <>
                                <ReferenceArea x1={a} x2={a + tol} fill="#f87171" fillOpacity={0.06}
                                  label={{ value: '← thin', position: 'insideTopLeft', fill: '#f87171', fontSize: 9, opacity: 0.7 }} />
                                <ReferenceArea x1={b - tol} x2={b} fill="#f87171" fillOpacity={0.06}
                                  label={{ value: 'thin →', position: 'insideTopRight', fill: '#f87171', fontSize: 9, opacity: 0.7 }} />
                              </>
                            );
                          })()}
                          {Number.isFinite(derived.poolPrice) && (
                            <ReferenceLine x={derived.poolPrice} stroke="#fbbf24" strokeWidth={2} strokeDasharray="5 5"
                              label={{ value: 'NOW', position: 'insideTopRight', fill: '#fbbf24', fontSize: 10, fontWeight: 'bold', offset: 8 }} />
                          )}
                          <Line type="monotone" dataKey="depthExit" name="Exit depth (sell shares)" stroke="#34d399" strokeWidth={2} dot={false} isAnimationActive={false} />
                          <Line type="monotone" dataKey="depthEnter" name="Enter depth (buy shares)" stroke="#60a5fa" strokeWidth={2} dot={false} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainerNoSSR></div>
                    </div>
                  )}
                  {activeChart === 'tune' && (() => {
                    if (!poolParamTune) {
                      return (
                        <div className="flex-1 min-h-[420px] flex items-center justify-center text-sm text-[#9ca3af]">
                          No deployable Balancer E-CLP parameter set found for this pool size, target cash mix, and average exit size.
                        </div>
                      );
                    }
                    const {
                      recommended,
                      recommendedSlipBps,
                      targetSlippageBps,
                      baseLineConfigs,
                      days,
                      hurdle,
                      avgT,
                      tuneStatus,
                      minAttainableBps,
                      maxAttainableBps,
                      currentLambda,
                      currentTolerance,
                      targetCashPct,
                    } = poolParamTune;
                    const colors = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa'];
                    const phi = parseFloat(eclp.phi);
                    const lambdaInput = recommended.lambda < 100
                      ? recommended.lambda.toFixed(recommended.lambda < 10 ? 2 : 1)
                      : Math.max(1, Math.floor(recommended.lambda)).toFixed(0);
                    const lambdaDisplay = recommended.lambda < 100
                      ? recommended.lambda.toFixed(recommended.lambda < 10 ? 2 : 1)
                      : Math.max(1, Math.floor(recommended.lambda)).toFixed(0);
                    const toleranceInput = recommended.tolerance.toFixed(2);
                    const applyRecommendedParams = () => {
                      setRangeTolerance(toleranceInput);
                      setEclp((s) => ({
                        ...s,
                        alpha: recommended.alpha.toFixed(4),
                        beta: recommended.beta.toFixed(4),
                        lambda: lambdaInput,
                      }));
                    };
                    return (
                      <div className="flex-1 min-h-[420px] flex flex-col">
                        {/* === Duration + Hurdle inputs === */}
                        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 mb-3 bg-[#0a0c10] border border-[#2a2f38] rounded p-3">
                          <div>
                            <label className="text-[10px] uppercase tracking-wider text-[#6b7280] font-semibold block mb-1">Duration to redemption</label>
                            <div className="flex items-baseline">
                              <input
                                type="number" value={redemptionDays}
                                onChange={(e) => setRedemptionDays(e.target.value)}
                                className="bg-transparent text-lg font-bold text-white tabular-nums font-mono focus:outline-none w-20"
                              />
                              <span className="text-sm text-[#6b7280] ml-1">days</span>
                            </div>
                            <p className="text-[9px] text-[#6b7280] mt-0.5">How long an MM holds the asset until they can redeem at par.</p>
                          </div>
                          <div>
                            <label className="text-[10px] uppercase tracking-wider text-[#6b7280] font-semibold block mb-1">MM hurdle rate</label>
                            <div className="flex items-baseline">
                              <input
                                type="number" value={mmHurdle}
                                onChange={(e) => setMmHurdle(e.target.value)}
                                className="bg-transparent text-lg font-bold text-white tabular-nums font-mono focus:outline-none w-20"
                              />
                              <span className="text-sm text-[#6b7280] ml-1">% APY</span>
                            </div>
                            <p className="text-[9px] text-[#6b7280] mt-0.5">Cost of capital for a crypto MM. ~20% is typical.</p>
                          </div>
                          <div className="bg-[#13161c] border border-[#fbbf24]/40 rounded p-2 min-w-[180px]">
                            <div className="text-[9px] uppercase tracking-wider text-[#fbbf24] font-semibold">Target curve impact</div>
                            <div className="text-xl font-bold text-white tabular-nums font-mono">{targetSlippageBps.toFixed(0)} bps</div>
                            <div className="text-[9px] text-[#9ca3af] mt-0.5">= {hurdle * 100}% × {days}/365 = MM compensation for holding to redemption</div>
                          </div>
                        </div>

                        {/* === Recommendation card === */}
                        <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-3 mb-3 bg-gradient-to-r from-[#0a2918] to-[#13161c] border border-[#16a34a]/50 rounded p-3">
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-[#34d399] font-semibold mb-1">Recommended pool parameters</div>
                            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
                              <ParamTile label="α min price" value={recommended.alpha.toFixed(4)} />
                              <ParamTile label="β max price" value={recommended.beta.toFixed(4)} />
                              <ParamTile label="λ" value={lambdaDisplay} />
                              <ParamTile label="φ skew" value={phi.toFixed(3)} />
                              <ParamTile label="Swap fee" value={`${parseFloat(eclp.swapFeeRate).toFixed(2)}%`} />
                              <ParamTile label="Close-side band" value={`${recommended.tolerance.toFixed(2)}%`} />
                              <ParamTile label="Junior cash target" value={`${targetCashPct.toFixed(1)}%`} />
                            </div>
                            <div className="text-[11px] text-[#9ca3af] mt-1.5 leading-snug">
                              {tuneStatus === 'matched' && (
                                <>
                                  At avg exit <span className="font-mono text-white">${fmtCompact(avgT)}</span>, these params produce <span className="font-mono text-white">{recommendedSlipBps.toFixed(0)} bps</span> curve impact versus a <span className="font-mono text-white">{targetSlippageBps.toFixed(0)} bps</span> target. The solver keeps λ near the current setting when possible and moves the band width because that is the missing parameter.
                                </>
                              )}
                              {tuneStatus === 'closest' && (
                                <>
                                  Closest valid set produces <span className="font-mono text-white">{recommendedSlipBps.toFixed(0)} bps</span> versus target <span className="font-mono text-white">{targetSlippageBps.toFixed(0)} bps</span>. Exact hit was not found inside the deployable search grid.
                                </>
                              )}
                              {tuneStatus === 'target-below-min' && (
                                <>
                                  Target is <span className="font-mono text-white">{targetSlippageBps.toFixed(0)} bps</span>, but the lowest searched deployable impact is about <span className="font-mono text-white">{minAttainableBps.toFixed(0)} bps</span>. Use a lower avg exit size, a deeper pool, or a wider/lower-impact design if you need less impact.
                                </>
                              )}
                              {tuneStatus === 'target-above-max' && (
                                <>
                                  Target is <span className="font-mono text-white">{targetSlippageBps.toFixed(0)} bps</span>, but the highest searched deployable impact is about <span className="font-mono text-white">{maxAttainableBps.toFixed(0)} bps</span>. Increase avg exit size, narrow the range, or accept that exits may not clear the MM hurdle.
                                </>
                              )}
                              <br />
                              <span className="text-[#6b7280]">
                                Current inputs: λ {currentLambda.toFixed(currentLambda < 100 ? 1 : 0)}, close-side band {currentTolerance.toFixed(2)}%. φ and fee are carried through from the current E-CLP config; fee is excluded from the target and included in the exit-cost table.
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={applyRecommendedParams}
                            disabled={tradeCount > 0}
                            className="self-center bg-[#34d399] text-[#0a0c10] text-xs font-bold py-2 px-4 rounded hover:bg-[#6ee7b7] whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Set pool params
                          </button>
                          {tradeCount > 0 && (
                            <div className="text-[9px] text-[#fbbf24] text-center mt-1">
                              Locked after trades. Reset session to change immutable E-CLP params.
                            </div>
                          )}
                        </div>

                        {/* === Senior exit cost table === */}
                        <div className="mb-3">
                          <div className="text-[10px] uppercase tracking-wider text-[#22d3ee] font-semibold mb-1.5">Senior exit cost (recommended params)</div>
                          <div className="bg-[#0a0c10] rounded border border-[#2a2f38] overflow-hidden">
                            <table className="w-full text-[11px] tabular-nums">
                              <thead>
                                <tr className="border-b border-[#2a2f38] text-[#6b7280]">
                                  <th className="text-left p-2 font-normal uppercase text-[9px] tracking-wider">If you exit</th>
                                  <th className="text-right p-2 font-normal uppercase text-[9px] tracking-wider">USD size</th>
                                  <th className="text-right p-2 font-normal uppercase text-[9px] tracking-wider">Slippage</th>
                                  <th className="text-right p-2 font-normal uppercase text-[9px] tracking-wider">$ cost</th>
                                  <th className="text-right p-2 font-normal uppercase text-[9px] tracking-wider">Days of yield</th>
                                  <th className="text-right p-2 font-normal uppercase text-[9px] tracking-wider">% of position</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(() => {
                                  const effectiveRecommendedLambda = recommended.lambda;
                                  const recAlpha = recommended.alpha;
                                  const recBeta = recommended.beta;
                                  const recommendedConfig = recommended.cfg;
                                  const swapFeeRate = parseFloat(eclp.swapFeeRate) / 100;
                                  const ydmShareForAccounting = yields
                                    ? yields.ydmShare
                                    : safeYdmShare(setup.ydmYT);
                                  const syncedBefore = syncAccountingOnBefore(
                                    pool,
                                    derived.assetPrice,
                                    derived.quotePrice,
                                    ydmShareForAccounting,
                                  );
                                  const rangeEps = Math.max(1e-9, Math.abs(recBeta - recAlpha) * 1e-6);
                                  const rAnnualBps = yields ? yields.r * 10000 : 1;
                                  const seniorCap = yields ? yields.seniorCapital : derived.poolSizeNav;
                                  const exitSizes = [
                                    { label: 'avg trade', t: avgT },
                                    { label: '1% of Senior', t: seniorCap * 0.01 },
                                    { label: '5% of Senior', t: seniorCap * 0.05 },
                                    { label: '10% of Senior', t: seniorCap * 0.10 },
                                    { label: '20% of Senior', t: seniorCap * 0.20 },
                                    { label: '33% of Senior', t: seniorCap * 0.33 },
                                  ];
                                  return exitSizes.map((s, idx) => {
                                    const sim = simulateTrade(
                                      syncedBefore,
                                      s.t,
                                      'exit',
                                      derived.perShareRaw,
                                      derived.quotePrice,
                                      swapFeeRate,
                                      recommendedConfig,
                                      balancePoolPrice,
                                    );
                                    const bps = s.t > 0 ? ((sim.feeNav + sim.sigmaNav) / s.t) * 10000 : 0;
                                    const dollarCost = sim.feeNav + sim.sigmaNav;
                                    const simCounterValueNav = Math.max(0, s.t - sim.feeNav - sim.sigmaNav);
                                    const simShareNav = sim.newState.internalShares * derived.perShareRaw;
                                    const simQuoteNav = sim.newState.quoteReserves * derived.quotePrice;
                                    const simPoolPrice = computeEclpSpotPrice(simShareNav, simQuoteNav, recAlpha, recBeta, effectiveRecommendedLambda, phi);
                                    const inRange = simPoolPrice >= recAlpha - rangeEps && simPoolPrice <= recBeta + rangeEps;
                                    let coverageShortfall = 0;
                                    if (sim.feasible && inRange) {
                                      const accounted = syncAccountingOnAfter(
                                        syncedBefore,
                                        sim.newState,
                                        derived.assetPrice,
                                        derived.quotePrice,
                                        ydmShareForAccounting,
                                      );
                                      const requiredCoveragePost = coverageNavAtBalance(accounted, derived.assetPrice, derived.quotePrice, recommendedConfig, balancePoolPrice) * derived.minCoverage;
                                      coverageShortfall = requiredCoveragePost - accounted.jtEffectiveNav;
                                    }
                                    const daysOfYield = rAnnualBps > 0 ? (bps / (rAnnualBps / 365)) : 0;
                                    const pctOfPos = bps / 100;
                                    // Capacity checks:
                                    //   (a) trade size > pool TVL — pool literally can't fit this
                                    //   (b) payout > pool cash — pool can't pay trader
                                    //   (c) slippage ≥ 100% — trader gets nothing
                                    //   (d) post-trade goes out of [α,β] range
                                    //   (e) post-trade coverage breach (Junior can't support it)
                                    const exceedsTVL = s.t > derived.poolSizeNav;
                                    const exceedsCash = simCounterValueNav > derived.quoteNavInPool;
                                    const slipOverflow = bps >= 10000;
                                    const outOfRange = !inRange;
                                    const coverageBreach = coverageShortfall > NAV_EPS;
                                    const infeasible = !sim.feasible || exceedsTVL || exceedsCash || slipOverflow || outOfRange || coverageBreach;
                                    if (infeasible) {
                                      const reason = !sim.feasible
                                        ? 'insufficient pool liquidity'
                                        : exceedsTVL
                                          ? `pool TVL only $${fmtCompact(derived.poolSizeNav)}`
                                          : exceedsCash
                                            ? `only $${fmtCompact(derived.quoteNavInPool)} cash in pool`
                                            : slipOverflow
                                              ? `slippage ${bps.toFixed(0)} bps`
                                              : outOfRange
                                                ? `would push price outside [${recAlpha.toFixed(3)}, ${recBeta.toFixed(3)}]`
                                                : `Junior coverage short by $${fmtCompact(Math.max(0, coverageShortfall))}`;
                                      return (
                                        <tr key={idx} className={idx % 2 === 0 ? 'bg-[#13161c]' : ''}>
                                          <td className="p-2 text-white">{s.label}</td>
                                          <td className="p-2 text-right text-white font-mono">${fmtNav(s.t, 0)}</td>
                                          <td colSpan={4} className="p-2 text-right text-[#f87171] font-semibold">
                                            ⚠ INFEASIBLE — {reason}
                                          </td>
                                        </tr>
                                      );
                                    }
                                    return (
                                      <tr key={idx} className={idx % 2 === 0 ? 'bg-[#13161c]' : ''}>
                                        <td className="p-2 text-white">{s.label}</td>
                                        <td className="p-2 text-right text-white font-mono">${fmtNav(s.t, 0)}</td>
                                        <td className="p-2 text-right text-[#fbbf24]">{bps.toFixed(0)} bps</td>
                                        <td className="p-2 text-right text-[#f87171]">−${fmtNav(dollarCost, 0)}</td>
                                        <td className="p-2 text-right text-[#9ca3af]">{daysOfYield < 1 ? `${(daysOfYield * 24).toFixed(1)}h` : daysOfYield < 30 ? `${daysOfYield.toFixed(1)}d` : `${(daysOfYield / 30).toFixed(1)}mo`}</td>
                                        <td className="p-2 text-right text-[#9ca3af]">{pctOfPos.toFixed(2)}%</td>
                                      </tr>
                                    );
                                  });
                                })()}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* === MM yield chart === */}
                        <div className="text-[10px] uppercase tracking-wider text-[#34d399] font-semibold mb-1">MM perspective: annualized yield from arbing exits</div>
                        <div className="text-xs text-[#9ca3af] mb-2">
                          Each curve is a deployable parameter set. It shows the implied annualized return from curve impact if an MM buys a discounted Senior share and holds {days} days to redemption.
                          <span className="text-[#fbbf24]"> Yellow line = your MM hurdle ({hurdle * 100}% APY).</span>
                          {' '}Curves above the line clear the hurdle; curves below can stall.
                        </div>

                        <div className="flex-1 min-h-0"><ResponsiveContainerNoSSR width="100%" height="100%" minWidth={0} minHeight={320}>
                          <LineChart
                            data={poolParamChartData.map((row) => {
                              // Convert each line's bps to MM annualized yield:
                              // mm_apy = slippage_frac × (365 / days)
                              const out: { [key: string]: number } = { t: row.t };
                              baseLineConfigs.forEach((_, idx) => {
                                const bps = row[`line_${idx}`] as number;
                                const slipFrac = bps / 10000;
                                out[`mm_${idx}`] = slipFrac * (365 / days) * 100; // as %
                              });
                              return out;
                            })}
                            margin={{ top: 10, right: 30, left: 60, bottom: 50 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#2a2f38" />
                            <XAxis dataKey="t" type="number"
                              label={{ value: 'Exit trade size ($)', position: 'insideBottom', offset: -10, fill: '#9ca3af', fontSize: 12 }}
                              stroke="#6b7280" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${fmtCompact(v)}`} />
                            <YAxis
                              label={{ value: 'MM annualized yield (%)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' }, fill: '#9ca3af', fontSize: 12 }}
                              stroke="#6b7280" tick={{ fontSize: 11 }}
                              domain={[0, Math.max(hurdle * 100 * 3, 50)]}
                              tickFormatter={(v) => `${v.toFixed(0)}%`}
                            />
                            <Tooltip
                              contentStyle={{ background: '#0a0c10', border: '1px solid #2a2f38', borderRadius: 8, fontSize: 12 }}
                              labelFormatter={(v: number) => `exit = $${fmtCompact(v)} (${((v / derived.poolSizeNav) * 100).toFixed(1)}% TVL)`}
                              formatter={(v: number) => `${v.toFixed(1)}% APY`}
                            />
                            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} verticalAlign="top" align="center" />
                            <ReferenceLine y={hurdle * 100} stroke="#fbbf24" strokeDasharray="5 3" strokeWidth={2}
                              label={{ value: `MM hurdle = ${hurdle * 100}% APY`, position: 'right', fill: '#fbbf24', fontSize: 10 }} />
                            <ReferenceLine x={avgT} stroke="#9ca3af" strokeDasharray="3 3"
                              label={{ value: `avg exit $${fmtCompact(avgT)}`, position: 'top', fill: '#9ca3af', fontSize: 10 }} />
                            {baseLineConfigs.map((line, idx) => {
                              const isRec = line.label === 'recommended';
                              return (
                                <Line
                                  key={idx}
                                  type="monotone"
                                  dataKey={`mm_${idx}`}
                                  name={`${line.label}: λ ${line.lambda < 100 ? line.lambda.toFixed(line.lambda < 10 ? 2 : 1) : line.lambda.toFixed(0)} / band ${line.tolerance.toFixed(2)}%`}
                                  stroke={colors[idx % colors.length]}
                                  strokeWidth={isRec ? 3 : 1.5}
                                  strokeDasharray={isRec ? undefined : '4 2'}
                                  dot={false}
                                  isAnimationActive={false}
                                />
                              );
                            })}
                          </LineChart>
                        </ResponsiveContainerNoSSR></div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Pool composition visual */}
              <div className="bg-[#13161c] border border-[#2a2f38] rounded p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-[#9ca3af] font-semibold">Junior pool composition (NAV-weighted)</div>
                  <div className="text-[10px] font-mono text-[#6b7280] tabular-nums">
                    pool TVL ${fmtNav(derived.poolSizeNav, 0)}
                  </div>
                </div>
                <div className="flex h-6 rounded overflow-hidden">
                  <div className="bg-[#fbbf24] flex items-center justify-center text-[10px] font-semibold text-[#0a0c10] transition-all"
                    style={{ width: `${(derived.shareNavInPool / Math.max(derived.poolSizeNav, 1)) * 100}%` }}>
                    {derived.shareNavInPool > derived.poolSizeNav * 0.12
                      ? `ST shares ${(derived.poolSizeNav > 0 ? (derived.shareNavInPool / derived.poolSizeNav) * 100 : 0).toFixed(1)}% · $${fmtNav(derived.shareNavInPool, 0)}`
                      : ''}
                  </div>
                  <div className="bg-[#34d399] flex items-center justify-center text-[10px] font-semibold text-[#0a0c10] transition-all"
                    style={{ width: `${(derived.quoteNavInPool / Math.max(derived.poolSizeNav, 1)) * 100}%` }}>
                    {derived.quoteNavInPool > derived.poolSizeNav * 0.12
                      ? `Cash ${(derived.poolSizeNav > 0 ? (derived.quoteNavInPool / derived.poolSizeNav) * 100 : 0).toFixed(1)}% · $${fmtNav(derived.quoteNavInPool, 0)}`
                      : ''}
                  </div>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-2 text-[10px] font-mono tabular-nums">
                  <div className="text-[#fbbf24]">ST shares: {fmtPct(derived.poolSizeNav > 0 ? derived.shareNavInPool / derived.poolSizeNav : 0)} · ${fmtNav(derived.shareNavInPool, 0)}</div>
                  <div className="text-[#34d399] text-right">Cash: {fmtPct(derived.poolSizeNav > 0 ? derived.quoteNavInPool / derived.poolSizeNav : 0)} · ${fmtNav(derived.quoteNavInPool, 0)}</div>
                </div>
              </div>
            </>
          )}
        </main>

        {/* ============= RIGHT: TRADE SIMULATOR (swap UI) ============= */}
        <aside className="lg:border-l border-[#1f242c] overflow-y-auto p-3 space-y-3 bg-[#0c0e13]">
          <SidebarHeader badge="SWAP" badgeColor="amber" title="Trade simulator" />

          {/* === SWAP CARDS === */}
          {(() => {
            const payIsShares = tradeDirection === 'exit';
            const payToken = payIsShares ? 'ST shares' : 'Cash';
            const payAccent = payIsShares ? 'cyan' : 'green';
            const recvToken = payIsShares ? 'Cash' : 'ST shares';
            const recvAccent = payIsShares ? 'green' : 'cyan';
            const tradeNav = parseNum(tradeSize) || 0;
            const recvNav = tradePreview ? tradePreview.counterValueNav : 0;
            const payAmount = tradeNav > 0
              ? (payIsShares
                ? tradeNav / Math.max(derived.perShareRaw, 1e-18)
                : tradeNav / Math.max(derived.quotePrice, 1e-18))
              : 0;
            const recvAmount = recvNav > 0
              ? (payIsShares
                ? recvNav / Math.max(derived.quotePrice, 1e-18)
                : recvNav / Math.max(derived.perShareRaw, 1e-18))
              : 0;
            // Display both rates in quote/share terms.
            const effRate = payAmount > 0 && recvAmount > 0
              ? (payIsShares ? recvAmount / payAmount : payAmount / recvAmount)
              : 1;
            const oracleRate = Math.max(1e-18, derived.perShareRaw / Math.max(derived.quotePrice, 1e-18));
            const slipBps = tradeNav > 0 && tradePreview
              ? ((tradePreview.sigmaNav + tradePreview.feeNav) / tradeNav) * 10000
              : 0;
            const feeBps = tradeNav > 0 && tradePreview
              ? (tradePreview.feeNav / tradeNav) * 10000
              : 0;
            const sigBps = tradeNav > 0 && tradePreview
              ? (tradePreview.sigmaNav / tradeNav) * 10000
              : 0;
            const maxTradeNav = Math.max(derived.quoteNavInPool * 1.5, 1);
            const tradeStepNav = Math.max(1, derived.quoteNavInPool / 200);
            const seniorCap = yields ? yields.seniorCapital : 0;
            const exitPresetPcts = [1, 5, 10, 20, 33];
            const setExitPreset = (pct: number) => {
              const target = seniorCap * (pct / 100);
              const capped = Math.max(0, Math.min(target, maxSafeExitNow));
              setTradeDirection('exit');
              setTradeSize(fmtCommas(capped.toFixed(0)));
            };
            return (
              <>
                {/* You pay */}
                <div className={`bg-[#13161c] border border-[#2a2f38] rounded p-3 border-l-2 ${payAccent === 'cyan' ? 'border-l-[#22d3ee]' : 'border-l-[#34d399]'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] uppercase tracking-wider text-[#6b7280] font-semibold">You pay</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${payAccent === 'cyan' ? 'bg-[#22d3ee]/10 text-[#22d3ee] border border-[#22d3ee]/30' : 'bg-[#34d399]/10 text-[#34d399] border border-[#34d399]/30'}`}>{payToken}</span>
                  </div>
                  <div className="relative flex items-baseline">
                    <span className="text-sm text-[#6b7280] mr-1">$</span>
                    <input
                      type="text"
                      value={tradeSize}
                      onChange={(e) => setTradeSize(fmtCommas(e.target.value.replace(/[^0-9.]/g, '')))}
                      className="flex-1 bg-transparent text-right text-xl font-bold text-white tabular-nums font-mono focus:outline-none w-full min-w-0"
                    />
                  </div>
                  <input
                    type="range" min={0} max={maxTradeNav} step={tradeStepNav}
                    value={Math.min(parseNum(tradeSize) || 0, maxTradeNav)}
                    onChange={(e) => setTradeSize(fmtCommas(e.target.value))}
                    className="w-full utilization-slider mt-2"
                  />
                  <div className="mt-2.5 rounded border border-[#2a2f38] bg-[#0a0c10] p-2">
                    <div className="flex items-center justify-between text-[10px] mb-1.5">
                      <span className="text-[#9ca3af] uppercase tracking-wide">Max safe exit now</span>
                      <span className="text-white font-mono tabular-nums">${fmtNav(maxSafeExitNow, 0)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setTradeDirection('exit');
                          setTradeSize(fmtCommas(Math.max(0, maxSafeExitNow).toFixed(0)));
                        }}
                        disabled={maxSafeExitNow <= 0}
                        className="text-[10px] px-2 py-1 rounded border border-[#34d399] text-[#34d399] hover:bg-[#34d399]/10 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Use max
                      </button>
                      <span className="text-[9px] text-[#6b7280]">
                        capped by cash, range, and Junior coverage
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-5 gap-1">
                      {exitPresetPcts.map((pct) => {
                        const target = seniorCap * (pct / 100);
                        const capped = Math.max(0, Math.min(target, maxSafeExitNow));
                        const isCapped = capped + 1 < target;
                        return (
                          <button
                            key={pct}
                            onClick={() => setExitPreset(pct)}
                            disabled={maxSafeExitNow <= 0}
                            className="text-[10px] font-mono py-1 rounded border border-[#2a2f38] text-[#9ca3af] hover:text-white hover:border-white disabled:opacity-40 disabled:cursor-not-allowed"
                            title={isCapped ? `Capped to $${fmtNav(capped, 0)} by current pool constraints` : `$${fmtNav(capped, 0)}`}
                          >
                            {pct}%{isCapped ? '*' : ''}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-1 text-[9px] text-[#6b7280]">
                      presets are % of Senior TVL{maxSafeExitNow > 0 ? ` · ${exitPresetPcts.map((p) => `${p}%=$${fmtCompact(Math.min(seniorCap * (p / 100), maxSafeExitNow))}`).join(' · ')}` : ''}
                    </div>
                  </div>
                </div>

                {/* Swap direction button */}
                <div className="flex justify-center -my-1.5 relative z-10">
                  <button
                    onClick={() => setTradeDirection(tradeDirection === 'exit' ? 'enter' : 'exit')}
                    title="Swap direction"
                    className="w-8 h-8 bg-[#1a1d24] border-2 border-[#0c0e13] rounded-full flex items-center justify-center text-[#9ca3af] hover:text-white hover:bg-[#2a2f38] transition-colors text-sm"
                  >↓</button>
                </div>

                {/* You receive */}
                <div className={`bg-[#13161c] border border-[#2a2f38] rounded p-3 border-l-2 ${recvAccent === 'cyan' ? 'border-l-[#22d3ee]' : 'border-l-[#34d399]'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] uppercase tracking-wider text-[#6b7280] font-semibold">You receive</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${recvAccent === 'cyan' ? 'bg-[#22d3ee]/10 text-[#22d3ee] border border-[#22d3ee]/30' : 'bg-[#34d399]/10 text-[#34d399] border border-[#34d399]/30'}`}>{recvToken}</span>
                  </div>
                  <div className="text-right text-xl font-bold text-white tabular-nums font-mono">
                    {tradePreview ? `$${fmtNav(recvNav)}` : <span className="text-[#6b7280]">—</span>}
                  </div>
                </div>

                {/* Rate + cost breakdown */}
                {tradePreview && (
                  <div className="bg-[#0a0c10] border border-[#2a2f38] rounded p-2.5 space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-[#9ca3af]">Effective rate</span>
                      <span className="text-white font-mono tabular-nums">
                        {effRate.toFixed(4)}
                        <span className="text-[#6b7280] ml-1 text-[10px]">vs oracle {oracleRate.toFixed(4)}</span>
                      </span>
                    </div>
                    {(() => {
                      // Days of Senior underlying yield equivalent for context.
                      // "X days of yield" = bps / (r_annual_bps / 365)
                      const rAnnualBps = yields ? yields.r * 10000 : 0;
                      const bpsToDays = (bps: number) => {
                        if (rAnnualBps <= 0) return '—';
                        const days = Math.abs(bps) / (rAnnualBps / 365);
                        return days < 0.1 ? `${(days * 24).toFixed(1)}h` :
                               days < 1 ? `${days.toFixed(2)}d` :
                               days < 30 ? `${days.toFixed(1)}d` :
                               `${(days / 30).toFixed(1)}mo`;
                      };
                      return (
                        <>
                          <div className="flex justify-between">
                            <span className="text-[#9ca3af]">Pool fee</span>
                            <span className="text-[#fbbf24] font-mono tabular-nums">
                              {feeBps.toFixed(1)} bps
                              <span className="text-[#6b7280] ml-1 text-[10px]">= {bpsToDays(feeBps)} yield</span>
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#9ca3af]">Price impact (σ)</span>
                            <span className={`font-mono tabular-nums ${sigBps >= 0 ? 'text-[#fbbf24]' : 'text-[#34d399]'}`}>
                              {sigBps >= 0 ? '+' : ''}{sigBps.toFixed(1)} bps
                              <span className="text-[#6b7280] ml-1 text-[10px]">= {sigBps >= 0 ? '' : '−'}{bpsToDays(sigBps)} yield</span>
                            </span>
                          </div>
                          <div className="border-t border-[#2a2f38] my-1.5"></div>
	                          <div className="flex justify-between font-semibold">
	                            <span className="text-white">{slipBps >= 0 ? 'Total cost to trader' : 'Total rebate to trader'}</span>
	                            <span className={`${slipBps >= 0 ? 'text-[#f87171]' : 'text-[#34d399]'} font-mono tabular-nums`}>
	                              {Math.abs(slipBps).toFixed(1)} bps
	                              <span className={`${slipBps >= 0 ? 'text-[#fca5a5]' : 'text-[#86efac]'} ml-1 text-[10px] font-normal`}>= {bpsToDays(slipBps)} yield</span>
	                            </span>
	                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* Execute button */}
                <button
                  onClick={executeTrade}
                  disabled={!tradePreview || !tradePreview.feasible}
                  className="w-full bg-[#fbbf24] text-[#0a0c10] text-sm font-bold py-3 rounded hover:bg-[#fcd34d] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {tradePreview && !tradePreview.feasible ? '✗ INFEASIBLE — bounds or liquidity' : '▶ EXECUTE TRADE'}
                </button>

                {/* Junior impact callout */}
                {tradePreview && (
                  <div className={`rounded p-2.5 border ${tradePreview.jtEffDelta >= 0 ? 'bg-[#0a2918] border-[#16a34a]/60' : 'bg-[#2a0e0e] border-[#dc2626]/60'}`}>
                    <div className="text-[9px] uppercase tracking-wider mb-1.5 font-semibold opacity-80">
                      Junior tranche impact
                      <span className={`ml-2 font-normal ${tradePreview.isImbalancing ? 'text-[#fbbf24]' : 'text-[#22d3ee]'}`}>
                        {tradePreview.isImbalancing ? '· imbalancing trade' : '· balancing trade'}
                      </span>
                    </div>
                    <div className={`flex items-baseline justify-between text-lg font-bold tabular-nums font-mono mb-2 ${tradePreview.jtEffDelta >= 0 ? 'text-[#34d399]' : 'text-[#f87171]'}`}>
                      <span className="text-[10px] uppercase opacity-70">NAV change</span>
                      <span>{tradePreview.jtEffDelta >= 0 ? '▲ +' : '▼ '}${fmtNav(Math.abs(tradePreview.jtEffDelta))}</span>
                    </div>
                    <div className="space-y-0.5 text-[10px]">
                      <PreviewLine
                        label="utilization"
                        value={`${fmtPct(derived.utilization)} → ${fmtPct(tradePreview.util_new)} ${tradePreview.utilDelta > 0 ? '▲' : tradePreview.utilDelta < 0 ? '▼' : '→'}`}
                        green={tradePreview.utilDelta <= 0}
                        red={tradePreview.utilDelta > 0}
                      />
                      <PreviewLine
                        label="Δ util"
                        value={`${tradePreview.utilDelta > 0 ? '+' : ''}${(tradePreview.utilDelta * 100).toFixed(3)} pp`}
                        green={tradePreview.utilDelta <= 0}
                        red={tradePreview.utilDelta > 0}
                      />
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          {cumVolume > 0 && (
            <>
              <div className="bg-[#0a2918] border border-[#16a34a] rounded p-2 space-y-1 text-[10px]">
                <div className="text-[#86efac] font-semibold mb-1">📈 SESSION · {tradeCount} trade{tradeCount === 1 ? '' : 's'}</div>
                <PreviewLine label="Volume" value={`$${fmtNav(cumVolume, 0)}`} />
                <PreviewLine label="Fees" value={`+$${fmtNav(cumFees)}`} green />
                <PreviewLine label="σ residual" value={`${cumSigma >= 0 ? '+' : ''}$${fmtNav(cumSigma)}`} green={cumSigma >= 0} />
                <div className="border-t border-[#16a34a]/50 my-1"></div>
                <PreviewLine label="JT NAV gained" value={`+$${fmtNav(cumFees + cumSigma)}`} green bold />
              </div>
              {tradeHistory.length > 0 && (
                <div className="bg-[#13161c] border border-[#2a2f38] rounded p-2">
                  <div className="text-[9px] uppercase tracking-wider text-[#6b7280] font-semibold mb-1.5">Trade history (last {tradeHistory.length})</div>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {tradeHistory.map((t) => (
                      <div key={t.id} className="flex items-center justify-between text-[10px] py-1 px-1.5 bg-[#0a0c10] rounded">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[9px] font-bold ${t.direction === 'exit' ? 'text-[#fbbf24]' : 'text-[#22d3ee]'}`}>
                            {t.direction === 'exit' ? '→' : '←'}
                          </span>
                          <span className="text-[#9ca3af] font-mono tabular-nums">${fmtCompact(t.size)}</span>
                          <span className={`text-[8px] px-1 rounded ${t.isImbalancing ? 'bg-[#f87171]/20 text-[#f87171]' : 'bg-[#34d399]/20 text-[#34d399]'}`}>
                            {t.isImbalancing ? 'IMB' : 'BAL'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[9px] font-mono tabular-nums">
                          <span className={t.jtNavDelta >= 0 ? 'text-[#34d399]' : 'text-[#f87171]'}>
                            {t.jtNavDelta >= 0 ? '+' : ''}${fmtNav(t.jtNavDelta, 0)}
                          </span>
                          <span className={`${t.utilDelta <= 0 ? 'text-[#34d399]' : 'text-[#f87171]'} w-12 text-right`}>
                            {t.utilDelta > 0 ? '▲' : t.utilDelta < 0 ? '▼' : '→'}{(Math.abs(t.utilDelta) * 100).toFixed(2)}pp
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="border-t border-[#1f242c] pt-3">
            <div className="text-[9px] uppercase tracking-wider text-[#6b7280] font-semibold mb-2">Annualization assumptions</div>
            <div className="space-y-2">
              <CompactInput
                label="Daily volume"
                value={assumedDailyVolume}
                onChange={(v) => setAssumedDailyVolume(fmtCommas(v.replace(/[^0-9.]/g, '')))}
                prefix="$"
                tip="Total $ traded per day. Auto-defaults to Junior tranche / 365 (= 100% annual turnover). Drives annualized fees + slippage gains."
              />
              <CompactInput
                label="Avg trade size"
                value={avgTradeSize}
                onChange={(v) => setAvgTradeSize(fmtCommas(v.replace(/[^0-9.]/g, '')))}
                prefix="$"
                tip="Average single-trade size. Auto-defaults to Junior tranche / 5 (~20% of pool TVL). Slippage (σ) scales with t² so larger trades have outsize impact. Used by the Pool parameters solver."
              />
              <CompactInput
                label="% imbalancing"
                value={pctImbalancing}
                onChange={(v) => {
                  // Clamp 0..100
                  const n = parseFloat(v);
                  if (v === '' || v === '.') { setPctImbalancing(v); return; }
                  if (!Number.isFinite(n)) return;
                  const clamped = Math.max(0, Math.min(100, n));
                  setPctImbalancing(clamped.toString());
                }}
                suffix="%"
                tip="% of trades that are imbalancing (push pool away from balance). Senior exits into a share-heavy pool = imbalancing. 100% = all exits during stress, 50% = neutral flow."
              />
              {(() => {
                const dv = parseNum(assumedDailyVolume);
                const ats = parseNum(avgTradeSize);
                const dvZero = !Number.isFinite(dv) || dv <= 0;
                const atsZero = !Number.isFinite(ats) || ats <= 0;
                if (!dvZero && !atsZero) return null;
                return (
                  <div className="bg-[#3a2410] border border-[#fbbf24] rounded p-2 text-[10px] text-[#fbbf24] flex items-start gap-1.5">
                    <span>⚠</span>
                    <div className="leading-snug">
                      <span className="font-semibold">Trading forecast disabled:</span>{' '}
                      {dvZero && atsZero ? 'Set Daily volume and Avg trade size to > 0' :
                       dvZero ? 'Daily volume is 0 — set to > 0 for fee/σ APY' :
                       'Avg trade size is 0 — set to > 0 for σ APY'}.
                      <br />
                      <span className="text-[#fde68a] opacity-80">Until then, % imbalancing has no effect (σ and fees both compute to $0).</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ============================================================================
// Small presentational helpers
// ============================================================================

function SidebarHeader(props: { badge: string; badgeColor: 'green' | 'amber' | 'cyan'; title: string }) {
  const bg = props.badgeColor === 'green' ? 'bg-[#34d399]' : props.badgeColor === 'amber' ? 'bg-[#fbbf24]' : 'bg-[#22d3ee]';
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className={`text-[9px] font-bold tracking-wider uppercase ${bg} text-[#0a0c10] px-1.5 py-0.5 rounded`}>{props.badge}</span>
      <h3 className="text-[11px] font-semibold text-white uppercase tracking-wide">{props.title}</h3>
    </div>
  );
}

function CollapsibleSection(props: { title: string; expanded: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="border-t border-[#1f242c] pt-3">
      <button onClick={props.onToggle} className="w-full flex items-center justify-between text-left mb-2 hover:opacity-80">
        <h3 className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wide">{props.title}</h3>
        <span className="text-[10px] text-[#6b7280]">{props.expanded ? '▲' : '▼'}</span>
      </button>
      {props.expanded && props.children}
    </div>
  );
}

function ChartTabBtn(props: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      className={`text-[11px] px-3 py-1.5 rounded transition-colors ${props.active ? 'bg-[#1a1d24] text-white font-semibold' : 'text-[#6b7280] hover:text-[#9ca3af] hover:bg-[#13161c]'}`}
    >
      {props.label}
    </button>
  );
}

function ParamTile(props: { label: string; value: string }) {
  return (
    <div className="bg-[#0a0c10] border border-[#2a2f38] rounded px-2 py-1.5">
      <div className="text-[8px] uppercase tracking-wider text-[#6b7280] font-semibold">{props.label}</div>
      <div className="text-sm text-white font-mono tabular-nums font-bold leading-tight">{props.value}</div>
    </div>
  );
}

function YieldSourceTile(props: { label: string; amount: number; tip?: string; green?: boolean }) {
  const isNeg = props.amount < 0;
  const sign = isNeg ? '-' : '';
  const abs = Math.abs(props.amount);
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const onEnter = () => {
    if (!props.tip || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.bottom });
    setShow(true);
  };
  return (
    <div
      ref={ref}
      onMouseEnter={onEnter}
      onMouseLeave={() => setShow(false)}
      className={`relative bg-[#0a0c10] border border-[#2a2f38] rounded px-1.5 py-1 ${props.tip ? 'cursor-help hover:border-[#fbbf24]' : ''} transition-colors ${props.green ? 'border-l-2 border-l-[#34d399]' : ''}`}
    >
      <div className="text-[8px] uppercase tracking-wider text-[#6b7280]">{props.label}</div>
      <div className={`text-[10px] font-mono tabular-nums ${isNeg ? 'text-[#f87171]' : props.green ? 'text-[#34d399]' : 'text-white'}`}>{sign}${fmtNav(abs, 0)}</div>
      {props.tip && show && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            left: pos.x,
            top: pos.y + 8,
            transform: 'translateX(-50%)',
            zIndex: 99999,
            maxWidth: '16rem',
          }}
          className="bg-[#0a0c10] border border-[#fbbf24] rounded p-2.5 text-[11px] text-[#e5e7eb] shadow-2xl pointer-events-none leading-snug w-56"
        >
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-[#fbbf24]" />
          {props.tip}
        </div>,
        document.body,
      )}
    </div>
  );
}

function PreviewLine(props: { label: string; value: string; green?: boolean; red?: boolean; bold?: boolean }) {
  const color = props.green ? 'text-[#34d399]' : props.red ? 'text-[#f87171]' : 'text-white';
  const weight = props.bold ? 'font-bold' : 'font-medium';
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#9ca3af]">{props.label}</span>
      <span className={`tabular-nums font-mono ${color} ${weight}`}>{props.value}</span>
    </div>
  );
}

function PortalTooltip(props: { tip: string }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const onEnter = () => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top });
    setShow(true);
  };
  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={onEnter}
        onMouseLeave={() => setShow(false)}
        className="text-[9px] text-[#6b7280] hover:text-[#fbbf24] cursor-help transition-colors"
      >ⓘ</span>
      {show && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            left: pos.x,
            top: pos.y - 10,
            transform: 'translate(-50%, -100%)',
            zIndex: 99999,
            maxWidth: '16rem',
          }}
          className="bg-[#0a0c10] border border-[#fbbf24] rounded p-2.5 text-[11px] text-[#e5e7eb] shadow-2xl pointer-events-none leading-snug"
        >
          {props.tip}
          <div
            className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[#fbbf24]"
          />
        </div>,
        document.body,
      )}
    </>
  );
}

function CompactInput(props: {
  label: string;
  tip?: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  accent?: 'cyan' | 'amber' | 'green';
  disabled?: boolean;
  lockedHint?: string;
}) {
  const accentBorder =
    props.accent === 'cyan' ? 'focus-within:ring-[#22d3ee] border-l-[#22d3ee]'
    : props.accent === 'amber' ? 'focus-within:ring-[#fbbf24] border-l-[#fbbf24]'
    : props.accent === 'green' ? 'focus-within:ring-[#34d399] border-l-[#34d399]'
    : 'focus-within:ring-white';
  const lockedCls = props.disabled ? 'opacity-60' : '';
  return (
    <div className={`relative bg-[#1a1d24] border border-[#2a2f38] ${props.accent ? 'border-l-2' : ''} ${accentBorder} rounded px-3 py-2 focus-within:ring-1 ${lockedCls}`}>
      <div className="flex items-center gap-1 mb-1">
        <div className="text-[10px] uppercase tracking-wider text-[#6b7280] font-semibold">{props.label}</div>
        {props.disabled && (
          <span className="text-[9px] text-[#fbbf24] font-mono">🔒</span>
        )}
        {props.tip && <PortalTooltip tip={props.tip} />}
      </div>
      <div className="relative flex items-baseline">
        {props.prefix && (
          <span className="text-sm text-[#6b7280] mr-1 select-none">{props.prefix}</span>
        )}
        <input
          type="text"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          disabled={props.disabled}
          className={`flex-1 bg-transparent text-right text-lg font-semibold text-white tabular-nums font-mono focus:outline-none w-full min-w-0 ${props.disabled ? 'cursor-not-allowed' : ''}`}
        />
        {props.suffix && (
          <span className="text-sm text-[#6b7280] ml-1 select-none">{props.suffix}</span>
        )}
      </div>
      {props.disabled && props.lockedHint && (
        <div className="text-[9px] text-[#fbbf24] mt-1 leading-tight">{props.lockedHint}</div>
      )}
    </div>
  );
}

function BreakdownRow(props: {
  label: string;
  formula?: string;
  amount: number;
  relativeTo?: number;
  green?: boolean;
  red?: boolean;
  bold?: boolean;
}) {
  const isNeg = props.amount < 0;
  const sign = isNeg ? '-' : '';
  const abs = Math.abs(props.amount);
  const color = props.red || isNeg ? 'text-[#f87171]'
    : props.green ? 'text-[#34d399]'
    : 'text-white';
  const pct = props.relativeTo && props.relativeTo > 0
    ? (props.amount / props.relativeTo) * 100
    : null;
  const pctStr = pct !== null
    ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`
    : null;
  return (
    <div className={`group flex items-baseline justify-between gap-2 py-1 ${props.bold ? 'border-y border-[#2a2f38] my-1 py-1.5 px-1 bg-[#13161c] rounded' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className={`text-[11px] ${props.bold ? 'font-bold text-white' : 'text-[#9ca3af]'} truncate`}>{props.label}</div>
        {props.formula && (
          <div className="text-[9px] font-mono text-[#6b7280] opacity-0 group-hover:opacity-100 transition-opacity">{props.formula}</div>
        )}
      </div>
      <div className={`text-right ${color} ${props.bold ? 'font-bold' : 'font-medium'}`}>
        <div className="text-[11px] font-mono tabular-nums">{sign}${fmtNav(abs, 0)}</div>
        {pctStr && (
          <div className={`text-[9px] font-mono tabular-nums opacity-70 ${props.bold ? 'opacity-100' : ''}`}>{pctStr} APY</div>
        )}
      </div>
    </div>
  );
}

function KpiTile(props: {
  label: string;
  value: string;
  accent?: 'green' | 'amber' | 'cyan' | 'red';
}) {
  const valueColor =
    props.accent === 'green' ? 'text-[#34d399]'
    : props.accent === 'amber' ? 'text-[#fbbf24]'
    : props.accent === 'cyan' ? 'text-[#22d3ee]'
    : props.accent === 'red' ? 'text-[#f87171]'
    : 'text-white';
  return (
    <div className="flex flex-col px-3 py-1 border-l border-[#1f242c]">
      <span className="text-[9px] tracking-wider text-[#6b7280] font-semibold">{props.label}</span>
      <span className={`text-sm font-semibold tabular-nums font-mono ${valueColor}`}>{props.value}</span>
    </div>
  );
}
