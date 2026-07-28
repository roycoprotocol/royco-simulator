// =============================================================================
// keccak-256 (the pre-NIST padding Ethereum uses), pure TypeScript.
// -----------------------------------------------------------------------------
// Needed so function selectors are DERIVED from their signatures rather than
// pasted in as hex nobody can check. `keccak.test.ts` validates this
// implementation against the standard empty-string vector and against the six
// selectors already proven in production by `scripts/data/extract-day-nav.mjs`.
//
// Note this is keccak-256, not SHA3-256: the domain padding byte is 0x01, not
// 0x06. Using the wrong one silently produces plausible-looking wrong hashes.
// =============================================================================

const ROUNDS = 24;

const RC: bigint[] = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

const ROTATION = [
  0, 1, 62, 28, 27,
  36, 44, 6, 55, 20,
  3, 10, 43, 25, 39,
  41, 45, 15, 21, 8,
  18, 2, 61, 56, 14,
];

const MASK = (1n << 64n) - 1n;

const rotl = (value: bigint, shift: number): bigint =>
  shift === 0 ? value : ((value << BigInt(shift)) | (value >> BigInt(64 - shift))) & MASK;

/** Keccak-f[1600] on a 25-lane state, lanes indexed `x + 5y`. */
function permute(state: bigint[]): void {
  for (let round = 0; round < ROUNDS; round += 1) {
    // θ
    const c = new Array<bigint>(5);
    for (let x = 0; x < 5; x += 1) {
      c[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    }
    for (let x = 0; x < 5; x += 1) {
      const d = c[(x + 4) % 5] ^ rotl(c[(x + 1) % 5], 1);
      for (let y = 0; y < 25; y += 5) state[x + y] ^= d;
    }

    // ρ and π
    const b = new Array<bigint>(25).fill(0n);
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        b[y + ((2 * x + 3 * y) % 5) * 5] = rotl(state[x + y * 5], ROTATION[x + y * 5]);
      }
    }

    // χ
    for (let y = 0; y < 25; y += 5) {
      for (let x = 0; x < 5; x += 1) {
        state[x + y] = b[x + y] ^ (~b[((x + 1) % 5) + y] & MASK & b[((x + 2) % 5) + y]);
      }
    }

    // ι
    state[0] ^= RC[round];
  }
}

export function keccak256(input: Uint8Array): Uint8Array {
  const rate = 136; // 1088 bits for keccak-256
  const state = new Array<bigint>(25).fill(0n);

  // Pad: 0x01 … 0x80 (Ethereum's keccak, not SHA3's 0x06).
  const padded = new Uint8Array(Math.ceil((input.length + 1) / rate) * rate);
  padded.set(input);
  padded[input.length] = 0x01;
  padded[padded.length - 1] |= 0x80;

  for (let offset = 0; offset < padded.length; offset += rate) {
    for (let lane = 0; lane < rate / 8; lane += 1) {
      let value = 0n;
      // Little-endian lane packing.
      for (let byte = 7; byte >= 0; byte -= 1) {
        value = (value << 8n) | BigInt(padded[offset + lane * 8 + byte]);
      }
      state[lane] ^= value;
    }
    permute(state);
  }

  const out = new Uint8Array(32);
  for (let lane = 0; lane < 4; lane += 1) {
    let value = state[lane];
    for (let byte = 0; byte < 8; byte += 1) {
      out[lane * 8 + byte] = Number(value & 0xffn);
      value >>= 8n;
    }
  }
  return out;
}

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export function keccak256Hex(input: string | Uint8Array): `0x${string}` {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  return `0x${toHex(keccak256(bytes))}`;
}

/** The 4-byte selector for a canonical function signature. */
export function selector(signature: string): `0x${string}` {
  return keccak256Hex(signature).slice(0, 10) as `0x${string}`;
}

/**
 * Build a canonical signature from an ABI param list, so a selector can be
 * derived from the same description used to encode the call.
 */
export function canonicalType(param: { type: string; components?: Array<{ type: string; components?: unknown[] }> }): string {
  if (param.type.startsWith("tuple")) {
    const suffix = param.type.slice("tuple".length);
    const inner = (param.components ?? [])
      .map((component) => canonicalType(component as { type: string }))
      .join(",");
    return `(${inner})${suffix}`;
  }
  return param.type;
}

export function signatureOf(
  name: string,
  params: Array<{ type: string; components?: unknown[] }>,
): string {
  return `${name}(${params.map((p) => canonicalType(p as { type: string })).join(",")})`;
}
