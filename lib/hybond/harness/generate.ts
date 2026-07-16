// generate.ts — regenerates HybondVectorGen.t.sol (the price/dt hex blobs + emit bitmap) from
// the current HYBOND_NAV_SERIES. Run when the underlying series changes:
//   npx tsx lib/hybond/harness/generate.ts
// It embeds the FULL daily prices/dts (so the contract walks the exact same path as
// backtest.ts) and an LSB-first emit bitmap selecting the documented SAMPLE (every STRIDE-th
// business day plus every IL-erasure and every PERPETUAL<->FIXED_TERM transition). See
// lib/hybond/PARITY-REPORT.md.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createMarket, deposit, sync, mulDiv, Rounding, WAD, type MarketState_Internal } from "@/lib/try/engine";
import { buildHybondConfig, HYBOND_DEFAULT_PARAMS, HYBOND_NAV_SERIES } from "@/lib/hybond/scenarios";

const toNav = (d: number): bigint => (BigInt(Math.round(d * 1e6)) * WAD) / 1_000_000n;
const toPriceWad = (p: number): bigint => (BigInt(Math.round(p * 1e6)) * WAD) / 1_000_000n;
function secondsBetween(a: string, b: string): bigint {
  const pa = Date.parse(a.length === 7 ? a + "-01" : a);
  const pb = Date.parse(b.length === 7 ? b + "-01" : b);
  return BigInt(Math.max(0, Math.round((pb - pa) / 1000)));
}
const series = HYBOND_NAV_SERIES;
const N = series.length;
const stNav0 = toNav(HYBOND_DEFAULT_PARAMS.depositST);
const jtNav0 = toNav(HYBOND_DEFAULT_PARAMS.depositJT);
const m: MarketState_Internal = createMarket(buildHybondConfig(HYBOND_DEFAULT_PARAMS));
deposit(m, "JT", 0n, jtNav0);
deposit(m, "ST", stNav0, jtNav0);
const priceWad0 = toPriceWad(series[0].price);
let jtRawCarry = jtNav0;
let prevPriceWad = priceWad0;
let prevState = "";
const prices: bigint[] = [];
const dts: bigint[] = [];
const transitions: number[] = [];
const erasures: number[] = [];
for (let i = 0; i < N; i++) {
  const priceWad = toPriceWad(series[i].price);
  const stRaw = mulDiv(stNav0, priceWad, priceWad0, Rounding.Floor);
  const jtRaw = i === 0 ? jtNav0 : mulDiv(jtRawCarry, priceWad, prevPriceWad, Rounding.Floor);
  const dt = i === 0 ? 0n : secondsBetween(series[i - 1].date, series[i].date);
  prices.push(priceWad); dts.push(dt);
  const r = sync(m, stRaw, jtRaw, dt);
  if (i > 0 && r.marketState !== prevState) transitions.push(i);
  if (r.jtCoverageILErased > 0n) erasures.push(i);
  prevState = r.marketState;
  jtRawCarry = r.jtRawNAV;
  prevPriceWad = priceWad;
}
const STRIDE = 8;
const emit = new Set<number>();
for (let i = 0; i < N; i += STRIDE) emit.add(i);
emit.add(N - 1);
for (const t of transitions) emit.add(t);
for (const e of erasures) emit.add(e);
const emitIdx = [...emit].sort((a, b) => a - b);

const hex64 = (v: bigint) => v.toString(16).padStart(64, "0");
const pricesHex = prices.map(hex64).join("");
const dtsHex = dts.map(hex64).join("");
// emit bitmap: ceil(N/8) bytes, bit i (LSB-first within byte) set => emit step i
const bmLen = Math.ceil(N / 8);
const bm = new Uint8Array(bmLen);
for (const i of emit) bm[i >> 3] |= 1 << (i & 7);
const bmHex = [...bm].map((b) => b.toString(16).padStart(2, "0")).join("");

