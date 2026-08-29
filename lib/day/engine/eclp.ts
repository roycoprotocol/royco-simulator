import { WAD, toWadFloor } from './wad';

// =============================================================================
// Gyroscope E-CLP math + Balancer manipulation-resistant LP valuation.
// Mirrors GyroECLPMath.sol (tau/eta/zeta, mulA/mulAinv, invariant) and
// EclpLPOracle._computeEclpTvl. Floats instead of 38-dec fixed point.
//
// Both pool legs carry rate providers expressed in Dawn NAV units, so the pool
// operates in NAV-value space and the oracle numeraire price is 1 for each leg.
// The manipulation-resistant TVL therefore tracks the *invariant* (conserved by
// swaps) and the rate-driven leg values — it does NOT depend on spot reserves,
// so imbalancing the pool by selling into it cannot move the reported value.
// =============================================================================

export interface EclpParams {
  alpha: number; // lower price bound (token0 in token1)
  beta: number; // upper price bound
  c: number; // cos(phi)
  s: number; // sin(phi)
  lambda: number; // stretching / concentration
  /**
   * The 18-decimal values passed to the Gyro pool constructor.  The display
   * fields above remain numbers because the quote explorer is number-facing,
   * but the oracle path keeps these strings so parsing a canonical response
   * cannot throw away the last few wei of c, s, or a bound.
   */
  fixedParams?: EclpFixedParams;
  /**
   * The 38-decimal values stored by GyroECLPPool.  Balancer deliberately does
   * not derive these on-chain; Royco Deploy returns them with the pool design.
   * When present, the simulator uses them for the BPT oracle valuation.
   */
  derivedParams?: EclpDerivedParams;
}

export interface EclpFixedParams {
  alpha: string;
  beta: string;
  c: string;
  s: string;
  lambda: string;
}

export interface EclpDerivedParams {
  tauAlphaX: string;
  tauAlphaY: string;
  tauBetaX: string;
  tauBetaY: string;
  u: string;
  v: string;
  w: string;
  z: string;
  dSq: string;
}

interface V2 { x: number; y: number; }

// A = [[c/λ, -s/λ], [s, c]]   (rotation by -φ, x stretched by 1/λ)
function mulA(p: EclpParams, t: V2): V2 {
  return { x: (p.c * t.x - p.s * t.y) / p.lambda, y: p.s * t.x + p.c * t.y };
}
// A^{-1} = [[λc, s], [-λs, c]]
function mulAinv(p: EclpParams, t: V2): V2 {
  return { x: p.lambda * p.c * t.x + p.s * t.y, y: -p.lambda * p.s * t.x + p.c * t.y };
}
const dot = (a: V2, b: V2) => a.x * b.x + a.y * b.y;

// eta(z) = (z, 1) / sqrt(z²+1)  — unit vector with slope z
function eta(z: number): V2 {
  const d = Math.sqrt(z * z + 1);
  return { x: z / d, y: 1 / d };
}
// zeta(px) = -(mulA(-1, px)).y / (mulA(-1, px)).x   (GyroECLPMath.zeta, exact)
// For the axis-aligned base case (c=1,s=0,λ=1) this reduces to zeta(px)=px, so
// tau/reservesPerL run the price axis the same way the Solidity does: token0 (ST)
// reserve is maximal at the price floor α and 0 at the ceil β, and a swap that adds
// ST lowers the internal price (slippage ≥ 0). The previous -n.x/n.y returned 1/px,
// inverting the price axis — harmless for the invariant-based oracle (its sign flip
// in reservesPerL cancelled) but it made on-curve swaps pay out *more* than was sold.
function zeta(p: EclpParams, px: number): number {
  const n = mulA(p, { x: -1, y: px });
  return -n.y / n.x;
}
// tau(px) = eta(zeta(px)) — point on the unit circle for price px
const tau = (p: EclpParams, px: number): V2 => eta(zeta(p, px));

function numberFromFixed(value: string, scale: bigint): number {
  return Number(BigInt(value)) / Number(scale);
}

/** Use the pool's stored tau endpoints whenever Royco Deploy supplied them.
 * A Balancer ECLP stores these at 38 decimals and the oracle reads those
 * values back; recomputing them from a rounded UI number can move the BPT mark
 * by more than one wei. */
