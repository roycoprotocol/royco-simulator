// =============================================================================
// Minimal ABI encoder.
// -----------------------------------------------------------------------------
// WHY HAND-ROLLED. `package.json` is SHA-locked by
// `scripts/day-simulator/template-lock.json`, so adding viem would mean editing
// a guardrail file. That is a maintainer decision, not a side effect of
// building a page, so this implements only the types `MarketParams` actually
// needs instead:
//
//   address · bool · uintN · bytesN · bytes · string · T[] · tuple (nested)
//
// The surface is small and every branch is covered by vectors in `abi.test.ts`,
// including the canonical example from the Solidity ABI specification. If the
// lock is ever regenerated to admit viem, `encodeParameters` is the only
// function that needs swapping — `params.ts` calls nothing else.
//
// Encoding rules implemented (ABI spec, "Formal Specification of the Encoding"):
//   - static types occupy their own head slot;
//   - dynamic types put a byte offset in the head and their payload in the tail;
//   - a tuple is dynamic if any component is dynamic;
//   - a static tuple's head slot is the concatenation of its components.
// =============================================================================

export type AbiParam = {
  name?: string;
  type: string;
  components?: AbiParam[];
};

export class AbiEncodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AbiEncodeError";
  }
}

const WORD = 64; // hex characters in a 32-byte word

const strip = (hex: string): string => (hex.startsWith("0x") ? hex.slice(2) : hex);

const padLeft = (hex: string): string => strip(hex).padStart(WORD, "0");
const padRight = (hex: string): string => {
  const body = strip(hex);
  const remainder = body.length % WORD;
  return remainder === 0 ? body : body.padEnd(body.length + (WORD - remainder), "0");
};

function encodeUint(value: bigint | number | string, bits: number): string {
  const big = typeof value === "bigint" ? value : BigInt(value);
  if (big < 0n) throw new AbiEncodeError(`uint${bits} cannot be negative: ${big}`);
  if (bits < 256 && big >= 1n << BigInt(bits)) {
    throw new AbiEncodeError(`value ${big} does not fit in uint${bits}`);
  }
  return padLeft(big.toString(16));
}

function encodeAddress(value: string): string {
  const body = strip(value).toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(body)) throw new AbiEncodeError(`invalid address: ${value}`);
  return padLeft(body);
}

function encodeBytesN(value: string, size: number): string {
  const body = strip(value).toLowerCase();
  if (!/^[0-9a-f]*$/.test(body)) throw new AbiEncodeError(`invalid bytes${size}: ${value}`);
  if (body.length > size * 2) throw new AbiEncodeError(`bytes${size} too long: ${value}`);
  // Fixed-size bytes are left-aligned (right-padded with zeros).
  return body.padEnd(WORD, "0");
}

