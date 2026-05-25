var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/constants.ts
var MAX_UINT256 = 115792089237316195423570985008687907853269984665640564039457584007913129639935n;
var MAX_BALANCE = BigInt(2 ** 128 - 1);

// src/utils/math.ts
var WAD = 1000000000000000000n;
var RAY = 1000000000000000000000000000000000000n;
var TWO_WAD = 2000000000000000000n;
var FOUR_WAD = 4000000000000000000n;
var HUNDRED_WAD = 100000000000000000000n;
var MAX_UINT2562 = BigInt(
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
);
var _require = (b3, message) => {
  if (!b3) throw new Error(message);
};
var _MathSol = class _MathSol {
  static max(a3, b3) {
    return a3 >= b3 ? a3 : b3;
  }
  static min(a3, b3) {
    return a3 < b3 ? a3 : b3;
  }
  static mulDownFixed(a3, b3) {
    const product = a3 * b3;
    return product / WAD;
  }
  static mulUpFixed(a3, b3) {
    const product = a3 * b3;
    if (product === 0n) {
      return 0n;
    }
    return (product - 1n) / WAD + 1n;
  }
  /// @dev Return (a * b) / c, rounding up.
  static mulDivUpFixed(a3, b3, c) {
    const product = a3 * b3;
    if (product === 0n) {
      return 0n;
    }
    return (product - 1n) / c + 1n;
  }
  static divDownFixed(a3, b3) {
    if (a3 === 0n) {
      return 0n;
    }
    const aInflated = a3 * WAD;
    return aInflated / b3;
  }
  static divUpFixed(a3, b3) {
    return this.mulDivUpFixed(a3, WAD, b3);
  }
  // also called divUpRaw in stable maths
  static divUp(a3, b3) {
    if (a3 === 0n || b3 === 0n) {
      return 0n;
    }
    return 1n + (a3 - 1n) / b3;
  }
  // version = poolTypeVersion
  static powUpFixed(x, y, version) {
    if (y === WAD && version !== 1) {
      return x;
    }
    if (y === TWO_WAD && version !== 1) {
      return _MathSol.mulUpFixed(x, x);
    }
    if (y === FOUR_WAD && version !== 1) {
      const square = _MathSol.mulUpFixed(x, x);
      return _MathSol.mulUpFixed(square, square);
    }
    const raw = LogExpMath.pow(x, y);
    const maxError = _MathSol.mulUpFixed(raw, _MathSol.MAX_POW_RELATIVE_ERROR) + 1n;
    return raw + maxError;
  }
  // version = poolTypeVersion
  static powDownFixed(x, y, version) {
    if (y === WAD && version !== 1) {
      return x;
    }
    if (y === TWO_WAD && version !== 1) {
      return _MathSol.mulUpFixed(x, x);
    }
    if (y === FOUR_WAD && version !== 1) {
      const square = _MathSol.mulUpFixed(x, x);
      return _MathSol.mulUpFixed(square, square);
    }
    const raw = LogExpMath.pow(x, y);
    const maxError = _MathSol.mulUpFixed(raw, _MathSol.MAX_POW_RELATIVE_ERROR) + 1n;
    if (raw < maxError) {
      return 0n;
    }
    return raw - maxError;
  }
  static complementFixed(x) {
    return x < WAD ? WAD - x : 0n;
  }
};
__publicField(_MathSol, "MAX_POW_RELATIVE_ERROR", 10000n);
var MathSol = _MathSol;
var _LogExpMath = class _LogExpMath {
  // eˆ(x11)
  // All arguments and return values are 18 decimal fixed point numbers.
  static pow(x, y) {
    if (y === 0n) {
      return WAD;
    }
    if (x === 0n) {
      return 0n;
    }
    _require(
      x < 57896044618658097711785492504343953926634992332820282019728792003956564819968n,
      "Errors.X_OUT_OF_BOUNDS"
    );
    const x_int256 = x;
    _require(y < _LogExpMath.MILD_EXPONENT_BOUND, "Errors.Y_OUT_OF_BOUNDS");
    const y_int256 = y;
    let logx_times_y;
    if (_LogExpMath.LN_36_LOWER_BOUND < x_int256 && x_int256 < _LogExpMath.LN_36_UPPER_BOUND) {
      const ln_36_x = _LogExpMath._ln_36(x_int256);
      logx_times_y = ln_36_x / WAD * y_int256 + ln_36_x % WAD * y_int256 / WAD;
    } else {
      logx_times_y = _LogExpMath._ln(x_int256) * y_int256;
    }
    logx_times_y /= WAD;
    _require(
      _LogExpMath.MIN_NATURAL_EXPONENT <= logx_times_y && logx_times_y <= _LogExpMath.MAX_NATURAL_EXPONENT,
      "Errors.PRODUCT_OUT_OF_BOUNDS"
    );
    return _LogExpMath.exp(logx_times_y);
  }
  static exp(x_) {
    let x = x_;
    _require(
      x >= _LogExpMath.MIN_NATURAL_EXPONENT && x <= _LogExpMath.MAX_NATURAL_EXPONENT,
      "Errors.INVALID_EXPONENT"
    );
    if (x < 0) {
      return WAD * WAD / _LogExpMath.exp(-1n * x);
    }
    let firstAN;
    if (x >= _LogExpMath.x0) {
      x -= _LogExpMath.x0;
      firstAN = _LogExpMath.a0;
    } else if (x >= _LogExpMath.x1) {
      x -= _LogExpMath.x1;
      firstAN = _LogExpMath.a1;
    } else {
      firstAN = 1n;
    }
    x *= 100n;
    let product = HUNDRED_WAD;
    if (x >= _LogExpMath.x2) {
      x -= _LogExpMath.x2;
      product = product * _LogExpMath.a2 / HUNDRED_WAD;
    }
    if (x >= _LogExpMath.x3) {
      x -= _LogExpMath.x3;
      product = product * _LogExpMath.a3 / HUNDRED_WAD;
    }
    if (x >= _LogExpMath.x4) {
      x -= _LogExpMath.x4;
      product = product * _LogExpMath.a4 / HUNDRED_WAD;
    }
    if (x >= _LogExpMath.x5) {
      x -= _LogExpMath.x5;
      product = product * _LogExpMath.a5 / HUNDRED_WAD;
    }
    if (x >= _LogExpMath.x6) {
      x -= _LogExpMath.x6;
      product = product * _LogExpMath.a6 / HUNDRED_WAD;
    }
    if (x >= _LogExpMath.x7) {
      x -= _LogExpMath.x7;
      product = product * _LogExpMath.a7 / HUNDRED_WAD;
    }
    if (x >= _LogExpMath.x8) {
      x -= _LogExpMath.x8;
      product = product * _LogExpMath.a8 / HUNDRED_WAD;
    }
    if (x >= _LogExpMath.x9) {
      x -= _LogExpMath.x9;
      product = product * _LogExpMath.a9 / HUNDRED_WAD;
    }
    let seriesSum = HUNDRED_WAD;
    let term;
    term = x;
    seriesSum += term;
    term = term * x / HUNDRED_WAD / 2n;
    seriesSum += term;
    term = term * x / HUNDRED_WAD / 3n;
    seriesSum += term;
    term = term * x / HUNDRED_WAD / 4n;
    seriesSum += term;
    term = term * x / HUNDRED_WAD / 5n;
    seriesSum += term;
    term = term * x / HUNDRED_WAD / 6n;
    seriesSum += term;
    term = term * x / HUNDRED_WAD / 7n;
    seriesSum += term;
    term = term * x / HUNDRED_WAD / 8n;
    seriesSum += term;
    term = term * x / HUNDRED_WAD / 9n;
    seriesSum += term;
    term = term * x / HUNDRED_WAD / 10n;
    seriesSum += term;
    term = term * x / HUNDRED_WAD / 11n;
    seriesSum += term;
    term = term * x / HUNDRED_WAD / 12n;
    seriesSum += term;
    return product * seriesSum / HUNDRED_WAD * firstAN / 100n;
  }
  static _ln_36(x_) {
    let x = x_;
    x *= WAD;
    const z = (x - RAY) * RAY / (x + RAY);
    const z_squared = z * z / RAY;
    let num = z;
    let seriesSum = num;
    num = num * z_squared / RAY;
    seriesSum += num / 3n;
    num = num * z_squared / RAY;
    seriesSum += num / 5n;
    num = num * z_squared / RAY;
    seriesSum += num / 7n;
    num = num * z_squared / RAY;
    seriesSum += num / 9n;
    num = num * z_squared / RAY;
    seriesSum += num / 11n;
    num = num * z_squared / RAY;
    seriesSum += num / 13n;
    num = num * z_squared / RAY;
    seriesSum += num / 15n;
    return seriesSum * 2n;
  }
  /**
   * @dev Internal natural logarithm (ln(a)) with signed 18 decimal fixed point argument.
   */
  static _ln(a_) {
    let a3 = a_;
    if (a3 < WAD) {
      return -1n * _LogExpMath._ln(WAD * WAD / a3);
    }
    let sum = 0n;
    if (a3 >= _LogExpMath.a0 * WAD) {
      a3 /= _LogExpMath.a0;
      sum += _LogExpMath.x0;
    }
    if (a3 >= _LogExpMath.a1 * WAD) {
      a3 /= _LogExpMath.a1;
      sum += _LogExpMath.x1;
    }
    sum *= 100n;
    a3 *= 100n;
    if (a3 >= _LogExpMath.a2) {
      a3 = a3 * HUNDRED_WAD / _LogExpMath.a2;
      sum += _LogExpMath.x2;
    }
    if (a3 >= _LogExpMath.a3) {
      a3 = a3 * HUNDRED_WAD / _LogExpMath.a3;
      sum += _LogExpMath.x3;
    }
    if (a3 >= _LogExpMath.a4) {
      a3 = a3 * HUNDRED_WAD / _LogExpMath.a4;
      sum += _LogExpMath.x4;
    }
    if (a3 >= _LogExpMath.a5) {
      a3 = a3 * HUNDRED_WAD / _LogExpMath.a5;
      sum += _LogExpMath.x5;
    }
    if (a3 >= _LogExpMath.a6) {
      a3 = a3 * HUNDRED_WAD / _LogExpMath.a6;
      sum += _LogExpMath.x6;
    }
    if (a3 >= _LogExpMath.a7) {
      a3 = a3 * HUNDRED_WAD / _LogExpMath.a7;
      sum += _LogExpMath.x7;
    }
    if (a3 >= _LogExpMath.a8) {
      a3 = a3 * HUNDRED_WAD / _LogExpMath.a8;
      sum += _LogExpMath.x8;
    }
    if (a3 >= _LogExpMath.a9) {
      a3 = a3 * HUNDRED_WAD / _LogExpMath.a9;
      sum += _LogExpMath.x9;
    }
    if (a3 >= _LogExpMath.a10) {
      a3 = a3 * HUNDRED_WAD / _LogExpMath.a10;
      sum += _LogExpMath.x10;
    }
    if (a3 >= _LogExpMath.a11) {
      a3 = a3 * HUNDRED_WAD / _LogExpMath.a11;
      sum += _LogExpMath.x11;
    }
    const z = (a3 - HUNDRED_WAD) * HUNDRED_WAD / (a3 + HUNDRED_WAD);
    const z_squared = z * z / HUNDRED_WAD;
    let num = z;
    let seriesSum = num;
    num = num * z_squared / HUNDRED_WAD;
    seriesSum += num / 3n;
    num = num * z_squared / HUNDRED_WAD;
    seriesSum += num / 5n;
    num = num * z_squared / HUNDRED_WAD;
    seriesSum += num / 7n;
    num = num * z_squared / HUNDRED_WAD;
    seriesSum += num / 9n;
    num = num * z_squared / HUNDRED_WAD;
    seriesSum += num / 11n;
    seriesSum *= 2n;
    return (sum + seriesSum) / 100n;
  }
};
// All fixed point multiplications and divisions are inlined. This means we need to divide by ONE when multiplying
// two numbers, and multiply by ONE when dividing them.
// The domain of natural exponentiation is bound by the word size and number of decimals used.
//
// Because internally the result will be stored using 20 decimals, the largest possible result is
// (2^255 - 1) / 10^20, which makes the largest exponent ln((2^255 - 1) / 10^20) = 130.700829182905140221.
// The smallest possible result is 10^(-18), which makes largest negative argument
// ln(10^(-18)) = -41.446531673892822312.
// We use 130.0 and -41.0 to have some safety margin.
__publicField(_LogExpMath, "MAX_NATURAL_EXPONENT", 130000000000000000000n);
__publicField(_LogExpMath, "MIN_NATURAL_EXPONENT", -41000000000000000000n);
// Bounds for ln_36's argument. Both ln(0.9) and ln(1.1) can be represented with 36 decimal places in a fixed point
// 256 bit integer.
__publicField(_LogExpMath, "LN_36_LOWER_BOUND", WAD - 100000000000000000n);
__publicField(_LogExpMath, "LN_36_UPPER_BOUND", WAD + 100000000000000000n);
// static MILD_EXPONENT_BOUND: bigint = 2 ** 254 / HUNDRED_WAD;
// Precomputed value of the above expression
__publicField(_LogExpMath, "MILD_EXPONENT_BOUND", 289480223093290488558927462521719769633174961664101410098n);
// 18 decimal constants
__publicField(_LogExpMath, "x0", 128000000000000000000n);
// 2ˆ7
__publicField(_LogExpMath, "a0", 38877084059945950922200000000000000000000000000000000000n);
// eˆ(x0) (no decimals)
__publicField(_LogExpMath, "x1", 64000000000000000000n);
// 2ˆ6
__publicField(_LogExpMath, "a1", 6235149080811616882910000000n);
// eˆ(x1) (no decimals)
// 20 decimal constants
__publicField(_LogExpMath, "x2", 3200000000000000000000n);
// 2ˆ5
__publicField(_LogExpMath, "a2", 7896296018268069516100000000000000n);
// eˆ(x2)
__publicField(_LogExpMath, "x3", 1600000000000000000000n);
// 2ˆ4
__publicField(_LogExpMath, "a3", 888611052050787263676000000n);
// eˆ(x3)
__publicField(_LogExpMath, "x4", 800000000000000000000n);
// 2ˆ3
__publicField(_LogExpMath, "a4", 298095798704172827474000n);
// eˆ(x4)
__publicField(_LogExpMath, "x5", 400000000000000000000n);
// 2ˆ2
__publicField(_LogExpMath, "a5", 5459815003314423907810n);
// eˆ(x5)
__publicField(_LogExpMath, "x6", 200000000000000000000n);
// 2ˆ1
__publicField(_LogExpMath, "a6", 738905609893065022723n);
// eˆ(x6)
__publicField(_LogExpMath, "x7", 100000000000000000000n);
// 2ˆ0
__publicField(_LogExpMath, "a7", 271828182845904523536n);
// eˆ(x7)
__publicField(_LogExpMath, "x8", 50000000000000000000n);
// 2ˆ-1
__publicField(_LogExpMath, "a8", 164872127070012814685n);
// eˆ(x8)
__publicField(_LogExpMath, "x9", 25000000000000000000n);
// 2ˆ-2
__publicField(_LogExpMath, "a9", 128402541668774148407n);
// eˆ(x9)
__publicField(_LogExpMath, "x10", 12500000000000000000n);
// 2ˆ-3
__publicField(_LogExpMath, "a10", 113314845306682631683n);
// eˆ(x10)
__publicField(_LogExpMath, "x11", 6250000000000000000n);
// 2ˆ-4
__publicField(_LogExpMath, "a11", 106449445891785942956n);
var LogExpMath = _LogExpMath;

// src/vault/utils.ts
function isSameAddress(addressOne, addressTwo) {
  return addressOne.toLowerCase() === addressTwo.toLowerCase();
}
function toRawUndoRateRoundDown(amount, scalingFactor, tokenRate) {
  return MathSol.divDownFixed(amount, scalingFactor * tokenRate);
}
function toRawUndoRateRoundUp(amount, scalingFactor, tokenRate) {
  return MathSol.divUpFixed(amount, scalingFactor * tokenRate);
}
function toScaled18ApplyRateRoundDown(amount, scalingFactor, tokenRate) {
  return MathSol.mulDownFixed(amount * scalingFactor, tokenRate);
}
function toScaled18ApplyRateRoundUp(amount, scalingFactor, tokenRate) {
  return MathSol.mulUpFixed(amount * scalingFactor, tokenRate);
}

// src/stable/stableMath.ts
var _MIN_INVARIANT_RATIO = BigInt("600000000000000000");
var _MAX_INVARIANT_RATIO = BigInt("5000000000000000000");
var AMP_PRECISION = 1000n;
var _computeInvariant = (amplificationParameter, balances) => {
  let sum = 0n;
  const numTokens = balances.length;
  for (let i = 0; i < numTokens; i++) {
    sum = sum + balances[i];
  }
  if (sum === 0n) {
    return 0n;
  }
  let prevInvariant;
  let invariant = sum;
  const ampTimesTotal = amplificationParameter * BigInt(numTokens);
  for (let i = 0; i < 255; i++) {
    let D_P = invariant;
    for (let j = 0; j < numTokens; ++j) {
      D_P = D_P * invariant / (balances[j] * BigInt(numTokens));
    }
    prevInvariant = invariant;
    invariant = (ampTimesTotal * sum / AMP_PRECISION + D_P * BigInt(numTokens)) * invariant / ((ampTimesTotal - AMP_PRECISION) * invariant / AMP_PRECISION + (BigInt(numTokens) + 1n) * D_P);
    if (invariant > prevInvariant) {
      if (invariant - prevInvariant <= 1) {
        return invariant;
      }
    } else if (prevInvariant - invariant <= 1) {
      return invariant;
    }
  }
  throw new Error("StableInvariantDidntConverge()");
};
function _computeOutGivenExactIn(amplificationParameter, balances, tokenIndexIn, tokenIndexOut, tokenAmountIn, invariant) {
  balances[tokenIndexIn] += tokenAmountIn;
  const finalBalanceOut = _computeBalance(
    amplificationParameter,
    balances,
    invariant,
    tokenIndexOut
  );
  balances[tokenIndexIn] -= tokenAmountIn;
  return balances[tokenIndexOut] - finalBalanceOut - 1n;
}
function _computeInGivenExactOut(amplificationParameter, balances, tokenIndexIn, tokenIndexOut, tokenAmountOut, invariant) {
  if (balances[tokenIndexOut] <= tokenAmountOut) {
    throw new Error(
      "tokenAmountOut is greater than the balance available in the pool"
    );
  }
  balances[tokenIndexOut] -= tokenAmountOut;
  const finalBalanceIn = _computeBalance(
    amplificationParameter,
    balances,
    invariant,
    tokenIndexIn
  );
  balances[tokenIndexOut] += tokenAmountOut;
  return finalBalanceIn - balances[tokenIndexIn] + 1n;
}
function _computeBalance(amplificationParameter, balances, invariant, tokenIndex) {
  const numTokens = balances.length;
  const ampTimesTotal = amplificationParameter * BigInt(numTokens);
  let sum = balances[0];
  let P_D = balances[0] * BigInt(numTokens);
  for (let j = 1; j < numTokens; ++j) {
    P_D = P_D * balances[j] * BigInt(numTokens) / invariant;
    sum = sum + balances[j];
  }
  sum = sum - balances[tokenIndex];
  const inv2 = invariant * invariant;
  const c = MathSol.divUp(inv2 * AMP_PRECISION, ampTimesTotal * P_D) * balances[tokenIndex];
  const b3 = sum + invariant * AMP_PRECISION / ampTimesTotal;
  let prevTokenBalance = 0n;
  let tokenBalance = MathSol.divUp(inv2 + c, invariant + b3);
  for (let i = 0; i < 255; ++i) {
    prevTokenBalance = tokenBalance;
    tokenBalance = MathSol.divUp(
      tokenBalance * tokenBalance + c,
      tokenBalance * 2n + b3 - invariant
    );
    if (tokenBalance > prevTokenBalance) {
      if (tokenBalance - prevTokenBalance <= 1) {
        return tokenBalance;
      }
    } else if (prevTokenBalance - tokenBalance <= 1) {
      return tokenBalance;
    }
  }
  throw new Error("StableGetBalanceDidntConverge()");
}

// src/vault/types.ts
var SwapKind = /* @__PURE__ */ ((SwapKind2) => {
  SwapKind2[SwapKind2["GivenIn"] = 0] = "GivenIn";
  SwapKind2[SwapKind2["GivenOut"] = 1] = "GivenOut";
  return SwapKind2;
})(SwapKind || {});
var Rounding = /* @__PURE__ */ ((Rounding2) => {
  Rounding2[Rounding2["ROUND_UP"] = 0] = "ROUND_UP";
  Rounding2[Rounding2["ROUND_DOWN"] = 1] = "ROUND_DOWN";
  return Rounding2;
})(Rounding || {});
var AddKind = /* @__PURE__ */ ((AddKind3) => {
  AddKind3[AddKind3["UNBALANCED"] = 0] = "UNBALANCED";
  AddKind3[AddKind3["SINGLE_TOKEN_EXACT_OUT"] = 1] = "SINGLE_TOKEN_EXACT_OUT";
  return AddKind3;
})(AddKind || {});
var RemoveKind = /* @__PURE__ */ ((RemoveKind2) => {
  RemoveKind2[RemoveKind2["PROPORTIONAL"] = 0] = "PROPORTIONAL";
  RemoveKind2[RemoveKind2["SINGLE_TOKEN_EXACT_IN"] = 1] = "SINGLE_TOKEN_EXACT_IN";
  RemoveKind2[RemoveKind2["SINGLE_TOKEN_EXACT_OUT"] = 2] = "SINGLE_TOKEN_EXACT_OUT";
  return RemoveKind2;
})(RemoveKind || {});

