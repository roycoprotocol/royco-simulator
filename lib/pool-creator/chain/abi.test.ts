// Run: npx tsx lib/pool-creator/chain/abi.test.ts
//
// The load-bearing test is #1: the canonical worked example from the Solidity
// ABI specification. If a hand-rolled encoder reproduces that byte for byte,
// its head/tail handling is right.

import {
  AbiEncodeError,
  decodeAddressAt,
  decodeBoolAt,
  decodeRevertReason,
  decodeUintAt,
  encodeCall,
  encodeParameters,
  isDynamic,
  toWad,
  WAD,
  type AbiParam,
} from "@/lib/pool-creator/chain/abi";

let failures = 0;
let checks = 0;
const ok = (c: boolean, label: string, detail = "") => {
  checks += 1;
  if (!c) {
    failures += 1;
    console.error(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`);
  }
};
const eq = (actual: string, expected: string, label: string) =>
  ok(actual.toLowerCase() === expected.toLowerCase(), label, `got      ${actual}\n        expected ${expected}`);

const words = (...w: string[]) => w.map((x) => x.padStart(64, "0")).join("");

// ---------------------------------------------------------------------------
console.log("\n1. The canonical example from the Solidity ABI specification");
// ---------------------------------------------------------------------------
{
  // f(uint256, uint32[], bytes10, bytes) with
  //   (0x123, [0x456, 0x789], "1234567890", "Hello, world!")
  // Expected encoding is published in the spec; reproducing it exactly is the
  // strongest available check on head/tail offsets without a reference library.
  const params: AbiParam[] = [
    { type: "uint256" },
    { type: "uint32[]" },
    { type: "bytes10" },
    { type: "bytes" },
  ];
  const values = [
    0x123n,
    [0x456n, 0x789n],
    "0x31323334353637383930", // "1234567890"
    `0x${Buffer.from("Hello, world!", "utf8").toString("hex")}`,
  ];

  const expected =
    "0x" +
    words("123") +                                   // uint256 0x123
    words("80") +                                    // offset of uint32[]  = 128
    "3132333435363738393000000000000000000000000000000000000000000000" + // bytes10, left-aligned
    words("e0") +                                    // offset of bytes     = 224
    words("2") +                                     // array length
    words("456") +
    words("789") +
    words("d") +                                     // bytes length = 13
    "48656c6c6f2c20776f726c6421".padEnd(64, "0");    // "Hello, world!", right-padded

  eq(encodeParameters(params, values), expected, "spec example encodes byte-for-byte");
}

// ---------------------------------------------------------------------------
console.log("2. Static scalars");
// ---------------------------------------------------------------------------
{
  eq(
    encodeParameters([{ type: "address" }], ["0x7c405bbD131e42af506d14e752f2e59B19D49997"]),
    "0x" + words("7c405bbd131e42af506d14e752f2e59b19d49997"),
    "address is right-aligned and lower-cased",
  );
  eq(encodeParameters([{ type: "bool" }], [true]), "0x" + words("1"), "bool true");
  eq(encodeParameters([{ type: "bool" }], [false]), "0x" + words("0"), "bool false");
  eq(encodeParameters([{ type: "uint64" }], [12345n]), "0x" + words("3039"), "uint64");
  eq(
    encodeParameters([{ type: "bytes32" }], ["0xdeadbeef"]),
    "0xdeadbeef" + "0".repeat(56),
    "bytes32 is left-aligned",
  );
  eq(
    encodeParameters([{ type: "uint24" }, { type: "uint48" }], [7n, 9n]),
    "0x" + words("7") + words("9"),
    "narrow uints still take a full word each",
  );
}

// ---------------------------------------------------------------------------
console.log("3. Overflow and malformed input are refused, not truncated");
// ---------------------------------------------------------------------------
{
  const throws = (fn: () => unknown, label: string) => {
    try {
      fn();
      ok(false, label, "did not throw");
    } catch (error) {
      ok(error instanceof AbiEncodeError, label, String(error));
    }
  };
  throws(() => encodeParameters([{ type: "uint8" }], [256n]), "uint8 overflow refused");
  throws(() => encodeParameters([{ type: "uint64" }], [-1n]), "negative uint refused");
  throws(() => encodeParameters([{ type: "address" }], ["0x123"]), "short address refused");
  throws(() => encodeParameters([{ type: "bytes4" }], ["0xdeadbeefcc"]), "oversized bytes4 refused");
  throws(() => encodeParameters([{ type: "uint256" }, { type: "bool" }], [1n]), "arity mismatch refused");
  throws(() => encodeParameters([{ type: "int256" }], [1n]), "unsupported type refused");
  throws(
    () => encodeParameters([{ type: "uint8[2]" }], [[1n, 2n, 3n]]),
    "fixed-array length mismatch refused",
  );
}

// ---------------------------------------------------------------------------
console.log("4. Dynamic-type detection");
// ---------------------------------------------------------------------------
{
  ok(!isDynamic({ type: "uint256" }), "uint256 is static");
  ok(!isDynamic({ type: "bytes32" }), "bytes32 is static");
  ok(isDynamic({ type: "bytes" }), "bytes is dynamic");
  ok(isDynamic({ type: "string" }), "string is dynamic");
  ok(isDynamic({ type: "uint64[]" }), "dynamic array is dynamic");
  ok(!isDynamic({ type: "uint64[3]" }), "fixed array of static is static");
  ok(isDynamic({ type: "bytes[2]" }), "fixed array of dynamic is dynamic");
  ok(
    !isDynamic({ type: "tuple", components: [{ type: "address" }, { type: "uint64" }] }),
    "all-static tuple is static",
  );
  ok(
    isDynamic({ type: "tuple", components: [{ type: "address" }, { type: "string" }] }),
    "tuple containing a string is dynamic",
  );
  ok(
    isDynamic({
      type: "tuple",
      components: [{ type: "tuple", components: [{ type: "bytes" }] }],
    }),
    "dynamism propagates through nesting",
  );
}

// ---------------------------------------------------------------------------
console.log("5. Static tuples are inlined, dynamic tuples are offset");
// ---------------------------------------------------------------------------
{
  // A static tuple occupies its components' slots directly — no offset word.
  const staticTuple: AbiParam = {
    type: "tuple",
    components: [{ type: "uint64" }, { type: "bool" }],
  };
  eq(
    encodeParameters([staticTuple, { type: "uint64" }], [[1n, true], 2n]),
    "0x" + words("1") + words("1") + words("2"),
    "static tuple is inlined in the head",
  );

  // A dynamic tuple gets an offset, and its payload lands in the tail.
  const dynamicTuple: AbiParam = {
    type: "tuple",
    components: [{ type: "uint64" }, { type: "string" }],
  };
  const encoded = encodeParameters([dynamicTuple], [[7n, "hi"]]);
  eq(
    encoded,
    "0x" +
      words("20") + // offset to the tuple
      words("7") + //  uint64
      words("40") + // offset to the string, relative to the tuple
      words("2") + //  string length
      "6869".padEnd(64, "0"),
    "dynamic tuple offsets are relative to the tuple, not the payload",
  );
}

// ---------------------------------------------------------------------------
console.log("6. The exact shapes MarketParams uses");
// ---------------------------------------------------------------------------
{
  // bytes4[] — the oracle binding selectors.
  eq(
    encodeParameters([{ type: "bytes4[]" }], [["0xda68cf8b", "0x38d52e0f"]]),
    "0x" +
      words("20") +
      words("2") +
      "da68cf8b".padEnd(64, "0") +
      "38d52e0f".padEnd(64, "0"),
    "bytes4[] elements are left-aligned in their own words",
  );

  // uint64[] — the binding role ids.
  eq(
    encodeParameters([{ type: "uint64[]" }], [[1n, 2n, 3n]]),
    "0x" + words("20") + words("3") + words("1") + words("2") + words("3"),
    "uint64[]",
  );

  // An empty dynamic array and empty bytes still occupy their length word.
  eq(
    encodeParameters([{ type: "uint64[]" }, { type: "bytes" }], [[], "0x"]),
    "0x" + words("40") + words("60") + words("0") + words("0"),
    "empty array and empty bytes",
  );

  // The tranche init params: two strings and an address, i.e. a dynamic tuple.
  const tranche: AbiParam = {
    type: "tuple",
    components: [{ type: "string" }, { type: "string" }, { type: "address" }],
  };
  const encoded = encodeParameters(
    [tranche],
    [["Senior sUSDai", "srRoysUSDai", "0x0000000000000000000000000000000000000001"]],
  );
  ok(encoded.startsWith("0x" + words("20")), "tranche tuple is offset");
  ok(encoded.includes(Buffer.from("srRoysUSDai", "utf8").toString("hex")), "symbol round-trips");
  ok(encoded.length % 64 === 2, "encoding is word-aligned", String(encoded.length));
}

// ---------------------------------------------------------------------------
console.log("7. Deeply nested: a tuple of tuples inside a dynamic parent");
// ---------------------------------------------------------------------------
{
  const trancheConfig: AbiParam = {
    type: "tuple",
    components: [
      { type: "bool" },
      { type: "uint24" },
      { type: "uint32" },
      { type: "uint24" },
      { type: "uint32" },
      { type: "bool" },
    ],
  };
  const configs: AbiParam = {
    type: "tuple",
    components: [trancheConfig, trancheConfig, trancheConfig],
  };
  ok(!isDynamic(configs), "the entry-point config trio is fully static");

  const value = [true, 0n, 0n, 0n, 0n, false];
  const encoded = encodeParameters([configs], [[value, value, value]]);
  // 3 tranches × 6 static words, inlined with no offsets at all.
  ok(encoded.length === 2 + 18 * 64, "18 inlined words, no offset", String(encoded.length));
  eq(encoded.slice(0, 66), "0x" + words("1"), "first field is the enabled flag");
}

// ---------------------------------------------------------------------------
console.log("8. Selector prefixing and return decoding");
// ---------------------------------------------------------------------------
{
  const call = encodeCall("0x12345678", [{ type: "uint64" }], [1n]);
  eq(call, "0x12345678" + words("1"), "selector is prefixed");

  const ret = "0x" + words("7c405bbd131e42af506d14e752f2e59b19d49997") + words("1") + words("2a");
  eq(decodeAddressAt(ret, 0), "0x7c405bbd131e42af506d14e752f2e59b19d49997", "decode address");
  ok(decodeBoolAt(ret, 1) === true, "decode bool");
  ok(decodeUintAt(ret, 2) === 42n, "decode uint");
}

// ---------------------------------------------------------------------------
console.log("9. Revert reasons");
// ---------------------------------------------------------------------------
{
  const message = "AccessManagedUnauthorized";
  const payload =
    "0x08c379a0" +
    words("20") +
    words(message.length.toString(16)) +
    Buffer.from(message, "utf8").toString("hex").padEnd(64, "0");
  ok(decodeRevertReason(payload) === message, "Error(string) decodes", String(decodeRevertReason(payload)));
  ok(decodeRevertReason("0x") === null, "empty revert has no message");
  ok(decodeRevertReason("0xdeadbeef") === null, "a custom error has no string");
}

// ---------------------------------------------------------------------------
console.log("10. WAD conversion");
// ---------------------------------------------------------------------------
{
  ok(toWad(1) === WAD, "1 → 1e18");
  ok(toWad(0.1) === WAD / 10n, "0.1 → 1e17 exactly (no float dust)", toWad(0.1).toString());
  ok(toWad(0.45) === 45n * 10n ** 16n, "0.45 → 4.5e17", toWad(0.45).toString());
  ok(toWad(0.005) === 5n * 10n ** 15n, "0.005 → 5e15", toWad(0.005).toString());
  ok(toWad(0) === 0n, "0 → 0");
  ok(toWad(0.084066) === 84066n * 10n ** 12n, "a solved yield share converts cleanly",
    toWad(0.084066).toString());
}

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${checks - failures}/${checks} checks passed\n`);
process.exit(failures === 0 ? 0 : 1);