function utf8ToHex(value: string): string {
  const bytes = new TextEncoder().encode(value);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** length word + right-padded payload */
function encodeDynamicBytes(hexBody: string): string {
  const length = hexBody.length / 2;
  return encodeUint(length, 256) + (length === 0 ? "" : padRight(hexBody));
}

// ---------------------------------------------------------------------------
// Type inspection
// ---------------------------------------------------------------------------

const arrayMatch = (type: string): { base: string; fixedLength: number | null } | null => {
  const match = /^(.*)\[(\d*)\]$/.exec(type);
  if (!match) return null;
  return { base: match[1], fixedLength: match[2] === "" ? null : Number(match[2]) };
};

export function isDynamic(param: AbiParam): boolean {
  const { type } = param;
  if (type === "bytes" || type === "string") return true;

  const array = arrayMatch(type);
  if (array) {
    if (array.fixedLength === null) return true;
    return isDynamic({ ...param, type: array.base });
  }

  if (type === "tuple") {
    return (param.components ?? []).some(isDynamic);
  }
  return false;
}

/** Head size in hex characters for a static type. */
function staticSize(param: AbiParam): number {
  const array = arrayMatch(param.type);
  if (array && array.fixedLength !== null) {
    return array.fixedLength * staticSize({ ...param, type: array.base });
  }
  if (param.type === "tuple") {
    return (param.components ?? []).reduce((total, component) => total + staticSize(component), 0);
  }
  return WORD;
}

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

/** Encode a single value: its inline form if static, its payload if dynamic. */
function encodeValue(param: AbiParam, value: unknown): string {
  const { type } = param;

  const array = arrayMatch(type);
  if (array) {
    if (!Array.isArray(value)) throw new AbiEncodeError(`${type} expects an array`);
    const element: AbiParam = { ...param, type: array.base };
    if (array.fixedLength !== null) {
      if (value.length !== array.fixedLength) {
        throw new AbiEncodeError(`${type} expects ${array.fixedLength} items, got ${value.length}`);
      }
      return encodeSequence(Array(array.fixedLength).fill(element), value);
    }
    return encodeUint(value.length, 256) + encodeSequence(Array(value.length).fill(element), value);
  }

  if (type === "tuple") {
    const components = param.components ?? [];
    if (!Array.isArray(value)) throw new AbiEncodeError("tuple expects an array of components");
    if (value.length !== components.length) {
      throw new AbiEncodeError(`tuple expects ${components.length} components, got ${value.length}`);
    }
    return encodeSequence(components, value);
  }

  if (type === "address") return encodeAddress(String(value));
  if (type === "bool") return encodeUint(value ? 1 : 0, 8);
  if (type === "string") return encodeDynamicBytes(utf8ToHex(String(value)));
  if (type === "bytes") return encodeDynamicBytes(strip(String(value)));

  const uint = /^uint(\d+)$/.exec(type);
  if (uint) return encodeUint(value as bigint | number | string, Number(uint[1]));

  const bytesN = /^bytes(\d+)$/.exec(type);
  if (bytesN) return encodeBytesN(String(value), Number(bytesN[1]));

  throw new AbiEncodeError(`unsupported ABI type: ${type}`);
}

/**
 * The head/tail split. Dynamic members contribute a 32-byte offset to the head
 * and their payload to the tail; static members sit inline in the head.
 */
function encodeSequence(params: AbiParam[], values: unknown[]): string {
  const headSize = params.reduce(
    (total, param) => total + (isDynamic(param) ? WORD : staticSize(param)),
    0,
  );

  const heads: string[] = [];
  const tails: string[] = [];
  let tailOffsetBytes = headSize / 2;

  params.forEach((param, index) => {
    const encoded = encodeValue(param, values[index]);
    if (isDynamic(param)) {
      heads.push(encodeUint(tailOffsetBytes, 256));
      tails.push(encoded);
      tailOffsetBytes += encoded.length / 2;
    } else {
      heads.push(encoded);
    }
  });

  return heads.join("") + tails.join("");
}

/** Encode a parameter list, as `abi.encode(...)` does. Returns `0x…`. */
export function encodeParameters(params: AbiParam[], values: unknown[]): `0x${string}` {
  if (params.length !== values.length) {
    throw new AbiEncodeError(`expected ${params.length} values, got ${values.length}`);
  }
  return `0x${encodeSequence(params, values)}`;
}

/** Prefix a 4-byte selector onto encoded arguments. */
export function encodeCall(
  selector: string,
  params: AbiParam[],
  values: unknown[],
): `0x${string}` {
  const body = strip(encodeParameters(params, values));
  return `0x${strip(selector)}${body}`;
}

// ---------------------------------------------------------------------------
// Decoding — only what the deploy flow reads back
// ---------------------------------------------------------------------------

/** Read the address in word `index` of a return payload. */
export function decodeAddressAt(hex: string, index: number): `0x${string}` {
  const body = strip(hex);
  const word = body.slice(index * WORD, (index + 1) * WORD);
  if (word.length !== WORD) throw new AbiEncodeError("return data too short");
  return `0x${word.slice(24)}` as `0x${string}`;
}

export function decodeBoolAt(hex: string, index: number): boolean {
  const body = strip(hex);
  const word = body.slice(index * WORD, (index + 1) * WORD);
  if (word.length !== WORD) throw new AbiEncodeError("return data too short");
  return BigInt(`0x${word}`) !== 0n;
}

export function decodeUintAt(hex: string, index: number): bigint {
  const body = strip(hex);
  const word = body.slice(index * WORD, (index + 1) * WORD);
  if (word.length !== WORD) throw new AbiEncodeError("return data too short");
  return BigInt(`0x${word}`);
}

/**
 * Decode a Solidity `Error(string)` revert payload into its message.
 * Returns null for custom errors and empty reverts, which have no string.
 */
export function decodeRevertReason(hex: string): string | null {
  const body = strip(hex);
  if (!body.startsWith("08c379a0")) return null;
  try {
    const payload = body.slice(8);
    const length = Number(BigInt(`0x${payload.slice(WORD, WORD * 2)}`));
    const data = payload.slice(WORD * 2, WORD * 2 + length * 2);
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) bytes[i] = parseInt(data.slice(i * 2, i * 2 + 2), 16);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

// WAD helpers — the contracts take 18-decimal fixed point.
export const WAD = 10n ** 18n;

/** Convert a decimal fraction to WAD, rounding half-up. */
export function toWad(value: number): bigint {
  if (!Number.isFinite(value)) throw new AbiEncodeError(`cannot convert ${value} to WAD`);
  // Route through a fixed-precision string so 0.1 does not become 99999…
  return BigInt(Math.round(value * 1e9)) * 10n ** 9n;
}
