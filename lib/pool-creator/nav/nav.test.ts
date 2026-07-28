// Run: npx tsx lib/pool-creator/nav/nav.test.ts
//
// Pure units only — no network. The live behaviour was verified against four
// real contracts (sUSDai, ACRED, Makina DUSD, USDC) during development; these
// guard the decoding, windowing and limiting logic that a live check cannot
// pin down, and that would otherwise silently rot.

import {
  decodeString,
  decodeUint,
  decodeWord,
  decodeAddress,
  encodeUintCall,
  hexBlock,
  isAddressShape,
  normalizeAddress,
  toDecimal,
  SELECTORS,
} from "@/lib/pool-creator/nav/rpc";
import { enumerateDates, dayEndTimestamp } from "@/lib/pool-creator/nav/blocks";
import {
  cadenceStepDays,
  clampWindow,
  MAX_LOOKBACK_DAYS,
  MAX_OBSERVATIONS,
} from "@/lib/pool-creator/nav/extract";
import { describeProbe, isReadable } from "@/lib/pool-creator/nav/probe";
import { takeToken } from "@/lib/pool-creator/nav/cache";
import { selector } from "@/lib/pool-creator/chain/keccak";

let failures = 0;
let checks = 0;
const ok = (c: boolean, label: string, detail = "") => {
  checks += 1;
  if (!c) {
    failures += 1;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
};

const word = (hex: string) => hex.padStart(64, "0");

// ---------------------------------------------------------------------------
console.log("\n1. Selectors match their signatures");
// ---------------------------------------------------------------------------
{
  // The same cross-check keccak.test.ts makes, from the other direction: these
  // constants are what actually get sent, so they must equal their signatures.
  const expected: Array<[keyof typeof SELECTORS, string]> = [
    ["accountingToken", "accountingToken()"],
    ["asset", "asset()"],
    ["convertToAssets", "convertToAssets(uint256)"],
    ["decimals", "decimals()"],
    ["latestRoundData", "latestRoundData()"],
    ["shareToken", "shareToken()"],
    ["symbol", "symbol()"],
    ["name", "name()"],
  ];
  for (const [key, signature] of expected) {
    ok(SELECTORS[key] === selector(signature), `SELECTORS.${key} = ${signature}`,
      `${SELECTORS[key]} vs ${selector(signature)}`);
  }
}

// ---------------------------------------------------------------------------
console.log("2. Return decoding");
// ---------------------------------------------------------------------------
{
  ok(decodeUint(`0x${word("de0b6b3a7640000")}`) === 10n ** 18n, "uint256");
  ok(decodeAddress(`0x${word("a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48")}`)
    === "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", "address is the low 20 bytes");

  // latestRoundData: (roundId, answer, startedAt, updatedAt, answeredInRound).
  const round = "0x" + word("1") + word("5f5e100") + word("0") + word("68000000") + word("1");
  ok(decodeWord(round, 1) === 100000000n, "chainlink answer is word 1");
  ok(decodeWord(round, 3) === 0x68000000n, "chainlink updatedAt is word 3");

  ok(toDecimal(100000000n, 8) === 1, "8-decimal price");
  ok(toDecimal(10n ** 18n, 18) === 1, "18-decimal price");

  ok(encodeUintCall(SELECTORS.convertToAssets, 10n ** 18n)
    === `${SELECTORS.convertToAssets}${word("de0b6b3a7640000")}`, "convertToAssets probe encodes");
  ok(hexBlock(1234567) === "0x12d687", "block numbers are hex");
}

// ---------------------------------------------------------------------------
console.log("3. String decoding, both encodings tokens actually use");
// ---------------------------------------------------------------------------
{
  // Dynamic ABI string: offset, length, payload.
  const dynamic = "0x" + word("20") + word("6") + Buffer.from("sUSDai").toString("hex").padEnd(64, "0");
  ok(decodeString(dynamic) === "sUSDai", "dynamic string", decodeString(dynamic));

  // bytes32, which older tokens (MKR and friends) still return.
  const fixed = "0x" + Buffer.from("DAI").toString("hex").padEnd(64, "0");
  ok(decodeString(fixed) === "DAI", "bytes32 string", decodeString(fixed));

  ok(decodeString("0x") === "", "empty returns empty");
  ok(decodeString(null) === "", "null returns empty");
  // Must not throw on rubbish — an unrecognised contract is a normal outcome.
  ok(typeof decodeString("0xdeadbeef") === "string", "garbage decodes to a string, not an exception");
}

// ---------------------------------------------------------------------------
console.log("4. Address validation");
// ---------------------------------------------------------------------------
{
  ok(isAddressShape("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"), "mixed case accepted");
  ok(!isAddressShape("0xA0b8"), "too short rejected");
  ok(!isAddressShape("A0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"), "missing 0x rejected");
  ok(!isAddressShape("0xZZb86991c6218b36c1d19D4a2e9Eb0cE3606eB48"), "non-hex rejected");
  ok(normalizeAddress("0xA0B8") === "0xa0b8", "normalisation lower-cases");
}

// ---------------------------------------------------------------------------
console.log("5. Date enumeration and cadence");
// ---------------------------------------------------------------------------
{
  const daily = enumerateDates("2026-01-01", "2026-01-10", 1);
  ok(daily.length === 10, "daily covers every day", String(daily.length));
  ok(daily[0] === "2026-01-01" && daily[daily.length - 1] === "2026-01-10", "inclusive of both ends");

  const weekly = enumerateDates("2026-01-01", "2026-02-01", 7);
  ok(weekly[weekly.length - 1] === "2026-02-01", "the final date is always included");
  ok(new Set(weekly).size === weekly.length, "no duplicate dates");
  ok(weekly.every((d, i) => i === 0 || d > weekly[i - 1]), "strictly increasing");

  ok(cadenceStepDays("daily") === 1 && cadenceStepDays("weekly") === 7, "cadence steps");

  // A day's close is never in the future.
  const future = dayEndTimestamp("2099-01-01");
  ok(future <= Math.floor(Date.now() / 1000) + 1, "a future date clamps to now", String(future));
}

// ---------------------------------------------------------------------------
console.log("6. Window clamping — the caps that keep a request bounded");
// ---------------------------------------------------------------------------
{
  // A 10-year request is cut to the lookback cap.
  const long = clampWindow("2016-01-01", "2026-07-01", "weekly");
  const spanDays = Math.round(
    (Date.parse(`${long.endDate}T00:00:00Z`) - Date.parse(`${long.startDate}T00:00:00Z`)) / 86_400_000,
  );
  ok(spanDays <= MAX_LOOKBACK_DAYS, `lookback capped at ${MAX_LOOKBACK_DAYS} days`, String(spanDays));

  // Daily over a long window would blow the observation cap, so it steps up.
  const stepped = clampWindow("2024-07-01", "2026-07-01", "daily");
  ok(stepped.cadence === "weekly", "daily steps up to weekly rather than exceeding the cap",
    stepped.cadence);
  ok(enumerateDates(stepped.startDate, stepped.endDate, cadenceStepDays(stepped.cadence)).length
    <= MAX_OBSERVATIONS, "the clamped window fits inside the observation cap");

  // A short daily window is left alone.
  const short = clampWindow("2026-06-01", "2026-07-01", "daily");
  ok(short.cadence === "daily", "a short daily window stays daily");
}

// ---------------------------------------------------------------------------
console.log("7. Probe descriptions never overstate");
// ---------------------------------------------------------------------------
{
  const erc4626 = describeProbe({
    kind: "erc4626", symbol: "sUSDai", name: "Staked USDai",
    shareDecimals: 18, baseAsset: "0x00", assetDecimals: 18, probeShares: "1",
  });
  ok(erc4626.includes("ERC-4626") && erc4626.includes("sUSDai"), "erc4626 names the vault");

  const token = describeProbe({ kind: "erc20-only", symbol: "USDC", name: "USD Coin", decimals: 6 });
  ok(token.includes("not a yield vault"), "a plain token is refused, clearly");

  const unknown = describeProbe({ kind: "unknown", attempted: ["asset()"] });
  ok(unknown.includes("couldn't recognise"), "an unknown contract says so rather than guessing");

  ok(isReadable({ kind: "erc4626", symbol: "", name: "", shareDecimals: 18, baseAsset: "0x00", assetDecimals: 18, probeShares: "1" }),
    "erc4626 is readable");
  ok(isReadable({ kind: "chainlink", symbol: "", name: "", decimals: 8 }), "chainlink is readable");
  ok(!isReadable({ kind: "erc20-only", symbol: "", name: "", decimals: 6 }), "a plain token is not");
  ok(!isReadable({ kind: "unknown", attempted: [] }), "unknown is not");
}

// ---------------------------------------------------------------------------
console.log("8. Rate limiting");
// ---------------------------------------------------------------------------
{
  const key = `test-${Math.round(performance.now())}-${process.pid}`;
  const limits = { capacity: 3, refillPerMinute: 4 };

  let allowed = 0;
  for (let i = 0; i < 5; i += 1) {
    if (takeToken(key, limits).allowed) allowed += 1;
  }
  ok(allowed === 3, "the bucket allows exactly its capacity", String(allowed));

  const denied = takeToken(key, limits);
  ok(denied.allowed === false, "further requests are refused");
  ok(denied.allowed === false && denied.retryAfterSeconds > 0, "and say when to come back",
    JSON.stringify(denied));

  // A different caller has its own bucket.
  ok(takeToken(`${key}-other`, limits).allowed === true, "buckets are per key");
}

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${checks - failures}/${checks} checks passed\n`);
process.exit(failures === 0 ? 0 : 1);