// src/stable/stablePool.ts
var Stable = class {
  constructor(poolState) {
    __publicField(this, "amp");
    this.amp = poolState.amp;
  }
  getMaximumInvariantRatio() {
    return _MAX_INVARIANT_RATIO;
  }
  getMinimumInvariantRatio() {
    return _MIN_INVARIANT_RATIO;
  }
  /**
   * Returns the max amount that can be swapped in relation to the swapKind.
   * @param maxSwapParams
   * @returns GivenIn: Returns the max amount in. GivenOut: Returns the max amount out.
   */
  getMaxSwapAmount(maxSwapParams) {
    const {
      balancesLiveScaled18,
      indexIn,
      indexOut,
      tokenRates,
      scalingFactors,
      swapKind
    } = maxSwapParams;
    if (swapKind === 0 /* GivenIn */) {
      const diff = MAX_BALANCE - balancesLiveScaled18[indexIn];
      return toRawUndoRateRoundDown(
        diff,
        scalingFactors[indexIn],
        tokenRates[indexIn]
      );
    }
    const max = MathSol.mulDownFixed(
      990000000000000000n,
      balancesLiveScaled18[indexOut]
    );
    return toRawUndoRateRoundDown(
      max,
      scalingFactors[indexOut],
      tokenRates[indexOut]
    );
  }
  getMaxSingleTokenAddAmount() {
    return MAX_UINT256;
  }
  getMaxSingleTokenRemoveAmount(maxRemoveParams) {
    const {
      isExactIn,
      totalSupply,
      tokenOutBalance,
      tokenOutScalingFactor,
      tokenOutRate
    } = maxRemoveParams;
    return this.getMaxSwapAmount({
      swapKind: isExactIn ? 0 /* GivenIn */ : 1 /* GivenOut */,
      balancesLiveScaled18: [totalSupply, tokenOutBalance],
      tokenRates: [1000000000000000000n, tokenOutRate],
      scalingFactors: [1000000000000000000n, tokenOutScalingFactor],
      indexIn: 0,
      indexOut: 1
    });
  }
  onSwap(swapParams) {
    const {
      swapKind,
      balancesLiveScaled18: balancesScaled18,
      indexIn,
      indexOut,
      amountGivenScaled18
    } = swapParams;
    const invariant = _computeInvariant(this.amp, balancesScaled18);
    if (swapKind === 0 /* GivenIn */) {
      return _computeOutGivenExactIn(
        this.amp,
        balancesScaled18,
        indexIn,
        indexOut,
        amountGivenScaled18,
        invariant
      );
    }
    return _computeInGivenExactOut(
      this.amp,
      balancesScaled18,
      indexIn,
      indexOut,
      amountGivenScaled18,
      invariant
    );
  }
  computeInvariant(balancesLiveScaled18, rounding) {
    let invariant = _computeInvariant(this.amp, balancesLiveScaled18);
    if (invariant > 0) {
      invariant = rounding == 1 /* ROUND_DOWN */ ? invariant : invariant + 1n;
    }
    return invariant;
  }
  computeBalance(balancesLiveScaled18, tokenInIndex, invariantRatio) {
    return _computeBalance(
      this.amp,
      balancesLiveScaled18,
      MathSol.mulUpFixed(
        this.computeInvariant(balancesLiveScaled18, 0 /* ROUND_UP */),
        invariantRatio
      ),
      tokenInIndex
    );
  }
};

// src/vault/basePoolMath.ts
function computeAddLiquidityUnbalanced(currentBalances, exactAmounts, totalSupply, swapFeePercentage, maxInvariantRatio, computeInvariant3) {
  const numTokens = currentBalances.length;
  const newBalances = new Array(numTokens);
  const swapFeeAmounts = new Array(numTokens).fill(0n);
  for (let index = 0; index < currentBalances.length; index++) {
    newBalances[index] = currentBalances[index] + exactAmounts[index] - 1n;
  }
  const currentInvariant = computeInvariant3(
    currentBalances,
    0 /* ROUND_UP */
  );
  const newInvariant = computeInvariant3(newBalances, 1 /* ROUND_DOWN */);
  const invariantRatio = MathSol.divDownFixed(newInvariant, currentInvariant);
  if (invariantRatio > maxInvariantRatio) {
    throw Error(
      `InvariantRatioAboveMax ${invariantRatio} ${maxInvariantRatio}`
    );
  }
  for (let index = 0; index < currentBalances.length; index++) {
    const proportionalTokenBalance = MathSol.mulDownFixed(
      invariantRatio,
      currentBalances[index]
    );
    if (newBalances[index] > proportionalTokenBalance) {
      const taxableAmount = newBalances[index] - proportionalTokenBalance;
      swapFeeAmounts[index] = MathSol.mulUpFixed(
        taxableAmount,
        swapFeePercentage
      );
      newBalances[index] = newBalances[index] - swapFeeAmounts[index];
    }
  }
  const invariantWithFeesApplied = computeInvariant3(
    newBalances,
    1 /* ROUND_DOWN */
  );
  const bptAmountOut = totalSupply * (invariantWithFeesApplied - currentInvariant) / currentInvariant;
  return { bptAmountOut, swapFeeAmounts };
}
function computeAddLiquiditySingleTokenExactOut(currentBalances, tokenInIndex, exactBptAmountOut, totalSupply, swapFeePercentage, maxInvariantRatio, computeBalance) {
  const newSupply = exactBptAmountOut + totalSupply;
  const invariantRatio = MathSol.divUpFixed(newSupply, totalSupply);
  if (invariantRatio > maxInvariantRatio) {
    throw Error(
      `InvariantRatioAboveMax ${invariantRatio} ${maxInvariantRatio}`
    );
  }
  const newBalance = computeBalance(
    currentBalances,
    tokenInIndex,
    invariantRatio
  );
  const amountIn = newBalance - currentBalances[tokenInIndex];
  const nonTaxableBalance = MathSol.divDownFixed(
    MathSol.mulDownFixed(newSupply, currentBalances[tokenInIndex]),
    totalSupply
  );
  const taxableAmount = amountIn + currentBalances[tokenInIndex] - nonTaxableBalance;
  const fee = MathSol.divUpFixed(
    taxableAmount,
    MathSol.complementFixed(swapFeePercentage)
  ) - taxableAmount;
  const swapFeeAmounts = new Array(currentBalances.length);
  swapFeeAmounts[tokenInIndex] = fee;
  const amountInWithFee = amountIn + fee;
  return { amountInWithFee, swapFeeAmounts };
}
function computeProportionalAmountsOut(balances, bptTotalSupply, bptAmountIn) {
  const amountsOut = [];
  for (let i = 0; i < balances.length; ++i) {
    amountsOut.push(balances[i] * bptAmountIn / bptTotalSupply);
  }
  return amountsOut;
}
function computeRemoveLiquiditySingleTokenExactIn(currentBalances, tokenOutIndex, exactBptAmountIn, totalSupply, swapFeePercentage, minInvariantRatio, computeBalance) {
  const newSupply = totalSupply - exactBptAmountIn;
  const invariantRatio = MathSol.divUpFixed(newSupply, totalSupply);
  if (invariantRatio < minInvariantRatio) {
    throw Error(
      `InvariantRatioBelowMin ${invariantRatio} ${minInvariantRatio}`
    );
  }
  const newBalance = computeBalance(
    currentBalances,
    tokenOutIndex,
    invariantRatio
  );
  const amountOut = currentBalances[tokenOutIndex] - newBalance;
  const newBalanceBeforeTax = MathSol.mulDivUpFixed(
    newSupply,
    currentBalances[tokenOutIndex],
    totalSupply
  );
  const taxableAmount = newBalanceBeforeTax - newBalance;
  const fee = MathSol.mulUpFixed(taxableAmount, swapFeePercentage);
  const swapFeeAmounts = new Array(currentBalances.length);
  swapFeeAmounts[tokenOutIndex] = fee;
  const amountOutWithFee = amountOut - fee;
  return {
    amountOutWithFee,
    swapFeeAmounts
  };
}
function computeRemoveLiquiditySingleTokenExactOut(currentBalances, tokenOutIndex, exactAmountOut, totalSupply, swapFeePercentage, minInvariantRatio, computeInvariant3) {
  const numTokens = currentBalances.length;
  const newBalances = new Array(numTokens);
  for (let index = 0; index < currentBalances.length; index++) {
    newBalances[index] = currentBalances[index] - 1n;
  }
  newBalances[tokenOutIndex] = newBalances[tokenOutIndex] - exactAmountOut;
  const currentInvariant = computeInvariant3(
    currentBalances,
    0 /* ROUND_UP */
  );
  const invariantRatio = MathSol.divUpFixed(
    computeInvariant3(newBalances, 0 /* ROUND_UP */),
    currentInvariant
  );
  if (invariantRatio < minInvariantRatio) {
    throw Error(
      `InvariantRatioBelowMin ${invariantRatio} ${minInvariantRatio}`
    );
  }
  const taxableAmount = MathSol.mulUpFixed(invariantRatio, currentBalances[tokenOutIndex]) - newBalances[tokenOutIndex];
  const fee = MathSol.divUpFixed(
    taxableAmount,
    MathSol.complementFixed(swapFeePercentage)
  ) - taxableAmount;
  newBalances[tokenOutIndex] = newBalances[tokenOutIndex] - fee;
  const invariantWithFeesApplied = computeInvariant3(
    newBalances,
    1 /* ROUND_DOWN */
  );
  const swapFeeAmounts = new Array(numTokens);
  swapFeeAmounts[tokenOutIndex] = fee;
  const bptAmountIn = MathSol.mulDivUpFixed(
    totalSupply,
    currentInvariant - invariantWithFeesApplied,
    currentInvariant
  );
  return {
    bptAmountIn,
    swapFeeAmounts
  };
}

// src/weighted/weightedMath.ts
var _MIN_WEIGHT = BigInt("10000000000000000");
var _MAX_IN_RATIO = BigInt("300000000000000000");
var _MAX_OUT_RATIO = BigInt("300000000000000000");
var _MAX_INVARIANT_RATIO2 = BigInt("3000000000000000000");
var _MIN_INVARIANT_RATIO2 = BigInt("700000000000000000");
var _computeInvariantDown = (normalizedWeights, balances) => {
  let invariant = WAD;
  for (let i = 0; i < normalizedWeights.length; ++i) {
    invariant = MathSol.mulDownFixed(
      invariant,
      MathSol.powDownFixed(balances[i], normalizedWeights[i])
    );
  }
  if (invariant === 0n) {
    throw new Error("ZeroInvariant");
  }
  return invariant;
};
var _computeInvariantUp = (normalizedWeights, balances) => {
  let invariant = WAD;
  for (let i = 0; i < normalizedWeights.length; ++i) {
    invariant = MathSol.mulUpFixed(
      invariant,
      MathSol.powUpFixed(balances[i], normalizedWeights[i])
    );
  }
  if (invariant === 0n) {
    throw new Error("ZeroInvariant");
  }
  return invariant;
};
var _computeBalanceOutGivenInvariant = (currentBalance, weight, invariantRatio) => {
  const balanceRatio = MathSol.powUpFixed(
    invariantRatio,
    MathSol.divUpFixed(WAD, weight)
  );
  return MathSol.mulUpFixed(currentBalance, balanceRatio);
};
var _computeOutGivenExactIn2 = (balanceIn, weightIn, balanceOut, weightOut, amountIn) => {
  if (amountIn > MathSol.mulDownFixed(balanceIn, _MAX_IN_RATIO)) {
    throw new Error("MaxInRatio exceeded");
  }
  const denominator = balanceIn + amountIn;
  const base = MathSol.divUpFixed(balanceIn, denominator);
  const exponent = MathSol.divDownFixed(weightIn, weightOut);
  const power = MathSol.powUpFixed(base, exponent);
  return MathSol.mulDownFixed(balanceOut, MathSol.complementFixed(power));
};
var _computeInGivenExactOut2 = (balanceIn, weightIn, balanceOut, weightOut, amountOut) => {
  if (amountOut > MathSol.mulDownFixed(balanceOut, _MAX_OUT_RATIO)) {
    throw new Error("MaxOutRatio exceeded");
  }
  const base = MathSol.divUpFixed(balanceOut, balanceOut - amountOut);
  const exponent = MathSol.divUpFixed(weightOut, weightIn);
  const power = MathSol.powUpFixed(base, exponent);
  const ratio = power - WAD;
  return MathSol.mulUpFixed(balanceIn, ratio);
};

// src/weighted/weightedPool.ts
var Weighted = class {
  constructor(poolState) {
    __publicField(this, "normalizedWeights");
    this.normalizedWeights = poolState.weights;
  }
  getMaximumInvariantRatio() {
    return _MAX_INVARIANT_RATIO2;
  }
  getMinimumInvariantRatio() {
    return _MIN_INVARIANT_RATIO2;
  }
  /**
   * Returns the max amount that can be swapped in relation to the swapKind.
   * @param maxSwapParams
   * @returns GivenIn: Returns the max amount in. GivenOut: Returns the max amount out.
   */
  getMaxSwapAmount(maxSwapParams) {
    const {
      balancesLiveScaled18,
      indexIn,
      indexOut,
      tokenRates,
      scalingFactors,
      swapKind
    } = maxSwapParams;
    if (swapKind === 0 /* GivenIn */) {
      const max182 = MathSol.mulDownFixed(
        balancesLiveScaled18[indexIn],
        _MAX_IN_RATIO
      );
      return toRawUndoRateRoundDown(
        max182,
        scalingFactors[indexIn],
        tokenRates[indexIn]
      );
    }
    const max18 = MathSol.mulDownFixed(
      balancesLiveScaled18[indexOut],
      _MAX_OUT_RATIO
    );
    return toRawUndoRateRoundDown(
      max18,
      scalingFactors[indexOut],
      tokenRates[indexOut]
    );
  }
  getMaxSingleTokenAddAmount() {
    return MAX_UINT256;
  }
  getMaxSingleTokenRemoveAmount(maxRemoveParams) {
    const {
      isExactIn,
      totalSupply,
      tokenOutBalance,
      tokenOutScalingFactor,
      tokenOutRate
    } = maxRemoveParams;
    return this.getMaxSwapAmount({
      swapKind: isExactIn ? 0 /* GivenIn */ : 1 /* GivenOut */,
      balancesLiveScaled18: [totalSupply, tokenOutBalance],
      tokenRates: [1000000000000000000n, tokenOutRate],
      scalingFactors: [1000000000000000000n, tokenOutScalingFactor],
      indexIn: 0,
      indexOut: 1
    });
  }
  onSwap(swapParams) {
    const {
      swapKind,
      balancesLiveScaled18: balancesScaled18,
      indexIn,
      indexOut,
      amountGivenScaled18
    } = swapParams;
    if (swapKind === 0 /* GivenIn */) {
      return _computeOutGivenExactIn2(
        balancesScaled18[indexIn],
        this.normalizedWeights[indexIn],
        balancesScaled18[indexOut],
        this.normalizedWeights[indexOut],
        amountGivenScaled18
      );
    }
    return _computeInGivenExactOut2(
      balancesScaled18[indexIn],
      this.normalizedWeights[indexIn],
      balancesScaled18[indexOut],
      this.normalizedWeights[indexOut],
      amountGivenScaled18
    );
  }
  computeInvariant(balancesLiveScaled18, rounding) {
    if (rounding === 0 /* ROUND_UP */)
      return _computeInvariantUp(
        this.normalizedWeights,
        balancesLiveScaled18
      );
    else
      return _computeInvariantDown(
        this.normalizedWeights,
        balancesLiveScaled18
      );
  }
  computeBalance(balancesLiveScaled18, tokenInIndex, invariantRatio) {
    return _computeBalanceOutGivenInvariant(
      balancesLiveScaled18[tokenInIndex],
      this.normalizedWeights[tokenInIndex],
      invariantRatio
    );
  }
};

// src/gyro/gyroPoolMath.ts
var GyroPoolMath = class {
  /// @dev Implements a square root algorithm using Newton's method and a first-guess optimization.
  static sqrt(input, tolerance) {
    if (input === 0n) {
      return 0n;
    }
    let guess = this._makeInitialGuess(input);
    guess = (guess + input * WAD / guess) / 2n;
    guess = (guess + input * WAD / guess) / 2n;
    guess = (guess + input * WAD / guess) / 2n;
    guess = (guess + input * WAD / guess) / 2n;
    guess = (guess + input * WAD / guess) / 2n;
    guess = (guess + input * WAD / guess) / 2n;
    guess = (guess + input * WAD / guess) / 2n;
    const guessSquared = MathSol.mulDownFixed(guess, guess);
    if (!(guessSquared <= input + MathSol.mulUpFixed(guess, tolerance) && guessSquared >= input - MathSol.mulUpFixed(guess, tolerance))) {
      throw Error("_sqrt FAILED");
    }
    return guess;
  }
  static _makeInitialGuess(input) {
    if (input >= WAD) {
      return (1n << this._intLog2Halved(input / WAD)) * WAD;
    } else {
      if (input <= 10n) return this._SQRT_1E_NEG_17;
      if (input <= 100n) return 10n ** 10n;
      if (input <= 1000n) return this._SQRT_1E_NEG_15;
      if (input <= 10000n) return 10n ** 11n;
      if (input <= 100000n) return this._SQRT_1E_NEG_13;
      if (input <= 1000000n) return 10n ** 12n;
      if (input <= 10000000n) return this._SQRT_1E_NEG_11;
      if (input <= 100000000n) return 10n ** 13n;
      if (input <= 1000000000n) return this._SQRT_1E_NEG_9;
      if (input <= 10000000000n) return 10n ** 14n;
      if (input <= 100000000000n) return this._SQRT_1E_NEG_7;
      if (input <= 1000000000000n) return 10n ** 15n;
      if (input <= 10000000000000n) return this._SQRT_1E_NEG_5;
      if (input <= 100000000000000n) return 10n ** 16n;
      if (input <= 1000000000000000n) return this._SQRT_1E_NEG_3;
      if (input <= 10000000000000000n) return 10n ** 17n;
      if (input <= 100000000000000000n) return this._SQRT_1E_NEG_1;
      return input;
    }
  }
  static _intLog2Halved(x) {
    let n = 0n;
    if (x >= 1n << 128n) {
      x >>= 128n;
      n += 64n;
    }
    if (x >= 1n << 64n) {
      x >>= 64n;
      n += 32n;
    }
    if (x >= 1n << 32n) {
      x >>= 32n;
      n += 16n;
    }
    if (x >= 1n << 16n) {
      x >>= 16n;
      n += 8n;
    }
    if (x >= 1n << 8n) {
      x >>= 8n;
      n += 4n;
    }
    if (x >= 1n << 4n) {
      x >>= 4n;
      n += 2n;
    }
    if (x >= 1n << 2n) {
      x >>= 2n;
      n += 1n;
    }
    return n;
  }
};
__publicField(GyroPoolMath, "_SQRT_1E_NEG_1", 316227766016837933n);
__publicField(GyroPoolMath, "_SQRT_1E_NEG_3", 31622776601683793n);
__publicField(GyroPoolMath, "_SQRT_1E_NEG_5", 3162277660168379n);
__publicField(GyroPoolMath, "_SQRT_1E_NEG_7", 316227766016837n);
__publicField(GyroPoolMath, "_SQRT_1E_NEG_9", 31622776601683n);
__publicField(GyroPoolMath, "_SQRT_1E_NEG_11", 3162277660168n);
__publicField(GyroPoolMath, "_SQRT_1E_NEG_13", 316227766016n);
__publicField(GyroPoolMath, "_SQRT_1E_NEG_15", 31622776601n);
__publicField(GyroPoolMath, "_SQRT_1E_NEG_17", 3162277660n);

// src/gyro/gyro2CLPMath.ts
function calculateInvariant(balances, sqrtAlpha, sqrtBeta, rounding) {
  const { a: a3, mb, bSquare, mc } = calculateQuadraticTerms(
    balances,
    sqrtAlpha,
    sqrtBeta,
    rounding
  );
  return calculateQuadratic(a3, mb, bSquare, mc);
}
function calculateQuadraticTerms(balances, sqrtAlpha, sqrtBeta, rounding) {
  const _divUpOrDown = rounding === 1 /* ROUND_DOWN */ ? MathSol.divDownFixed : MathSol.divUpFixed;
  const _mulUpOrDown = rounding === 1 /* ROUND_DOWN */ ? MathSol.mulDownFixed : MathSol.mulUpFixed;
  const _mulDownOrUp = rounding === 1 /* ROUND_DOWN */ ? MathSol.mulUpFixed : MathSol.mulDownFixed;
  const a3 = WAD - _divUpOrDown(sqrtAlpha, sqrtBeta);
  const bterm0 = _divUpOrDown(balances[1], sqrtBeta);
  const bterm1 = _mulUpOrDown(balances[0], sqrtAlpha);
  const mb = bterm0 + bterm1;
  const mc = _mulUpOrDown(balances[0], balances[1]);
  let bSquare = _mulUpOrDown(
    _mulUpOrDown(_mulUpOrDown(balances[0], balances[0]), sqrtAlpha),
    sqrtAlpha
  );
  const bSq2 = _divUpOrDown(
    2n * _mulUpOrDown(_mulUpOrDown(balances[0], balances[1]), sqrtAlpha),
    sqrtBeta
  );
  const bSq3 = _divUpOrDown(
    _mulUpOrDown(balances[1], balances[1]),
    _mulDownOrUp(sqrtBeta, sqrtBeta)
  );
  bSquare = bSquare + bSq2 + bSq3;
  return { a: a3, mb, bSquare, mc };
}
function calculateQuadratic(a3, mb, bSquare, mc) {
  const denominator = MathSol.mulUpFixed(a3, 2n * WAD);
  const addTerm = MathSol.mulDownFixed(MathSol.mulDownFixed(mc, 4n * WAD), a3);
  const radicand = bSquare + addTerm;
  const sqrResult = GyroPoolMath.sqrt(radicand, 5n);
  const numerator = mb + sqrResult;
  const invariant = MathSol.divDownFixed(numerator, denominator);
  return invariant;
}
function calcOutGivenIn(balanceIn, balanceOut, amountIn, virtualOffsetIn, virtualOffsetOut) {
  const virtInOver = balanceIn + MathSol.mulUpFixed(virtualOffsetIn, WAD + 2n);
  const virtOutUnder = balanceOut + MathSol.mulDownFixed(virtualOffsetOut, WAD - 1n);
  const amountOut = MathSol.divDownFixed(
    MathSol.mulDownFixed(virtOutUnder, amountIn),
    virtInOver + amountIn
  );
  if (!(amountOut <= balanceOut)) {
    throw Error("AssetBoundsExceeded");
  }
  return amountOut;
}
function calcInGivenOut(balanceIn, balanceOut, amountOut, virtualOffsetIn, virtualOffsetOut) {
  if (!(amountOut <= balanceOut)) {
    throw Error("AssetBoundsExceeded");
  }
  const virtInOver = balanceIn + MathSol.mulUpFixed(virtualOffsetIn, WAD + 2n);
  const virtOutUnder = balanceOut + MathSol.mulDownFixed(virtualOffsetOut, WAD - 1n);
  const amountIn = MathSol.divUpFixed(
    MathSol.mulUpFixed(virtInOver, amountOut),
    virtOutUnder - amountOut
  );
  return amountIn;
}
function calculateVirtualParameter0(invariant, _sqrtBeta, rounding) {
  return rounding === 1 /* ROUND_DOWN */ ? MathSol.divDownFixed(invariant, _sqrtBeta) : MathSol.divUpFixed(invariant, _sqrtBeta);
}
function calculateVirtualParameter1(invariant, _sqrtAlpha, rounding) {
  return rounding === 1 /* ROUND_DOWN */ ? MathSol.mulDownFixed(invariant, _sqrtAlpha) : MathSol.mulUpFixed(invariant, _sqrtAlpha);
}