function tauEndpoint(p: EclpParams, endpoint: 'alpha' | 'beta'): V2 {
  const d = p.derivedParams;
  if (d) {
    const x = endpoint === 'alpha' ? d.tauAlphaX : d.tauBetaX;
    const y = endpoint === 'alpha' ? d.tauAlphaY : d.tauBetaY;
    try {
      return {
        x: numberFromFixed(x, 10n ** 38n),
        y: numberFromFixed(y, 10n ** 38n),
      };
    } catch {
      // A malformed optional payload must not make the educational quote
      // explorer unusable; the canonical response validator rejects it before
      // it reaches this path, and local configs can still use the fallback.
    }
  }
  return tau(p, endpoint === 'alpha' ? p.alpha : p.beta);
}

// Reserves per unit invariant at price pxIny. token0 (ST) reserve is max at the
// price floor and 0 at the ceil; token1 (stable) is the mirror. Both >= 0 in band.
// Real reserves are (corner − v), with corner = (mulAinv(tauβ).x, mulAinv(tauα).y);
// the offsets are *subtracted* from the curve point, matching GyroECLPMath's virtual
// offsets and EclpLPOracle._computeEclpTvl (vec.x = mulAinv(tauβ).x − mulAinv(tau).x).
export function reservesPerL(p: EclpParams, pxIny: number): V2 {
  const aB = mulAinv(p, tauEndpoint(p, 'beta'));
  const aA = mulAinv(p, tauEndpoint(p, 'alpha'));
  if (pxIny < p.alpha) return { x: aB.x - aA.x, y: 0 };
  if (pxIny > p.beta) return { x: 0, y: aA.y - aB.y };
  const v = mulAinv(p, tau(p, pxIny));
  return { x: aB.x - v.x, y: aA.y - v.y };
}

// Manipulation-resistant TVL = (px·xPerL + py·yPerL)·invariant   (EclpLPOracle).
export function eclpTVL(p: EclpParams, invariant: number, px: number, py: number): number {
  const r = reservesPerL(p, px / py);
  return (px * r.x + py * r.y) * invariant;
}

// ---------------------------------------------------------------------------
// Balancer fixed-point oracle path
// ---------------------------------------------------------------------------

// Balancer's normal and extra-precision scales.  Keeping this path in bigint
// arithmetic is important: the pool oracle floors both the live balances and
// the invariant before it computes TVL, while a Number round-trip can move a
// large pool by many WADs even when the displayed dollar value looks unchanged.
const ONE_XP = 10n ** 38n;
const XP_TO_NP = 10n ** 20n;
const XP_SPLIT = 10n ** 19n;
const ONE_20 = 10n ** 20n;
const ONE_36 = 10n ** 36n;

type FixedEclpParams = {
  alpha: bigint;
  beta: bigint;
  c: bigint;
  s: bigint;
  lambda: bigint;
};

type FixedDerivedEclpParams = {
  tauAlphaX: bigint;
  tauAlphaY: bigint;
  tauBetaX: bigint;
  tauBetaY: bigint;
  u: bigint;
  v: bigint;
  w: bigint;
  z: bigint;
  dSq: bigint;
};

const mulDownMagFixed = (a: bigint, b: bigint, scale = WAD): bigint => (a * b) / scale;
const mulUpMagFixed = (a: bigint, b: bigint, scale = WAD): bigint => {
  const product = a * b;
  if (product > 0n) return ((product - 1n) / scale) + 1n;
  if (product < 0n) return ((product + 1n) / scale) - 1n;
  return 0n;
};
const divDownMagFixed = (a: bigint, b: bigint, scale = WAD): bigint => {
  if (b === 0n) throw new Error('ECLP_DIVISION_BY_ZERO');
  return (a * scale) / b;
};
const divUpMagFixed = (a: bigint, b: bigint, scale = WAD): bigint => {
  if (b === 0n) throw new Error('ECLP_DIVISION_BY_ZERO');
  if (a === 0n) return 0n;
  let numerator = a;
  let denominator = b;
  if (denominator < 0n) {
    denominator = -denominator;
    numerator = -numerator;
  }
  const inflated = numerator * scale;
  return inflated > 0n
    ? ((inflated - 1n) / denominator) + 1n
    : ((inflated + 1n) / denominator) - 1n;
};

/** Signed normal × extra-precision → normal, copied from
 * SignedFixedPoint.mul{Down,Up}XpToNpU. */
