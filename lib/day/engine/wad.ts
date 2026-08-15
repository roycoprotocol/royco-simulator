// Contract-scale numeric primitives. All accounting values use 18-decimal WAD.

export const WAD = 10n ** 18n;
export const UINT256_MAX = 2n ** 256n - 1n;

export enum Rounding {
  Floor,
  Ceil,
}

export function mulDiv(
  a: bigint,
  b: bigint,
  denominator: bigint,
  rounding: Rounding = Rounding.Floor,
): bigint {
  if (denominator === 0n) throw new Error('mulDiv: division by zero');
  const product = a * b;
  const quotient = product / denominator;
  return rounding === Rounding.Ceil && product % denominator !== 0n
    ? quotient + 1n
    : quotient;
}

const expandScientific = (value: string): string => {
  if (!/[eE]/.test(value)) return value;
  const [coefficient, exponentText] = value.toLowerCase().split('e');
  const exponent = Number(exponentText);
  const negative = coefficient.startsWith('-');
  const unsigned = negative ? coefficient.slice(1) : coefficient;
  const [whole, fraction = ''] = unsigned.split('.');
  const digits = whole + fraction;
  const decimalAt = whole.length + exponent;
  const expanded = decimalAt <= 0
    ? `0.${'0'.repeat(-decimalAt)}${digits}`
    : decimalAt >= digits.length
      ? `${digits}${'0'.repeat(decimalAt - digits.length)}`
      : `${digits.slice(0, decimalAt)}.${digits.slice(decimalAt)}`;
  return negative ? `-${expanded}` : expanded;
};

/** Converts a UI/config decimal to the nearest representable 18-decimal WAD. */
export function toWad(value: number | string): bigint {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error(`cannot convert non-finite number to WAD: ${value}`);
  }
  const expanded = expandScientific(String(value));
  const negative = expanded.startsWith('-');
  const unsigned = negative ? expanded.slice(1) : expanded;
  const [wholeText = '0', fractionText = ''] = unsigned.split('.');
  const padded = `${fractionText}${'0'.repeat(19)}`;
  const first18 = padded.slice(0, 18);
  const roundDigit = Number(padded[18] ?? '0');
  let result = BigInt(wholeText || '0') * WAD + BigInt(first18 || '0');
  if (roundDigit >= 5) result += 1n;
  return negative ? -result : result;
}

/** Converts a decimal to WAD with mathematical floor rounding. This is used
 * for positive exact-input swap outputs, where rounding proceeds down in the
 * recipient's favor rather than to the nearest representable WAD. */
export function toWadFloor(value: number | string): bigint {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error(`cannot convert non-finite number to WAD: ${value}`);
  }
  const expanded = expandScientific(String(value));
  const negative = expanded.startsWith('-');
  const unsigned = negative ? expanded.slice(1) : expanded;
  const [wholeText = '0', fractionText = ''] = unsigned.split('.');
  const padded = `${fractionText}${'0'.repeat(18)}`;
  let result = BigInt(wholeText || '0') * WAD + BigInt(padded.slice(0, 18) || '0');
  if (negative && fractionText.slice(18).split('').some((digit) => digit !== '0')) {
    result += 1n;
  }
  return negative ? -result : result;
}

export const fromWad = (value: bigint): number => Number(value) / 1e18;
export const minWad = (a: bigint, b: bigint): bigint => (a < b ? a : b);
export const maxWad = (a: bigint, b: bigint): bigint => (a > b ? a : b);
export const saturatingSub = (a: bigint, b: bigint): bigint => (a > b ? a - b : 0n);

export function signedMulDiv(
  value: bigint,
  numerator: bigint,
  denominator: bigint,
): bigint {
  if (value === 0n || numerator === 0n) return 0n;
  const magnitude = mulDiv(value < 0n ? -value : value, numerator, denominator);
  return value < 0n ? -magnitude : magnitude;
}

/** Applies a decimal return to WAD NAV with Solidity-style floor rounding. */
export function applyReturn(value: bigint, decimalReturn: number): bigint {
  const factor = WAD + toWad(decimalReturn);
  if (factor < 0n) throw new Error('return would make NAV negative');
  return mulDiv(value, factor, WAD, Rounding.Floor);
}