// src/gyro/gyro2CLPPool.ts
var Gyro2CLP = class {
  constructor(poolState) {
    __publicField(this, "_sqrtAlpha");
    __publicField(this, "_sqrtBeta");
    if (poolState.sqrtAlpha >= poolState.sqrtBeta) {
      throw Error("SqrtParamsWrong");
    }
    this._sqrtAlpha = poolState.sqrtAlpha;
    this._sqrtBeta = poolState.sqrtBeta;
  }
  getMaximumInvariantRatio() {
    return MAX_UINT256;
  }
  getMinimumInvariantRatio() {
    return 0n;
  }
  /**
   * Returns the max amount that can be swapped in relation to the swapKind.
   * @param maxSwapParams
   * @returns GivenIn: Returns the max amount in. GivenOut: Returns the max amount out.
   */
  getMaxSwapAmount(maxSwapParams) {
    const {
      balancesLiveScaled18,
      indexIn,
      indexOut,
      tokenRates,
      scalingFactors,
      swapKind
    } = maxSwapParams;
    if (swapKind === 0 /* GivenIn */) {
      const diff = MAX_BALANCE - balancesLiveScaled18[indexIn];
      return toRawUndoRateRoundDown(
        diff,
        scalingFactors[indexIn],
        tokenRates[indexIn]
      );
    }
    const max = MathSol.mulDownFixed(
      990000000000000000n,
      balancesLiveScaled18[indexOut]
    );
    return toRawUndoRateRoundDown(
      max,
      scalingFactors[indexOut],
      tokenRates[indexOut]
    );
  }
  getMaxSingleTokenAddAmount() {
    return MAX_UINT256;
  }
  getMaxSingleTokenRemoveAmount(maxRemoveParams) {
    const {
      isExactIn,
      totalSupply,
      tokenOutBalance,
      tokenOutScalingFactor,
      tokenOutRate
    } = maxRemoveParams;
    return this.getMaxSwapAmount({
      swapKind: isExactIn ? 0 /* GivenIn */ : 1 /* GivenOut */,
      balancesLiveScaled18: [totalSupply, tokenOutBalance],
      tokenRates: [1000000000000000000n, tokenOutRate],
      scalingFactors: [1000000000000000000n, tokenOutScalingFactor],
      indexIn: 0,
      indexOut: 1
    });
  }
  onSwap(swapParams) {
    const {
      swapKind,
      balancesLiveScaled18: balancesScaled18,
      indexIn,
      indexOut,
      amountGivenScaled18
    } = swapParams;
    const tokenInIsToken0 = indexIn == 0;
    const balanceTokenInScaled18 = balancesScaled18[indexIn];
    const balanceTokenOutScaled18 = balancesScaled18[indexOut];
    const { virtualBalanceIn, virtualBalanceOut } = this._getVirtualOffsets(
      balanceTokenInScaled18,
      balanceTokenOutScaled18,
      tokenInIsToken0
    );
    if (swapKind === 0 /* GivenIn */) {
      const amountOutScaled18 = calcOutGivenIn(
        balanceTokenInScaled18,
        balanceTokenOutScaled18,
        amountGivenScaled18,
        virtualBalanceIn,
        virtualBalanceOut
      );
      return amountOutScaled18;
    }
    const amountInScaled18 = calcInGivenOut(
      balanceTokenInScaled18,
      balanceTokenOutScaled18,
      amountGivenScaled18,
      virtualBalanceIn,
      virtualBalanceOut
    );
    return amountInScaled18;
  }
  computeInvariant(balancesLiveScaled18, rounding) {
    return calculateInvariant(
      balancesLiveScaled18,
      this._sqrtAlpha,
      this._sqrtBeta,
      rounding
    );
  }
  computeBalance(balancesLiveScaled18, tokenInIndex, invariantRatio) {
    let invariant = calculateInvariant(
      balancesLiveScaled18,
      this._sqrtAlpha,
      this._sqrtBeta,
      0 /* ROUND_UP */
    );
    invariant = MathSol.mulUpFixed(invariant, invariantRatio);
    const squareNewInv = invariant * invariant;
    const a3 = MathSol.divDownFixed(invariant, this._sqrtBeta);
    const b3 = MathSol.mulDownFixed(invariant, this._sqrtAlpha);
    let newBalance = 0n;
    if (tokenInIndex === 0) {
      newBalance = MathSol.divUp(squareNewInv, balancesLiveScaled18[1] + b3) - a3;
    } else {
      newBalance = MathSol.divUp(squareNewInv, balancesLiveScaled18[0] + a3) - b3;
    }
    return newBalance;
  }
  /**
   * @notice Return the virtual offsets of each token of the 2CLP pool.
   * @dev The 2CLP invariant is defined as `L=(x+a)(y+b)`. "x" and "y" are the real balances, and "a" and "b" are
   * offsets to concentrate the liquidity of the pool. The sum of real balance and offset is known as
   * "virtual balance". Here we return the offsets a and b.
   */
  _getVirtualOffsets(balanceTokenInScaled18, balanceTokenOutScaled18, tokenInIsToken0) {
    const balances = new Array(2).fill(0n);
    balances[0] = tokenInIsToken0 ? balanceTokenInScaled18 : balanceTokenOutScaled18;
    balances[1] = tokenInIsToken0 ? balanceTokenOutScaled18 : balanceTokenInScaled18;
    const currentInvariant = calculateInvariant(
      balances,
      this._sqrtAlpha,
      this._sqrtBeta,
      1 /* ROUND_DOWN */
    );
    let virtualBalanceIn = 0n;
    let virtualBalanceOut = 0n;
    if (tokenInIsToken0) {
      virtualBalanceIn = calculateVirtualParameter0(
        currentInvariant,
        this._sqrtBeta,
        0 /* ROUND_UP */
      );
      virtualBalanceOut = calculateVirtualParameter1(
        currentInvariant,
        this._sqrtAlpha,
        1 /* ROUND_DOWN */
      );
    } else {
      virtualBalanceIn = calculateVirtualParameter1(
        currentInvariant,
        this._sqrtAlpha,
        0 /* ROUND_UP */
      );
      virtualBalanceOut = calculateVirtualParameter0(
        currentInvariant,
        this._sqrtBeta,
        1 /* ROUND_DOWN */
      );
    }
    return {
      virtualBalanceIn,
      virtualBalanceOut
    };
  }
};

// src/gyro/signedFixedPoint.ts
var FixedPointError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "FixedPointError";
  }
};
var SignedFixedPoint = class {
  // 1e38
  static add(a3, b3) {
    const c = a3 + b3;
    if (!(b3 >= 0n ? c >= a3 : c < a3)) {
      throw new FixedPointError("AddOverflow");
    }
    return c;
  }
  static addMag(a3, b3) {
    return a3 > 0n ? this.add(a3, b3) : this.sub(a3, b3);
  }
  static sub(a3, b3) {
    const c = a3 - b3;
    if (!(b3 <= 0n ? c >= a3 : c < a3)) {
      throw new FixedPointError("SubOverflow");
    }
    return c;
  }
  static mulDownMag(a3, b3) {
    const product = a3 * b3;
    if (!(a3 === 0n || product / a3 === b3)) {
      throw new FixedPointError("MulOverflow");
    }
    return product / this.ONE;
  }
  static mulDownMagU(a3, b3) {
    return a3 * b3 / this.ONE;
  }
  static mulUpMag(a3, b3) {
    const product = a3 * b3;
    if (!(a3 === 0n || product / a3 === b3)) {
      throw new FixedPointError("MulOverflow");
    }
    if (product > 0n) {
      return (product - 1n) / this.ONE + 1n;
    } else if (product < 0n) {
      return (product + 1n) / this.ONE - 1n;
    }
    return 0n;
  }
  static mulUpMagU(a3, b3) {
    const product = a3 * b3;
    if (product > 0n) {
      return (product - 1n) / this.ONE + 1n;
    } else if (product < 0n) {
      return (product + 1n) / this.ONE - 1n;
    }
    return 0n;
  }
  static divDownMag(a3, b3) {
    if (b3 === 0n) {
      throw new FixedPointError("ZeroDivision");
    }
    if (a3 === 0n) {
      return 0n;
    }
    const aInflated = a3 * this.ONE;
    if (aInflated / a3 !== this.ONE) {
      throw new FixedPointError("DivInterval");
    }
    return aInflated / b3;
  }
  static divDownMagU(a3, b3) {
    if (b3 === 0n) {
      throw new FixedPointError("ZeroDivision");
    }
    return a3 * this.ONE / b3;
  }
  static divUpMag(a3, b3) {
    if (b3 === 0n) {
      throw new FixedPointError("ZeroDivision");
    }
    if (a3 === 0n) {
      return 0n;
    }
    let localA = a3;
    let localB = b3;
    if (b3 < 0n) {
      localB = -b3;
      localA = -a3;
    }
    const aInflated = localA * this.ONE;
    if (aInflated / localA !== this.ONE) {
      throw new FixedPointError("DivInterval");
    }
    if (aInflated > 0n) {
      return (aInflated - 1n) / localB + 1n;
    }
    return (aInflated + 1n) / localB - 1n;
  }
  static divUpMagU(a3, b3) {
    if (b3 === 0n) {
      throw new FixedPointError("ZeroDivision");
    }
    if (a3 === 0n) {
      return 0n;
    }
    let localA = a3;
    let localB = b3;
    if (b3 < 0n) {
      localB = -b3;
      localA = -a3;
    }
    if (localA > 0n) {
      return (localA * this.ONE - 1n) / localB + 1n;
    }
    return (localA * this.ONE + 1n) / localB - 1n;
  }
  static mulXp(a3, b3) {
    const product = a3 * b3;
    if (!(a3 === 0n || product / a3 === b3)) {
      throw new FixedPointError("MulOverflow");
    }
    return product / this.ONE_XP;
  }
  static mulXpU(a3, b3) {
    return a3 * b3 / this.ONE_XP;
  }
  static divXp(a3, b3) {
    if (b3 === 0n) {
      throw new FixedPointError("ZeroDivision");
    }
    if (a3 === 0n) {
      return 0n;
    }
    const aInflated = a3 * this.ONE_XP;
    if (aInflated / a3 !== this.ONE_XP) {
      throw new FixedPointError("DivInterval");
    }
    return aInflated / b3;
  }
  static divXpU(a3, b3) {
    if (b3 === 0n) {
      throw new FixedPointError("ZeroDivision");
    }
    return a3 * this.ONE_XP / b3;
  }
  static mulDownXpToNp(a3, b3) {
    const E19 = BigInt("10000000000000000000");
    const b1 = b3 / E19;
    const prod1 = a3 * b1;
    if (a3 !== 0n && prod1 / a3 !== b1) {
      throw new FixedPointError("MulOverflow");
    }
    const b22 = b3 % E19;
    const prod2 = a3 * b22;
    if (a3 !== 0n && prod2 / a3 !== b22) {
      throw new FixedPointError("MulOverflow");
    }
    return prod1 >= 0n && prod2 >= 0n ? (prod1 + prod2 / E19) / E19 : (prod1 + prod2 / E19 + 1n) / E19 - 1n;
  }
  static mulDownXpToNpU(a3, b3) {
    const E19 = BigInt("10000000000000000000");
    const b1 = b3 / E19;
    const b22 = b3 % E19;
    const prod1 = a3 * b1;
    const prod2 = a3 * b22;
    return prod1 >= 0n && prod2 >= 0n ? (prod1 + prod2 / E19) / E19 : (prod1 + prod2 / E19 + 1n) / E19 - 1n;
  }
  static mulUpXpToNp(a3, b3) {
    const E19 = BigInt("10000000000000000000");
    const b1 = b3 / E19;
    const prod1 = a3 * b1;
    if (!(a3 === 0n || prod1 / a3 === b1)) {
      throw new FixedPointError("MulOverflow");
    }
    const b22 = b3 % E19;
    const prod2 = a3 * b22;
    if (!(a3 === 0n || prod2 / a3 === b22)) {
      throw new FixedPointError("MulOverflow");
    }
    return prod1 <= 0n && prod2 <= 0n ? (prod1 + prod2 / E19) / E19 : (prod1 + prod2 / E19 - 1n) / E19 + 1n;
  }
  static mulUpXpToNpU(a3, b3) {
    const E19 = BigInt("10000000000000000000");
    const b1 = b3 / E19;
    const b22 = b3 % E19;
    const prod1 = a3 * b1;
    const prod2 = a3 * b22;
    return prod1 <= 0n && prod2 <= 0n ? (prod1 + prod2 / E19) / E19 : (prod1 + prod2 / E19 - 1n) / E19 + 1n;
  }
  static complement(x) {
    if (x >= this.ONE || x <= 0n) {
      return 0n;
    }
    return this.ONE - x;
  }
};
__publicField(SignedFixedPoint, "ONE", BigInt("1000000000000000000"));
// 1e18
__publicField(SignedFixedPoint, "ONE_XP", BigInt(
  "100000000000000000000000000000000000000"
));