function mulDownXpToNpFixed(a: bigint, b: bigint): bigint {
  const b1 = b / XP_SPLIT;
  const b2 = b % XP_SPLIT;
  const prod1 = a * b1;
  const prod2 = a * b2;
  const partial = prod1 + prod2 / XP_SPLIT;
  return prod1 >= 0n && prod2 >= 0n
    ? partial / XP_SPLIT
    : (partial + 1n) / XP_SPLIT - 1n;
}

function mulUpXpToNpFixed(a: bigint, b: bigint): bigint {
  const b1 = b / XP_SPLIT;
  const b2 = b % XP_SPLIT;
  const prod1 = a * b1;
  const prod2 = a * b2;
  const partial = prod1 + prod2 / XP_SPLIT;
  return prod1 <= 0n && prod2 <= 0n
    ? partial / XP_SPLIT
    : (partial - 1n) / XP_SPLIT + 1n;
}

const mulXpFixed = (a: bigint, b: bigint): bigint => (a * b) / ONE_XP;
const divXpFixed = (a: bigint, b: bigint): bigint => {
  if (b === 0n) throw new Error('ECLP_DIVISION_BY_ZERO');
  return (a * ONE_XP) / b;
};

function fixedParamsFor(p: EclpParams): FixedEclpParams | null {
  const raw = p.fixedParams;
  if (!raw) return null;
  try {
    return {
      alpha: BigInt(raw.alpha),
      beta: BigInt(raw.beta),
      c: BigInt(raw.c),
      s: BigInt(raw.s),
      lambda: BigInt(raw.lambda),
    };
  } catch {
    return null;
  }
}

function fixedDerivedFor(p: EclpParams): FixedDerivedEclpParams | null {
  const raw = p.derivedParams;
  if (!raw) return null;
  try {
    return {
      tauAlphaX: BigInt(raw.tauAlphaX),
      tauAlphaY: BigInt(raw.tauAlphaY),
      tauBetaX: BigInt(raw.tauBetaX),
      tauBetaY: BigInt(raw.tauBetaY),
      u: BigInt(raw.u),
      v: BigInt(raw.v),
      w: BigInt(raw.w),
      z: BigInt(raw.z),
      dSq: BigInt(raw.dSq),
    };
  } catch {
    return null;
  }
}

function fixedMulA(p: FixedEclpParams, t: { x: bigint; y: bigint }) {
  return {
    x:
      divDownMagFixed(mulDownMagFixed(p.c, t.x), p.lambda) -
      divDownMagFixed(mulDownMagFixed(p.s, t.y), p.lambda),
    y: mulDownMagFixed(p.s, t.x) + mulDownMagFixed(p.c, t.y),
  };
}

/** A^-1 for normal-precision vectors (the output is normal precision). */
function fixedMulAinv(p: FixedEclpParams, t: { x: bigint; y: bigint }) {
  return {
    x:
      mulDownMagFixed(mulDownMagFixed(t.x, p.lambda), p.c) +
      mulDownMagFixed(t.y, p.s),
    y:
      -mulDownMagFixed(mulDownMagFixed(t.x, p.lambda), p.s) +
      mulDownMagFixed(t.y, p.c),
  };
}

/** A^-1 for the 38-decimal stored tau endpoints (the output is extra
 * precision, matching GyroECLPMath.mulAinv). */
function fixedMulAinvXp(p: FixedEclpParams, t: { x: bigint; y: bigint }) {
  return {
    x:
      mulDownMagFixed(mulDownMagFixed(t.x, p.lambda), p.c) +
      mulDownMagFixed(t.y, p.s),
    y:
      -mulDownMagFixed(mulDownMagFixed(t.x, p.lambda), p.s) +
      mulDownMagFixed(t.y, p.c),
  };
}

function integerSqrt(value: bigint): bigint {
  if (value <= 0n) return 0n;
  let guess = 1n << BigInt((value.toString(2).length + 1) >> 1);
  while (true) {
    const next = (guess + value / guess) >> 1n;
    if (next >= guess) return guess;
    guess = next;
  }
}

/** GyroPoolMath.sqrt(input, 5): fixed-point floor sqrt(input). */
function sqrtFixed(value: bigint): bigint {
  return integerSqrt(value * WAD);
}

