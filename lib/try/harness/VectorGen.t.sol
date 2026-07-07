// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import { Test, console2 } from "../../lib/forge-std/src/Test.sol";

import { RoycoDayAccountant } from "../../src/accountant/RoycoDayAccountant.sol";
import { IRoycoDayAccountant } from "../../src/interfaces/IRoycoDayAccountant.sol";
import { StaticCurveYDM } from "../../src/ydm/StaticCurveYDM.sol";
import { MarketState, SyncedAccountingState, Operation } from "../../src/libraries/Types.sol";
import { NAV_UNIT, toNAVUnits } from "../../src/libraries/Units.sol";
import { UtilsLib } from "../../src/libraries/UtilsLib.sol";
import { ERC1967Proxy } from "../../lib/openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @dev Thin wrapper to expose the internal pure `computeCoverageUtilization` for Group B.
contract UtilsConsumer {
    function computeCoverageUtilization(
        uint256 stRaw,
        uint256 jtRaw,
        bool jtCoinvested,
        uint256 minCovWAD,
        uint256 jtEff
    ) external pure returns (uint256) {
        return UtilsLib.computeCoverageUtilization(toNAVUnits(stRaw), toNAVUnits(jtRaw), jtCoinvested, minCovWAD, toNAVUnits(jtEff));
    }
}

