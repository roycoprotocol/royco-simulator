// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

// Copied to royco-day/test/vectors/ by generate-day-vectors.mjs. Imports are
// intentionally relative to that destination.
import { Math } from "../../lib/openzeppelin-contracts/contracts/utils/math/Math.sol";
import { IRoycoDayAccountant } from "../../src/interfaces/IRoycoDayAccountant.sol";
import { StaticCurveYDM } from "../../src/ydm/StaticCurveYDM.sol";
import { AssetClaims, MarketState, Operation, SyncedAccountingState } from "../../src/libraries/Types.sol";
import { NAV_UNIT, toNAVUnits, toTrancheUnits, toUint256 } from "../../src/libraries/Units.sol";
import { FeeAndLiquidityPremiumLogic } from "../../src/libraries/logic/FeeAndLiquidityPremiumLogic.sol";
import { UtilizationLogic } from "../../src/libraries/logic/UtilizationLogic.sol";
import { ValuationLogic } from "../../src/libraries/logic/ValuationLogic.sol";
import { AccountantTestBase } from "../utils/AccountantTestBase.sol";
import { FeeAndLiquidityPremiumHarness } from "../mocks/FeeAndLiquidityPremiumHarness.sol";
import { SelfLiquidationHarness } from "../mocks/SelfLiquidationHarness.sol";

contract DayVectorLogicExposer {
    function coverageUtilization(uint256 collateral, uint256 minCoverageWAD, uint256 jtEffective) external pure returns (uint256) {
        return UtilizationLogic._computeCoverageUtilization(toNAVUnits(collateral), minCoverageWAD, toNAVUnits(jtEffective));
    }

    function liquidityUtilization(uint256 stEffective, uint256 minLiquidityWAD, uint256 lptRaw) external pure returns (uint256) {
        return UtilizationLogic._computeLiquidityUtilization(toNAVUnits(stEffective), minLiquidityWAD, toNAVUnits(lptRaw));
    }

    function sharesForValue(uint256 value, uint256 totalValue, uint256 supply) external pure returns (uint256) {
        return ValuationLogic._convertToShares(toNAVUnits(value), toNAVUnits(totalValue), supply, Math.Rounding.Floor);
    }

    function feePremiumShares(
        uint256 stEffective,
        uint256 premium,
        uint256 stFee,
        uint256 lptFee,
        uint256 supply
    )
        external
        pure
        returns (uint256 premiumShares, uint256 feeShares, uint256 supplyAfter)
    {
        SyncedAccountingState memory s;
        s.stEffectiveNAV = toNAVUnits(stEffective);
        s.lptLiquidityPremium = toNAVUnits(premium);
        s.stProtocolFee = toNAVUnits(stFee);
        s.lptProtocolFee = toNAVUnits(lptFee);
        return FeeAndLiquidityPremiumLogic._computeSTFeeAndLiquidityPremiumSharesToMint(s, supply);
    }
}

/// @dev Initializes a real StaticCurveYDM for itself, then keeps calls under
/// the same msg.sender key used by the model's per-market mapping.
contract StaticYDMVectorCaller {
    StaticCurveYDM internal immutable ydm;

    constructor() {
        ydm = new StaticCurveYDM(0.9e18);
        ydm.initializeYDMForMarket(0.53e18, 0.53e18, 0.53e18);
    }

    function preview(uint256 utilizationWAD) external view returns (uint256) {
        return ydm.previewYieldShare(MarketState.PERPETUAL, utilizationWAD);
    }
}