/**
 * The Balancer FixedPoint/LogExpMath implementation used by
 * GyroECLPMath.eta. This is intentionally kept separate from GyroPoolMath's
 * integer square root: Balancer's `powDown(x, 0.5e18)` first evaluates the
 * logarithm/exponential approximation and then subtracts its relative-error
 * margin. A mathematically exact square root is close, but not interchangeable
 * at the wei level on the ECLP boundary branches.
 */
function ln36Fixed(value: bigint): bigint {
  const x = value * WAD;
  const z = ((x - ONE_36) * ONE_36) / (x + ONE_36);
  const zSquared = (z * z) / ONE_36;
  let num = z;
  let series = num;
  for (const denominator of [3n, 5n, 7n, 9n, 11n, 13n, 15n]) {
    num = (num * zSquared) / ONE_36;
    series += num / denominator;
  }
  return series * 2n;
}

function lnFixed(value: bigint): bigint {
  let a = value;
  let negative = false;
  if (a < WAD) {
    a = (WAD * WAD) / a;
    negative = true;
  }

  // Exact 18/20-decimal constants from Balancer's LogExpMath.sol. They
  // decompose ln(a) into powers of two before the short Taylor series around
  // one.
  const a0 = 38877084059945950922200000000000000000000000000000000000n;
  const a1 = 6235149080811616882910000000n;
  const a2 = 7896296018268069516100000000000000n;
  const a3 = 888611052050787263676000000n;
  const a4 = 298095798704172827474000n;
  const a5 = 5459815003314423907810n;
  const a6 = 738905609893065022723n;
  const a7 = 271828182845904523536n;
  const a8 = 164872127070012814685n;
  const a9 = 128402541668774148407n;
  const a10 = 113314845306682631683n;
  const a11 = 106449445891785942956n;
  let sum = 0n;
  if (a >= a0 * WAD) {
    a /= a0;
    sum += 128n * WAD;
  }
  if (a >= a1 * WAD) {
    a /= a1;
    sum += 64n * WAD;
  }

  sum *= 100n;
  a *= 100n;
  const decompositions: Array<[bigint, bigint]> = [
    [a2, 32n * ONE_20],
    [a3, 16n * ONE_20],
    [a4, 8n * ONE_20],
    [a5, 4n * ONE_20],
    [a6, 2n * ONE_20],
    [a7, ONE_20],
    [a8, ONE_20 / 2n],
    [a9, ONE_20 / 4n],
    [a10, ONE_20 / 8n],
    [a11, ONE_20 / 16n],
  ];
  for (const [factor, exponent] of decompositions) {
    if (a >= factor) {
      a = (a * ONE_20) / factor;
      sum += exponent;
    }
  }

  const z = ((a - ONE_20) * ONE_20) / (a + ONE_20);
  const zSquared = (z * z) / ONE_20;
  let num = z;
  let series = num;
  for (const denominator of [3n, 5n, 7n, 9n, 11n]) {
    num = (num * zSquared) / ONE_20;
    series += num / denominator;
  }
  const result = (sum + series * 2n) / 100n;
  return negative ? -result : result;
}

function expFixed(value: bigint): bigint {
  let x = value;
  let negative = false;
  if (x < 0n) {
    x = -x;
    negative = true;
  }

  const x0 = 128n * WAD;
  const x1 = 64n * WAD;
  const a0 = 38877084059945950922200000000000000000000000000000000000n;
  const a1 = 6235149080811616882910000000n;
  const a2 = 7896296018268069516100000000000000n;
  const a3 = 888611052050787263676000000n;
  const a4 = 298095798704172827474000n;
  const a5 = 5459815003314423907810n;
  const a6 = 738905609893065022723n;
  const a7 = 271828182845904523536n;
  const a8 = 164872127070012814685n;
  const a9 = 128402541668774148407n;
  let first = 1n;
  if (x >= x0) {
    x -= x0;
    first = a0;
  } else if (x >= x1) {
    x -= x1;
    first = a1;
  }
  x *= 100n;

  let product = ONE_20;
  const products: Array<[bigint, bigint]> = [
    [32n * ONE_20, a2],
    [16n * ONE_20, a3],
    [8n * ONE_20, a4],
    [4n * ONE_20, a5],
    [2n * ONE_20, a6],
    [ONE_20, a7],
    [ONE_20 / 2n, a8],
    [ONE_20 / 4n, a9],
  ];
  for (const [threshold, factor] of products) {
    if (x >= threshold) {
      x -= threshold;
      product = (product * factor) / ONE_20;
    }
  }

  let term = x;
  let series = ONE_20 + term;
  for (const denominator of [2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n, 11n, 12n]) {
    term = ((term * x) / ONE_20) / denominator;
    series += term;
  }
  const result = (((product * series) / ONE_20) * first) / 100n;
  return negative ? (WAD * WAD) / result : result;
}

