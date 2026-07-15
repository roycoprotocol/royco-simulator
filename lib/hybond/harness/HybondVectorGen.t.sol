// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import { Test, console2 } from "../../lib/forge-std/src/Test.sol";

import { RoycoDayAccountant } from "../../src/accountant/RoycoDayAccountant.sol";
import { IRoycoDayAccountant } from "../../src/interfaces/IRoycoDayAccountant.sol";
import { StaticCurveYDM } from "../../src/ydm/StaticCurveYDM.sol";
import { MarketState, SyncedAccountingState, Operation } from "../../src/libraries/Types.sol";
import { NAV_UNIT, toNAVUnits } from "../../src/libraries/Units.sol";
import { ERC1967Proxy } from "../../lib/openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @dev HYBond vector generator (group "F"). Drives the REAL RoycoDayAccountant over the
/// srHYBond simulator's ACTUAL 61-point monthly NAV series (BNY Mellon Global Short-Dated
/// High Yield Bond Fund, 2020-06 = 100 .. 2025-06 ~= 142.20) using HYBond's DEFAULT params
/// (depositST 1000, depositJT 500, seniorShareToJuniorPct 53, observationDays 30,
/// minCoveragePct 30 -- see lib/hybond/scenarios.ts / lib/try/scenarios.ts).
///
/// The raw-NAV driving replicates lib/try/backtest.ts EXACTLY:
///   stRaw_i = floor(stNav0 * price_i / price_0)              (Senior: fixed capital)
///   jtRaw_0 = jtNav0 ; jtRaw_i = floor(jtCarry * price_i / price_{i-1})   (Junior: carried)
/// with jtCarry = the accountant's returned jtRawNAV. Junior replenishment
/// (maintainJuniorCoverage) is a SIMULATOR-level product assumption and is deliberately
/// NOT exercised here: this harness proves the raw engine sync path only.
///
/// Prices/dts below are literals emitted from lib/hybond/scenarios.ts (toPriceWad + month-start
/// deltas), so the Solidity inputs are bit-identical to the TypeScript ones.
contract HybondVectorGenTest is Test {
    address internal kernel;

    StaticCurveYDM internal jtYDM;
    StaticCurveYDM internal ltYDM;

    uint256 internal constant ST_NAV0 = 1000e18; // depositST 1000
    uint256 internal constant JT_NAV0 = 500e18; // depositJT 500

    string internal json;
    uint256 internal clock;

    function setUp() public {
        kernel = makeAddr("kernel");
        vm.warp(1_000_000);
    }

    function _deploy() internal returns (RoycoDayAccountant acct) {
        jtYDM = new StaticCurveYDM(0.9e18);
        ltYDM = new StaticCurveYDM(0.9e18);

        RoycoDayAccountant impl = new RoycoDayAccountant(kernel, true);

        IRoycoDayAccountant.RoycoDayAccountantInitParams memory p = IRoycoDayAccountant.RoycoDayAccountantInitParams({
            minCoverageWAD: uint64(0.3e18), // minCoveragePct 30
            coverageLiquidationUtilizationWAD: 2e18,
            minLiquidityWAD: 0,
            jtYDM: address(jtYDM),
            jtYDMInitializationData: abi.encodeCall(
                StaticCurveYDM.initializeYDMForMarket, (uint64(0.53e18), uint64(0.53e18), uint64(0.53e18))
            ),
            ltYDM: address(ltYDM),
            ltYDMInitializationData: abi.encodeCall(StaticCurveYDM.initializeYDMForMarket, (uint64(1), uint64(1), uint64(1))),
            maxJTYieldShareWAD: uint64(1e18),
            maxLTYieldShareWAD: 0,
            fixedTermDurationSeconds: uint24(2_592_000), // observationDays 30
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
        uint256[61] memory prices = [
            uint256(100000000000000000000), 101458079000000000000, 102633168000000000000, 103001142000000000000,
            103267476000000000000, 105289321000000000000, 106508785000000000000, 107103583000000000000,
            107594644000000000000, 107980406000000000000, 108799295000000000000, 109298130000000000000,
            109690000000000000000, 110260318000000000000, 110943993000000000000, 111298678000000000000,
            111765929000000000000, 111451845000000000000, 112254493000000000000, 111039928000000000000,
            109504986000000000000, 108758712000000000000, 106928638000000000000, 105985810000000000000,
            103459608000000000000, 106198722000000000000, 106670620000000000000, 105221780000000000000,
            106637696000000000000, 108393038000000000000, 108983236000000000000, 111322888000000000000,
            111706072000000000000, 112426176000000000000, 113713862000000000000, 114560786000000000000,
            116102372000000000000, 117634062000000000000, 118479322000000000000, 118856181000000000000,
            119353234000000000000, 121644774000000000000, 123614947000000000000, 124750704000000000000,
            125771999000000000000, 127053495000000000000, 127712033000000000000, 129013296000000000000,
            130069487000000000000, 131529372000000000000, 132873954000000000000, 134232280000000000000,
            135066913000000000000, 136177196000000000000, 136887580000000000000, 138286937000000000000,
            139285235000000000000, 139872378000000000000, 139341661000000000000, 140905615000000000000,
            142204971000000000000
        ];
        uint256[61] memory dts = [
            uint256(0), 2592000, 2678400, 2678400,
            2592000, 2678400, 2592000, 2678400,
            2678400, 2419200, 2678400, 2592000,
            2678400, 2592000, 2678400, 2678400,
            2592000, 2678400, 2592000, 2678400,
            2678400, 2419200, 2678400, 2592000,
            2678400, 2592000, 2678400, 2678400,
            2592000, 2678400, 2592000, 2678400,
            2678400, 2419200, 2678400, 2592000,
            2678400, 2592000, 2678400, 2678400,
            2592000, 2678400, 2592000, 2678400,
            2678400, 2505600, 2678400, 2592000,
            2678400, 2592000, 2678400, 2678400,
            2592000, 2678400, 2592000, 2678400,
            2678400, 2419200, 2678400, 2592000,
            2678400
        ];

        RoycoDayAccountant acct = _deploy();
        _genesis(acct);

        uint256 price0 = prices[0];
        uint256 jtCarry = JT_NAV0;
        uint256 prevPrice = price0;

        for (uint256 i = 0; i < prices.length; i++) {
            uint256 dtSec = dts[i];
            if (dtSec > 0) {
                clock += dtSec;
                vm.warp(clock);
            }
            uint256 stRaw = ST_NAV0 * prices[i] / price0;
            uint256 jtRaw = i == 0 ? JT_NAV0 : jtCarry * prices[i] / prevPrice;

            vm.prank(kernel);
            SyncedAccountingState memory s = acct.preOpSyncTrancheAccounting(toNAVUnits(stRaw), toNAVUnits(jtRaw));

            _record("F", string.concat("F_hybond_", vm.toString(i + 1)), stRaw, jtRaw, prices[i], dtSec, s);
            _checkConservation(s, string.concat("F_hybond_", vm.toString(i + 1)));

            jtCarry = NAV_UNIT.unwrap(s.jtRawNAV);
            prevPrice = prices[i];
        }

        string memory out = string.concat("[", json, "]");
        vm.writeFile("output/hybond-vectors-out.json", out);
        console2.log("=== WROTE output/hybond-vectors-out.json ===");
    }

    function _marketStateStr(MarketState ms) internal pure returns (string memory) {
        return ms == MarketState.PERPETUAL ? "PERPETUAL" : "FIXED_TERM";
    }

    function _record(
        string memory group,
        string memory label,
        uint256 stRawIn,
        uint256 jtRawIn,
        uint256 priceWad,
        uint256 dtSec,
        SyncedAccountingState memory s
    ) internal {
        uint256 stEff = NAV_UNIT.unwrap(s.stEffectiveNAV);
        uint256 jtEff = NAV_UNIT.unwrap(s.jtEffectiveNAV);
        uint256 il = NAV_UNIT.unwrap(s.jtCoverageImpermanentLoss);
        uint256 u = s.coverageUtilizationWAD;
        string memory ms = _marketStateStr(s.marketState);

        console2.log("---");
        console2.log(string.concat(group, " / ", label));
        console2.log("  stRawIn", stRawIn);
        console2.log("  jtRawIn", jtRawIn);
        console2.log("  stEff  ", stEff);
        console2.log("  jtEff  ", jtEff);
        console2.log("  IL     ", il);
        console2.log("  U(WAD) ", u);
        console2.log("  state  ", ms);

        string memory obj = string.concat(
            "{\"group\":\"", group, "\",\"label\":\"", label, "\",",
            "\"inputs\":{\"stRaw\":\"", vm.toString(stRawIn), "\",\"jtRaw\":\"", vm.toString(jtRawIn),
            "\",\"priceWad\":\"", vm.toString(priceWad), "\",\"dtSec\":\"", vm.toString(dtSec), "\"},",
            "\"outputs\":{\"stEff\":\"", vm.toString(stEff), "\",\"jtEff\":\"", vm.toString(jtEff),
            "\",\"il\":\"", vm.toString(il), "\",\"coverageUtilWad\":\"", vm.toString(u),
            "\",\"marketState\":\"", ms, "\"}}"
        );
        if (bytes(json).length == 0) json = obj;
        else json = string.concat(json, ",", obj);
    }

    function _checkConservation(SyncedAccountingState memory s, string memory label) internal pure {
        uint256 rawSum = NAV_UNIT.unwrap(s.stRawNAV) + NAV_UNIT.unwrap(s.jtRawNAV);
        uint256 effSum = NAV_UNIT.unwrap(s.stEffectiveNAV) + NAV_UNIT.unwrap(s.jtEffectiveNAV);
        if (rawSum != effSum) {
            revert(string.concat("CONSERVATION VIOLATION at ", label));
        }
    }
}