// src/gyro/gyroECLPMath.ts
var MaxBalancesExceededError = class extends Error {
  constructor() {
    super("Max assets exceeded");
    this.name = "MaxBalancesExceededError";
  }
};
var MaxInvariantExceededError = class extends Error {
  constructor() {
    super("Max invariant exceeded");
    this.name = "MaxInvariantExceededError";
  }
};
var GyroECLPMath = class {
  // 500e16 (500%)
  static validateParams(params) {
    _require(
      0 <= params.s && params.s <= this._ONE,
      `s must be >= 0 and <= ${this._ONE}`
    );
    _require(
      0 <= params.c && params.c <= this._ONE,
      `c must be >= 0 and <= ${this._ONE}`
    );
    const sc = { x: params.s, y: params.c };
    const scnorm2 = this.scalarProd(sc, sc);
    _require(
      this._ONE - this._ROTATION_VECTOR_NORM_ACCURACY <= scnorm2 && scnorm2 <= this._ONE + this._ROTATION_VECTOR_NORM_ACCURACY,
      "RotationVectorNotNormalized()"
    );
    _require(
      0 <= params.lambda && params.lambda <= this._MAX_STRETCH_FACTOR,
      `lambda must be >= 0 and <= ${this._MAX_STRETCH_FACTOR}`
    );
  }
  static validateDerivedParams(params, derived) {
    _require(derived.tauAlpha.y > 0, "tuaAlpha.y must be > 0");
    _require(derived.tauBeta.y > 0, "tauBeta.y must be > 0");
    _require(
      derived.tauBeta.x > derived.tauAlpha.x,
      "tauBeta.x must be > tauAlpha.x"
    );
    const norm2 = this.scalarProdXp(derived.tauAlpha, derived.tauAlpha);
    _require(
      this._ONE_XP - this._DERIVED_TAU_NORM_ACCURACY_XP <= norm2 && norm2 <= this._ONE_XP + this._DERIVED_TAU_NORM_ACCURACY_XP,
      "RotationVectorNotNormalized()"
    );
    _require(derived.u <= this._ONE_XP, `u must be <= ${this._ONE_XP}`);
    _require(derived.v <= this._ONE_XP, `v must be <= ${this._ONE_XP}`);
    _require(derived.w <= this._ONE_XP, `w must be <= ${this._ONE_XP}`);
    _require(derived.z <= this._ONE_XP, `z must be <= ${this._ONE_XP}`);
    _require(
      this._ONE_XP - this._DERIVED_DSQ_NORM_ACCURACY_XP <= derived.dSq && derived.dSq <= this._ONE_XP + this._DERIVED_DSQ_NORM_ACCURACY_XP,
      "DerivedDsqWrong()"
    );
    const mulDenominator = SignedFixedPoint.divXpU(
      this._ONE_XP,
      this.calcAChiAChiInXp(params, derived) - this._ONE_XP
    );
    _require(
      mulDenominator <= this._MAX_INV_INVARIANT_DENOMINATOR_XP,
      `mulDenominator must be <= ${this._MAX_INV_INVARIANT_DENOMINATOR_XP}`
    );
  }
  static scalarProd(t1, t2) {
    const xProd = SignedFixedPoint.mulDownMag(t1.x, t2.x);
    const yProd = SignedFixedPoint.mulDownMag(t1.y, t2.y);
    return xProd + yProd;
  }
  static scalarProdXp(t1, t2) {
    return SignedFixedPoint.mulXp(t1.x, t2.x) + SignedFixedPoint.mulXp(t1.y, t2.y);
  }
  static mulA(params, tp) {
    return {
      x: SignedFixedPoint.divDownMagU(
        SignedFixedPoint.mulDownMagU(params.c, tp.x) - SignedFixedPoint.mulDownMagU(params.s, tp.y),
        params.lambda
      ),
      y: SignedFixedPoint.mulDownMagU(params.s, tp.x) + SignedFixedPoint.mulDownMagU(params.c, tp.y)
    };
  }
  static virtualOffset0(p, d, r) {
    const termXp = SignedFixedPoint.divXpU(d.tauBeta.x, d.dSq);
    let a3;
    if (d.tauBeta.x > 0n) {
      a3 = SignedFixedPoint.mulUpXpToNpU(
        SignedFixedPoint.mulUpMagU(
          SignedFixedPoint.mulUpMagU(r.x, p.lambda),
          p.c
        ),
        termXp
      );
    } else {
      a3 = SignedFixedPoint.mulUpXpToNpU(
        SignedFixedPoint.mulDownMagU(
          SignedFixedPoint.mulDownMagU(r.y, p.lambda),
          p.c
        ),
        termXp
      );
    }
    return a3 + SignedFixedPoint.mulUpXpToNpU(
      SignedFixedPoint.mulUpMagU(r.x, p.s),
      SignedFixedPoint.divXpU(d.tauBeta.y, d.dSq)
    );
  }
  static virtualOffset1(p, d, r) {
    const termXp = SignedFixedPoint.divXpU(d.tauAlpha.x, d.dSq);
    let b3;
    if (d.tauAlpha.x < 0n) {
      b3 = SignedFixedPoint.mulUpXpToNpU(
        SignedFixedPoint.mulUpMagU(
          SignedFixedPoint.mulUpMagU(r.x, p.lambda),
          p.s
        ),
        -termXp
      );
    } else {
      b3 = SignedFixedPoint.mulUpXpToNpU(
        SignedFixedPoint.mulDownMagU(
          SignedFixedPoint.mulDownMagU(-r.y, p.lambda),
          p.s
        ),
        termXp
      );
    }
    return b3 + SignedFixedPoint.mulUpXpToNpU(
      SignedFixedPoint.mulUpMagU(r.x, p.c),
      SignedFixedPoint.divXpU(d.tauAlpha.y, d.dSq)
    );
  }
  static maxBalances0(p, d, r) {
    const termXp1 = SignedFixedPoint.divXpU(
      d.tauBeta.x - d.tauAlpha.x,
      d.dSq
    );
    const termXp2 = SignedFixedPoint.divXpU(
      d.tauBeta.y - d.tauAlpha.y,
      d.dSq
    );
    const xp = SignedFixedPoint.mulDownXpToNpU(
      SignedFixedPoint.mulDownMagU(
        SignedFixedPoint.mulDownMagU(r.y, p.lambda),
        p.c
      ),
      termXp1
    );
    const term2 = termXp2 > 0n ? SignedFixedPoint.mulDownMagU(r.y, p.s) : SignedFixedPoint.mulUpMagU(r.x, p.s);
    return xp + SignedFixedPoint.mulDownXpToNpU(term2, termXp2);
  }
  static maxBalances1(p, d, r) {
    const termXp1 = SignedFixedPoint.divXpU(
      d.tauBeta.x - d.tauAlpha.x,
      d.dSq
    );
    const termXp2 = SignedFixedPoint.divXpU(
      d.tauAlpha.y - d.tauBeta.y,
      d.dSq
    );
    const yp = SignedFixedPoint.mulDownXpToNpU(
      SignedFixedPoint.mulDownMagU(
        SignedFixedPoint.mulDownMagU(r.y, p.lambda),
        p.s
      ),
      termXp1
    );
    const term2 = termXp2 > 0n ? SignedFixedPoint.mulDownMagU(r.y, p.c) : SignedFixedPoint.mulUpMagU(r.x, p.c);
    return yp + SignedFixedPoint.mulDownXpToNpU(term2, termXp2);
  }
  static calcAtAChi(x, y, p, d) {
    const dSq2 = SignedFixedPoint.mulXpU(d.dSq, d.dSq);
    const termXp = SignedFixedPoint.divXpU(
      SignedFixedPoint.divDownMagU(
        SignedFixedPoint.divDownMagU(d.w, p.lambda) + d.z,
        p.lambda
      ),
      dSq2
    );
    let val = SignedFixedPoint.mulDownXpToNpU(
      SignedFixedPoint.mulDownMagU(x, p.c) - SignedFixedPoint.mulDownMagU(y, p.s),
      termXp
    );
    let termNp = SignedFixedPoint.mulDownMagU(
      SignedFixedPoint.mulDownMagU(x, p.lambda),
      p.s
    ) + SignedFixedPoint.mulDownMagU(
      SignedFixedPoint.mulDownMagU(y, p.lambda),
      p.c
    );
    val = val + SignedFixedPoint.mulDownXpToNpU(
      termNp,
      SignedFixedPoint.divXpU(d.u, dSq2)
    );
    termNp = SignedFixedPoint.mulDownMagU(x, p.s) + SignedFixedPoint.mulDownMagU(y, p.c);
    val = val + SignedFixedPoint.mulDownXpToNpU(
      termNp,
      SignedFixedPoint.divXpU(d.v, dSq2)
    );
    return val;
  }
  static calcAChiAChiInXp(p, d) {
    const dSq3 = SignedFixedPoint.mulXpU(
      SignedFixedPoint.mulXpU(d.dSq, d.dSq),
      d.dSq
    );
    let val = SignedFixedPoint.mulUpMagU(
      p.lambda,
      SignedFixedPoint.divXpU(
        SignedFixedPoint.mulXpU(2n * d.u, d.v),
        dSq3
      )
    );
    val += SignedFixedPoint.mulUpMagU(
      SignedFixedPoint.mulUpMagU(
        SignedFixedPoint.divXpU(
          SignedFixedPoint.mulXpU(d.u + 1n, d.u + 1n),
          dSq3
        ),
        p.lambda
      ),
      p.lambda
    );
    val += SignedFixedPoint.divXpU(SignedFixedPoint.mulXpU(d.v, d.v), dSq3);
    const termXp = SignedFixedPoint.divUpMagU(d.w, p.lambda) + d.z;
    val += SignedFixedPoint.divXpU(
      SignedFixedPoint.mulXpU(termXp, termXp),
      dSq3
    );
    return val;
  }
  static calculateInvariantWithError(balances, params, derived) {
    const x = balances[0];
    const y = balances[1];
    if (x + y > this._MAX_BALANCES) {
      throw new MaxBalancesExceededError();
    }
    const atAChi = this.calcAtAChi(x, y, params, derived);
    const invariantResult = this.calcInvariantSqrt(x, y, params, derived);
    const sqrt2 = invariantResult[0];
    let err = invariantResult[1];
    if (sqrt2 > 0) {
      err = SignedFixedPoint.divUpMagU(err + 1n, 2n * sqrt2);
    } else {
      err = err > 0 ? GyroPoolMath.sqrt(err, 5n) : BigInt("1000000000");
    }
    err = (SignedFixedPoint.mulUpMagU(params.lambda, x + y) / this._ONE_XP + err + 1n) * 20n;
    const achiachi = this.calcAChiAChiInXp(params, derived);
    const mulDenominator = SignedFixedPoint.divXpU(
      this._ONE_XP,
      achiachi - this._ONE_XP
    );
    const invariant = SignedFixedPoint.mulDownXpToNpU(
      atAChi + sqrt2 - err,
      mulDenominator
    );
    err = SignedFixedPoint.mulUpXpToNpU(err, mulDenominator);
    err = err + SignedFixedPoint.mulUpXpToNpU(invariant, mulDenominator) * (params.lambda * params.lambda / BigInt("1000000000000000000000000000000000000")) * 40n / this._ONE_XP + 1n;
    if (invariant + err > this._MAX_INVARIANT) {
      throw new MaxInvariantExceededError();
    }
    return [invariant, err];
  }
  static calcMinAtxAChiySqPlusAtxSq(x, y, p, d) {
    let termNp = SignedFixedPoint.mulUpMagU(
      SignedFixedPoint.mulUpMagU(
        SignedFixedPoint.mulUpMagU(x, x),
        p.c
      ),
      p.c
    ) + SignedFixedPoint.mulUpMagU(
      SignedFixedPoint.mulUpMagU(
        SignedFixedPoint.mulUpMagU(y, y),
        p.s
      ),
      p.s
    );
    termNp = termNp - SignedFixedPoint.mulDownMagU(
      SignedFixedPoint.mulDownMagU(
        SignedFixedPoint.mulDownMagU(x, y),
        p.c * 2n
      ),
      p.s
    );
    let termXp = SignedFixedPoint.mulXpU(d.u, d.u) + SignedFixedPoint.divDownMagU(
      SignedFixedPoint.mulXpU(d.u * 2n, d.v),
      p.lambda
    ) + SignedFixedPoint.divDownMagU(
      SignedFixedPoint.divDownMagU(
        SignedFixedPoint.mulXpU(d.v, d.v),
        p.lambda
      ),
      p.lambda
    );
    termXp = SignedFixedPoint.divXpU(
      termXp,
      SignedFixedPoint.mulXpU(
        SignedFixedPoint.mulXpU(
          SignedFixedPoint.mulXpU(d.dSq, d.dSq),
          d.dSq
        ),
        d.dSq
      )
    );
    let val = SignedFixedPoint.mulDownXpToNpU(-termNp, termXp);
    val = val + SignedFixedPoint.mulDownXpToNpU(
      SignedFixedPoint.divDownMagU(
        SignedFixedPoint.divDownMagU(termNp - 9n, p.lambda),
        p.lambda
      ),
      SignedFixedPoint.divXpU(SignedFixedPoint.ONE_XP, d.dSq)
    );
    return val;
  }
  static calc2AtxAtyAChixAChiy(x, y, p, d) {
    let termNp = SignedFixedPoint.mulDownMagU(
      SignedFixedPoint.mulDownMagU(
        SignedFixedPoint.mulDownMagU(x, x) - SignedFixedPoint.mulUpMagU(y, y),
        2n * p.c
      ),
      p.s
    );
    const xy = SignedFixedPoint.mulDownMagU(y, 2n * x);
    termNp = termNp + SignedFixedPoint.mulDownMagU(
      SignedFixedPoint.mulDownMagU(xy, p.c),
      p.c
    ) - SignedFixedPoint.mulDownMagU(
      SignedFixedPoint.mulDownMagU(xy, p.s),
      p.s
    );
    let termXp = SignedFixedPoint.mulXpU(d.z, d.u) + SignedFixedPoint.divDownMagU(
      SignedFixedPoint.divDownMagU(
        SignedFixedPoint.mulXpU(d.w, d.v),
        p.lambda
      ),
      p.lambda
    );
    termXp = termXp + SignedFixedPoint.divDownMagU(
      SignedFixedPoint.mulXpU(d.w, d.u) + SignedFixedPoint.mulXpU(d.z, d.v),
      p.lambda
    );
    termXp = SignedFixedPoint.divXpU(
      termXp,
      SignedFixedPoint.mulXpU(
        SignedFixedPoint.mulXpU(
          SignedFixedPoint.mulXpU(d.dSq, d.dSq),
          d.dSq
        ),
        d.dSq
      )
    );
    return SignedFixedPoint.mulDownXpToNpU(termNp, termXp);
  }
  static calcMinAtyAChixSqPlusAtySq(x, y, p, d) {
    let termNp = SignedFixedPoint.mulUpMagU(
      SignedFixedPoint.mulUpMagU(
        SignedFixedPoint.mulUpMagU(x, x),
        p.s
      ),
      p.s
    ) + SignedFixedPoint.mulUpMagU(
      SignedFixedPoint.mulUpMagU(
        SignedFixedPoint.mulUpMagU(y, y),
        p.c
      ),
      p.c
    );
    termNp = termNp + SignedFixedPoint.mulUpMagU(
      SignedFixedPoint.mulUpMagU(
        SignedFixedPoint.mulUpMagU(x, y),
        p.s * 2n
      ),
      p.c
    );
    let termXp = SignedFixedPoint.mulXpU(d.z, d.z) + SignedFixedPoint.divDownMagU(
      SignedFixedPoint.divDownMagU(
        SignedFixedPoint.mulXpU(d.w, d.w),
        p.lambda
      ),
      p.lambda
    );
    termXp = termXp + SignedFixedPoint.divDownMagU(
      SignedFixedPoint.mulXpU(2n * d.z, d.w),
      p.lambda
    );
    termXp = SignedFixedPoint.divXpU(
      termXp,
      SignedFixedPoint.mulXpU(
        SignedFixedPoint.mulXpU(
          SignedFixedPoint.mulXpU(d.dSq, d.dSq),
          d.dSq
        ),
        d.dSq
      )
    );
    let val = SignedFixedPoint.mulDownXpToNpU(-termNp, termXp);
    val = val + SignedFixedPoint.mulDownXpToNpU(
      termNp - 9n,
      SignedFixedPoint.divXpU(SignedFixedPoint.ONE_XP, d.dSq)
    );
    return val;
  }
  static calcInvariantSqrt(x, y, p, d) {
    let val = this.calcMinAtxAChiySqPlusAtxSq(x, y, p, d) + this.calc2AtxAtyAChixAChiy(x, y, p, d) + this.calcMinAtyAChixSqPlusAtySq(x, y, p, d);
    const err = (SignedFixedPoint.mulUpMagU(x, x) + SignedFixedPoint.mulUpMagU(y, y)) / BigInt("1000000000000000000000000000000000000000");
    val = val > 0n ? GyroPoolMath.sqrt(val, 5n) : 0n;
    return [val, err];
  }
  static calcSpotPrice0in1(balances, params, derived, invariant) {
    const r = { x: invariant, y: invariant };
    const ab = {
      x: this.virtualOffset0(params, derived, r),
      y: this.virtualOffset1(params, derived, r)
    };
    const vec = {
      x: balances[0] - ab.x,
      y: balances[1] - ab.y
    };
    const transformedVec = this.mulA(params, vec);
    const pc = {
      x: SignedFixedPoint.divDownMagU(transformedVec.x, transformedVec.y),
      y: this._ONE
    };
    const pgx = this.scalarProd(
      pc,
      this.mulA(params, { x: this._ONE, y: 0n })
    );
    return SignedFixedPoint.divDownMag(
      pgx,
      this.scalarProd(pc, this.mulA(params, { x: 0n, y: this._ONE }))
    );
  }
  static checkAssetBounds(params, derived, invariant, newBal, assetIndex) {
    if (assetIndex === 0) {
      const xPlus = this.maxBalances0(params, derived, invariant);
      if (newBal > this._MAX_BALANCES || newBal > xPlus) {
        throw new Error("Asset bounds exceeded");
      }
    } else {
      const yPlus = this.maxBalances1(params, derived, invariant);
      if (newBal > this._MAX_BALANCES || newBal > yPlus) {
        throw new Error("Asset bounds exceeded");
      }
    }
  }
  static calcOutGivenIn(balances, amountIn, tokenInIsToken0, params, derived, invariant) {
    const [ixIn, ixOut, calcGiven] = tokenInIsToken0 ? [0, 1, this.calcYGivenX] : [1, 0, this.calcXGivenY];
    const balInNew = balances[ixIn] + amountIn;
    this.checkAssetBounds(params, derived, invariant, balInNew, ixIn);
    const balOutNew = calcGiven.call(
      this,
      balInNew,
      params,
      derived,
      invariant
    );
    return balances[ixOut] - balOutNew;
  }
  static calcInGivenOut(balances, amountOut, tokenInIsToken0, params, derived, invariant) {
    const [ixIn, ixOut, calcGiven] = tokenInIsToken0 ? [0, 1, this.calcXGivenY] : [1, 0, this.calcYGivenX];
    if (amountOut > balances[ixOut]) {
      throw new Error("Asset bounds exceeded");
    }
    const balOutNew = balances[ixOut] - amountOut;
    const balInNew = calcGiven.call(
      this,
      balOutNew,
      params,
      derived,
      invariant
    );
    this.checkAssetBounds(params, derived, invariant, balInNew, ixIn);
    return balInNew - balances[ixIn];
  }
  static solveQuadraticSwap(lambda, x, s, c, r, ab, tauBeta, dSq) {
    const lamBar = {
      x: SignedFixedPoint.ONE_XP - SignedFixedPoint.divDownMagU(
        SignedFixedPoint.divDownMagU(
          SignedFixedPoint.ONE_XP,
          lambda
        ),
        lambda
      ),
      y: SignedFixedPoint.ONE_XP - SignedFixedPoint.divUpMagU(
        SignedFixedPoint.divUpMagU(SignedFixedPoint.ONE_XP, lambda),
        lambda
      )
    };
    const q = { a: 0n, b: 0n, c: 0n };
    const xp = x - ab.x;
    if (xp > 0n) {
      q.b = SignedFixedPoint.mulUpXpToNpU(
        SignedFixedPoint.mulDownMagU(
          SignedFixedPoint.mulDownMagU(-xp, s),
          c
        ),
        SignedFixedPoint.divXpU(lamBar.y, dSq)
      );
    } else {
      q.b = SignedFixedPoint.mulUpXpToNpU(
        SignedFixedPoint.mulUpMagU(
          SignedFixedPoint.mulUpMagU(-xp, s),
          c
        ),
        SignedFixedPoint.divXpU(lamBar.x, dSq) + 1n
      );
    }
    const sTerm = {
      x: SignedFixedPoint.divXpU(
        SignedFixedPoint.mulDownMagU(
          SignedFixedPoint.mulDownMagU(lamBar.y, s),
          s
        ),
        dSq
      ),
      y: SignedFixedPoint.divXpU(
        SignedFixedPoint.mulUpMagU(
          SignedFixedPoint.mulUpMagU(lamBar.x, s),
          s
        ),
        dSq + 1n
      ) + 1n
    };
    sTerm.x = SignedFixedPoint.ONE_XP - sTerm.x;
    sTerm.y = SignedFixedPoint.ONE_XP - sTerm.y;
    q.c = -this.calcXpXpDivLambdaLambda(x, r, lambda, s, c, tauBeta, dSq);
    q.c = q.c + SignedFixedPoint.mulDownXpToNpU(
      SignedFixedPoint.mulDownMagU(r.y, r.y),
      sTerm.y
    );
    q.c = q.c > 0n ? GyroPoolMath.sqrt(q.c, 5n) : 0n;
    if (q.b - q.c > 0n) {
      q.a = SignedFixedPoint.mulUpXpToNpU(
        q.b - q.c,
        SignedFixedPoint.divXpU(SignedFixedPoint.ONE_XP, sTerm.y) + 1n
      );
    } else {
      q.a = SignedFixedPoint.mulUpXpToNpU(
        q.b - q.c,
        SignedFixedPoint.divXpU(SignedFixedPoint.ONE_XP, sTerm.x)
      );
    }
    return q.a + ab.y;
  }
  static calcXpXpDivLambdaLambda(x, r, lambda, s, c, tauBeta, dSq) {
    const sqVars = {
      x: SignedFixedPoint.mulXpU(dSq, dSq),
      y: SignedFixedPoint.mulUpMagU(r.x, r.x)
    };
    const q = { a: 0n, b: 0n, c: 0n };
    const termXp = SignedFixedPoint.divXpU(
      SignedFixedPoint.mulXpU(tauBeta.x, tauBeta.y),
      sqVars.x
    );
    if (termXp > 0n) {
      q.a = SignedFixedPoint.mulUpMagU(sqVars.y, 2n * s);
      q.a = SignedFixedPoint.mulUpXpToNpU(
        SignedFixedPoint.mulUpMagU(q.a, c),
        termXp + 7n
      );
    } else {
      q.a = SignedFixedPoint.mulDownMagU(r.y, r.y);
      q.a = SignedFixedPoint.mulDownMagU(q.a, 2n * s);
      q.a = SignedFixedPoint.mulUpXpToNpU(
        SignedFixedPoint.mulDownMagU(q.a, c),
        termXp
      );
    }
    if (tauBeta.x < 0n) {
      q.b = SignedFixedPoint.mulUpXpToNpU(
        SignedFixedPoint.mulUpMagU(
          SignedFixedPoint.mulUpMagU(r.x, x),
          2n * c
        ),
        -SignedFixedPoint.divXpU(tauBeta.x, dSq) + 3n
      );
    } else {
      q.b = SignedFixedPoint.mulUpXpToNpU(
        SignedFixedPoint.mulDownMagU(
          SignedFixedPoint.mulDownMagU(-r.y, x),
          2n * c
        ),
        SignedFixedPoint.divXpU(tauBeta.x, dSq)
      );
    }
    q.a = q.a + q.b;
    let termXp2 = SignedFixedPoint.divXpU(
      SignedFixedPoint.mulXpU(tauBeta.y, tauBeta.y),
      sqVars.x
    ) + 7n;
    q.b = SignedFixedPoint.mulUpMagU(sqVars.y, s);
    q.b = SignedFixedPoint.mulUpXpToNpU(
      SignedFixedPoint.mulUpMagU(q.b, s),
      termXp2
    );
    q.c = SignedFixedPoint.mulUpXpToNpU(
      SignedFixedPoint.mulDownMagU(
        SignedFixedPoint.mulDownMagU(-r.y, x),
        2n * s
      ),
      SignedFixedPoint.divXpU(tauBeta.y, dSq)
    );
    q.b = q.b + q.c + SignedFixedPoint.mulUpMagU(x, x);
    q.b = q.b > 0n ? SignedFixedPoint.divUpMagU(q.b, lambda) : SignedFixedPoint.divDownMagU(q.b, lambda);
    q.a = q.a + q.b;
    q.a = q.a > 0n ? SignedFixedPoint.divUpMagU(q.a, lambda) : SignedFixedPoint.divDownMagU(q.a, lambda);
    termXp2 = SignedFixedPoint.divXpU(
      SignedFixedPoint.mulXpU(tauBeta.x, tauBeta.x),
      sqVars.x
    ) + 7n;
    const val = SignedFixedPoint.mulUpMagU(
      SignedFixedPoint.mulUpMagU(sqVars.y, c),
      c
    );
    return SignedFixedPoint.mulUpXpToNpU(val, termXp2) + q.a;
  }
  static calcYGivenX(x, params, d, r) {
    const ab = {
      x: this.virtualOffset0(params, d, r),
      y: this.virtualOffset1(params, d, r)
    };
    return this.solveQuadraticSwap(
      params.lambda,
      x,
      params.s,
      params.c,
      r,
      ab,
      d.tauBeta,
      d.dSq
    );
  }
  static calcXGivenY(y, params, d, r) {
    const ba = {
      x: this.virtualOffset1(params, d, r),
      y: this.virtualOffset0(params, d, r)
    };
    return this.solveQuadraticSwap(
      params.lambda,
      y,
      params.c,
      params.s,
      r,
      ba,
      { x: -d.tauAlpha.x, y: d.tauAlpha.y },
      d.dSq
    );
  }
};
__publicField(GyroECLPMath, "_ONEHALF", BigInt("500000000000000000"));
// 0.5e18
__publicField(GyroECLPMath, "_ONE", BigInt("1000000000000000000"));
// 1e18
__publicField(GyroECLPMath, "_ONE_XP", BigInt("100000000000000000000000000000000000000"));
// 1e38
// Anti-overflow limits: Params and DerivedParams (static, only needs to be checked on pool creation)
__publicField(GyroECLPMath, "_ROTATION_VECTOR_NORM_ACCURACY", BigInt("1000"));
// 1e3 (1e-15 in normal precision)
__publicField(GyroECLPMath, "_MAX_STRETCH_FACTOR", BigInt("100000000000000000000000000"));
// 1e26 (1e8 in normal precision)
__publicField(GyroECLPMath, "_DERIVED_TAU_NORM_ACCURACY_XP", BigInt(
  "100000000000000000000000"
));
// 1e23 (1e-15 in extra precision)
__publicField(GyroECLPMath, "_MAX_INV_INVARIANT_DENOMINATOR_XP", BigInt(
  "10000000000000000000000000000000000000000000"
));
// 1e43 (1e5 in extra precision)
__publicField(GyroECLPMath, "_DERIVED_DSQ_NORM_ACCURACY_XP", BigInt(
  "100000000000000000000000"
));
// 1e23 (1e-15 in extra precision)
// Anti-overflow limits: Dynamic values (checked before operations that use them)
__publicField(GyroECLPMath, "_MAX_BALANCES", BigInt(
  "100000000000000000000000000000000000"
));
// 1e34 (1e16 in normal precision)
__publicField(GyroECLPMath, "_MAX_INVARIANT", BigInt(
  "3000000000000000000000000000000000000"
));
// 3e37 (3e19 in normal precision)
// Invariant growth limit: non-proportional add cannot cause the invariant to increase by more than this ratio
__publicField(GyroECLPMath, "MIN_INVARIANT_RATIO", BigInt("600000000000000000"));
// 60e16 (60%)
// Invariant shrink limit: non-proportional remove cannot cause the invariant to decrease by less than this ratio
__publicField(GyroECLPMath, "MAX_INVARIANT_RATIO", BigInt("5000000000000000000"));

// src/gyro/gyroECLPPool.ts
var GyroECLP = class {
  constructor(poolState) {
    __publicField(this, "poolParams");
    this.poolParams = {
      eclpParams: {
        alpha: poolState.paramsAlpha,
        beta: poolState.paramsBeta,
        c: poolState.paramsC,
        s: poolState.paramsS,
        lambda: poolState.paramsLambda
      },
      derivedECLPParams: {
        tauAlpha: {
          x: poolState.tauAlphaX,
          y: poolState.tauAlphaY
        },
        tauBeta: {
          x: poolState.tauBetaX,
          y: poolState.tauBetaY
        },
        u: poolState.u,
        v: poolState.v,
        w: poolState.w,
        z: poolState.z,
        dSq: poolState.dSq
      }
    };
  }
  getMaximumInvariantRatio() {
    return GyroECLPMath.MAX_INVARIANT_RATIO;
  }
  getMinimumInvariantRatio() {
    return GyroECLPMath.MIN_INVARIANT_RATIO;
  }
  /**
   * Returns the max amount that can be swapped in relation to the swapKind.
   * @param maxSwapParams
   * @returns GivenIn: Returns the max amount in. GivenOut: Returns the max amount out.
   */
  getMaxSwapAmount(maxSwapParams) {
    const {
      balancesLiveScaled18,
      indexIn,
      indexOut,
      tokenRates,
      scalingFactors,
      swapKind
    } = maxSwapParams;
    if (swapKind === 0 /* GivenIn */) {
      const diff = MAX_BALANCE - balancesLiveScaled18[indexIn];
      return toRawUndoRateRoundDown(
        diff,
        scalingFactors[indexIn],
        tokenRates[indexIn]
      );
    }
    const max = MathSol.mulDownFixed(
      990000000000000000n,
      balancesLiveScaled18[indexOut]
    );
    return toRawUndoRateRoundDown(
      max,
      scalingFactors[indexOut],
      tokenRates[indexOut]
    );
  }
  getMaxSingleTokenAddAmount() {
    return MAX_UINT256;
  }
  getMaxSingleTokenRemoveAmount(maxRemoveParams) {
    const {
      isExactIn,
      totalSupply,
      tokenOutBalance,
      tokenOutScalingFactor,
      tokenOutRate
    } = maxRemoveParams;
    return this.getMaxSwapAmount({
      swapKind: isExactIn ? 0 /* GivenIn */ : 1 /* GivenOut */,
      balancesLiveScaled18: [totalSupply, tokenOutBalance],
      tokenRates: [1000000000000000000n, tokenOutRate],
      scalingFactors: [1000000000000000000n, tokenOutScalingFactor],
      indexIn: 0,
      indexOut: 1
    });
  }
  onSwap(swapParams) {
    const {
      swapKind,
      balancesLiveScaled18: balancesScaled18,
      indexIn,
      amountGivenScaled18
    } = swapParams;
    const tokenInIsToken0 = indexIn === 0;
    const { eclpParams, derivedECLPParams } = this.poolParams;
    const [currentInvariant, invErr] = GyroECLPMath.calculateInvariantWithError(
      balancesScaled18,
      eclpParams,
      derivedECLPParams
    );
    const invariant = {
      x: currentInvariant + 2n * invErr,
      y: currentInvariant
    };
    if (swapKind === 0 /* GivenIn */) {
      const amountOutScaled18 = GyroECLPMath.calcOutGivenIn(
        balancesScaled18,
        amountGivenScaled18,
        tokenInIsToken0,
        eclpParams,
        derivedECLPParams,
        invariant
      );
      return amountOutScaled18;
    }
    const amountInScaled18 = GyroECLPMath.calcInGivenOut(
      balancesScaled18,
      amountGivenScaled18,
      tokenInIsToken0,
      eclpParams,
      derivedECLPParams,
      invariant
    );
    return amountInScaled18;
  }
  computeInvariant(balancesLiveScaled18, rounding) {
    const { eclpParams, derivedECLPParams } = this.poolParams;
    const [currentInvariant, invErr] = GyroECLPMath.calculateInvariantWithError(
      balancesLiveScaled18,
      eclpParams,
      derivedECLPParams
    );
    if (rounding == 1 /* ROUND_DOWN */) {
      return currentInvariant - invErr;
    } else {
      return currentInvariant + invErr;
    }
  }
  computeBalance(balancesLiveScaled18, tokenInIndex, invariantRatio) {
    const { eclpParams, derivedECLPParams } = this.poolParams;
    const [currentInvariant, invErr] = GyroECLPMath.calculateInvariantWithError(
      balancesLiveScaled18,
      eclpParams,
      derivedECLPParams
    );
    const invariant = {
      x: MathSol.mulUpFixed(currentInvariant + invErr, invariantRatio),
      y: MathSol.mulUpFixed(currentInvariant - invErr, invariantRatio)
    };
    if (invariant.x > GyroECLPMath._MAX_INVARIANT)
      throw Error(`GyroECLPMath.MaxInvariantExceeded`);
    if (tokenInIndex === 0) {
      return GyroECLPMath.calcXGivenY(
        balancesLiveScaled18[1],
        eclpParams,
        derivedECLPParams,
        invariant
      );
    } else {
      return GyroECLPMath.calcYGivenX(
        balancesLiveScaled18[0],
        eclpParams,
        derivedECLPParams,
        invariant
      );
    }
  }
};