function logExpPowFixed(value: bigint, exponent: bigint): bigint {
  if (exponent === 0n) return WAD;
  if (value === 0n) return 0n;
  const lower = WAD - 100_000_000_000_000_000n;
  const upper = WAD + 100_000_000_000_000_000n;
  const log = lower < value && value < upper
    ? (() => {
      const ln36 = ln36Fixed(value);
      return ((ln36 / WAD) * exponent + ((ln36 % WAD) * exponent) / WAD) / WAD;
    })()
    : (lnFixed(value) * exponent) / WAD;
  return expFixed(log);
}

function sqrtPowDownFixed(value: bigint): bigint {
  const raw = logExpPowFixed(value, WAD / 2n);
  const maxError = ((raw * 10_000n + WAD - 1n) / WAD) + 1n;
  return raw > maxError ? raw - maxError : 0n;
}

/** GyroECLPMath.tau in normal precision.  The simulator only feeds the
 * oracle NAV mark positive prices, so the signed intermediate operations below
 * cover the complete E-CLP range without a floating-point fallback. */
function fixedTau(p: FixedEclpParams, pxIny: bigint) {
  const nd = fixedMulA(p, { x: -WAD, y: pxIny });
  const pxc = -divDownMagFixed(nd.y, nd.x);
  const z = sqrtPowDownFixed(WAD + mulDownMagFixed(pxc, pxc));
  return {
    x: divDownMagFixed(pxc, z),
    y: divDownMagFixed(WAD, z),
  };
}

function calcAtAChi(
  x: bigint,
  y: bigint,
  p: FixedEclpParams,
  d: FixedDerivedEclpParams,
): bigint {
  const dSq2 = mulXpFixed(d.dSq, d.dSq);
  let termXp = divDownMagFixed(d.w, p.lambda) + d.z;
  termXp = divDownMagFixed(termXp, p.lambda);
  termXp = divXpFixed(termXp, dSq2);
  let value = mulDownXpToNpFixed(
    mulDownMagFixed(x, p.c) - mulDownMagFixed(y, p.s),
    termXp,
  );
  let termNp =
    mulDownMagFixed(mulDownMagFixed(x, p.lambda), p.s) +
    mulDownMagFixed(mulDownMagFixed(y, p.lambda), p.c);
  value += mulDownXpToNpFixed(termNp, divXpFixed(d.u, dSq2));
  termNp = mulDownMagFixed(x, p.s) + mulDownMagFixed(y, p.c);
  value += mulDownXpToNpFixed(termNp, divXpFixed(d.v, dSq2));
  return value;
}

function calcAChiAChiInXp(
  p: FixedEclpParams,
  d: FixedDerivedEclpParams,
): bigint {
  const dSq3 = mulXpFixed(mulXpFixed(d.dSq, d.dSq), d.dSq);
  let value = mulUpMagFixed(
    p.lambda,
    divXpFixed(mulXpFixed(2n * d.u, d.v), dSq3),
  );
  const lambdaSquaredTerm = divXpFixed(
    mulXpFixed(d.u + 1n, d.u + 1n),
    dSq3,
  );
  value += mulUpMagFixed(mulUpMagFixed(lambdaSquaredTerm, p.lambda), p.lambda);
  value += divXpFixed(mulXpFixed(d.v, d.v), dSq3);
  const termXp = divUpMagFixed(d.w, p.lambda) + d.z;
  value += divXpFixed(mulXpFixed(termXp, termXp), dSq3);
  return value;
}