const sol = `// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import { Test, console2 } from "../../lib/forge-std/src/Test.sol";
import { Vm } from "../../lib/forge-std/src/Vm.sol";

import { RoycoDayAccountant } from "../../src/accountant/RoycoDayAccountant.sol";
import { IRoycoDayAccountant } from "../../src/interfaces/IRoycoDayAccountant.sol";
import { StaticCurveYDM } from "../../src/ydm/StaticCurveYDM.sol";
import { MarketState, SyncedAccountingState, Operation } from "../../src/libraries/Types.sol";
import { NAV_UNIT, toNAVUnits } from "../../src/libraries/Units.sol";
import { ERC1967Proxy } from "../../lib/openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @dev HYBond vector generator (group "F"). Drives the REAL RoycoDayAccountant over the
/// srHYBond simulator's ACTUAL REAL daily NAV series (BNY Global Short-Dated High Yield Bond
/// Fund, ${N} business days, 2016-11-30 = 1.0 .. 2026-07-02 ~= 1.7318) using HYBond's DEFAULT
/// (Balanced) params: depositST 1000, depositJT 500, seniorShareToJuniorPct 62, observationDays
/// 45, minCoveragePct 30 (see lib/hybond/scenarios.ts / lib/try/scenarios.ts).
///
/// The raw-NAV driving replicates lib/try/backtest.ts EXACTLY:
///   stRaw_i = floor(stNav0 * price_i / price_0)              (Senior: fixed capital)
///   jtRaw_0 = jtNav0 ; jtRaw_i = floor(jtCarry * price_i / price_{i-1})   (Junior: carried)
/// with jtCarry = the accountant's returned jtRawNAV. Junior replenishment
/// (maintainJuniorCoverage) is a SIMULATOR-level product assumption and is deliberately
/// NOT exercised here: this harness proves the raw engine sync path only.
///
/// dt is the REAL per-step day gap in seconds (1-day, 3-day weekends, holiday gaps), computed
/// exactly like backtest.ts's secondsBetween(date_{i-1}, date_i) -- NOT a fixed step.
///
/// SAMPLED EMISSION: the accountant is synced on ALL ${N} daily steps (so the path/state is
/// bit-identical to the full daily backtest), but a JSON vector is EMITTED only on a documented
/// SAMPLE of steps: every ${STRIDE}th business day PLUS every step where an IL erasure occurs
/// (${erasures.length}) or the market state transitions PERPETUAL<->FIXED_TERM (${transitions.length}),
/// so ALL transitions and erasures are covered. That yields ${emitIdx.length} vectors of ${N}.
/// The emit set is an LSB-first bitmap (EMIT_BM). lib/hybond/parity.ts replays the SAME full
/// daily series through lib/try/engine.ts and compares at exactly these indices, wei-exact.
///
/// Prices/dts/bitmap are hex byte-blobs emitted from lib/hybond/scenarios.ts (toPriceWad +
/// day-delta logic), so the Solidity inputs are bit-identical to the TypeScript ones.
contract HybondVectorGenTest is Test {
    address internal kernel;

    StaticCurveYDM internal jtYDM;
    StaticCurveYDM internal ltYDM;

    uint256 internal constant ST_NAV0 = 1000e18; // depositST 1000
    uint256 internal constant JT_NAV0 = 500e18; // depositJT 500
    uint256 internal constant N = ${N};
    string internal constant OUT = "output/hybond-vectors-out.json";

    // price_i (WAD) and dt_i (seconds) as big-endian 32-byte words; step i at offset i*32.
    bytes internal constant PRICES = hex"${pricesHex}";
    bytes internal constant DTS = hex"${dtsHex}";
    // Emit bitmap: bit i (LSB-first within byte, byte i>>3) set => record a vector at step i.
    bytes internal constant EMIT_BM = hex"${bmHex}";

    uint256 internal clock;

    function setUp() public {
        kernel = makeAddr("kernel");
        vm.warp(1_000_000);
    }

    function _wordAt(bytes memory b, uint256 i) internal pure returns (uint256 v) {
        assembly {
            v := mload(add(add(b, 0x20), mul(i, 0x20)))
        }
    }

    function _priceAt(uint256 i) internal pure returns (uint256) {
        return _wordAt(PRICES, i);
    }

    function _dtAt(uint256 i) internal pure returns (uint256) {
        return _wordAt(DTS, i);
    }

    function _emit(uint256 i) internal pure returns (bool) {
        uint8 word = uint8(EMIT_BM[i >> 3]);
        return (word >> uint8(i & 7)) & 1 == 1;
    }

    function _deploy() internal returns (RoycoDayAccountant acct) {
        jtYDM = new StaticCurveYDM(0.9e18);
        ltYDM = new StaticCurveYDM(0.9e18);

        RoycoDayAccountant impl = new RoycoDayAccountant(kernel, true);

        IRoycoDayAccountant.RoycoDayAccountantInitParams memory p = IRoycoDayAccountant.RoycoDayAccountantInitParams({
            minCoverageWAD: uint64(0.3e18), // minCoveragePct 30
            coverageLiquidationUtilizationWAD: 20e18,
            minLiquidityWAD: 0,
            jtYDM: address(jtYDM),
            jtYDMInitializationData: abi.encodeCall(
                StaticCurveYDM.initializeYDMForMarket, (uint64(0.62e18), uint64(0.62e18), uint64(0.62e18))
            ),
            ltYDM: address(ltYDM),
            ltYDMInitializationData: abi.encodeCall(StaticCurveYDM.initializeYDMForMarket, (uint64(1), uint64(1), uint64(1))),
            maxJTYieldShareWAD: uint64(1e18),
            maxLTYieldShareWAD: 0,
            fixedTermDurationSeconds: uint24(3_888_000), // observationDays 45
            stNAVDustTolerance: toNAVUnits(uint256(0)),
            jtNAVDustTolerance: toNAVUnits(uint256(0)),
            stProtocolFeeWAD: 0,
            jtProtocolFeeWAD: 0,
            jtYieldShareProtocolFeeWAD: 0,
            ltYieldShareProtocolFeeWAD: 0
        });
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), abi.encodeCall(RoycoDayAccountant.initialize, (p, address(this))));
        acct = RoycoDayAccountant(address(proxy));
    }

    /// Genesis seeding: JT_DEPOSIT then ST_DEPOSIT at price 1.0, mirroring
    /// runBacktest()'s deposit(m,"JT",0,jtNav0); deposit(m,"ST",stNav0,jtNav0).
    function _genesis(RoycoDayAccountant acct) internal {
        clock = 1_000_000;
        vm.warp(clock);
        vm.prank(kernel);
        acct.postOpSyncTrancheAccounting(
            Operation.JT_DEPOSIT, toNAVUnits(uint256(0)), toNAVUnits(JT_NAV0), toNAVUnits(uint256(0)), toNAVUnits(uint256(0)), false
        );
        vm.prank(kernel);
        acct.postOpSyncTrancheAccounting(
            Operation.ST_DEPOSIT, toNAVUnits(ST_NAV0), toNAVUnits(JT_NAV0), toNAVUnits(uint256(0)), toNAVUnits(uint256(0)), false
        );
    }

    function test_GenerateHybondVectors() public {
        RoycoDayAccountant acct = _deploy();
        _genesis(acct);

        uint256 price0 = _priceAt(0);
        uint256 jtCarry = JT_NAV0;
        uint256 prevPrice = price0;
        uint256 emitted;

        // Vectors are streamed to the output file incrementally (as a JSON array) rather than
        // accumulated into one growing string: at 698 emitted vectors the quadratic string
        // concat blows the EVM memory-expansion gas limit (MemoryOOG). vm.writeLine appends.
        vm.writeFile(OUT, "");

        for (uint256 i = 0; i < N; i++) {
            uint256 dtSec = _dtAt(i);
            if (dtSec > 0) {
                clock += dtSec;
                vm.warp(clock);
            }
            uint256 priceI = _priceAt(i);
            uint256 stRaw = ST_NAV0 * priceI / price0;
            uint256 jtRaw = i == 0 ? JT_NAV0 : jtCarry * priceI / prevPrice;

            // Capture the accountant's OWN IL-erasure signal for this sync. The contract emits
            // JuniorTrancheCoverageImpermanentLossReset only when it actually erased outstanding
            // coverage IL, so absence of the event == 0 erased.
            vm.recordLogs();
            vm.prank(kernel);
            SyncedAccountingState memory s = acct.preOpSyncTrancheAccounting(toNAVUnits(stRaw), toNAVUnits(jtRaw));
            uint256 ilErased = _ilErasedFromLogs();

            _checkConservation(s, i);
            if (_emit(i)) {
                string memory obj =
                    _obj("F", string.concat("F_hybond_", vm.toString(i + 1)), stRaw, jtRaw, priceI, dtSec, s, ilErased);
                // Comma/bracket handling: first vector opens the array, the rest are ",<obj>".
                vm.writeLine(OUT, emitted == 0 ? string.concat("[", obj) : string.concat(",", obj));
                emitted++;
            }

            jtCarry = NAV_UNIT.unwrap(s.jtRawNAV);
            prevPrice = priceI;
        }

        vm.writeLine(OUT, "]");

        console2.log("=== SAMPLED EMISSION ===");
        console2.log("  daily steps synced:", N);
        console2.log("  vectors emitted:   ", emitted);
        console2.log("  stride:            ", uint256(${STRIDE}));
        console2.log("=== WROTE output/hybond-vectors-out.json ===");
    }

    /// Scans the logs emitted by the last sync for JuniorTrancheCoverageImpermanentLossReset and
    /// returns the erased amount (0 if the accountant erased nothing). Reverts if the event fires
    /// more than once in a single sync, which would make the per-step signal ambiguous.
    function _ilErasedFromLogs() internal returns (uint256 ilErased) {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 sig = keccak256("JuniorTrancheCoverageImpermanentLossReset(uint256)");
        bool seen;
        for (uint256 j = 0; j < logs.length; j++) {
            if (logs[j].topics.length > 0 && logs[j].topics[0] == sig) {
                if (seen) revert("DUPLICATE IL RESET EVENT IN ONE SYNC");
                seen = true;
                ilErased = abi.decode(logs[j].data, (uint256));
            }
        }
    }

    function _marketStateStr(MarketState ms) internal pure returns (string memory) {
        return ms == MarketState.PERPETUAL ? "PERPETUAL" : "FIXED_TERM";
    }

    function _obj(
        string memory group,
        string memory label,
        uint256 stRawIn,
        uint256 jtRawIn,
        uint256 priceWad,
        uint256 dtSec,
        SyncedAccountingState memory s,
        uint256 ilErased
    ) internal pure returns (string memory) {
        uint256 stEff = NAV_UNIT.unwrap(s.stEffectiveNAV);
        uint256 jtEff = NAV_UNIT.unwrap(s.jtEffectiveNAV);
        uint256 il = NAV_UNIT.unwrap(s.jtCoverageImpermanentLoss);
        uint256 u = s.coverageUtilizationWAD;
        string memory ms = _marketStateStr(s.marketState);

        return string.concat(
            "{\\"group\\":\\"", group, "\\",\\"label\\":\\"", label, "\\",",
            "\\"inputs\\":{\\"stRaw\\":\\"", vm.toString(stRawIn), "\\",\\"jtRaw\\":\\"", vm.toString(jtRawIn),
            "\\",\\"priceWad\\":\\"", vm.toString(priceWad), "\\",\\"dtSec\\":\\"", vm.toString(dtSec), "\\"},",
            "\\"outputs\\":{\\"stEff\\":\\"", vm.toString(stEff), "\\",\\"jtEff\\":\\"", vm.toString(jtEff),
            "\\",\\"il\\":\\"", vm.toString(il), "\\",\\"coverageUtilWad\\":\\"", vm.toString(u),
            "\\",\\"marketState\\":\\"", ms, "\\",\\"ilErased\\":\\"", vm.toString(ilErased), "\\"}}"
        );
    }

    function _checkConservation(SyncedAccountingState memory s, uint256 i) internal pure {
        uint256 rawSum = NAV_UNIT.unwrap(s.stRawNAV) + NAV_UNIT.unwrap(s.jtRawNAV);
        uint256 effSum = NAV_UNIT.unwrap(s.stEffectiveNAV) + NAV_UNIT.unwrap(s.jtEffectiveNAV);
        if (rawSum != effSum) {
            revert(string.concat("CONSERVATION VIOLATION at step ", vm.toString(i)));
        }
    }
}
`;
const outPath = join(dirname(fileURLToPath(import.meta.url)), "HybondVectorGen.t.sol");
writeFileSync(outPath, sol);
console.log("wrote harness; N=", N, "emitted=", emitIdx.length, "transitions=", transitions.length, "erasures=", erasures.length, "stride=", STRIDE);
console.log("erasure idx:", erasures.join(","));