// src/utils/ozMath.ts
function sqrt(a3) {
  if (a3 <= 1n) {
    return a3;
  }
  let aa = a3;
  let xn = 1n;
  if (aa >= 1n << 128n) {
    aa >>= 128n;
    xn <<= 64n;
  }
  if (aa >= 1n << 64n) {
    aa >>= 64n;
    xn <<= 32n;
  }
  if (aa >= 1n << 32n) {
    aa >>= 32n;
    xn <<= 16n;
  }
  if (aa >= 1n << 16n) {
    aa >>= 16n;
    xn <<= 8n;
  }
  if (aa >= 1n << 8n) {
    aa >>= 8n;
    xn <<= 4n;
  }
  if (aa >= 1n << 4n) {
    aa >>= 4n;
    xn <<= 2n;
  }
  if (aa >= 1n << 2n) {
    xn <<= 1n;
  }
  xn = 3n * xn >> 1n;
  xn = xn + a3 / xn >> 1n;
  xn = xn + a3 / xn >> 1n;
  xn = xn + a3 / xn >> 1n;
  xn = xn + a3 / xn >> 1n;
  xn = xn + a3 / xn >> 1n;
  xn = xn + a3 / xn >> 1n;
  return xn - (xn > a3 / xn ? 1n : 0n);
}

// src/reClamm/reClammMath.ts
var a = 0;
var b = 1;
function computeCurrentVirtualBalances(currentTimestamp, balancesScaled18, lastVirtualBalanceA, lastVirtualBalanceB, dailyPriceShiftBase, lastTimestamp, centerednessMargin, priceRatioState) {
  if (lastTimestamp === currentTimestamp) {
    return {
      currentVirtualBalanceA: lastVirtualBalanceA,
      currentVirtualBalanceB: lastVirtualBalanceB,
      changed: false
    };
  }
  let currentVirtualBalanceA = lastVirtualBalanceA;
  let currentVirtualBalanceB = lastVirtualBalanceB;
  const currentFourthRootPriceRatio = computeFourthRootPriceRatio(
    currentTimestamp,
    priceRatioState.startFourthRootPriceRatio,
    priceRatioState.endFourthRootPriceRatio,
    priceRatioState.priceRatioUpdateStartTime,
    priceRatioState.priceRatioUpdateEndTime
  );
  let changed = false;
  if (currentTimestamp > priceRatioState.priceRatioUpdateStartTime && lastTimestamp < priceRatioState.priceRatioUpdateEndTime) {
    ({
      virtualBalanceA: currentVirtualBalanceA,
      virtualBalanceB: currentVirtualBalanceB
    } = computeVirtualBalancesUpdatingPriceRatio(
      currentFourthRootPriceRatio,
      balancesScaled18,
      lastVirtualBalanceA,
      lastVirtualBalanceB
    ));
    changed = true;
  }
  const { poolCenteredness: centeredness, isPoolAboveCenter } = computeCenteredness(
    balancesScaled18,
    currentVirtualBalanceA,
    currentVirtualBalanceB
  );
  if (centeredness < centerednessMargin) {
    [currentVirtualBalanceA, currentVirtualBalanceB] = computeVirtualBalancesUpdatingPriceRange(
      balancesScaled18,
      currentVirtualBalanceA,
      currentVirtualBalanceB,
      isPoolAboveCenter,
      dailyPriceShiftBase,
      currentTimestamp,
      lastTimestamp
    );
    changed = true;
  }
  return {
    currentVirtualBalanceA,
    currentVirtualBalanceB,
    changed
  };
}
function computeVirtualBalancesUpdatingPriceRatio(currentFourthRootPriceRatio, balancesScaled18, lastVirtualBalanceA, lastVirtualBalanceB) {
  const { poolCenteredness, isPoolAboveCenter } = computeCenteredness(
    balancesScaled18,
    lastVirtualBalanceA,
    lastVirtualBalanceB
  );
  const {
    balanceTokenUndervalued,
    lastVirtualBalanceUndervalued,
    lastVirtualBalanceOvervalued
  } = isPoolAboveCenter ? {
    balanceTokenUndervalued: balancesScaled18[a],
    lastVirtualBalanceUndervalued: lastVirtualBalanceA,
    lastVirtualBalanceOvervalued: lastVirtualBalanceB
  } : {
    balanceTokenUndervalued: balancesScaled18[b],
    lastVirtualBalanceUndervalued: lastVirtualBalanceB,
    lastVirtualBalanceOvervalued: lastVirtualBalanceA
  };
  const sqrtPriceRatio = MathSol.mulDownFixed(
    currentFourthRootPriceRatio,
    currentFourthRootPriceRatio
  );
  const virtualBalanceUndervalued = balanceTokenUndervalued * (WAD + poolCenteredness + sqrt(
    poolCenteredness * (poolCenteredness + 4n * sqrtPriceRatio - 2000000000000000000n) + 1000000000000000000000000000000000000n
  )) / (2n * (sqrtPriceRatio - WAD));
  const virtualBalanceOvervalued = virtualBalanceUndervalued * lastVirtualBalanceOvervalued / lastVirtualBalanceUndervalued;
  const { virtualBalanceA, virtualBalanceB } = isPoolAboveCenter ? {
    virtualBalanceA: virtualBalanceUndervalued,
    virtualBalanceB: virtualBalanceOvervalued
  } : {
    virtualBalanceA: virtualBalanceOvervalued,
    virtualBalanceB: virtualBalanceUndervalued
  };
  return { virtualBalanceA, virtualBalanceB };
}
function computeVirtualBalancesUpdatingPriceRange(balancesScaled18, virtualBalanceA, virtualBalanceB, isPoolAboveCenter, dailyPriceShiftBase, currentTimestamp, lastTimestamp) {
  const sqrtPriceRatio = sqrt(
    computePriceRatio(balancesScaled18, virtualBalanceA, virtualBalanceB) * WAD
  );
  const [balancesScaledUndervalued, balancesScaledOvervalued] = isPoolAboveCenter ? [balancesScaled18[0], balancesScaled18[1]] : [balancesScaled18[1], balancesScaled18[0]];
  let [virtualBalanceUndervalued, virtualBalanceOvervalued] = isPoolAboveCenter ? [virtualBalanceA, virtualBalanceB] : [virtualBalanceB, virtualBalanceA];
  virtualBalanceOvervalued = MathSol.mulDownFixed(
    virtualBalanceOvervalued,
    MathSol.powDownFixed(
      dailyPriceShiftBase,
      (currentTimestamp - lastTimestamp) * WAD
    )
  );
  virtualBalanceUndervalued = balancesScaledUndervalued * (virtualBalanceOvervalued + balancesScaledOvervalued) / (MathSol.mulDownFixed(sqrtPriceRatio - WAD, virtualBalanceOvervalued) - balancesScaledOvervalued);
  return isPoolAboveCenter ? [virtualBalanceUndervalued, virtualBalanceOvervalued] : [virtualBalanceOvervalued, virtualBalanceUndervalued];
}
function computePriceRatio(balancesScaled18, virtualBalanceA, virtualBalanceB) {
  const { minPrice, maxPrice } = computePriceRange(
    balancesScaled18,
    virtualBalanceA,
    virtualBalanceB
  );
  return MathSol.divUpFixed(maxPrice, minPrice);
}
function computePriceRange(balancesScaled18, virtualBalanceA, virtualBalanceB) {
  const currentInvariant = computeInvariant(
    balancesScaled18,
    virtualBalanceA,
    virtualBalanceB,
    1 /* ROUND_DOWN */
  );
  const minPrice = virtualBalanceB * virtualBalanceB / currentInvariant;
  const maxPrice = MathSol.divDownFixed(
    currentInvariant,
    MathSol.mulDownFixed(virtualBalanceA, virtualBalanceA)
  );
  return { minPrice, maxPrice };
}
function computeFourthRootPriceRatio(currentTime, startFourthRootPriceRatio, endFourthRootPriceRatio, priceRatioUpdateStartTime, priceRatioUpdateEndTime) {
  if (currentTime >= priceRatioUpdateEndTime) {
    return endFourthRootPriceRatio;
  } else if (currentTime <= priceRatioUpdateStartTime) {
    return startFourthRootPriceRatio;
  }
  const exponent = MathSol.divDownFixed(
    currentTime - priceRatioUpdateStartTime,
    priceRatioUpdateEndTime - priceRatioUpdateStartTime
  );
  const currentFourthRootPriceRatio = MathSol.mulDownFixed(
    startFourthRootPriceRatio,
    MathSol.powDownFixed(
      MathSol.divDownFixed(
        endFourthRootPriceRatio,
        startFourthRootPriceRatio
      ),
      exponent
    )
  );
  const minimumFourthRootPriceRatio = MathSol.min(
    startFourthRootPriceRatio,
    endFourthRootPriceRatio
  );
  return MathSol.max(
    minimumFourthRootPriceRatio,
    currentFourthRootPriceRatio
  );
}
function computeCenteredness(balancesScaled18, virtualBalanceA, virtualBalanceB) {
  if (balancesScaled18[a] === 0n) {
    return { poolCenteredness: 0n, isPoolAboveCenter: false };
  } else if (balancesScaled18[b] === 0n) {
    return { poolCenteredness: 0n, isPoolAboveCenter: true };
  }
  const numerator = balancesScaled18[a] * virtualBalanceB;
  const denominator = virtualBalanceA * balancesScaled18[b];
  let poolCenteredness;
  let isPoolAboveCenter;
  if (numerator <= denominator) {
    poolCenteredness = MathSol.divDownFixed(numerator, denominator);
    isPoolAboveCenter = false;
  } else {
    poolCenteredness = MathSol.divDownFixed(denominator, numerator);
    isPoolAboveCenter = true;
  }
  return { poolCenteredness, isPoolAboveCenter };
}
function computeInvariant(balancesScaled18, virtualBalanceA, virtualBalanceB, rounding) {
  const _mulUpOrDown = rounding === 1 /* ROUND_DOWN */ ? MathSol.mulDownFixed : MathSol.mulUpFixed;
  return _mulUpOrDown(
    balancesScaled18[0] + virtualBalanceA,
    balancesScaled18[1] + virtualBalanceB
  );
}
function computeOutGivenIn(balancesScaled18, virtualBalanceA, virtualBalanceB, tokenInIndex, tokenOutIndex, amountInScaled18) {
  const { virtualBalanceTokenIn, virtualBalanceTokenOut } = tokenInIndex === 0 ? {
    virtualBalanceTokenIn: virtualBalanceA,
    virtualBalanceTokenOut: virtualBalanceB
  } : {
    virtualBalanceTokenIn: virtualBalanceB,
    virtualBalanceTokenOut: virtualBalanceA
  };
  const amountOutScaled18 = (balancesScaled18[tokenOutIndex] + virtualBalanceTokenOut) * amountInScaled18 / (balancesScaled18[tokenInIndex] + virtualBalanceTokenIn + amountInScaled18);
  if (amountOutScaled18 > balancesScaled18[tokenOutIndex]) {
    throw new Error("reClammMath: AmountOutGreaterThanBalance");
  }
  return amountOutScaled18;
}
function computeInGivenOut(balancesScaled18, virtualBalanceA, virtualBalanceB, tokenInIndex, tokenOutIndex, amountOutScaled18) {
  if (amountOutScaled18 > balancesScaled18[tokenOutIndex]) {
    throw new Error("reClammMath: AmountOutGreaterThanBalance");
  }
  const { virtualBalanceTokenIn, virtualBalanceTokenOut } = tokenInIndex === 0 ? {
    virtualBalanceTokenIn: virtualBalanceA,
    virtualBalanceTokenOut: virtualBalanceB
  } : {
    virtualBalanceTokenIn: virtualBalanceB,
    virtualBalanceTokenOut: virtualBalanceA
  };
  const amountInScaled18 = MathSol.mulDivUpFixed(
    balancesScaled18[tokenInIndex] + virtualBalanceTokenIn,
    amountOutScaled18,
    balancesScaled18[tokenOutIndex] + virtualBalanceTokenOut - amountOutScaled18
  );
  return amountInScaled18;
}

// src/reClamm/reClammPool.ts
var ReClamm = class {
  constructor(reClammState) {
    __publicField(this, "reClammState");
    this.reClammState = reClammState;
  }
  getMaximumInvariantRatio() {
    return 0n;
  }
  getMinimumInvariantRatio() {
    return 0n;
  }
  /**
   * Returns the max amount that can be swapped in relation to the swapKind.
   * @param maxSwapParams
   * @returns GivenIn: Returns the max amount in. GivenOut: Returns the max amount out.
   */
  getMaxSwapAmount(maxSwapParams) {
    const { balancesLiveScaled18, indexIn, indexOut, swapKind } = maxSwapParams;
    if (swapKind === 0 /* GivenIn */) {
      const computeResult = this._computeCurrentVirtualBalances(balancesLiveScaled18);
      const maxAmountIn = computeInGivenOut(
        balancesLiveScaled18,
        computeResult.currentVirtualBalanceA,
        computeResult.currentVirtualBalanceB,
        indexIn,
        indexOut,
        balancesLiveScaled18[indexOut]
      );
      const maxAmountInWithTolerance = maxAmountIn - 10n;
      return maxAmountInWithTolerance < 0n ? 0n : maxAmountInWithTolerance;
    }
    const maxAmountOutWithTolerance = balancesLiveScaled18[indexOut] - 10n;
    return maxAmountOutWithTolerance < 0n ? 0n : maxAmountOutWithTolerance;
  }
  getMaxSingleTokenAddAmount() {
    return 0n;
  }
  getMaxSingleTokenRemoveAmount() {
    return 0n;
  }
  onSwap(swapParams) {
    const {
      swapKind,
      balancesLiveScaled18,
      indexIn,
      indexOut,
      amountGivenScaled18
    } = swapParams;
    const { currentVirtualBalanceA, currentVirtualBalanceB } = this._computeCurrentVirtualBalances(balancesLiveScaled18);
    if (swapKind === 0 /* GivenIn */) {
      const amountCalculatedScaled182 = computeOutGivenIn(
        balancesLiveScaled18,
        currentVirtualBalanceA,
        currentVirtualBalanceB,
        indexIn,
        indexOut,
        amountGivenScaled18
      );
      return amountCalculatedScaled182;
    }
    const amountCalculatedScaled18 = computeInGivenOut(
      balancesLiveScaled18,
      currentVirtualBalanceA,
      currentVirtualBalanceB,
      indexIn,
      indexOut,
      amountGivenScaled18
    );
    return amountCalculatedScaled18;
  }
  computeInvariant() {
    return 0n;
  }
  computeBalance() {
    return 0n;
  }
  _computeCurrentVirtualBalances(balancesScaled18) {
    return computeCurrentVirtualBalances(
      this.reClammState.currentTimestamp,
      balancesScaled18,
      this.reClammState.lastVirtualBalances[0],
      this.reClammState.lastVirtualBalances[1],
      this.reClammState.dailyPriceShiftBase,
      this.reClammState.lastTimestamp,
      this.reClammState.centerednessMargin,
      {
        priceRatioUpdateStartTime: this.reClammState.priceRatioUpdateStartTime,
        priceRatioUpdateEndTime: this.reClammState.priceRatioUpdateEndTime,
        startFourthRootPriceRatio: this.reClammState.startFourthRootPriceRatio,
        endFourthRootPriceRatio: this.reClammState.endFourthRootPriceRatio
      }
    );
  }
};