function calcMinAtxAChiySqPlusAtxSq(
  x: bigint,
  y: bigint,
  p: FixedEclpParams,
  d: FixedDerivedEclpParams,
): bigint {
  let termNp =
    mulUpMagFixed(mulUpMagFixed(mulUpMagFixed(x, x), p.c), p.c) +
    mulUpMagFixed(mulUpMagFixed(mulUpMagFixed(y, y), p.s), p.s);
  termNp -= mulDownMagFixed(mulDownMagFixed(mulDownMagFixed(x, y), 2n * p.c), p.s);

  const dSq4 = mulXpFixed(mulXpFixed(mulXpFixed(d.dSq, d.dSq), d.dSq), d.dSq);
  let termXp = mulXpFixed(d.u, d.u);
  termXp += divDownMagFixed(mulXpFixed(2n * d.u, d.v), p.lambda);
  termXp += divDownMagFixed(divDownMagFixed(mulXpFixed(d.v, d.v), p.lambda), p.lambda);
  termXp = divXpFixed(termXp, dSq4);
  let value = mulDownXpToNpFixed(-termNp, termXp);
  value += mulDownXpToNpFixed(
    divDownMagFixed(divDownMagFixed(termNp - 9n, p.lambda), p.lambda),
    divXpFixed(ONE_XP, d.dSq),
  );
  return value;
}

function calc2AtxAtyAChixAChiy(
  x: bigint,
  y: bigint,
  p: FixedEclpParams,
  d: FixedDerivedEclpParams,
): bigint {
  let termNp = mulDownMagFixed(
    mulDownMagFixed(mulDownMagFixed(x, x) - mulUpMagFixed(y, y), 2n * p.c),
    p.s,
  );
  const xy = mulDownMagFixed(y, 2n * x);
  termNp += mulDownMagFixed(mulDownMagFixed(xy, p.c), p.c);
  termNp -= mulDownMagFixed(mulDownMagFixed(xy, p.s), p.s);

  const dSq4 = mulXpFixed(mulXpFixed(mulXpFixed(d.dSq, d.dSq), d.dSq), d.dSq);
  let termXp = mulXpFixed(d.z, d.u) + divDownMagFixed(divDownMagFixed(mulXpFixed(d.w, d.v), p.lambda), p.lambda);
  termXp += divDownMagFixed(mulXpFixed(d.w, d.u) + mulXpFixed(d.z, d.v), p.lambda);
  termXp = divXpFixed(termXp, dSq4);
  return mulDownXpToNpFixed(termNp, termXp);
}

function calcMinAtyAChixSqPlusAtySq(
  x: bigint,
  y: bigint,
  p: FixedEclpParams,
  d: FixedDerivedEclpParams,
): bigint {
  let termNp =
    mulUpMagFixed(mulUpMagFixed(mulUpMagFixed(x, x), p.s), p.s) +
    mulUpMagFixed(mulUpMagFixed(mulUpMagFixed(y, y), p.c), p.c);
  termNp += mulUpMagFixed(mulUpMagFixed(mulUpMagFixed(x, y), 2n * p.s), p.c);

  const dSq4 = mulXpFixed(mulXpFixed(mulXpFixed(d.dSq, d.dSq), d.dSq), d.dSq);
  let termXp = mulXpFixed(d.z, d.z) + divDownMagFixed(divDownMagFixed(mulXpFixed(d.w, d.w), p.lambda), p.lambda);
  termXp += divDownMagFixed(mulXpFixed(2n * d.z, d.w), p.lambda);
  termXp = divXpFixed(termXp, dSq4);
  let value = mulDownXpToNpFixed(-termNp, termXp);
  value += mulDownXpToNpFixed(termNp - 9n, divXpFixed(ONE_XP, d.dSq));
  return value;
}

function balancerInvariantDown(
  p: FixedEclpParams,
  d: FixedDerivedEclpParams,
  x: bigint,
  y: bigint,
): bigint {
  const atAChi = calcAtAChi(x, y, p, d);
  const term1 = calcMinAtxAChiySqPlusAtxSq(x, y, p, d);
  const term2 = calc2AtxAtyAChixAChiy(x, y, p, d);
  const term3 = calcMinAtyAChixSqPlusAtySq(x, y, p, d);
  let sqrtTerm = term1 + term2 + term3;
  let error = (mulUpMagFixed(x, x) + mulUpMagFixed(y, y)) / ONE_XP;
  sqrtTerm = sqrtTerm > 0n ? sqrtFixed(sqrtTerm) : 0n;
  if (sqrtTerm > 0n) {
    error = divUpMagFixed(error + 1n, 2n * sqrtTerm);
  } else {
    error = error > 0n ? sqrtFixed(error) : 1_000_000_000n;
  }
  error = ((mulUpMagFixed(p.lambda, x + y) / ONE_XP) + error + 1n) * 20n;

  const denominator = divXpFixed(ONE_XP, calcAChiAChiInXp(p, d) - ONE_XP);
  const current = mulDownXpToNpFixed(atAChi + sqrtTerm - error, denominator);
  error = mulUpXpToNpFixed(error, denominator);
  const lambdaSq = (p.lambda * p.lambda) / (10n ** 36n);
  error += (mulUpXpToNpFixed(current, denominator) * lambdaSq * 40n) / ONE_XP + 1n;
  const roundedDown = current - error;
  return roundedDown > 0n ? roundedDown : 0n;
}