contract VectorGenTest is Test {
    address internal constant KERNEL = address(0); // set in setUp via makeAddr
    address internal kernel;

    RoycoDayAccountant internal accountant;
    StaticCurveYDM internal jtYDM;
    StaticCurveYDM internal ltYDM;

    uint256 internal constant BASE = 1e18;
    uint256 internal constant ST_SHARES = 1000;
    uint256 internal constant JT_SHARES = 500;

    string internal json; // accumulated JSON array body

    // Single monotonically-increasing wall clock driving every vector sequence. Foundry does not
    // reliably persist block.timestamp across the many sub-calls in this one big test (reads reset
    // to the setUp value), which previously froze Group D at a constant 3_592_000 and made time
    // never elapse. We thread an explicit clock instead: _resetClock() at the start of each fresh
    // market/case, then each step does `clock += dtSec; vm.warp(clock)` so consecutive syncs are
    // genuinely dtSec apart and time never resets or goes backward within a sequence.
    uint256 internal clock;

    function setUp() public {
        kernel = makeAddr("kernel");
        vm.warp(1_000_000); // start at a sane non-zero timestamp
    }

    // Re-anchor the monotonic clock at the start of every fresh-market case.
    function _resetClock() internal {
        clock = 1_000_000;
        vm.warp(clock);
    }

    // ---- deploy helper (fresh market) ----
    function _deploy() internal returns (RoycoDayAccountant acct) {
        jtYDM = new StaticCurveYDM(0.9e18);
        ltYDM = new StaticCurveYDM(0.9e18);

        RoycoDayAccountant impl = new RoycoDayAccountant(kernel, true);

        IRoycoDayAccountant.RoycoDayAccountantInitParams memory p = IRoycoDayAccountant.RoycoDayAccountantInitParams({
            minCoverageWAD: uint64(0.3e18),
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
            fixedTermDurationSeconds: uint24(2_592_000),
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

    // Seed the market's effective-NAV checkpoints via post-op deposits (genesis).
    // A cold pre-op sync would attribute the entire arriving raw NAV as PNL against a zero
    // effective baseline, so the effective NAVs must first be established through deposits.
    // JT is deposited first (loss-absorption buffer) then ST (protected exposure), each as a
    // single-tranche post-op sync at price 1.0.
    function _genesis(RoycoDayAccountant acct) internal {
        // Re-anchor the monotonic clock for this fresh market so genesis deposits and the first
        // step both start from 1_000_000 (== engine startTimestamp).
        _resetClock();
        uint256 st = _stRaw(1e18); // 1000e18
        uint256 jt = _jtRaw(1e18); // 500e18
        // JT deposit: jtRaw 0 -> 500, stRaw 0
        vm.prank(kernel);
        acct.postOpSyncTrancheAccounting(
            Operation.JT_DEPOSIT, toNAVUnits(uint256(0)), toNAVUnits(jt), toNAVUnits(uint256(0)), toNAVUnits(uint256(0)), false
        );
        // ST deposit: stRaw 0 -> 1000, jtRaw stays 500
        vm.prank(kernel);
        acct.postOpSyncTrancheAccounting(
            Operation.ST_DEPOSIT, toNAVUnits(st), toNAVUnits(jt), toNAVUnits(uint256(0)), toNAVUnits(uint256(0)), false
        );
    }

    function _stRaw(uint256 priceWad) internal pure returns (uint256) {
        return (ST_SHARES * BASE) * priceWad / BASE;
    }

    function _jtRaw(uint256 priceWad) internal pure returns (uint256) {
        return (JT_SHARES * BASE) * priceWad / BASE;
    }

    // External wrapper: used ONLY for the single deferred C5 case that can revert. A raw external boundary
    // lets the harness catch that one revert without aborting. It is invoked exactly once, last, so the
    // catch can never poison a subsequent step (catching a revert mid-run corrupts later try/catch under forge).
    function syncExternal(RoycoDayAccountant acct, uint256 st, uint256 jt) external returns (SyncedAccountingState memory s) {
        require(msg.sender == address(this), "internal");
        vm.prank(kernel);
        s = acct.preOpSyncTrancheAccounting(toNAVUnits(st), toNAVUnits(jt));
    }

    // Perform a sync step at a given price, warping dt seconds first, and record. Direct call: reverts abort the run.
    function _step(
        RoycoDayAccountant acct,
        string memory group,
        string memory label,
        uint256 priceWad,
        uint256 dtSec
    ) internal returns (SyncedAccountingState memory s) {
        if (dtSec > 0) {
            clock += dtSec;
            vm.warp(clock);
        }
        uint256 st = _stRaw(priceWad);
        uint256 jt = _jtRaw(priceWad);
        vm.prank(kernel);
        s = acct.preOpSyncTrancheAccounting(toNAVUnits(st), toNAVUnits(jt));
        _record(group, label, st, jt, priceWad, dtSec, s);
    }

    // Deferred, catchable variant for the single C5 case. Returns ok=false and records a revert marker if it reverts.
    function _stepCatch(
        RoycoDayAccountant acct,
        string memory group,
        string memory label,
        uint256 priceWad,
        uint256 dtSec
    ) internal returns (bool ok, SyncedAccountingState memory s) {
        if (dtSec > 0) {
            clock += dtSec;
            vm.warp(clock);
        }
        uint256 st = _stRaw(priceWad);
        uint256 jt = _jtRaw(priceWad);
        try this.syncExternal(acct, st, jt) returns (SyncedAccountingState memory r) {
            s = r;
            ok = true;
            _record(group, label, st, jt, priceWad, dtSec, s);
        } catch (bytes memory) {
            ok = false;
            _recordRevert(group, label, st, jt, priceWad, dtSec);
        }
    }

    function _recordRevert(
        string memory group,
        string memory label,
        uint256 stRawIn,
        uint256 jtRawIn,
        uint256 priceWad,
        uint256 dtSec
    ) internal {
        console2.log("---");
        console2.log(string.concat(group, " / ", label, "  >>> REVERTED (accountant panic)"));
        string memory obj = string.concat(
            "{\"group\":\"", group, "\",\"label\":\"", label, "\",",
            "\"inputs\":{\"stRaw\":\"", vm.toString(stRawIn), "\",\"jtRaw\":\"", vm.toString(jtRawIn),
            "\",\"priceWad\":\"", vm.toString(priceWad), "\",\"dtSec\":\"", vm.toString(dtSec), "\"},",
            "\"outputs\":{\"revert\":true}}"
        );
        if (bytes(json).length == 0) json = obj;
        else json = string.concat(json, ",", obj);
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

    function _recordScalar(
        string memory group,
        string memory label,
        uint256 value
    ) internal {
        console2.log("---");
        console2.log(string.concat(group, " / ", label), value);
        string memory obj = string.concat(
            "{\"group\":\"", group, "\",\"label\":\"", label, "\",",
            "\"inputs\":{},\"outputs\":{\"value\":\"", vm.toString(value), "\"}}"
        );
        if (bytes(json).length == 0) json = obj;
        else json = string.concat(json, ",", obj);
    }

    function test_GenerateVectors() public {
        // ===================== GROUP A: YDM curve =====================
        {
            RoycoDayAccountant acct = _deploy();
            uint256[6] memory us = [uint256(0), 0.45e18, 0.9e18, 0.95e18, 1.0e18, 1.5e18];
            for (uint256 i = 0; i < us.length; i++) {
                vm.prank(address(acct));
                uint256 y = jtYDM.previewYieldShare(MarketState.PERPETUAL, us[i]);
                _recordScalar("A", string.concat("ydm_U_", vm.toString(us[i])), y);
            }
        }

        // ===================== GROUP B: coverage utilization =====================
        {
            UtilsConsumer c = new UtilsConsumer();
            _recordScalar("B", "cov_1000_500_500", c.computeCoverageUtilization(1000e18, 500e18, true, 0.3e18, 500e18));
            _recordScalar("B", "cov_700_300_300", c.computeCoverageUtilization(700e18, 300e18, true, 0.3e18, 300e18));
            _recordScalar("B", "cov_minCov0", c.computeCoverageUtilization(1000e18, 500e18, true, 0, 500e18));
            _recordScalar("B", "cov_jtEff0_exposure", c.computeCoverageUtilization(1000e18, 500e18, true, 0.3e18, 0));
            _recordScalar("B", "cov_zero_exposure", c.computeCoverageUtilization(0, 0, true, 0.3e18, 1));
        }

        // ===================== GROUP C: single-sync waterfall =====================
        // C0/genesis sanity on a standalone market
        {
            RoycoDayAccountant acct = _deploy();
            _genesis(acct);
            SyncedAccountingState memory g = _step(acct, "C", "C0_genesis", 1e18, 0);
            require(g.coverageUtilizationWAD == 0.9e18, "GENESIS U != 0.9e18");
            _checkConservation(g, "C0_genesis");
        }
        // C1 flat
        {
            RoycoDayAccountant acct = _deploy();
            _genesis(acct);
            SyncedAccountingState memory s = _step(acct, "C", "C1_flat_30d", 1e18, 30 days);
            _checkConservation(s, "C1_flat");
        }
        // C2 up +10%
        {
            RoycoDayAccountant acct = _deploy();
            _genesis(acct);
            SyncedAccountingState memory s = _step(acct, "C", "C2_up10_30d", 1.1e18, 30 days);
            _checkConservation(s, "C2_up10");
        }
        // C3 down -10%
        {
            RoycoDayAccountant acct = _deploy();
            _genesis(acct);
            SyncedAccountingState memory s = _step(acct, "C", "C3_down10_30d", 0.9e18, 30 days);
            _checkConservation(s, "C3_down10");
        }
        // C4 down then partial recover
        {
            RoycoDayAccountant acct = _deploy();
            _genesis(acct);
            _step(acct, "C", "C4_down10_30d", 0.9e18, 30 days);
            SyncedAccountingState memory s = _step(acct, "C", "C4_recover95_5d", 0.95e18, 5 days);
            _checkConservation(s, "C4_recover95");
        }
        // C5 is deferred to the very end: it can trigger an accountant revert, and catching a revert
        // mid-transaction poisons subsequent try/catch in the same test (foundry limitation), so it must be last.
        // C6 deep -60%
        {
            RoycoDayAccountant acct = _deploy();
            _genesis(acct);
            SyncedAccountingState memory s = _step(acct, "C", "C6_down60_30d", 0.4e18, 30 days);
            _checkConservation(s, "C6_down60");
        }
        // C7 term elapses
        {
            RoycoDayAccountant acct = _deploy();
            _genesis(acct);
            _step(acct, "C", "C7_down10_30d", 0.9e18, 30 days);
            // warp past the fixed term (duration 2_592_000s == 30 days) plus a day
            SyncedAccountingState memory s = _step(acct, "C", "C7_termElapsed_flat", 0.9e18, 31 days);
            _checkConservation(s, "C7_termElapsed");
        }

        // ===================== GROUP D: multi-sync backtest =====================
        {
            RoycoDayAccountant acct = _deploy();
            _genesis(acct);
            uint256[12] memory prices = [
                uint256(1.00e18), 1.02e18, 1.05e18, 1.03e18, 1.08e18, 0.98e18,
                0.95e18, 1.01e18, 1.06e18, 1.10e18, 1.04e18, 1.12e18
            ];
            for (uint256 i = 0; i < prices.length; i++) {
                SyncedAccountingState memory s =
                    _step(acct, "D", string.concat("D_step_", vm.toString(i + 1)), prices[i], 30 days);
                _checkConservation(s, string.concat("D_step_", vm.toString(i + 1)));
            }
        }

        // ===================== C5 (deferred, may revert) =====================
        // C5 down then full recover in-term. Placed last: if it reverts, the catch cannot poison any later step.
        {
            RoycoDayAccountant acct = _deploy();
            _genesis(acct);
            _step(acct, "C", "C5_down10_30d", 0.9e18, 30 days);
            (bool ok, SyncedAccountingState memory s) = _stepCatch(acct, "C", "C5_recover105_5d", 1.05e18, 5 days);
            if (ok) _checkConservation(s, "C5_recover105");
        }

        // ===================== GROUP E: FIXED_TERM boundary adversarial =====================
        // These stress the APPLY_MARKET_STATE_TRANSITION boundary: the exact `<=` vs `<`
        // term-elapse comparison, and whether the fixed-term end timestamp re-anchors on every
        // fixed-term sync or only on the PERPETUAL->FIXED_TERM entry.
        uint256 TERM_S = 2_592_000; // fixedTermDurationSeconds (== 30 days)

        // E1: enter FIXED_TERM (down -10%); then FIVE consecutive flat/underwater syncs, each dt=TERM.
        {
            RoycoDayAccountant acct = _deploy();
            _genesis(acct);
            SyncedAccountingState memory s = _step(acct, "E", "E1_enter_down10", 0.9e18, TERM_S);
            _checkConservation(s, "E1_enter");
            for (uint256 i = 1; i <= 5; i++) {
                s = _step(acct, "E", string.concat("E1_flat_", vm.toString(i)), 0.9e18, TERM_S);
                _checkConservation(s, string.concat("E1_flat_", vm.toString(i)));
            }
        }

        // E2: down -10%; then one sync at dt = TERM - 1 (one second BEFORE term end), flat 0.9.
        {
            RoycoDayAccountant acct = _deploy();
            _genesis(acct);
            _step(acct, "E", "E2_enter_down10", 0.9e18, TERM_S);
            SyncedAccountingState memory s = _step(acct, "E", "E2_before_end", 0.9e18, TERM_S - 1);
            _checkConservation(s, "E2_before_end");
        }

        // E3: down -10%; then one sync at dt = TERM (EXACTLY term end), flat 0.9. (settles < vs <=)
        {
            RoycoDayAccountant acct = _deploy();
            _genesis(acct);
            _step(acct, "E", "E3_enter_down10", 0.9e18, TERM_S);
            SyncedAccountingState memory s = _step(acct, "E", "E3_at_end", 0.9e18, TERM_S);
            _checkConservation(s, "E3_at_end");
        }

        // E4: down -10%; then one sync at dt = TERM + 1 (one second AFTER), flat 0.9. IL erased?
        {
            RoycoDayAccountant acct = _deploy();
            _genesis(acct);
            _step(acct, "E", "E4_enter_down10", 0.9e18, TERM_S);
            SyncedAccountingState memory s = _step(acct, "E", "E4_after_end", 0.9e18, TERM_S + 1);
            _checkConservation(s, "E4_after_end");
        }

        // E5: down -10%; sync dt=1000000 (partial, still under water); then sync dt=2000000
        // (cumulative 3000000 > TERM from ORIGINAL entry, but each individual sync < TERM).
        // Discriminates "re-anchor every sync" from "anchor on entry".
        {
            RoycoDayAccountant acct = _deploy();
            _genesis(acct);
            _step(acct, "E", "E5_enter_down10", 0.9e18, TERM_S);
            _step(acct, "E", "E5_partial_1e6", 0.9e18, 1_000_000);
            SyncedAccountingState memory s = _step(acct, "E", "E5_partial_2e6", 0.9e18, 2_000_000);
            _checkConservation(s, "E5_partial_2e6");
        }

        // E6 (deferred, recovery may revert): down -10%; recover fully to 1.10 at dt=TERM-1
        // (IL->0, should go PERPETUAL); then down -10% again dt=100 (fresh FIXED_TERM entry) --
        // confirm a new term anchor. The full in-term recovery sync can hit the same accountant
        // revert path as C5, so it uses the catchable variant and is placed last.
        {
            RoycoDayAccountant acct = _deploy();
            _genesis(acct);
            _step(acct, "E", "E6_enter_down10", 0.9e18, TERM_S);
            (bool ok, SyncedAccountingState memory s) = _stepCatch(acct, "E", "E6_recover110", 1.10e18, TERM_S - 1);
            if (ok) {
                _checkConservation(s, "E6_recover110");
                s = _step(acct, "E", "E6_reenter_down10", 0.9e18, 100);
                _checkConservation(s, "E6_reenter_down10");
            }
        }

        // ===================== write JSON =====================
        string memory out = string.concat("[", json, "]");
        vm.writeFile("output/vectors-out.json", out);
        console2.log("=== WROTE output/vectors-out.json ===");
    }

    function _checkConservation(SyncedAccountingState memory s, string memory label) internal pure {
        uint256 rawSum = NAV_UNIT.unwrap(s.stRawNAV) + NAV_UNIT.unwrap(s.jtRawNAV);
        uint256 effSum = NAV_UNIT.unwrap(s.stEffectiveNAV) + NAV_UNIT.unwrap(s.jtEffectiveNAV);
        // Allow zero tolerance (dust tolerances are 0 in this config).
        if (rawSum != effSum) {
            revert(string.concat("CONSERVATION VIOLATION at ", label));
        }
    }
}