contract DayVectorGenTest is AccountantTestBase {
    string internal coreVectors;
    string internal vectors;
    uint256 internal coreClock;

    function testGenerateDaySolidityVectors() public {
        _coreVectors();
        _logicVectors();
        _syncAndFeeVectors();
        _postOperationVectors();
        _operationGateVectors();
        _premiumStagingVectors();
        _selfLiquidationVector();
        vm.writeFile("output/day-core-vectors.raw.json", string.concat("[", coreVectors, "]"));
        vm.writeFile("output/day-solidity-vectors.raw.json", string.concat("[", vectors, "]"));
    }

    function _appendCore(string memory group, string memory label, string memory inputs, string memory outputs) internal {
        string memory row = string(
            abi.encodePacked(
                '{"group":"', group, '","label":"', label,
                '","inputs":', inputs, ',"outputs":', outputs, '}'
            )
        );
        coreVectors = bytes(coreVectors).length == 0 ? row : string.concat(coreVectors, ",", row);
    }

    function _append(string memory id, string memory group, string memory kind, string memory inputs, string memory outputs) internal {
        string memory row = string(
            abi.encodePacked(
                '{"id":"', id, '","group":"', group, '","kind":"', kind,
                '","inputs":', inputs, ',"outputs":', outputs, '}'
            )
        );
        vectors = bytes(vectors).length == 0 ? row : string.concat(vectors, ",", row);
    }

    function _q(uint256 value) internal view returns (string memory) {
        return string.concat('"', vm.toString(value), '"');
    }

    /*//////////////////////////////////////////////////////////////////////
                                CORE 52
    //////////////////////////////////////////////////////////////////////*/

    function _coreVectors() internal {
        DayVectorLogicExposer x = new DayVectorLogicExposer();
        StaticYDMVectorCaller ydmCaller = new StaticYDMVectorCaller();
        uint256[6] memory utilizations = [uint256(0), 0.45e18, 0.9e18, 0.95e18, 1e18, 1.5e18];
        for (uint256 i; i < utilizations.length; ++i) {
            uint256 u = utilizations[i];
            _appendCore("A", string.concat("ydm_U_", vm.toString(u)), "{}", string(abi.encodePacked('{"value":', _q(ydmCaller.preview(u)), '}')));
        }

        _coreCoverage(x, "cov_1000_500_500", 1500e18, 0.3e18, 500e18);
        _coreCoverage(x, "cov_700_300_300", 1000e18, 0.3e18, 300e18);
        _coreCoverage(x, "cov_minCov0", 1500e18, 0, 500e18);
        _coreCoverage(x, "cov_jtEff0_exposure", 1500e18, 0.3e18, 0);
        _coreCoverage(x, "cov_zero_exposure", 0, 0.3e18, 1);

        _coreFresh();
        _coreStep("C", "C0_genesis", 1e18, 0);
        _coreFresh();
        _coreStep("C", "C1_flat_30d", 1e18, 30 days);
        _coreFresh();
        _coreStep("C", "C2_up10_30d", 1.1e18, 30 days);
        _coreFresh();
        _coreStep("C", "C3_down10_30d", 0.9e18, 30 days);

        _coreFresh();
        _coreStep("C", "C4_down10_30d", 0.9e18, 30 days);
        _coreStep("C", "C4_recover95_5d", 0.95e18, 5 days);

        _coreFresh();
        _coreStep("C", "C6_down60_30d", 0.4e18, 30 days);

        _coreFresh();
        _coreStep("C", "C7_down10_30d", 0.9e18, 30 days);
        _coreStep("C", "C7_termElapsed_flat", 0.9e18, 31 days);

        _coreFresh();
        uint256[12] memory prices = [
            uint256(1e18), 1.02e18, 1.05e18, 1.03e18, 1.08e18, 0.98e18,
            0.95e18, 1.01e18, 1.06e18, 1.1e18, 1.04e18, 1.12e18
        ];
        for (uint256 i; i < prices.length; ++i) {
            _coreStep("D", string.concat("D_step_", vm.toString(i + 1)), prices[i], 30 days);
        }

        _coreFresh();
        _coreStep("C", "C5_down10_30d", 0.9e18, 30 days);
        _coreStep("C", "C5_recover105_5d", 1.05e18, 5 days);

        _coreFresh();
        _coreStep("E", "E1_enter_down10", 0.9e18, 30 days);
        for (uint256 i = 1; i <= 5; ++i) {
            _coreStep("E", string.concat("E1_flat_", vm.toString(i)), 0.9e18, 30 days);
        }

        _coreFresh();
        _coreStep("E", "E2_enter_down10", 0.9e18, 30 days);
        _coreStep("E", "E2_before_end", 0.9e18, 30 days - 1);

        _coreFresh();
        _coreStep("E", "E3_enter_down10", 0.9e18, 30 days);
        _coreStep("E", "E3_at_end", 0.9e18, 30 days);

        _coreFresh();
        _coreStep("E", "E4_enter_down10", 0.9e18, 30 days);
        _coreStep("E", "E4_after_end", 0.9e18, 30 days + 1);

        _coreFresh();
        _coreStep("E", "E5_enter_down10", 0.9e18, 30 days);
        _coreStep("E", "E5_partial_1e6", 0.9e18, 1_000_000);
        _coreStep("E", "E5_partial_2e6", 0.9e18, 2_000_000);

        _coreFresh();
        _coreStep("E", "E6_enter_down10", 0.9e18, 30 days);
        _coreStep("E", "E6_recover110", 1.1e18, 30 days - 1);
        _coreStep("E", "E6_reenter_down10", 0.9e18, 100);
    }

    function _coreCoverage(
        DayVectorLogicExposer x,
        string memory label,
        uint256 collateral,
        uint256 minCoverageWAD,
        uint256 jtEffective
    )
        internal
    {
        _appendCore(
            "B",
            label,
            "{}",
            string(abi.encodePacked('{"value":', _q(x.coverageUtilization(collateral, minCoverageWAD, jtEffective)), '}'))
        );
    }

    function _coreFresh() internal {
        vm.warp(1_000_000);
        IRoycoDayAccountant.RoycoDayAccountantInitParams memory p = _defaultParams();
        p.minCoverageWAD = 0.3e18;
        p.coverageLiquidationUtilizationWAD = 2e18;
        p.minLiquidityWAD = 0;
        p.maxJTYieldShareWAD = 1e18;
        p.maxLPTYieldShareWAD = 0;
        p.fixedTermDurationSeconds = 30 days;
        p.stProtocolFeeWAD = 0;
        p.jtProtocolFeeWAD = 0;
        p.jtYieldShareProtocolFeeWAD = 0;
        p.lptYieldShareProtocolFeeWAD = 0;
        _deploy(p);
        _seedState(1000e18, 500e18, 0, 0, MarketState.PERPETUAL);
        jtYDM.setRates(0.53e18);
        lptYDM.setRates(0);
        kernel.doPreOp(toNAVUnits(uint256(1500e18)));
        coreClock = block.timestamp;
    }

    function _coreStep(string memory group, string memory label, uint256 priceWAD, uint256 elapsed) internal {
        coreClock += elapsed;
        vm.warp(coreClock);
        uint256 stRaw = 1000e18 * priceWAD / 1e18;
        uint256 jtRaw = 500e18 * priceWAD / 1e18;
        SyncedAccountingState memory s = kernel.doPreOp(toNAVUnits(stRaw + jtRaw));
        _appendCore(
            group,
            label,
            string(
                abi.encodePacked(
                    '{"stRaw":', _q(stRaw), ',"jtRaw":', _q(jtRaw),
                    ',"priceWad":', _q(priceWAD), ',"dtSec":', _q(elapsed), '}'
                )
            ),
            string(
                abi.encodePacked(
                    '{"stEff":', _q(toUint256(s.stEffectiveNAV)),
                    ',"jtEff":', _q(toUint256(s.jtEffectiveNAV)),
                    ',"il":', _q(toUint256(s.jtImpermanentLoss)),
                    ',"coverageUtilWad":', _q(s.coverageUtilizationWAD),
                    ',"marketState":"', s.marketState == MarketState.PERPETUAL ? "PERPETUAL" : "FIXED_TERM", '"}'
                )
            )
        );
    }

    /*//////////////////////////////////////////////////////////////////////
                              EXTENDED 22
    //////////////////////////////////////////////////////////////////////*/

    function _logicVectors() internal {
        DayVectorLogicExposer x = new DayVectorLogicExposer();
        uint256 st = 1000e18;
        uint256 minLiq = 0.05e18;
        uint256 exactLPT = 50e18;
        _append(
            "liq-util-exact",
            "liquidity-utilization",
            "liquidityUtilization",
            string(abi.encodePacked('{"stEffective":', _q(st), ',"minLiquidityWAD":', _q(minLiq), ',"ltRaw":', _q(exactLPT), '}')),
            string(abi.encodePacked('{"value":', _q(x.liquidityUtilization(st, minLiq, exactLPT)), '}'))
        );
        _append(
            "liq-util-one-wei-short",
            "rounding-boundaries",
            "liquidityUtilization",
            string(abi.encodePacked('{"stEffective":', _q(st), ',"minLiquidityWAD":', _q(minLiq), ',"ltRaw":', _q(exactLPT - 1), '}')),
            string(abi.encodePacked('{"value":', _q(x.liquidityUtilization(st, minLiq, exactLPT - 1)), '}'))
        );

        (uint256 premiumShares, uint256 feeShares, uint256 supplyAfter) =
            x.feePremiumShares(1120e18, 10e18, 5e18, 1e18, 1000e18);
        _append(
            "premium-and-fee-share-mint",
            "premium-share-mint",
            "feePremiumShares",
            '{"stEffective":"1120000000000000000000","premium":"10000000000000000000","stFee":"5000000000000000000","lptFee":"1000000000000000000","supply":"1000000000000000000000"}',
            string(abi.encodePacked('{"premiumShares":', _q(premiumShares), ',"feeShares":', _q(feeShares), ',"supplyAfter":', _q(supplyAfter), '}'))
        );

        uint256 clampShares = x.sharesForValue(1e18, 0, 1e18);
        _append(
            "mint-dilution-clamp",
            "mint-dilution-clamp",
            "sharesForValue",
            '{"value":"1000000000000000000","totalValue":"0","supply":"1000000000000000000"}',
            string(abi.encodePacked('{"shares":', _q(clampShares), '}'))
        );
    }

    function _syncAndFeeVectors() internal {
        IRoycoDayAccountant.RoycoDayAccountantInitParams memory p = _defaultParams();
        _deploy(p);
        _seedAndInitAccrual();
        jtYDM.setRates(0.2e18);
        lptYDM.setRates(0.1e18);
        vm.warp(block.timestamp + 1 days);
        SyncedAccountingState memory s = kernel.doPreOp(toNAVUnits(uint256(1320e18)));
        _append(
            "nonzero-four-fees-sync",
            "nonzero-fees",
            "accountantSync",
            '{"seedST":"1000000000000000000000","seedJT":"200000000000000000000","seedLT":"100000000000000000000","newST":"1100000000000000000000","newJT":"220000000000000000000","jtShareWAD":"200000000000000000","ltShareWAD":"100000000000000000","elapsed":"86400"}',
            _syncOutputs(s, 1100e18, 220e18)
        );

        _isolatedFeeVector("fee-st-only", 0.1e18, 0, 0, 0);
        _isolatedFeeVector("fee-jt-only", 0, 0.1e18, 0, 0);
        _isolatedFeeVector("fee-jt-yield-share-only", 0, 0, 0.1e18, 0);
        _isolatedFeeVector("fee-lpt-yield-share-only", 0, 0, 0, 0.1e18);

        kernel.doCommit(toNAVUnits(uint256(123e18)));
        _append(
            "post-mint-lpt-raw-commit",
            "lt-raw-commit",
            "ltCommit",
            '{"ltRaw":"123000000000000000000"}',
            string(abi.encodePacked('{"lastLTRawNAV":', _q(toUint256(accountant.getState().lastLPTRawNAV)), '}'))
        );
    }

    function _isolatedFeeVector(
        string memory id,
        uint64 stFeeRate,
        uint64 jtFeeRate,
        uint64 jtShareFeeRate,
        uint64 lptShareFeeRate
    )
        internal
    {
        IRoycoDayAccountant.RoycoDayAccountantInitParams memory p = _defaultParams();
        p.stProtocolFeeWAD = stFeeRate;
        p.jtProtocolFeeWAD = jtFeeRate;
        p.jtYieldShareProtocolFeeWAD = jtShareFeeRate;
        p.lptYieldShareProtocolFeeWAD = lptShareFeeRate;
        _deploy(p);
        _seedAndInitAccrual();
        jtYDM.setRates(0.2e18);
        lptYDM.setRates(0.1e18);
        vm.warp(block.timestamp + 1 days);
        SyncedAccountingState memory s = kernel.doPreOp(toNAVUnits(uint256(1320e18)));
        _append(
            id,
            "nonzero-fees",
            "accountantSync",
            string(
                abi.encodePacked(
                    '{"seedST":"1000000000000000000000","seedJT":"200000000000000000000","seedLT":"100000000000000000000",',
                    '"newST":"1100000000000000000000","newJT":"220000000000000000000","jtShareWAD":"200000000000000000","ltShareWAD":"100000000000000000","elapsed":"86400",',
                    '"stFeeRate":', _q(stFeeRate), ',"jtFeeRate":', _q(jtFeeRate), ',"jtShareFeeRate":', _q(jtShareFeeRate), ',"ltShareFeeRate":', _q(lptShareFeeRate), '}'
                )
            ),
            _syncOutputs(s, 1100e18, 220e18)
        );
    }

    function _syncOutputs(SyncedAccountingState memory s, uint256 stRaw, uint256 jtRaw) internal view returns (string memory) {
        return string(
            abi.encodePacked(
                '{"marketState":"', s.marketState == MarketState.PERPETUAL ? "PERPETUAL" : "FIXED_TERM",
                '","stRaw":', _q(stRaw), ',"jtRaw":', _q(jtRaw),
                ',"ltRaw":', _q(toUint256(s.lptRawNAV)), ',"stEffective":', _q(toUint256(s.stEffectiveNAV)),
                ',"jtEffective":', _q(toUint256(s.jtEffectiveNAV)), ',"jtIL":', _q(toUint256(s.jtImpermanentLoss)),
                ',"liquidityPremium":', _q(toUint256(s.lptLiquidityPremium)), ',"stFee":', _q(toUint256(s.stProtocolFee)),
                ',"jtFee":', _q(toUint256(s.jtProtocolFee)), ',"ltFee":', _q(toUint256(s.lptProtocolFee)),
                ',"coverageUtilWAD":', _q(s.coverageUtilizationWAD), ',"liquidityUtilWAD":', _q(s.liquidityUtilizationWAD), '}'
            )
        );
    }

    function _freshSeed() internal {
        _deploy(_defaultParams());
        _seedSymmetric(1000e18, 200e18, 100e18);
    }

    function _postOperationVectors() internal {
        _postSuccess("post-st-deposit", Operation.ST_DEPOSIT, 1100e18, 200e18, 100e18, 0);
        _postSuccess("post-jt-deposit", Operation.JT_DEPOSIT, 1000e18, 250e18, 100e18, 0);
        _postSuccess("post-lpt-deposit", Operation.LPT_DEPOSIT, 1000e18, 200e18, 150e18, 0);
        _postSuccess("post-st-redeem", Operation.ST_REDEMPTION, 900e18, 200e18, 100e18, 0);
        _postSuccess("post-jt-redeem", Operation.JT_REDEMPTION, 1000e18, 150e18, 100e18, 0);
        _postSuccess("post-lpt-redeem", Operation.LPT_REDEMPTION, 1000e18, 200e18, 50e18, 0);
        _postSuccess("post-st-redeem-bonus", Operation.ST_REDEMPTION, 900e18, 199e18, 100e18, 1e18);
    }

    function _postSuccess(string memory id, Operation op, uint256 stRaw, uint256 jtRaw, uint256 lptRaw, uint256 bonus) internal {
        _freshSeed();
        SyncedAccountingState memory s = kernel.doPostOp(op, toNAVUnits(stRaw + jtRaw), toNAVUnits(lptRaw), toNAVUnits(bonus));
        _append(
            id,
            "post-operations",
            "postOp",
            string(
                abi.encodePacked(
                    '{"operation":"', _opName(op), '","seedST":"1000000000000000000000","seedJT":"200000000000000000000","seedLT":"100000000000000000000",',
                    '"stRaw":', _q(stRaw), ',"jtRaw":', _q(jtRaw), ',"ltRaw":', _q(lptRaw), ',"bonus":', _q(bonus), '}'
                )
            ),
            _syncOutputs(s, stRaw, jtRaw)
        );
    }

    function _opName(Operation op) internal pure returns (string memory) {
        if (op == Operation.ST_DEPOSIT) return "ST_DEPOSIT";
        if (op == Operation.ST_REDEMPTION) return "ST_REDEEM";
        if (op == Operation.JT_DEPOSIT) return "JT_DEPOSIT";
        if (op == Operation.JT_REDEMPTION) return "JT_REDEEM";
        if (op == Operation.LPT_DEPOSIT) return "LT_DEPOSIT";
        return "LT_REDEEM";
    }

    function _operationGateVectors() internal {
        _freshSeed();
        SyncedAccountingState memory state = _checkpointState();
        _append(
            "max-st-deposit-coverage-bound",
            "operation-gates",
            "maxSTDeposit",
            '{"collateral":"1200000000000000000000","stEffective":"1000000000000000000000","jtEffective":"200000000000000000000","lptRaw":"100000000000000000000","minCoverageWAD":"100000000000000000","minLiquidityWAD":"50000000000000000","dust":"0"}',
            string(abi.encodePacked('{"max":', _q(toUint256(accountant.maxSTDeposit(state))), '}'))
        );
        _append(
            "max-lpt-withdrawal-liquidity-bound",
            "operation-gates",
            "maxLPTWithdrawal",
            '{"stEffective":"1000000000000000000000","lptRaw":"100000000000000000000","minLiquidityWAD":"50000000000000000","dust":"0"}',
            string(abi.encodePacked('{"max":', _q(toUint256(accountant.maxLPTWithdrawal(state))), '}'))
        );
    }

    function _premiumStagingVectors() internal {
        _premiumStaging("premium-staging-with-fees", 10e18, 1e18);
        _premiumStaging("premium-staging-zero-lpt-premium", 0, 0);
    }

    function _premiumStaging(string memory id, uint256 premium, uint256 lptFee) internal {
        FeeAndLiquidityPremiumHarness h = new FeeAndLiquidityPremiumHarness();
        h.ST_LEDGER().setTotalSupply(1000e18);
        h.JT_LEDGER().setTotalSupply(200e18);
        h.LPT_LEDGER().setTotalSupply(100e18);
        h.setTotalLPTAssets(100e18);
        SyncedAccountingState memory s;
        s.stEffectiveNAV = toNAVUnits(uint256(1120e18));
        s.jtEffectiveNAV = toNAVUnits(uint256(220e18));
        s.lptRawNAV = toNAVUnits(uint256(100e18));
        s.lptLiquidityPremium = toNAVUnits(premium);
        s.stProtocolFee = toNAVUnits(uint256(5e18));
        s.jtProtocolFee = toNAVUnits(uint256(2e18));
        s.lptProtocolFee = toNAVUnits(lptFee);
        h.processFeesAndLiquidityPremium(s);
        _append(
            id,
            "premium-reinvestment",
            "premiumStaging",
            string(
                abi.encodePacked(
                    '{"stEffective":"1120000000000000000000","jtEffective":"220000000000000000000","ltRaw":"100000000000000000000",',
                    '"premium":', _q(premium), ',"stFee":"5000000000000000000","jtFee":"2000000000000000000","ltFee":', _q(lptFee),
                    ',"stSupply":"1000000000000000000000","jtSupply":"200000000000000000000","ltSupply":"100000000000000000000"}'
                )
            ),
            string(
                abi.encodePacked(
                    '{"stSupplyAfter":', _q(h.ST_LEDGER().totalSupply()), ',"jtSupplyAfter":', _q(h.JT_LEDGER().totalSupply()),
                    ',"ltSupplyAfter":', _q(h.LPT_LEDGER().totalSupply()), ',"premiumShares":', _q(h.ST_LEDGER().lastPremiumSharesMinted()),
                    ',"stFeeShares":', _q(h.ST_LEDGER().lastFeeSharesMinted()), ',"jtFeeShares":', _q(h.JT_LEDGER().lastFeeSharesMinted()),
                    ',"ltFeeShares":"0","idlePremiumShares":', _q(h.lptOwnedSeniorTrancheShares()), '}'
                )
            )
        );
    }

    function _selfLiquidationVector() internal {
        SelfLiquidationHarness h = new SelfLiquidationHarness();
        h.setSelfLiquidationBonusWAD(0.01e18);
        SyncedAccountingState memory s;
        s.collateralNAV = toNAVUnits(uint256(1040e18));
        s.stEffectiveNAV = toNAVUnits(uint256(1000e18));
        s.jtEffectiveNAV = toNAVUnits(uint256(40e18));
        s.coverageUtilizationWAD = 5.2e18;
        s.coverageLiquidationUtilizationWAD = 4e18;
        AssetClaims memory claims;
        claims.collateralAssets = toTrancheUnits(uint256(100e18));
        claims.nav = toNAVUnits(uint256(100e18));
        (AssetClaims memory out, NAV_UNIT bonus) = h.applyBonus(s, claims);
        _append(
            "self-liquidation-bonus",
            "self-liquidation",
            "selfLiquidation",
            '{"bonusWAD":"10000000000000000","stEffective":"1000000000000000000000","jtEffective":"40000000000000000000","coverageUtilWAD":"5200000000000000000","liquidationUtilWAD":"4000000000000000000","claimCollateral":"100000000000000000000","claimNAV":"100000000000000000000"}',
            string(abi.encodePacked('{"bonus":', _q(toUint256(bonus)), ',"claimCollateral":', _q(toUint256(out.collateralAssets)), ',"claimNAV":', _q(toUint256(out.nav)), '}'))
        );
    }
}