function removeExtraPrecision(value: bigint): bigint {
  return value / XP_TO_NP;
}

/**
 * The Balancer EclpLPOracle TVL mark for WAD balances and WAD token prices.
 * It follows the oracle's order exactly: live scaled balances → Gyro
 * `computeInvariant(..., ROUND_DOWN)` → `_computeEclpTvl` → floor. A local
 * curve without both deployment response payloads (`fixedParams` and
 * `derivedParams`) falls back to the geometric curve already used by the quote
 * explorer; a canonical response carries both, so production APYs take the
 * fixed-point path.
 */
export function eclpOracleTvlWad(
  p: EclpParams,
  balances: { x: bigint; y: bigint },
  prices: { x: bigint; y: bigint } = { x: WAD, y: WAD },
): bigint {
  if (balances.x <= 0n && balances.y <= 0n) return 0n;
  const d = fixedDerivedFor(p);
  const fp = fixedParamsFor(p);
  if (!d || !fp) {
    const invariant = eclpInvariant(p, fromFixedWad(balances.x), fromFixedWad(balances.y));
    return toWadFloor(
      eclpTVL(p, invariant, fromFixedWad(prices.x), fromFixedWad(prices.y)),
    );
  }
  const invariant = balancerInvariantDown(fp, d, balances.x, balances.y);
  if (invariant <= 0n) return 0n;
  // EclpLPOracle rejects either feed before doing its branch calculation.
  // Keep the same lower bound instead of silently returning a plausible but
  // non-contract value for a malformed/underflowed price feed.
  const minPrice = 100_000_000_000n; // 1e-7 in 18-decimal scale
  if (prices.x < minPrice || prices.y < minPrice) {
    throw new Error('ECLP_TOKEN_PRICE_TOO_SMALL');
  }
  const pxIny = divDownMagFixed(prices.x, prices.y);
  let valuePerInvariant: bigint;
  const tauBeta = fixedMulAinvXp(fp, { x: d.tauBetaX, y: d.tauBetaY });
  const tauAlpha = fixedMulAinvXp(fp, { x: d.tauAlphaX, y: d.tauAlphaY });
  if (pxIny < fp.alpha) {
    const bP = removeExtraPrecision(tauBeta.x - tauAlpha.x);
    valuePerInvariant = mulDownMagFixed(bP, prices.x);
  } else if (pxIny > fp.beta) {
    const bP = removeExtraPrecision(tauAlpha.y - tauBeta.y);
    valuePerInvariant = mulDownMagFixed(bP, prices.y);
  } else {
    const v = fixedMulAinv(fp, fixedTau(fp, pxIny));
    const vec = {
      x: removeExtraPrecision(tauBeta.x) - v.x,
      y: removeExtraPrecision(tauAlpha.y) - v.y,
    };
    valuePerInvariant =
      mulDownMagFixed(prices.x, vec.x) + mulDownMagFixed(prices.y, vec.y);
  }
  return valuePerInvariant > 0n
    ? mulDownMagFixed(valuePerInvariant, invariant)
    : 0n;
}

const fromFixedWad = (value: bigint): number => Number(value) / 1e18;