// src/reClammV2/reClammV2Math.ts
var a2 = 0;
var b2 = 1;
var thirtyDaysSeconds = 30n * 24n * 60n * 60n;
function computeCurrentVirtualBalances2(currentTimestamp, balancesScaled18, lastVirtualBalanceA, lastVirtualBalanceB, dailyPriceShiftBase, lastTimestamp, centerednessMargin, priceRatioState) {
  if (lastTimestamp === currentTimestamp) {
    return {
      currentVirtualBalanceA: lastVirtualBalanceA,
      currentVirtualBalanceB: lastVirtualBalanceB,
      changed: false
    };
  }
  let currentVirtualBalanceA = lastVirtualBalanceA;
  let currentVirtualBalanceB = lastVirtualBalanceB;
  const currentFourthRootPriceRatio = computeFourthRootPriceRatio2(
    currentTimestamp,
    priceRatioState.startFourthRootPriceRatio,
    priceRatioState.endFourthRootPriceRatio,
    priceRatioState.priceRatioUpdateStartTime,
    priceRatioState.priceRatioUpdateEndTime
  );
  let changed = false;
  if (currentTimestamp > priceRatioState.priceRatioUpdateStartTime && lastTimestamp < priceRatioState.priceRatioUpdateEndTime) {
    ({
      virtualBalanceA: currentVirtualBalanceA,
      virtualBalanceB: currentVirtualBalanceB
    } = computeVirtualBalancesUpdatingPriceRatio2(
      currentFourthRootPriceRatio,
      balancesScaled18,
      lastVirtualBalanceA,
      lastVirtualBalanceB
    ));
    changed = true;
  }
  const { poolCenteredness: centeredness, isPoolAboveCenter } = computeCenteredness2(
    balancesScaled18,
    currentVirtualBalanceA,
    currentVirtualBalanceB
  );
  if (centeredness < centerednessMargin) {
    [currentVirtualBalanceA, currentVirtualBalanceB] = computeVirtualBalancesUpdatingPriceRange2(
      balancesScaled18,
      currentVirtualBalanceA,
      currentVirtualBalanceB,
      isPoolAboveCenter,
      dailyPriceShiftBase,
      currentTimestamp,
      lastTimestamp
    );
    changed = true;
  }
  return {
    currentVirtualBalanceA,
    currentVirtualBalanceB,
    changed
  };
}
function computeVirtualBalancesUpdatingPriceRatio2(currentFourthRootPriceRatio, balancesScaled18, lastVirtualBalanceA, lastVirtualBalanceB) {
  const { poolCenteredness, isPoolAboveCenter } = computeCenteredness2(
    balancesScaled18,
    lastVirtualBalanceA,
    lastVirtualBalanceB
  );
  const {
    balanceTokenUndervalued,
    lastVirtualBalanceUndervalued,
    lastVirtualBalanceOvervalued
  } = isPoolAboveCenter ? {
    balanceTokenUndervalued: balancesScaled18[a2],
    lastVirtualBalanceUndervalued: lastVirtualBalanceA,
    lastVirtualBalanceOvervalued: lastVirtualBalanceB
  } : {
    balanceTokenUndervalued: balancesScaled18[b2],
    lastVirtualBalanceUndervalued: lastVirtualBalanceB,
    lastVirtualBalanceOvervalued: lastVirtualBalanceA
  };
  const sqrtPriceRatio = MathSol.mulDownFixed(
    currentFourthRootPriceRatio,
    currentFourthRootPriceRatio
  );
  const virtualBalanceUndervalued = balanceTokenUndervalued * (WAD + poolCenteredness + sqrt(
    poolCenteredness * (poolCenteredness + 4n * sqrtPriceRatio - 2000000000000000000n) + 1000000000000000000000000000000000000n
  )) / (2n * (sqrtPriceRatio - WAD));
  const virtualBalanceOvervalued = virtualBalanceUndervalued * lastVirtualBalanceOvervalued / lastVirtualBalanceUndervalued;
  const { virtualBalanceA, virtualBalanceB } = isPoolAboveCenter ? {
    virtualBalanceA: virtualBalanceUndervalued,
    virtualBalanceB: virtualBalanceOvervalued
  } : {
    virtualBalanceA: virtualBalanceOvervalued,
    virtualBalanceB: virtualBalanceUndervalued
  };
  return { virtualBalanceA, virtualBalanceB };
}
function computeVirtualBalancesUpdatingPriceRange2(balancesScaled18, virtualBalanceA, virtualBalanceB, isPoolAboveCenter, dailyPriceShiftBase, currentTimestamp, lastTimestamp) {
  const sqrtPriceRatio = sqrtScaled18(
    computePriceRatio2(balancesScaled18, virtualBalanceA, virtualBalanceB)
  );
  const [balancesScaledUndervalued, balancesScaledOvervalued] = isPoolAboveCenter ? [balancesScaled18[0], balancesScaled18[1]] : [balancesScaled18[1], balancesScaled18[0]];
  let [virtualBalanceUndervalued, virtualBalanceOvervalued] = isPoolAboveCenter ? [virtualBalanceA, virtualBalanceB] : [virtualBalanceB, virtualBalanceA];
  const duration = MathSol.min(
    currentTimestamp - lastTimestamp,
    thirtyDaysSeconds
  );
  virtualBalanceOvervalued = MathSol.mulDownFixed(
    virtualBalanceOvervalued,
    MathSol.powDownFixed(dailyPriceShiftBase, duration * WAD)
  );
  virtualBalanceOvervalued = MathSol.max(
    virtualBalanceOvervalued,
    MathSol.divDownFixed(
      balancesScaledOvervalued,
      sqrtScaled18(sqrtPriceRatio) - WAD
    )
  );
  virtualBalanceUndervalued = balancesScaledUndervalued * (virtualBalanceOvervalued + balancesScaledOvervalued) / (MathSol.mulDownFixed(sqrtPriceRatio - WAD, virtualBalanceOvervalued) - balancesScaledOvervalued);
  return isPoolAboveCenter ? [virtualBalanceUndervalued, virtualBalanceOvervalued] : [virtualBalanceOvervalued, virtualBalanceUndervalued];
}
function computePriceRatio2(balancesScaled18, virtualBalanceA, virtualBalanceB) {
  const { minPrice, maxPrice } = computePriceRange2(
    balancesScaled18,
    virtualBalanceA,
    virtualBalanceB
  );
  return MathSol.divUpFixed(maxPrice, minPrice);
}
function computePriceRange2(balancesScaled18, virtualBalanceA, virtualBalanceB) {
  const currentInvariant = computeInvariant2(
    balancesScaled18,
    virtualBalanceA,
    virtualBalanceB,
    1 /* ROUND_DOWN */
  );
  const minPrice = virtualBalanceB * virtualBalanceB / currentInvariant;
  const maxPrice = MathSol.divDownFixed(
    currentInvariant,
    MathSol.mulDownFixed(virtualBalanceA, virtualBalanceA)
  );
  return { minPrice, maxPrice };
}
function computeFourthRootPriceRatio2(currentTime, startFourthRootPriceRatio, endFourthRootPriceRatio, priceRatioUpdateStartTime, priceRatioUpdateEndTime) {
  if (currentTime >= priceRatioUpdateEndTime) {
    return endFourthRootPriceRatio;
  } else if (currentTime <= priceRatioUpdateStartTime) {
    return startFourthRootPriceRatio;
  }
  const exponent = MathSol.divDownFixed(
    currentTime - priceRatioUpdateStartTime,
    priceRatioUpdateEndTime - priceRatioUpdateStartTime
  );
  const currentFourthRootPriceRatio = MathSol.mulDownFixed(
    startFourthRootPriceRatio,
    MathSol.powDownFixed(
      MathSol.divDownFixed(
        endFourthRootPriceRatio,
        startFourthRootPriceRatio
      ),
      exponent
    )
  );
  const minimumFourthRootPriceRatio = MathSol.min(
    startFourthRootPriceRatio,
    endFourthRootPriceRatio
  );
  return MathSol.max(
    minimumFourthRootPriceRatio,
    currentFourthRootPriceRatio
  );
}
function computeCenteredness2(balancesScaled18, virtualBalanceA, virtualBalanceB) {
  if (balancesScaled18[a2] === 0n) {
    return { poolCenteredness: 0n, isPoolAboveCenter: false };
  } else if (balancesScaled18[b2] === 0n) {
    return { poolCenteredness: 0n, isPoolAboveCenter: true };
  }
  const numerator = balancesScaled18[a2] * virtualBalanceB;
  const denominator = virtualBalanceA * balancesScaled18[b2];
  let poolCenteredness;
  let isPoolAboveCenter;
  if (numerator <= denominator) {
    poolCenteredness = MathSol.divDownFixed(numerator, denominator);
    isPoolAboveCenter = false;
  } else {
    poolCenteredness = MathSol.divDownFixed(denominator, numerator);
    isPoolAboveCenter = true;
  }
  return { poolCenteredness, isPoolAboveCenter };
}
function computeInvariant2(balancesScaled18, virtualBalanceA, virtualBalanceB, rounding) {
  const _mulUpOrDown = rounding === 1 /* ROUND_DOWN */ ? MathSol.mulDownFixed : MathSol.mulUpFixed;
  return _mulUpOrDown(
    balancesScaled18[0] + virtualBalanceA,
    balancesScaled18[1] + virtualBalanceB
  );
}
function computeOutGivenIn2(balancesScaled18, virtualBalanceA, virtualBalanceB, tokenInIndex, tokenOutIndex, amountInScaled18) {
  const { virtualBalanceTokenIn, virtualBalanceTokenOut } = tokenInIndex === 0 ? {
    virtualBalanceTokenIn: virtualBalanceA,
    virtualBalanceTokenOut: virtualBalanceB
  } : {
    virtualBalanceTokenIn: virtualBalanceB,
    virtualBalanceTokenOut: virtualBalanceA
  };
  const amountOutScaled18 = (balancesScaled18[tokenOutIndex] + virtualBalanceTokenOut) * amountInScaled18 / (balancesScaled18[tokenInIndex] + virtualBalanceTokenIn + amountInScaled18);
  if (amountOutScaled18 > balancesScaled18[tokenOutIndex]) {
    throw new Error("reClammMath: AmountOutGreaterThanBalance");
  }
  return amountOutScaled18;
}
function computeInGivenOut2(balancesScaled18, virtualBalanceA, virtualBalanceB, tokenInIndex, tokenOutIndex, amountOutScaled18) {
  if (amountOutScaled18 > balancesScaled18[tokenOutIndex]) {
    throw new Error("reClammMath: AmountOutGreaterThanBalance");
  }
  const { virtualBalanceTokenIn, virtualBalanceTokenOut } = tokenInIndex === 0 ? {
    virtualBalanceTokenIn: virtualBalanceA,
    virtualBalanceTokenOut: virtualBalanceB
  } : {
    virtualBalanceTokenIn: virtualBalanceB,
    virtualBalanceTokenOut: virtualBalanceA
  };
  const amountInScaled18 = MathSol.mulDivUpFixed(
    balancesScaled18[tokenInIndex] + virtualBalanceTokenIn,
    amountOutScaled18,
    balancesScaled18[tokenOutIndex] + virtualBalanceTokenOut - amountOutScaled18
  );
  return amountInScaled18;
}
function sqrtScaled18(valueScaled18) {
  return sqrt(valueScaled18 * WAD);
}

// src/reClammV2/reClammV2Pool.ts
var ReClammV2 = class {
  constructor(reClammState) {
    __publicField(this, "reClammState");
    this.reClammState = reClammState;
  }
  getMaximumInvariantRatio() {
    return 0n;
  }
  getMinimumInvariantRatio() {
    return 0n;
  }
  /**
   * Returns the max amount that can be swapped in relation to the swapKind.
   * @param maxSwapParams
   * @returns GivenIn: Returns the max amount in. GivenOut: Returns the max amount out.
   */
  getMaxSwapAmount(maxSwapParams) {
    const { balancesLiveScaled18, indexIn, indexOut, swapKind } = maxSwapParams;
    if (swapKind === 0 /* GivenIn */) {
      const computeResult = this._computeCurrentVirtualBalances(balancesLiveScaled18);
      const maxAmountIn = computeInGivenOut2(
        balancesLiveScaled18,
        computeResult.currentVirtualBalanceA,
        computeResult.currentVirtualBalanceB,
        indexIn,
        indexOut,
        balancesLiveScaled18[indexOut]
      );
      const maxAmountInWithTolerance = maxAmountIn - 10n;
      return maxAmountInWithTolerance < 0n ? 0n : maxAmountInWithTolerance;
    }
    const maxAmountOutWithTolerance = balancesLiveScaled18[indexOut] - 10n;
    return maxAmountOutWithTolerance < 0n ? 0n : maxAmountOutWithTolerance;
  }
  getMaxSingleTokenAddAmount() {
    return 0n;
  }
  getMaxSingleTokenRemoveAmount() {
    return 0n;
  }
  onSwap(swapParams) {
    const {
      swapKind,
      balancesLiveScaled18,
      indexIn,
      indexOut,
      amountGivenScaled18
    } = swapParams;
    const { currentVirtualBalanceA, currentVirtualBalanceB } = this._computeCurrentVirtualBalances(balancesLiveScaled18);
    if (swapKind === 0 /* GivenIn */) {
      const amountCalculatedScaled182 = computeOutGivenIn2(
        balancesLiveScaled18,
        currentVirtualBalanceA,
        currentVirtualBalanceB,
        indexIn,
        indexOut,
        amountGivenScaled18
      );
      return amountCalculatedScaled182;
    }
    const amountCalculatedScaled18 = computeInGivenOut2(
      balancesLiveScaled18,
      currentVirtualBalanceA,
      currentVirtualBalanceB,
      indexIn,
      indexOut,
      amountGivenScaled18
    );
    return amountCalculatedScaled18;
  }
  computeInvariant() {
    return 0n;
  }
  computeBalance() {
    return 0n;
  }
  _computeCurrentVirtualBalances(balancesScaled18) {
    return computeCurrentVirtualBalances2(
      this.reClammState.currentTimestamp,
      balancesScaled18,
      this.reClammState.lastVirtualBalances[0],
      this.reClammState.lastVirtualBalances[1],
      this.reClammState.dailyPriceShiftBase,
      this.reClammState.lastTimestamp,
      this.reClammState.centerednessMargin,
      {
        priceRatioUpdateStartTime: this.reClammState.priceRatioUpdateStartTime,
        priceRatioUpdateEndTime: this.reClammState.priceRatioUpdateEndTime,
        startFourthRootPriceRatio: this.reClammState.startFourthRootPriceRatio,
        endFourthRootPriceRatio: this.reClammState.endFourthRootPriceRatio
      }
    );
  }
};

// src/quantAmm/quantAmmMath.ts
var calculateBlockNormalisedWeight = (weight, multiplier, timeSinceLastUpdate) => {
  const multiplierScaled18 = multiplier * BigInt("1000000000000000000");
  if (multiplier > 0n) {
    return weight + MathSol.mulDownFixed(multiplierScaled18, timeSinceLastUpdate);
  } else {
    return weight - MathSol.mulDownFixed(-multiplierScaled18, timeSinceLastUpdate);
  }
};
var getFirstFourWeightsAndMultipliers = (tokens, firstFourWeightsAndMultipliers) => {
  const lessThan4TokensOffset = tokens.length > 4 ? 4 : tokens.length;
  const weights = new Array(lessThan4TokensOffset).fill(0n);
  const multipliers = new Array(lessThan4TokensOffset).fill(0n);
  for (let i = 0; i < lessThan4TokensOffset; i++) {
    weights[i] = firstFourWeightsAndMultipliers[i];
    multipliers[i] = firstFourWeightsAndMultipliers[i + lessThan4TokensOffset];
  }
  return { weights, multipliers };
};
var getSecondFourWeightsAndMultipliers = (tokens, secondFourWeightsAndMultipliers) => {
  if (tokens.length <= 4) {
    return { weights: [], multipliers: [] };
  }
  const moreThan4TokensOffset = tokens.length - 4;
  const weights = new Array(moreThan4TokensOffset).fill(0n);
  const multipliers = new Array(moreThan4TokensOffset).fill(0n);
  for (let i = 0; i < moreThan4TokensOffset; i++) {
    weights[i] = secondFourWeightsAndMultipliers[i];
    multipliers[i] = secondFourWeightsAndMultipliers[i + moreThan4TokensOffset];
  }
  return { weights, multipliers };
};

// src/quantAmm/quantAmmPool.ts
var QuantAmm = class {
  constructor(quantAmmState) {
    this.quantAmmState = quantAmmState;
    __publicField(this, "weights");
    __publicField(this, "multipliers");
    const first = getFirstFourWeightsAndMultipliers(
      quantAmmState.tokens,
      quantAmmState.firstFourWeightsAndMultipliers
    );
    const second = getSecondFourWeightsAndMultipliers(
      quantAmmState.tokens,
      quantAmmState.secondFourWeightsAndMultipliers
    );
    this.weights = [...first.weights, ...second.weights];
    this.multipliers = [...first.multipliers, ...second.multipliers];
  }
  getMaximumInvariantRatio() {
    return _MAX_INVARIANT_RATIO2;
  }
  getMinimumInvariantRatio() {
    return _MIN_INVARIANT_RATIO2;
  }
  getMaxSwapAmount(maxSwapParams) {
    const {
      balancesLiveScaled18,
      indexIn,
      indexOut,
      tokenRates,
      scalingFactors,
      swapKind
    } = maxSwapParams;
    if (swapKind === 0 /* GivenIn */) {
      const max182 = MathSol.mulDownFixed(
        balancesLiveScaled18[indexIn],
        this.quantAmmState.maxTradeSizeRatio
      );
      return toRawUndoRateRoundDown(
        max182,
        scalingFactors[indexIn],
        tokenRates[indexIn]
      );
    }
    const max18 = MathSol.mulDownFixed(
      balancesLiveScaled18[indexOut],
      this.quantAmmState.maxTradeSizeRatio
    );
    return toRawUndoRateRoundDown(
      max18,
      scalingFactors[indexOut],
      tokenRates[indexOut]
    );
  }
  getMaxSingleTokenAddAmount() {
    return MAX_UINT2562;
  }
  getMaxSingleTokenRemoveAmount(maxRemoveParams) {
    const {
      isExactIn,
      totalSupply,
      tokenOutBalance,
      tokenOutScalingFactor,
      tokenOutRate
    } = maxRemoveParams;
    return this.getMaxSwapAmount({
      swapKind: isExactIn ? 0 /* GivenIn */ : 1 /* GivenOut */,
      balancesLiveScaled18: [totalSupply, tokenOutBalance],
      tokenRates: [1000000000000000000n, tokenOutRate],
      scalingFactors: [1000000000000000000n, tokenOutScalingFactor],
      indexIn: 0,
      indexOut: 1
    });
  }
  onSwap(swapParams) {
    const {
      swapKind,
      balancesLiveScaled18,
      indexIn,
      indexOut,
      amountGivenScaled18
    } = swapParams;
    let multiplierTime = this.quantAmmState.currentTimestamp;
    if (this.quantAmmState.currentTimestamp >= this.quantAmmState.lastInteropTime) {
      multiplierTime = this.quantAmmState.lastInteropTime;
    }
    const timeSinceLastUpdate = multiplierTime - this.quantAmmState.lastUpdateTime;
    const { tokenInWeight, tokenOutWeight } = this._getNormalizedWeightPair(
      indexIn,
      indexOut,
      timeSinceLastUpdate,
      this.weights,
      this.multipliers
    );
    if (swapKind === 0 /* GivenIn */) {
      if (amountGivenScaled18 > MathSol.mulDownFixed(
        balancesLiveScaled18[indexIn],
        this.quantAmmState.maxTradeSizeRatio
      )) {
        throw new Error("MaxTradeSizeRatio exceeded");
      }
      const amountOutScaled18 = _computeOutGivenExactIn2(
        balancesLiveScaled18[indexIn],
        tokenInWeight,
        balancesLiveScaled18[indexOut],
        tokenOutWeight,
        amountGivenScaled18
      );
      if (amountOutScaled18 > MathSol.mulDownFixed(
        balancesLiveScaled18[indexOut],
        this.quantAmmState.maxTradeSizeRatio
      )) {
        throw new Error("MaxTradeSizeRatio exceeded");
      }
      return amountOutScaled18;
    } else {
      if (amountGivenScaled18 > MathSol.mulDownFixed(
        balancesLiveScaled18[indexOut],
        this.quantAmmState.maxTradeSizeRatio
      )) {
        throw new Error("MaxTradeSizeRatio exceeded");
      }
      const amountInScaled18 = _computeInGivenExactOut2(
        balancesLiveScaled18[indexIn],
        tokenInWeight,
        balancesLiveScaled18[indexOut],
        tokenOutWeight,
        amountGivenScaled18
      );
      if (amountInScaled18 > MathSol.mulDownFixed(
        balancesLiveScaled18[indexIn],
        this.quantAmmState.maxTradeSizeRatio
      )) {
        throw new Error("MaxTradeSizeRatio exceeded");
      }
      return amountInScaled18;
    }
  }
  computeInvariant(balancesLiveScaled18, rounding) {
    let multiplierTime = this.quantAmmState.currentTimestamp;
    if (this.quantAmmState.currentTimestamp >= this.quantAmmState.lastInteropTime) {
      multiplierTime = this.quantAmmState.lastInteropTime;
    }
    const timeSinceLastUpdate = multiplierTime - this.quantAmmState.lastUpdateTime;
    const normalizedWeights = this._getNormalizedWeights(
      timeSinceLastUpdate,
      this.weights,
      this.multipliers
    );
    if (rounding === 0 /* ROUND_UP */) {
      return _computeInvariantUp(normalizedWeights, balancesLiveScaled18);
    }
    return _computeInvariantDown(normalizedWeights, balancesLiveScaled18);
  }
  computeBalance(balancesLiveScaled18, tokenInIndex, invariantRatio) {
    let multiplierTime = this.quantAmmState.currentTimestamp;
    if (this.quantAmmState.currentTimestamp >= this.quantAmmState.lastInteropTime) {
      multiplierTime = this.quantAmmState.lastInteropTime;
    }
    const timeSinceLastUpdate = multiplierTime - this.quantAmmState.lastUpdateTime;
    const normalizedWeights = this._getNormalizedWeights(
      timeSinceLastUpdate,
      this.weights,
      this.multipliers
    );
    return _computeBalanceOutGivenInvariant(
      balancesLiveScaled18[tokenInIndex],
      normalizedWeights[tokenInIndex],
      invariantRatio
    );
  }
  _getNormalizedWeightPair(indexIn, indexOut, timeSinceLastUpdate, weights, multipliers) {
    const tokenInWeight = calculateBlockNormalisedWeight(
      weights[indexIn],
      multipliers[indexIn],
      timeSinceLastUpdate
    );
    const tokenOutWeight = calculateBlockNormalisedWeight(
      weights[indexOut],
      multipliers[indexOut],
      timeSinceLastUpdate
    );
    return { tokenInWeight, tokenOutWeight };
  }
  _getNormalizedWeights(timeSinceLastUpdate, weights, multipliers) {
    const normalizedWeights = new Array(weights.length).fill(0n);
    for (let i = 0; i < weights.length; i++) {
      normalizedWeights[i] = calculateBlockNormalisedWeight(
        weights[i],
        multipliers[i],
        timeSinceLastUpdate
      );
    }
    return normalizedWeights;
  }
};

// src/liquidityBootstrapping/liquidityBootstrappingMath.ts
function getNormalizedWeights(projectTokenIndex, currentTime, startTime, endTime, projectTokenStartWeight, projectTokenEndWeight) {
  const normalizedWeights = [0n, 0n];
  const reserveTokenIndex = projectTokenIndex === 0 ? 1 : 0;
  normalizedWeights[projectTokenIndex] = getProjectTokenNormalizedWeight(
    currentTime,
    startTime,
    endTime,
    projectTokenStartWeight,
    projectTokenEndWeight
  );
  normalizedWeights[reserveTokenIndex] = WAD - normalizedWeights[projectTokenIndex];
  return normalizedWeights;
}
function getProjectTokenNormalizedWeight(currentTime, startTime, endTime, startWeight, endWeight) {
  const pctProgress = calculateValueChangeProgress(
    currentTime,
    startTime,
    endTime
  );
  return interpolateValue(startWeight, endWeight, pctProgress);
}
function calculateValueChangeProgress(currentTime, startTime, endTime) {
  if (currentTime >= endTime) {
    return WAD;
  } else if (currentTime <= startTime) {
    return 0n;
  }
  const totalSeconds = endTime - startTime;
  const secondsElapsed = currentTime - startTime;
  const progress = MathSol.divDownFixed(secondsElapsed, totalSeconds);
  return progress;
}
function interpolateValue(startValue, endValue, pctProgress) {
  if (pctProgress >= WAD || startValue === endValue) {
    return endValue;
  }
  if (pctProgress === 0n) {
    return startValue;
  }
  if (startValue > endValue) {
    const delta = MathSol.mulDownFixed(pctProgress, startValue - endValue);
    return startValue - delta;
  } else {
    const delta = MathSol.mulDownFixed(pctProgress, endValue - startValue);
    return startValue + delta;
  }
}

// src/liquidityBootstrapping/liquidityBootstrapping.ts
var LiquidityBootstrapping = class extends Weighted {
  constructor(poolState) {
    const projectTokenStartWeight = poolState.startWeights[poolState.projectTokenIndex];
    const projectTokenEndWeight = poolState.endWeights[poolState.projectTokenIndex];
    const currentTime = poolState.currentTimestamp;
    const weights = getNormalizedWeights(
      poolState.projectTokenIndex,
      currentTime,
      poolState.startTime,
      poolState.endTime,
      projectTokenStartWeight,
      projectTokenEndWeight
    );
    super({ weights });
    __publicField(this, "lbpState");
    this.lbpState = poolState;
  }
  onSwap(swapParams) {
    if (!this.lbpState.isSwapEnabled) {
      throw new Error("Swap is not enabled");
    }
    if (this.lbpState.isProjectTokenSwapInBlocked && swapParams.indexIn === this.lbpState.projectTokenIndex) {
      throw new Error("Project token swap in is blocked");
    }
    return super.onSwap(swapParams);
  }
};

