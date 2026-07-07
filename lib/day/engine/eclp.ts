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

// Reserves per unit invariant at price pxIny. token0 (ST) reserve is max at the
// price floor and 0 at the ceil; token1 (stable) is the mirror. Both >= 0 in band.
// Real reserves are (corner − v), with corner = (mulAinv(tauβ).x, mulAinv(tauα).y);
// the offsets are *subtracted* from the curve point, matching GyroECLPMath's virtual
// offsets and EclpLPOracle._computeEclpTvl (vec.x = mulAinv(tauβ).x − mulAinv(tau).x).
export function reservesPerL(p: EclpParams, pxIny: number): V2 {
  const aB = mulAinv(p, tau(p, p.beta));
  const aA = mulAinv(p, tau(p, p.alpha));
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

// Invariant L from NAV-value balances (X, Y), in closed form. The pool sits on
// the curve where (X, Y) = L·reservesPerL(p) = L·(corner − mulAinv(tau(p))), with
// corner = (mulAinv(tauβ).x, mulAinv(tauα).y). Since mulA(mulAinv(tau)) = tau and
// ‖tau‖ = 1, writing Q = mulA(X,Y), P = mulA(corner) gives ‖P − Q/L‖ = 1, i.e.
//     (‖P‖²−1)·L² − 2⟨Q,P⟩·L + ‖Q‖² = 0.
// Solving exactly (no iteration, no averaging) makes L exactly swap-invariant, so
// the EclpLPOracle TVL does not drift as the pool is imbalanced. Conserved by swaps.
export function eclpInvariant(p: EclpParams, X: number, Y: number): number {
  if (X <= 0 && Y <= 0) return 0;
  const aB = mulAinv(p, tau(p, p.beta));
  const aA = mulAinv(p, tau(p, p.alpha));
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
