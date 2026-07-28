// Run: npx tsx lib/pool-creator/chain/keccak.test.ts
//
// The point of this suite is that the six selectors in test 2 are already
// proven in production — `scripts/data/extract-day-nav.mjs` uses them to read
// real vaults, and Phase 2 confirmed they work against live chains. If this
// implementation reproduces all six from their signatures, the selectors it
// derives for the deploy path can be trusted too.

import { keccak256Hex, selector, signatureOf } from "@/lib/pool-creator/chain/keccak";

let failures = 0;
let checks = 0;
const eq = (actual: string, expected: string, label: string) => {
  checks += 1;
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    failures += 1;
    console.error(`  FAIL  ${label}\n        got      ${actual}\n        expected ${expected}`);
  }
};

// ---------------------------------------------------------------------------
console.log("\n1. Standard keccak-256 vectors");
// ---------------------------------------------------------------------------
{
  eq(
    keccak256Hex(""),
    "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
    "keccak256('')",
  );
  eq(
    keccak256Hex("abc"),
    "0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45",
    "keccak256('abc')",
  );
  eq(
    keccak256Hex("The quick brown fox jumps over the lazy dog"),
    "0x4d741b6f1eb29cb2a9b9911c82f56fa8d73b04959d3d9d222895df6c0b28aa15",
    "keccak256(pangram)",
  );
  // Multi-block absorption. I have no memorised vector for these lengths, so
  // these are structural assertions rather than published ones — stated as such
  // rather than dressed up as vectors. The rate is 136 bytes, so 135/136/137
  // straddle the padding boundary where an absorption bug would show.
  const boundary = [135, 136, 137].map((n) => keccak256Hex("a".repeat(n)));
  for (const [index, digest] of boundary.entries()) {
    checks += 1;
    if (!/^0x[0-9a-f]{64}$/.test(digest)) {
      failures += 1;
      console.error(`  FAIL  rate-boundary digest ${index} is malformed: ${digest}`);
    }
  }
  checks += 1;
  if (new Set(boundary).size !== 3) {
    failures += 1;
    console.error("  FAIL  digests either side of the rate boundary collide");
  }
  checks += 1;
  if (keccak256Hex("a".repeat(200)) !== keccak256Hex("a".repeat(200))) {
    failures += 1;
    console.error("  FAIL  hashing is not deterministic");
  }
}

// ---------------------------------------------------------------------------
console.log("2. The six selectors already proven against live chains");
// ---------------------------------------------------------------------------
{
  // Source of truth: SELECTORS in scripts/data/extract-day-nav.mjs, which
  // Phase 2 used to read sUSDai, ACRED, Makina DUSD and USDC successfully.
  const known: Array<[string, string]> = [
    ["accountingToken()", "0xda68cf8b"],
    ["asset()", "0x38d52e0f"],
    ["convertToAssets(uint256)", "0x07a2d13a"],
    ["decimals()", "0x313ce567"],
    ["latestRoundData()", "0xfeaf968c"],
    ["shareToken()", "0x6c9fa59e"],
    ["symbol()", "0x95d89b41"],
    ["name()", "0x06fdde03"],
  ];
  for (const [signature, expected] of known) {
    eq(selector(signature), expected, `selector ${signature}`);
  }

  // Widely-published selectors, as an independent cross-check.
  eq(selector("transfer(address,uint256)"), "0xa9059cbb", "selector transfer");
  eq(selector("approve(address,uint256)"), "0x095ea7b3", "selector approve");
  eq(selector("balanceOf(address)"), "0x70a08231", "selector balanceOf");
  eq(selector("allowance(address,address)"), "0xdd62ed3e", "selector allowance");
  eq(selector("totalSupply()"), "0x18160ddd", "selector totalSupply");
}

// ---------------------------------------------------------------------------
console.log("3. Canonical signatures from ABI params");
// ---------------------------------------------------------------------------
{
  eq(
    signatureOf("executeMarketDeployment", [{ type: "address" }, { type: "bytes" }]),
    "executeMarketDeployment(address,bytes)",
    "flat signature",
  );
  eq(
    signatureOf("f", [
      { type: "tuple", components: [{ type: "address" }, { type: "uint64" }] },
      { type: "bytes4[]" },
    ]),
    "f((address,uint64),bytes4[])",
    "tuples flatten to parenthesised lists",
  );
  eq(
    signatureOf("g", [
      {
        type: "tuple",
        components: [{ type: "tuple", components: [{ type: "bool" }] }, { type: "string" }],
      },
    ]),
    "g(((bool),string))",
    "nested tuples",
  );
  eq(
    signatureOf("h", [{ type: "tuple[]", components: [{ type: "uint256" }] }]),
    "h((uint256)[])",
    "array-of-tuple keeps its suffix",
  );
}

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${checks - failures}/${checks} checks passed\n`);
process.exit(failures === 0 ? 0 : 1);