// src/fixedPriceLBP/fixedPriceLBP.ts
var FixedPriceLBP = class {
  constructor(poolState) {
    __publicField(this, "projectTokenIndex");
    __publicField(this, "reserveTokenIndex");
    __publicField(this, "projectTokenRate");
    __publicField(this, "isSwapEnabled");
    this.projectTokenIndex = poolState.projectTokenIndex;
    this.reserveTokenIndex = poolState.reserveTokenIndex;
    this.projectTokenRate = poolState.projectTokenRate;
    this.isSwapEnabled = poolState.isSwapEnabled;
  }
  getMaximumInvariantRatio() {
    return MAX_UINT256;
  }
  getMinimumInvariantRatio() {
    return 0n;
  }
  getMaxSwapAmount(maxSwapParams) {
    const {
      balancesLiveScaled18,
      indexIn,
      indexOut,
      tokenRates,
      scalingFactors,
      swapKind
    } = maxSwapParams;
    if (swapKind === 0 /* GivenIn */) {
      const maxIn18 = MathSol.mulDownFixed(
        balancesLiveScaled18[indexOut],
        this.projectTokenRate
      );
      return toRawUndoRateRoundDown(
        maxIn18,
        scalingFactors[indexIn],
        tokenRates[indexIn]
      );
    }
    const maxOut18 = balancesLiveScaled18[indexOut];
    return toRawUndoRateRoundDown(
      maxOut18,
      scalingFactors[indexOut],
      tokenRates[indexOut]
    );
  }
  getMaxSingleTokenAddAmount() {
    throw new Error("UnsupportedOperation");
  }
  getMaxSingleTokenRemoveAmount() {
    throw new Error("UnsupportedOperation");
  }
  onSwap(swapParams) {
    if (!this.isSwapEnabled) {
      throw new Error("SwapsDisabled");
    }
    if (swapParams.indexIn === this.projectTokenIndex) {
      throw new Error("SwapOfProjectTokenIn");
    }
    if (swapParams.swapKind === 0 /* GivenIn */) {
      return MathSol.divDownFixed(
        swapParams.amountGivenScaled18,
        this.projectTokenRate
      );
    }
    return MathSol.mulUpFixed(
      swapParams.amountGivenScaled18,
      this.projectTokenRate
    );
  }
  computeInvariant(balancesLiveScaled18, rounding) {
    const projectTokenValue = rounding === 0 /* ROUND_UP */ ? MathSol.mulUpFixed(
      balancesLiveScaled18[this.projectTokenIndex],
      this.projectTokenRate
    ) : MathSol.mulDownFixed(
      balancesLiveScaled18[this.projectTokenIndex],
      this.projectTokenRate
    );
    return projectTokenValue + balancesLiveScaled18[this.reserveTokenIndex];
  }
  computeBalance() {
    throw new Error("UnsupportedOperation");
  }
};

// src/buffer/bufferMath.ts
function calculateBufferAmounts(direction, kind, amountRaw, rate, maxDeposit, maxMint) {
  if (direction === 0 /* WRAP */) {
    if (kind === 0 /* GivenIn */) {
      const maxAssets = maxDeposit ? maxDeposit : MAX_UINT2562;
      if (amountRaw > maxAssets) {
        throw new Error(
          `ERC4626ExceededMaxDeposit ${amountRaw} ${maxAssets}`
        );
      }
      return _convertToShares(amountRaw, rate, 1 /* DOWN */);
    } else {
      const maxShares = maxMint ? maxMint : MAX_UINT2562;
      if (amountRaw > maxShares) {
        throw new Error(
          `ERC4626ExceededMaxMint ${amountRaw} ${maxMint}`
        );
      }
      return _convertToAssets(amountRaw, rate, 0 /* UP */);
    }
  } else {
    if (kind === 0 /* GivenIn */) {
      return _convertToAssets(amountRaw, rate, 1 /* DOWN */);
    } else {
      return _convertToShares(amountRaw, rate, 0 /* UP */);
    }
  }
}
function _convertToShares(assets, rate, rounding) {
  if (rounding === 0 /* UP */) return MathSol.divUpFixed(assets, rate);
  return MathSol.divDownFixed(assets, rate);
}
function _convertToAssets(shares, rate, rounding) {
  if (rounding === 0 /* UP */) return MathSol.mulUpFixed(shares, rate);
  return MathSol.mulDownFixed(shares, rate);
}

// src/buffer/erc4626BufferWrapOrUnwrap.ts
var _MINIMUM_WRAP_AMOUNT = 1000n;
function erc4626BufferWrapOrUnwrap(input, poolState) {
  if (input.amountRaw < _MINIMUM_WRAP_AMOUNT) {
    throw new Error("wrapAmountTooSmall");
  }
  const wrappingDirection = isSameAddress(
    input.tokenIn,
    poolState.poolAddress
  ) ? 1 /* UNWRAP */ : 0 /* WRAP */;
  return calculateBufferAmounts(
    wrappingDirection,
    input.swapKind,
    input.amountRaw,
    poolState.rate,
    poolState.maxDeposit,
    poolState.maxMint
  );
}

// src/hooks/constants.ts
var defaultHook = {
  shouldCallComputeDynamicSwapFee: false,
  shouldCallBeforeSwap: false,
  shouldCallAfterSwap: false,
  shouldCallBeforeAddLiquidity: false,
  shouldCallAfterAddLiquidity: false,
  shouldCallBeforeRemoveLiquidity: false,
  shouldCallAfterRemoveLiquidity: false,
  enableHookAdjustedAmounts: false,
  onBeforeAddLiquidity: () => {
    return { success: false, hookAdjustedBalancesScaled18: [] };
  },
  onAfterAddLiquidity: () => {
    return { success: false, hookAdjustedAmountsInRaw: [] };
  },
  onBeforeRemoveLiquidity: () => {
    return { success: false, hookAdjustedBalancesScaled18: [] };
  },
  onAfterRemoveLiquidity: () => {
    return { success: false, hookAdjustedAmountsOutRaw: [] };
  },
  onBeforeSwap: () => {
    return { success: false, hookAdjustedBalancesScaled18: [] };
  },
  onAfterSwap: () => {
    return { success: false, hookAdjustedAmountCalculatedRaw: 0n };
  },
  onComputeDynamicSwapFee: () => {
    return { success: false, dynamicSwapFee: 0n };
  }
};

// src/hooks/exitFeeHook.ts
var ExitFeeHook = class {
  constructor() {
    __publicField(this, "shouldCallComputeDynamicSwapFee", false);
    __publicField(this, "shouldCallBeforeSwap", false);
    __publicField(this, "shouldCallAfterSwap", false);
    __publicField(this, "shouldCallBeforeAddLiquidity", false);
    __publicField(this, "shouldCallAfterAddLiquidity", false);
    __publicField(this, "shouldCallBeforeRemoveLiquidity", false);
    __publicField(this, "shouldCallAfterRemoveLiquidity", true);
    __publicField(this, "enableHookAdjustedAmounts", true);
  }
  onBeforeAddLiquidity() {
    return { success: false, hookAdjustedBalancesScaled18: [] };
  }
  onAfterAddLiquidity() {
    return { success: false, hookAdjustedAmountsInRaw: [] };
  }
  onBeforeRemoveLiquidity() {
    return { success: false, hookAdjustedBalancesScaled18: [] };
  }
  onAfterRemoveLiquidity(kind, bptAmountIn, amountsOutScaled18, amountsOutRaw, balancesScaled18, hookState) {
    if (!(typeof hookState === "object" && hookState !== null && "removeLiquidityHookFeePercentage" in hookState && "tokens" in hookState))
      throw new Error("Unexpected hookState");
    if (kind !== 0 /* PROPORTIONAL */) {
      throw new Error(`ExitFeeHook: Unsupported RemoveKind: ${kind}`);
    }
    const accruedFees = new Array(hookState.tokens.length).fill(0n);
    const hookAdjustedAmountsOutRaw = [...amountsOutRaw];
    if (hookState.removeLiquidityHookFeePercentage > 0) {
      for (let i = 0; i < amountsOutRaw.length; i++) {
        const hookFee = MathSol.mulDownFixed(
          amountsOutRaw[i],
          hookState.removeLiquidityHookFeePercentage
        );
        accruedFees[i] = hookFee;
        hookAdjustedAmountsOutRaw[i] -= hookFee;
      }
    }
    return {
      success: true,
      hookAdjustedAmountsOutRaw
    };
  }
  onBeforeSwap() {
    return { success: false, hookAdjustedBalancesScaled18: [] };
  }
  onAfterSwap() {
    return { success: false, hookAdjustedAmountCalculatedRaw: 0n };
  }
  onComputeDynamicSwapFee() {
    return { success: false, dynamicSwapFee: 0n };
  }
};

// src/hooks/directionalFeeHook.ts
var DirectionalFeeHook = class {
  constructor() {
    __publicField(this, "shouldCallComputeDynamicSwapFee", true);
    __publicField(this, "shouldCallBeforeSwap", false);
    __publicField(this, "shouldCallAfterSwap", false);
    __publicField(this, "shouldCallBeforeAddLiquidity", false);
    __publicField(this, "shouldCallAfterAddLiquidity", false);
    __publicField(this, "shouldCallBeforeRemoveLiquidity", false);
    __publicField(this, "shouldCallAfterRemoveLiquidity", false);
    __publicField(this, "enableHookAdjustedAmounts", false);
  }
  onComputeDynamicSwapFee(params, pool, staticSwapFeePercentage) {
    const calculatedSwapFeePercentage = this.calculateExpectedSwapFeePercentage(
      params.balancesLiveScaled18,
      params.amountGivenScaled18,
      params.indexIn,
      params.indexOut
    );
    const dynamicSwapFee = calculatedSwapFeePercentage > staticSwapFeePercentage ? calculatedSwapFeePercentage : staticSwapFeePercentage;
    return {
      success: true,
      dynamicSwapFee
    };
  }
  // the bigger the swap ( relative to pool size ) the bigger the fee
  calculateExpectedSwapFeePercentage(poolBalances, swapAmount, indexIn, indexOut) {
    const finalBalanceTokenIn = poolBalances[indexIn] + swapAmount;
    const finalBalanceTokenOut = poolBalances[indexOut] - swapAmount;
    if (finalBalanceTokenIn > finalBalanceTokenOut) {
      const diff = finalBalanceTokenIn - finalBalanceTokenOut;
      const totalLiquidity = finalBalanceTokenIn + finalBalanceTokenOut;
      return MathSol.divDownFixed(diff, totalLiquidity);
    }
    return 0n;
  }
  onBeforeAddLiquidity() {
    return { success: false, hookAdjustedBalancesScaled18: [] };
  }
  onAfterAddLiquidity() {
    return { success: false, hookAdjustedAmountsInRaw: [] };
  }
  onBeforeRemoveLiquidity() {
    return { success: false, hookAdjustedBalancesScaled18: [] };
  }
  onAfterRemoveLiquidity() {
    return { success: false, hookAdjustedAmountsOutRaw: [] };
  }
  onBeforeSwap() {
    return { success: false, hookAdjustedBalancesScaled18: [] };
  }
  onAfterSwap() {
    return { success: false, hookAdjustedAmountCalculatedRaw: 0n };
  }
};

// src/hooks/stableSurgeHook.ts
var StableSurgeHook = class {
  constructor() {
    __publicField(this, "shouldCallComputeDynamicSwapFee", true);
    __publicField(this, "shouldCallBeforeSwap", false);
    __publicField(this, "shouldCallAfterSwap", false);
    __publicField(this, "shouldCallBeforeAddLiquidity", false);
    __publicField(this, "shouldCallAfterAddLiquidity", true);
    __publicField(this, "shouldCallBeforeRemoveLiquidity", false);
    __publicField(this, "shouldCallAfterRemoveLiquidity", true);
    __publicField(this, "enableHookAdjustedAmounts", false);
  }
  onComputeDynamicSwapFee(params, pool, staticSwapFeePercentage, hookState) {
    const stablePool = new Stable(hookState);
    return {
      success: true,
      dynamicSwapFee: this.getSurgeFeePercentage(
        params,
        stablePool,
        hookState.surgeThresholdPercentage,
        hookState.maxSurgeFeePercentage,
        staticSwapFeePercentage
      )
    };
  }
  getSurgeFeePercentage(params, pool, surgeThresholdPercentage, maxSurgeFeePercentage, staticFeePercentage) {
    const amountCalculatedScaled18 = pool.onSwap(params);
    const newBalances = [...params.balancesLiveScaled18];
    if (params.swapKind === 0 /* GivenIn */) {
      newBalances[params.indexIn] += params.amountGivenScaled18;
      newBalances[params.indexOut] -= amountCalculatedScaled18;
    } else {
      newBalances[params.indexIn] += amountCalculatedScaled18;
      newBalances[params.indexOut] -= params.amountGivenScaled18;
    }
    const newTotalImbalance = this.calculateImbalance([...newBalances]);
    if (newTotalImbalance === 0n) {
      return staticFeePercentage;
    }
    const oldTotalImbalance = this.calculateImbalance([
      ...params.balancesLiveScaled18
    ]);
    if (newTotalImbalance <= oldTotalImbalance || newTotalImbalance <= surgeThresholdPercentage) {
      return staticFeePercentage;
    }
    const dynamicSwapFee = staticFeePercentage + MathSol.mulDownFixed(
      maxSurgeFeePercentage - staticFeePercentage,
      MathSol.divDownFixed(
        newTotalImbalance - surgeThresholdPercentage,
        MathSol.complementFixed(surgeThresholdPercentage)
      )
    );
    return dynamicSwapFee;
  }
  isSurging(thresholdPercentage, currentBalances, newTotalImbalance) {
    if (newTotalImbalance === 0n) {
      return false;
    }
    const oldTotalImbalance = this.calculateImbalance(currentBalances);
    return newTotalImbalance > oldTotalImbalance && newTotalImbalance > thresholdPercentage;
  }
  calculateImbalance(balances) {
    const median = this.findMedian(balances);
    let totalBalance = 0n;
    let totalDiff = 0n;
    for (let i = 0; i < balances.length; i++) {
      totalBalance += balances[i];
      totalDiff += this.absSub(balances[i], median);
    }
    return MathSol.divDownFixed(totalDiff, totalBalance);
  }
  findMedian(balances) {
    const sortedBalances = balances.sort((a3, b3) => {
      if (a3 < b3) return -1;
      if (a3 > b3) return 1;
      return 0;
    });
    const mid = Math.floor(sortedBalances.length / 2);
    if (sortedBalances.length % 2 == 0) {
      return (sortedBalances[mid - 1] + sortedBalances[mid]) / 2n;
    } else {
      return sortedBalances[mid];
    }
  }
  absSub(a3, b3) {
    return a3 > b3 ? a3 - b3 : b3 - a3;
  }
  onBeforeAddLiquidity() {
    return { success: false, hookAdjustedBalancesScaled18: [] };
  }
  onAfterAddLiquidity(kind, amountsInScaled18, amountsInRaw, bptAmountOut, balancesScaled18, hookState) {
    const oldBalancesScaled18 = new Array(balancesScaled18.length).fill(0n);
    for (let i = 0; i < balancesScaled18.length; ++i) {
      oldBalancesScaled18[i] = balancesScaled18[i] - amountsInScaled18[i];
    }
    const newTotalImbalance = this.calculateImbalance(balancesScaled18);
    const isSurging = this.isSurging(
      hookState.surgeThresholdPercentage,
      oldBalancesScaled18,
      newTotalImbalance
    );
    return {
      success: isSurging === false,
      hookAdjustedAmountsInRaw: amountsInRaw
    };
  }
  onBeforeRemoveLiquidity() {
    return { success: false, hookAdjustedBalancesScaled18: [] };
  }
  onAfterRemoveLiquidity(kind, bptAmountIn, amountsOutScaled18, amountsOutRaw, balancesScaled18, hookState) {
    if (kind == 0 /* PROPORTIONAL */) {
      return { success: true, hookAdjustedAmountsOutRaw: amountsOutRaw };
    }
    const oldBalancesScaled18 = new Array(balancesScaled18.length).fill(0n);
    for (let i = 0; i < balancesScaled18.length; ++i) {
      oldBalancesScaled18[i] = balancesScaled18[i] + amountsOutScaled18[i];
    }
    const newTotalImbalance = this.calculateImbalance(balancesScaled18);
    const isSurging = this.isSurging(
      hookState.surgeThresholdPercentage,
      oldBalancesScaled18,
      newTotalImbalance
    );
    return {
      success: isSurging === false,
      hookAdjustedAmountsOutRaw: amountsOutRaw
    };
  }
  onBeforeSwap() {
    return { success: false, hookAdjustedBalancesScaled18: [] };
  }
  onAfterSwap() {
    return { success: false, hookAdjustedAmountCalculatedRaw: 0n };
  }
};

// src/hooks/akron/akronWeightedMath.ts
var _MIN_WEIGHT2 = BigInt(1e16);
var _computeSwapFeePercentageGivenExactIn = (balanceIn, exponent, amountIn) => {
  const powerWithFees = MathSol.powUpFixed(
    MathSol.divUpFixed(
      balanceIn + amountIn,
      balanceIn + amountIn * BigInt(2)
    ),
    exponent
  );
  const powerWithoutFees = MathSol.powUpFixed(
    MathSol.divUpFixed(balanceIn, balanceIn + amountIn),
    exponent
  );
  return MathSol.mulDivUpFixed(
    exponent,
    MathSol.mulDivUpFixed(
      balanceIn + amountIn,
      powerWithFees - powerWithoutFees,
      powerWithFees
    ),
    amountIn
  );
};
var _computeSwapFeePercentageGivenExactOut = (balanceOut, exponent, amountOut) => {
  const powerWithFees = MathSol.powUpFixed(
    MathSol.divUpFixed(
      balanceOut - amountOut,
      balanceOut - amountOut * BigInt(2)
    ),
    exponent
  );
  const powerWithoutFees = MathSol.powUpFixed(
    MathSol.divUpFixed(balanceOut, balanceOut - amountOut),
    exponent
  );
  return MathSol.divUpFixed(
    powerWithFees - powerWithoutFees,
    powerWithFees - WAD
  );
};

// src/hooks/akron/akronHook.ts
var AkronHook = class {
  constructor() {
    __publicField(this, "shouldCallComputeDynamicSwapFee", true);
    __publicField(this, "shouldCallBeforeSwap", false);
    __publicField(this, "shouldCallAfterSwap", false);
    __publicField(this, "shouldCallBeforeAddLiquidity", false);
    __publicField(this, "shouldCallAfterAddLiquidity", false);
    __publicField(this, "shouldCallBeforeRemoveLiquidity", false);
    __publicField(this, "shouldCallAfterRemoveLiquidity", false);
    __publicField(this, "enableHookAdjustedAmounts", false);
  }
  onComputeDynamicSwapFee(params, pool, staticSwapFeePercentage, hookState) {
    const calculatedSwapFeePercentage = params.swapKind === 0 /* GivenIn */ ? _computeSwapFeePercentageGivenExactIn(
      params.balancesLiveScaled18[params.indexIn],
      MathSol.divDownFixed(
        hookState.weights[params.indexIn],
        hookState.weights[params.indexOut]
      ),
      params.amountGivenScaled18
    ) : _computeSwapFeePercentageGivenExactOut(
      params.balancesLiveScaled18[params.indexOut],
      MathSol.divUpFixed(
        hookState.weights[params.indexOut],
        hookState.weights[params.indexIn]
      ),
      params.amountGivenScaled18
    );
    const dynamicSwapFee = hookState.minimumSwapFeePercentage > calculatedSwapFeePercentage ? hookState.minimumSwapFeePercentage : calculatedSwapFeePercentage;
    return {
      success: true,
      dynamicSwapFee
    };
  }
  onBeforeAddLiquidity() {
    return { success: false, hookAdjustedBalancesScaled18: [] };
  }
  onAfterAddLiquidity() {
    return { success: false, hookAdjustedAmountsInRaw: [] };
  }
  onBeforeRemoveLiquidity() {
    return { success: false, hookAdjustedBalancesScaled18: [] };
  }
  onAfterRemoveLiquidity() {
    return { success: false, hookAdjustedAmountsOutRaw: [] };
  }
  onBeforeSwap() {
    return { success: false, hookAdjustedBalancesScaled18: [] };
  }
  onAfterSwap() {
    return { success: false, hookAdjustedAmountCalculatedRaw: 0n };
  }
};