// Invariant L from NAV-value balances (X, Y), in closed form. The pool sits on
// the curve where (X, Y) = L·reservesPerL(p) = L·(corner − mulAinv(tau(p))), with
// corner = (mulAinv(tauβ).x, mulAinv(tauα).y). Since mulA(mulAinv(tau)) = tau and
// ‖tau‖ = 1, writing Q = mulA(X,Y), P = mulA(corner) gives ‖P − Q/L‖ = 1, i.e.
//     (‖P‖²−1)·L² − 2⟨Q,P⟩·L + ‖Q‖² = 0.
// Solving exactly (no iteration, no averaging) makes L exactly swap-invariant, so
// the EclpLPOracle TVL does not drift as the pool is imbalanced. Conserved by swaps.
export function eclpInvariant(p: EclpParams, X: number, Y: number): number {
  if (X <= 0 && Y <= 0) return 0;
  const aB = mulAinv(p, tauEndpoint(p, 'beta'));
  const aA = mulAinv(p, tauEndpoint(p, 'alpha'));
  if (Y <= 0) return X / (aB.x - aA.x); // out of band: all token0
  if (X <= 0) return Y / (aA.y - aB.y); // out of band: all token1
  const corner: V2 = { x: aB.x, y: aA.y };
  const Q = mulA(p, { x: X, y: Y });
  const P = mulA(p, corner);
  const a = dot(P, P) - 1;
  const b = -2 * dot(Q, P);
  const c = dot(Q, Q);
  if (Math.abs(a) < 1e-12) return -c / b; // degenerate (‖P‖→1): linear
  const disc = Math.max(0, b * b - 4 * a * c);
  const sq = Math.sqrt(disc);
  const r1 = (-b + sq) / (2 * a);
  const r2 = (-b - sq) / (2 * a);
  return Math.max(r1, r2) > 0 ? Math.max(r1, r2) : Math.min(r1, r2);
}

// Internal price where token0-per-L equals xPerL (reservesPerL.x is monotone
// decreasing in price, so this bisection is unambiguous and stays on the band arc).
function priceForXPerL(p: EclpParams, xPerL: number): number {
  let lo = p.alpha, hi = p.beta, px = (lo + hi) / 2;
  for (let i = 0; i < 100; i++) {
    px = (lo + hi) / 2;
    if (reservesPerL(p, px).x > xPerL) lo = px; else hi = px;
  }
  return px;
}

// Sell `sellValue` of token0 (ST) value into the pool; the internal price falls
// toward alpha. The swap is parameterized by price along the band: both legs are
// read from reservesPerL at the start/end prices for the SAME invariant L, so the
// move stays on the convex arc (slippage >= 0) and L — hence the EclpLPOracle TVL
// — is unchanged. filled < sellValue => the band floor was reached (pool went
// all-ST and ran out of stable to pay). Returns stable out and filled ST value.
export function eclpSellValue(p: EclpParams, X: number, Y: number, sellValue: number) {
  const L = eclpInvariant(p, X, Y);
  if (L <= 0) return { stableOut: 0, filled: 0, Lconserved: 0 };
  const px0 = priceForXPerL(p, X / L); // current internal price
  const r0 = reservesPerL(p, px0);
  const xFloorPerL = reservesPerL(p, p.alpha).x; // token0-per-L when stable hits 0
  const filled = Math.min(sellValue, Math.max(0, xFloorPerL * L - X));
  const px1 = priceForXPerL(p, (X + filled) / L); // price after selling
  const r1 = reservesPerL(p, px1);
  const stableOut = Math.max(0, (r0.y - r1.y) * L); // stable released along the arc
  return { stableOut, filled, Lconserved: L };
}

// Build params for a peg-centred pool with a target token0 (ST) value weight and
// lower price bound 1-bw. We solve the upper bound beta so the peg composition
// hits `wST`. Axis-aligned (c=1,s=0, φ=0) to keep price 1 off the singularity;
// lambda sets depth. Priced identically to a rotated E-CLP by EclpLPOracle.
export function eclpParamsForWeight(wST: number, lambda: number, bw: number): EclpParams {
  const c = 1, s = 0; // axis-aligned E-CLP (φ=0): no center-price singularity
  const alpha = Math.max(0.01, 1 - bw);
  // bisection on beta so reservesPerL(1) gives the target ST value weight at peg
  let lo = 1.0001, hi = 6, beta = 1.05;
  for (let i = 0; i < 100; i++) {
    beta = (lo + hi) / 2;
    const p: EclpParams = { alpha, beta, c, s, lambda };
    const r = reservesPerL(p, 1);
    const w = r.x / (r.x + r.y); // px=py=1 at peg
    if (!isFinite(w)) { hi = beta; continue; }
    if (w > wST) hi = beta; else lo = beta; // smaller beta -> peg nearer ceil -> less ST
  }
  return { alpha, beta, c, s, lambda };
}