// src/vault/vault.ts
var _MINIMUM_TRADE_AMOUNT = 1e6;
var Vault = class {
  constructor(config) {
    __publicField(this, "poolClasses", {});
    __publicField(this, "hookClasses", {});
    const { customPoolClasses, customHookClasses: hookClasses } = config || {};
    this.poolClasses = {
      WEIGHTED: Weighted,
      STABLE: Stable,
      GYROE: GyroECLP,
      RECLAMM: ReClamm,
      RECLAMM_V2: ReClammV2,
      LIQUIDITY_BOOTSTRAPPING: LiquidityBootstrapping,
      QUANT_AMM_WEIGHTED: QuantAmm,
      FIXED_PRICE_LBP: FixedPriceLBP,
      // custom add liquidity types take precedence over base types
      ...customPoolClasses
    };
    this.hookClasses = {
      ExitFee: ExitFeeHook,
      DirectionalFee: DirectionalFeeHook,
      StableSurge: StableSurgeHook,
      Akron: AkronHook,
      // custom hooks take precedence over base types
      ...hookClasses
    };
  }
  getPool(poolState) {
    const poolClass = this.poolClasses[poolState.poolType];
    if (!poolClass)
      throw new Error(`Unsupported Pool Type: ${poolState.poolType}`);
    return new poolClass(poolState);
  }
  getHook(hookName, hookState) {
    if (!hookName) return defaultHook;
    const hookClass = this.hookClasses[hookName];
    if (!hookClass) throw new Error(`Unsupported Hook Type: ${hookName}`);
    if (!hookState) throw new Error(`No state for Hook: ${hookName}`);
    const hook = new hookClass(hookState);
    return hook;
  }
  /**
   * Returns the max amount that can be swapped (in relation to the amount specified by user).
   * @param maxSwapParams
   * @returns Returned amount/scaling is respective to the tokenOut because that’s what we’re taking out of the pool and what limits the swap size.
   */
  getMaxSwapAmount(swapParams, poolState) {
    const pool = this.getPool(poolState);
    return pool.getMaxSwapAmount(swapParams);
  }
  /**
   * Returns the max amount of a single token that can be added to a pool.
   * @param poolState
   * @returns
   */
  getMaxSingleTokenAddAmount(poolState) {
    const pool = this.getPool(poolState);
    return pool.getMaxSingleTokenAddAmount();
  }
  /**
   * Returns the max amount of a single token that can be removed from a pool.
   * @param maxRemoveParams
   * @param poolState
   * @returns
   */
  getMaxSingleTokenRemoveAmount(maxRemoveParams, poolState) {
    const pool = this.getPool(poolState);
    return pool.getMaxSingleTokenRemoveAmount(maxRemoveParams);
  }
  /**
   * Calculates the result of a swap.
   *
   * @param swapInput - User defined input for a swap operation, including:
   *   - `amountRaw`: Raw amount for swap (e.g. 1USDC=1000000).
   *   - `tokenIn`: Address of token in.
   *   - `tokenOut`: Address of token out.
   *   - `swapKind`: GivenIn or GivenOut.
   * @param poolState - Pool state that will be used for calculations.
   *   - Note: rates, fees, totalSupply use scaled 18. For detailed information, refer to the `PoolState | BufferState` types.
   * @param hookState - Optional state for any associated hook. Required if pool has a hook enabled.
   *   - Note: Each hook will require its own state data. See `HookState` type for officially supported hook info.
   * @returns The raw result of the swap operation.
   */
  swap(swapInput, poolState, hookState) {
    if (swapInput.amountRaw === 0n) return 0n;
    if (!("totalSupply" in poolState)) {
      return erc4626BufferWrapOrUnwrap(swapInput, poolState);
    }
    const pool = this.getPool(poolState);
    const hook = this.getHook(poolState.hookType, hookState);
    const inputIndex = poolState.tokens.findIndex(
      (t) => isSameAddress(swapInput.tokenIn, t)
    );
    if (inputIndex === -1) throw Error("Input token not found on pool");
    const outputIndex = poolState.tokens.findIndex(
      (t) => isSameAddress(swapInput.tokenOut, t)
    );
    if (outputIndex === -1) throw Error("Output token not found on pool");
    const amountGivenScaled18 = this._computeAmountGivenScaled18(
      swapInput.amountRaw,
      swapInput.swapKind,
      inputIndex,
      outputIndex,
      poolState.scalingFactors,
      poolState.tokenRates
    );
    const updatedBalancesLiveScaled18 = [...poolState.balancesLiveScaled18];
    const swapParams = {
      swapKind: swapInput.swapKind,
      amountGivenScaled18,
      balancesLiveScaled18: updatedBalancesLiveScaled18,
      indexIn: inputIndex,
      indexOut: outputIndex
    };
    if (hook.shouldCallBeforeSwap) {
      const { success, hookAdjustedBalancesScaled18 } = hook.onBeforeSwap(
        {
          ...swapParams,
          hookState
        }
      );
      if (!success) throw new Error("BeforeSwapHookFailed");
      hookAdjustedBalancesScaled18.forEach(
        (a3, i) => updatedBalancesLiveScaled18[i] = a3
      );
    }
    let swapFee = poolState.swapFee;
    if (hook.shouldCallComputeDynamicSwapFee) {
      const { success, dynamicSwapFee } = hook.onComputeDynamicSwapFee(
        swapParams,
        poolState.poolAddress,
        poolState.swapFee,
        hookState
      );
      if (success) swapFee = dynamicSwapFee;
    }
    let totalSwapFeeAmountScaled18 = 0n;
    if (swapParams.swapKind === 0 /* GivenIn */) {
      totalSwapFeeAmountScaled18 = MathSol.mulUpFixed(
        swapParams.amountGivenScaled18,
        swapFee
      );
      swapParams.amountGivenScaled18 -= totalSwapFeeAmountScaled18;
    }
    this._ensureValidSwapAmount(swapParams.amountGivenScaled18);
    let amountCalculatedScaled18 = pool.onSwap(swapParams);
    this._ensureValidSwapAmount(amountCalculatedScaled18);
    let amountCalculatedRaw = 0n;
    if (swapInput.swapKind === 0 /* GivenIn */) {
      amountCalculatedRaw = toRawUndoRateRoundDown(
        amountCalculatedScaled18,
        poolState.scalingFactors[outputIndex],
        // If the swap is ExactIn, the amountCalculated is the amount of tokenOut. So, we want to use the rate
        // rounded up to calculate the amountCalculatedRaw, because scale down (undo rate) is a division, the
        // larger the rate, the smaller the amountCalculatedRaw. So, any rounding imprecision will stay in the
        // Vault and not be drained by the user.
        this._computeRateRoundUp(poolState.tokenRates[outputIndex])
      );
    } else {
      totalSwapFeeAmountScaled18 = MathSol.mulDivUpFixed(
        amountCalculatedScaled18,
        swapFee,
        MathSol.complementFixed(swapFee)
      );
      amountCalculatedScaled18 += totalSwapFeeAmountScaled18;
      amountCalculatedRaw = toRawUndoRateRoundUp(
        amountCalculatedScaled18,
        poolState.scalingFactors[inputIndex],
        poolState.tokenRates[inputIndex]
      );
    }
    const aggregateSwapFeeAmountScaled18 = this._computeAndChargeAggregateSwapFees(
      totalSwapFeeAmountScaled18,
      poolState.aggregateSwapFee,
      poolState.scalingFactors,
      poolState.tokenRates,
      inputIndex
    );
    const locals = {
      balanceInIncrement: 0n,
      balanceOutDecrement: 0n
    };
    [locals.balanceInIncrement, locals.balanceOutDecrement] = swapInput.swapKind === 0 /* GivenIn */ ? [
      amountGivenScaled18 - aggregateSwapFeeAmountScaled18,
      amountCalculatedScaled18
    ] : [
      amountCalculatedScaled18 - aggregateSwapFeeAmountScaled18,
      amountGivenScaled18
    ];
    updatedBalancesLiveScaled18[inputIndex] += locals.balanceInIncrement;
    updatedBalancesLiveScaled18[outputIndex] -= locals.balanceOutDecrement;
    if (hook.shouldCallAfterSwap) {
      const { success, hookAdjustedAmountCalculatedRaw } = hook.onAfterSwap({
        kind: swapInput.swapKind,
        tokenIn: swapInput.tokenIn,
        tokenOut: swapInput.tokenOut,
        amountInScaled18: swapInput.swapKind === 0 /* GivenIn */ ? amountGivenScaled18 : amountCalculatedScaled18,
        amountOutScaled18: swapInput.swapKind === 0 /* GivenIn */ ? amountCalculatedScaled18 : amountGivenScaled18,
        tokenInBalanceScaled18: updatedBalancesLiveScaled18[inputIndex],
        tokenOutBalanceScaled18: updatedBalancesLiveScaled18[outputIndex],
        amountCalculatedScaled18,
        amountCalculatedRaw,
        hookState
      });
      if (success === false) {
        throw new Error(
          `AfterAddSwapHookFailed ${poolState.poolType} ${poolState.hookType}`
        );
      }
      if (hook.enableHookAdjustedAmounts)
        amountCalculatedRaw = hookAdjustedAmountCalculatedRaw;
    }
    return amountCalculatedRaw;
  }
  /**
   * Calculates the amount of BPT for a given add liquidity operation.
   *
   * @param addLiquidityInput - User defined input for an addLiquidity operation.
   *   - For detailed information refer to the `AddLiquidityInput` type.
   * @param poolState - Pool state that will be used for calculations.
   *   - Note: rates, fees, totalSupply use scaled 18. For detailed information, refer to the `PoolState` type.
   * @param hookState - Optional state for any associated hook. Required if pool has a hook enabled.
   *   - Note: Each hook will require its own state data. See `HookState` type for officially supported hook info.
   * @returns {Object} An object containing the raw input amounts and the calculated raw BPT output amount.
   * @returns {bigint[]} returns.amountsInRaw - An array of raw input amounts in.
   * @returns {bigint} returns.bptAmountOutRaw - The calculated raw BPT output amount.
   */
  addLiquidity(addLiquidityInput, poolState, hookState) {
    if (poolState.poolType === "Buffer")
      throw Error("Buffer pools do not support addLiquidity");
    const pool = this.getPool(poolState);
    const hook = this.getHook(poolState.hookType, hookState);
    const maxAmountsInScaled18 = this._copyToScaled18ApplyRateRoundDownArray(
      addLiquidityInput.maxAmountsInRaw,
      poolState.scalingFactors,
      poolState.tokenRates
    );
    const updatedBalancesLiveScaled18 = [...poolState.balancesLiveScaled18];
    if (hook.shouldCallBeforeAddLiquidity) {
      const { success, hookAdjustedBalancesScaled18 } = hook.onBeforeAddLiquidity(
        addLiquidityInput.kind,
        addLiquidityInput.maxAmountsInRaw,
        addLiquidityInput.minBptAmountOutRaw,
        updatedBalancesLiveScaled18,
        hookState
      );
      if (!success) throw new Error("BeforeAddLiquidityHookFailed");
      hookAdjustedBalancesScaled18.forEach(
        (a3, i) => updatedBalancesLiveScaled18[i] = a3
      );
    }
    let amountsInScaled18;
    let bptAmountOut;
    let swapFeeAmountsScaled18;
    if (addLiquidityInput.kind === 0 /* UNBALANCED */) {
      this._requireUnbalancedLiquidityEnabled(poolState);
      amountsInScaled18 = maxAmountsInScaled18;
      const computed = computeAddLiquidityUnbalanced(
        updatedBalancesLiveScaled18,
        maxAmountsInScaled18,
        poolState.totalSupply,
        poolState.swapFee,
        pool.getMaximumInvariantRatio(),
        (balancesLiveScaled18, rounding) => pool.computeInvariant(balancesLiveScaled18, rounding)
      );
      bptAmountOut = computed.bptAmountOut;
      swapFeeAmountsScaled18 = computed.swapFeeAmounts;
    } else if (addLiquidityInput.kind === 1 /* SINGLE_TOKEN_EXACT_OUT */) {
      this._requireUnbalancedLiquidityEnabled(poolState);
      const tokenIndex = this._getSingleInputIndex(maxAmountsInScaled18);
      amountsInScaled18 = maxAmountsInScaled18;
      bptAmountOut = addLiquidityInput.minBptAmountOutRaw;
      const computed = computeAddLiquiditySingleTokenExactOut(
        updatedBalancesLiveScaled18,
        tokenIndex,
        bptAmountOut,
        poolState.totalSupply,
        poolState.swapFee,
        pool.getMaximumInvariantRatio(),
        (balancesLiveScaled18, tokenIndex2, invariantRatio) => pool.computeBalance(
          balancesLiveScaled18,
          tokenIndex2,
          invariantRatio
        )
      );
      amountsInScaled18[tokenIndex] = computed.amountInWithFee;
      swapFeeAmountsScaled18 = computed.swapFeeAmounts;
    } else throw new Error("Unsupported AddLiquidity Kind");
    const amountsInRaw = new Array(poolState.tokens.length);
    for (let i = 0; i < poolState.tokens.length; i++) {
      amountsInRaw[i] = toRawUndoRateRoundUp(
        amountsInScaled18[i],
        poolState.scalingFactors[i],
        poolState.tokenRates[i]
      );
      const aggregateSwapFeeAmountRaw = this._computeAndChargeAggregateSwapFees(
        swapFeeAmountsScaled18[i],
        poolState.aggregateSwapFee,
        poolState.scalingFactors,
        poolState.tokenRates,
        i
      );
      const aggregateSwapFeeAmountScaled18 = toScaled18ApplyRateRoundDown(
        aggregateSwapFeeAmountRaw,
        poolState.scalingFactors[i],
        poolState.tokenRates[i]
      );
      updatedBalancesLiveScaled18[i] = updatedBalancesLiveScaled18[i] + amountsInScaled18[i] - aggregateSwapFeeAmountScaled18;
    }
    if (hook.shouldCallAfterAddLiquidity) {
      const { success, hookAdjustedAmountsInRaw } = hook.onAfterAddLiquidity(
        addLiquidityInput.kind,
        amountsInScaled18,
        amountsInRaw,
        bptAmountOut,
        updatedBalancesLiveScaled18,
        hookState
      );
      if (success === false || hookAdjustedAmountsInRaw.length != amountsInRaw.length) {
        throw new Error(
          `AfterAddLiquidityHookFailed ${poolState.poolType} ${poolState.hookType}`
        );
      }
      if (hook.enableHookAdjustedAmounts)
        hookAdjustedAmountsInRaw.forEach(
          (a3, i) => amountsInRaw[i] = a3
        );
    }
    return {
      amountsInRaw,
      bptAmountOutRaw: bptAmountOut
    };
  }
  /**
   * Calculates the token amounts out for a given remove liquidity operation.
   *
   * @param removeLiquidityInput - User defined input for a removeLiquidity operation.
   *   - For detailed information refer to the `RemoveLiquidityInput` type.
   *   - Note: `minAmountsOutRaw` must always contain an amount for all tokens, e.g. for single token remove other tokens must have 0n.
   * @param poolState - Pool state that will be used for calculations.
   *   - Note: rates, fees, totalSupply use scaled 18. For detailed information, refer to the `PoolState` type.
   * @param hookState - Optional state for any associated hook. Required if pool has a hook enabled.
   *   - Note: Each hook will require its own state data. See `HookState` type for officially supported hook info.
   * @returns {Object} An object containing the calculated raw output amounts and the BPT input amount.
   * @returns {bigint[]} returns.amountsOutRaw - An array of calculated raw output amounts.
   * @returns {bigint} returns.bptAmountInRaw - The raw BPT input amount.
   */
  removeLiquidity(removeLiquidityInput, poolState, hookState) {
    if (poolState.poolType === "Buffer")
      throw Error("Buffer pools do not support removeLiquidity");
    const pool = this.getPool(poolState);
    const hook = this.getHook(poolState.hookType, hookState);
    const minAmountsOutScaled18 = this._copyToScaled18ApplyRateRoundUpArray(
      removeLiquidityInput.minAmountsOutRaw,
      poolState.scalingFactors,
      poolState.tokenRates
    );
    const updatedBalancesLiveScaled18 = [...poolState.balancesLiveScaled18];
    if (hook.shouldCallBeforeRemoveLiquidity) {
      const { success, hookAdjustedBalancesScaled18 } = hook.onBeforeRemoveLiquidity(
        removeLiquidityInput.kind,
        removeLiquidityInput.maxBptAmountInRaw,
        removeLiquidityInput.minAmountsOutRaw,
        updatedBalancesLiveScaled18,
        hookState
      );
      if (!success) throw new Error("BeforeRemoveLiquidityHookFailed");
      hookAdjustedBalancesScaled18.forEach(
        (a3, i) => updatedBalancesLiveScaled18[i] = a3
      );
    }
    let tokenOutIndex;
    let bptAmountIn;
    let amountsOutScaled18;
    let swapFeeAmountsScaled18;
    if (removeLiquidityInput.kind === 0 /* PROPORTIONAL */) {
      bptAmountIn = removeLiquidityInput.maxBptAmountInRaw;
      swapFeeAmountsScaled18 = new Array(poolState.tokens.length).fill(
        0n
      );
      amountsOutScaled18 = computeProportionalAmountsOut(
        updatedBalancesLiveScaled18,
        poolState.totalSupply,
        removeLiquidityInput.maxBptAmountInRaw
      );
    } else if (removeLiquidityInput.kind === 1 /* SINGLE_TOKEN_EXACT_IN */) {
      this._requireUnbalancedLiquidityEnabled(poolState);
      bptAmountIn = removeLiquidityInput.maxBptAmountInRaw;
      amountsOutScaled18 = minAmountsOutScaled18;
      tokenOutIndex = this._getSingleInputIndex(
        removeLiquidityInput.minAmountsOutRaw
      );
      const computed = computeRemoveLiquiditySingleTokenExactIn(
        updatedBalancesLiveScaled18,
        tokenOutIndex,
        removeLiquidityInput.maxBptAmountInRaw,
        poolState.totalSupply,
        poolState.swapFee,
        pool.getMinimumInvariantRatio(),
        (balancesLiveScaled18, tokenIndex, invariantRatio) => pool.computeBalance(
          balancesLiveScaled18,
          tokenIndex,
          invariantRatio
        )
      );
      amountsOutScaled18[tokenOutIndex] = computed.amountOutWithFee;
      swapFeeAmountsScaled18 = computed.swapFeeAmounts;
    } else if (removeLiquidityInput.kind === 2 /* SINGLE_TOKEN_EXACT_OUT */) {
      this._requireUnbalancedLiquidityEnabled(poolState);
      amountsOutScaled18 = minAmountsOutScaled18;
      tokenOutIndex = this._getSingleInputIndex(
        removeLiquidityInput.minAmountsOutRaw
      );
      const computed = computeRemoveLiquiditySingleTokenExactOut(
        updatedBalancesLiveScaled18,
        tokenOutIndex,
        amountsOutScaled18[tokenOutIndex],
        poolState.totalSupply,
        poolState.swapFee,
        pool.getMinimumInvariantRatio(),
        (balancesLiveScaled18, rounding) => pool.computeInvariant(balancesLiveScaled18, rounding)
      );
      bptAmountIn = computed.bptAmountIn;
      swapFeeAmountsScaled18 = computed.swapFeeAmounts;
    } else throw new Error("Unsupported RemoveLiquidity Kind");
    const amountsOutRaw = new Array(poolState.tokens.length);
    for (let i = 0; i < poolState.tokens.length; ++i) {
      amountsOutRaw[i] = toRawUndoRateRoundDown(
        amountsOutScaled18[i],
        poolState.scalingFactors[i],
        poolState.tokenRates[i]
      );
      const aggregateSwapFeeAmountScaled18 = this._computeAndChargeAggregateSwapFees(
        swapFeeAmountsScaled18[i],
        poolState.aggregateSwapFee,
        poolState.scalingFactors,
        poolState.tokenRates,
        i
      );
      updatedBalancesLiveScaled18[i] = updatedBalancesLiveScaled18[i] - (amountsOutScaled18[i] + aggregateSwapFeeAmountScaled18);
    }
    if (hook.shouldCallAfterRemoveLiquidity) {
      const { success, hookAdjustedAmountsOutRaw } = hook.onAfterRemoveLiquidity(
        removeLiquidityInput.kind,
        bptAmountIn,
        amountsOutScaled18,
        amountsOutRaw,
        updatedBalancesLiveScaled18,
        hookState
      );
      if (success === false || hookAdjustedAmountsOutRaw.length != amountsOutRaw.length) {
        throw new Error(
          `AfterRemoveLiquidityHookFailed ${poolState.poolType} ${poolState.hookType}`
        );
      }
      if (hook.enableHookAdjustedAmounts)
        hookAdjustedAmountsOutRaw.forEach(
          (a3, i) => amountsOutRaw[i] = a3
        );
    }
    return {
      amountsOutRaw,
      bptAmountInRaw: bptAmountIn
    };
  }
  _computeAndChargeAggregateSwapFees(swapFeeAmountScaled18, aggregateSwapFeePercentage, decimalScalingFactors, tokenRates, index) {
    if (swapFeeAmountScaled18 > 0 && aggregateSwapFeePercentage > 0) {
      const totalSwapFeeAmountRaw = toRawUndoRateRoundDown(
        swapFeeAmountScaled18,
        decimalScalingFactors[index],
        tokenRates[index]
      );
      return MathSol.mulDownFixed(
        totalSwapFeeAmountRaw,
        aggregateSwapFeePercentage
      );
    }
    return 0n;
  }
  _getSingleInputIndex(maxAmountsIn) {
    const length = maxAmountsIn.length;
    let inputIndex = length;
    for (let i = 0; i < length; ++i) {
      if (maxAmountsIn[i] !== 0n) {
        if (inputIndex !== length) {
          throw new Error(
            "Multiple non-zero inputs for single token add"
          );
        }
        inputIndex = i;
      }
    }
    if (inputIndex >= length) {
      throw new Error("All zero inputs for single token add");
    }
    return inputIndex;
  }
  /**
   * @dev Same as `toScaled18ApplyRateRoundDown`, but returns a new array, leaving the original intact.
   */
  _copyToScaled18ApplyRateRoundDownArray(amounts, scalingFactors, tokenRates) {
    return amounts.map(
      (a3, i) => toScaled18ApplyRateRoundDown(a3, scalingFactors[i], tokenRates[i])
    );
  }
  /**
   * @dev Same as `toScaled18ApplyRateRoundDown`, but returns a new array, leaving the original intact.
   */
  _copyToScaled18ApplyRateRoundUpArray(amounts, scalingFactors, tokenRates) {
    return amounts.map(
      (a3, i) => toScaled18ApplyRateRoundUp(a3, scalingFactors[i], tokenRates[i])
    );
  }
  _computeAmountGivenScaled18(amountGivenRaw, swapKind, indexIn, indexOut, scalingFactors, tokenRates) {
    const amountGivenScaled18 = swapKind === 0 /* GivenIn */ ? toScaled18ApplyRateRoundDown(
      amountGivenRaw,
      scalingFactors[indexIn],
      tokenRates[indexIn]
    ) : toScaled18ApplyRateRoundUp(
      amountGivenRaw,
      scalingFactors[indexOut],
      this._computeRateRoundUp(tokenRates[indexOut])
    );
    return amountGivenScaled18;
  }
  /**
   * @notice Rounds up a rate informed by a rate provider.
   * @dev Rates calculated by an external rate provider have rounding errors. Intuitively, a rate provider
   * rounds the rate down so the pool math is executed with conservative amounts. However, when upscaling or
   * downscaling the amount out, the rate should be rounded up to make sure the amounts scaled are conservative.
   */
  _computeRateRoundUp(rate) {
    const roundedRate = rate / WAD * WAD;
    return roundedRate == rate ? rate : rate + 1n;
  }
  // Minimum token value in or out (applied to scaled18 values), enforced as a security measure to block potential
  // exploitation of rounding errors. This is called in the swap context, so zero is not a valid amount.
  _ensureValidSwapAmount(tradeAmount) {
    if (tradeAmount < _MINIMUM_TRADE_AMOUNT) {
      throw new Error(`TradeAmountTooSmall ${tradeAmount}`);
    }
    return true;
  }
  _requireUnbalancedLiquidityEnabled(poolState) {
    if (!poolState.supportsUnbalancedLiquidity) {
      throw new Error("DoesNotSupportUnbalancedLiquidity");
    }
  }
};
export {
  AddKind,
  FixedPriceLBP,
  Gyro2CLP,
  GyroECLP,
  GyroECLPMath,
  LiquidityBootstrapping,
  QuantAmm,
  ReClamm,
  ReClammV2,
  RemoveKind,
  Rounding,
  Stable,
  SwapKind,
  Vault,
  Weighted,
  _MAX_INVARIANT_RATIO2 as _MAX_INVARIANT_RATIO,
  _MAX_IN_RATIO,
  _MAX_OUT_RATIO,
  _MIN_INVARIANT_RATIO2 as _MIN_INVARIANT_RATIO,
  _MIN_WEIGHT,
  _computeBalanceOutGivenInvariant,
  _computeInGivenExactOut2 as _computeInGivenExactOut,
  _computeInvariantDown,
  _computeInvariantUp,
  _computeOutGivenExactIn2 as _computeOutGivenExactIn,
  calcInGivenOut,
  calcOutGivenIn,
  calculateBlockNormalisedWeight,
  calculateInvariant,
  calculateVirtualParameter0,
  calculateVirtualParameter1,
  erc4626BufferWrapOrUnwrap,
  getFirstFourWeightsAndMultipliers,
  getSecondFourWeightsAndMultipliers
};
//# sourceMappingURL=index.mjs.map