// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

// Copied to royco-day/test/vectors/ by generate-day-vectors.mjs. Imports are
// intentionally relative to that destination. Every output below is produced
// by the current Royco Day contracts or their canonical internal libraries.
import { Math } from "../../lib/openzeppelin-contracts/contracts/utils/math/Math.sol";
import { IRoycoDayAccountant } from "../../src/interfaces/IRoycoDayAccountant.sol";
import { AdaptiveCurveYDM_V2 } from "../../src/ydm/AdaptiveCurveYDM_V2.sol";
import { AssetClaims, MarketState, Operation, SyncedAccountingState } from "../../src/libraries/Types.sol";
import { NAV_UNIT, toNAVUnits, toTrancheUnits, toUint256 } from "../../src/libraries/Units.sol";
import { FeeAndLiquidityPremiumLogic } from "../../src/libraries/logic/FeeAndLiquidityPremiumLogic.sol";
import { UtilizationLogic } from "../../src/libraries/logic/UtilizationLogic.sol";
import { ValuationLogic } from "../../src/libraries/logic/ValuationLogic.sol";
import { AccountantTestBase } from "../utils/AccountantTestBase.sol";
import { FeeAndLiquidityPremiumHarness } from "../mocks/FeeAndLiquidityPremiumHarness.sol";
import { SelfLiquidationHarness } from "../mocks/SelfLiquidationHarness.sol";

contract DayVectorLogicExposer {
    function coverageUtilization(uint256 collateralNAV, uint256 minCoverageWAD, uint256 jtEffectiveNAV) external pure returns (uint256) {
        return UtilizationLogic._computeCoverageUtilization(toNAVUnits(collateralNAV), minCoverageWAD, toNAVUnits(jtEffectiveNAV));
    }

    function liquidityUtilization(uint256 stEffectiveNAV, uint256 minLiquidityWAD, uint256 lptRawNAV) external pure returns (uint256) {
        return UtilizationLogic._computeLiquidityUtilization(toNAVUnits(stEffectiveNAV), minLiquidityWAD, toNAVUnits(lptRawNAV));
    }

    function sharesForValue(uint256 value, uint256 totalValue, uint256 supply) external pure returns (uint256) {
        return ValuationLogic._convertToShares(toNAVUnits(value), toNAVUnits(totalValue), supply, Math.Rounding.Floor);
    }

    function valueForShares(uint256 shares, uint256 supply, uint256 totalValue) external pure returns (uint256) {
        return toUint256(ValuationLogic._convertToValue(shares, supply, toNAVUnits(totalValue), Math.Rounding.Floor));
    }

    function feePremiumShares(
        uint256 stEffective,
        uint256 grossPremium,
        uint256 stFee,
        uint256 lptFee,
        uint256 supply
    ) external pure returns (uint256 premiumShares, uint256 feeShares, uint256 supplyAfter) {
        SyncedAccountingState memory s;
        s.stEffectiveNAV = toNAVUnits(stEffective);
        s.lptLiquidityPremium = toNAVUnits(grossPremium);
        s.stProtocolFee = toNAVUnits(stFee);
        s.lptProtocolFee = toNAVUnits(lptFee);
        return FeeAndLiquidityPremiumLogic._computeSTFeeAndLiquidityPremiumSharesToMint(s, supply);
    }
}

contract DayVectorYDMCaller {
    AdaptiveCurveYDM_V2 public immutable ydm;

    constructor() {
        ydm = new AdaptiveCurveYDM_V2(0.9e18, 0.0001e18, 1e18, (100e18 / uint256(365 days)));
    }

    function initialize() external {
        ydm.initializeYDMForMarket(0.1e18, 0.3e18, 0.5e18);
    }

    function preview(MarketState marketState, uint256 utilizationWAD) external view returns (uint256) {
        return ydm.previewYieldShare(marketState, utilizationWAD);
    }

    function commit(MarketState marketState, uint256 utilizationWAD) external returns (uint256) {
        return ydm.yieldShare(marketState, utilizationWAD);
    }

    function target() external view returns (uint256 yieldShareAtTargetWAD, uint256 lastAdaptationTimestamp) {
        (uint64 targetWAD, uint32 timestamp,,) = ydm.accountantToCurve(address(this));
        return (targetWAD, timestamp);
    }
}

contract DayVectorGenTest is AccountantTestBase {
    string internal vectors;

    function testGenerateDaySolidityVectors() public {
        _utilizationVectors();
        _valuationVectors();
        _waterfallVectors();
        _additionalWaterfallVectors();
        _graceVectors();
        _premiumAccountingVectors();
        _postOperationVectors();
        _feeMintVector();
        _selfLiquidationVectors();
        _adaptiveYDMVectors();
        vm.writeFile("output/day-solidity-vectors.raw.json", string.concat("[", vectors, "]"));
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

    function _stateOutputs(SyncedAccountingState memory s) internal view returns (string memory) {
        return string(
            abi.encodePacked(
                '{"marketState":"', s.marketState == MarketState.PERPETUAL ? "PERPETUAL" : "FIXED_TERM",
                '","collateralNAV":', _q(toUint256(s.collateralNAV)), ',"lptRawNAV":', _q(toUint256(s.lptRawNAV)),
                ',"stEffective":', _q(toUint256(s.stEffectiveNAV)), ',"jtEffective":', _q(toUint256(s.jtEffectiveNAV)),
                ',"jtIL":', _q(toUint256(s.jtImpermanentLoss)), ',"liquidityPremium":', _q(toUint256(s.lptLiquidityPremium)),
                ',"stFee":', _q(toUint256(s.stProtocolFee)), ',"jtFee":', _q(toUint256(s.jtProtocolFee)),
                ',"lptFee":', _q(toUint256(s.lptProtocolFee)), ',"coverageUtilWAD":', _q(s.coverageUtilizationWAD),
                ',"liquidityUtilWAD":', _q(s.liquidityUtilizationWAD), ',"fixedTermEndTimestamp":', _q(s.fixedTermEndTimestamp), '}'
            )
        );
    }

    function _utilizationVectors() internal {
        DayVectorLogicExposer x = new DayVectorLogicExposer();
        _append(
            "coverage-util-exact", "coverage-utilization", "coverageUtilization",
            '{"collateralNAV":"1200000000000000000000","minCoverageWAD":"100000000000000000","jtEffectiveNAV":"200000000000000000000"}',
            string(abi.encodePacked('{"value":', _q(x.coverageUtilization(1200e18, 0.1e18, 200e18)), '}'))
        );
        _append(
            "coverage-util-one-wei-short", "rounding-boundaries", "coverageUtilization",
            '{"collateralNAV":"1200000000000000000000","minCoverageWAD":"100000000000000000","jtEffectiveNAV":"199999999999999999999"}',
            string(abi.encodePacked('{"value":', _q(x.coverageUtilization(1200e18, 0.1e18, 200e18 - 1)), '}'))
        );
        _append(
            "coverage-util-zero-buffer", "rounding-boundaries", "coverageUtilization",
            '{"collateralNAV":"1200000000000000000000","minCoverageWAD":"100000000000000000","jtEffectiveNAV":"0"}',
            string(abi.encodePacked('{"value":', _q(x.coverageUtilization(1200e18, 0.1e18, 0)), '}'))
        );
        _append(
            "liquidity-util-exact", "liquidity-utilization", "liquidityUtilization",
            '{"stEffectiveNAV":"1000000000000000000000","minLiquidityWAD":"50000000000000000","lptRawNAV":"50000000000000000000"}',
            string(abi.encodePacked('{"value":', _q(x.liquidityUtilization(1000e18, 0.05e18, 50e18)), '}'))
        );
        _append(
            "liquidity-util-one-wei-short", "rounding-boundaries", "liquidityUtilization",
            '{"stEffectiveNAV":"1000000000000000000000","minLiquidityWAD":"50000000000000000","lptRawNAV":"49999999999999999999"}',
            string(abi.encodePacked('{"value":', _q(x.liquidityUtilization(1000e18, 0.05e18, 50e18 - 1)), '}'))
        );
        _append(
            "coverage-util-zero-minimum", "coverage-utilization", "coverageUtilization",
            '{"collateralNAV":"1200000000000000000000","minCoverageWAD":"0","jtEffectiveNAV":"0"}',
            string(abi.encodePacked('{"value":', _q(x.coverageUtilization(1200e18, 0, 0)), '}'))
        );
        _append(
            "coverage-util-zero-collateral", "coverage-utilization", "coverageUtilization",
            '{"collateralNAV":"0","minCoverageWAD":"100000000000000000","jtEffectiveNAV":"0"}',
            string(abi.encodePacked('{"value":', _q(x.coverageUtilization(0, 0.1e18, 0)), '}'))
        );
        _append(
            "coverage-util-half", "coverage-utilization", "coverageUtilization",
            '{"collateralNAV":"1200000000000000000000","minCoverageWAD":"100000000000000000","jtEffectiveNAV":"240000000000000000000"}',
            string(abi.encodePacked('{"value":', _q(x.coverageUtilization(1200e18, 0.1e18, 240e18)), '}'))
        );
        _append(
            "coverage-util-over", "coverage-utilization", "coverageUtilization",
            '{"collateralNAV":"1200000000000000000000","minCoverageWAD":"300000000000000000","jtEffectiveNAV":"100000000000000000000"}',
            string(abi.encodePacked('{"value":', _q(x.coverageUtilization(1200e18, 0.3e18, 100e18)), '}'))
        );
        _append(
            "coverage-util-one-wei", "rounding-boundaries", "coverageUtilization",
            '{"collateralNAV":"1","minCoverageWAD":"1000000000000000000","jtEffectiveNAV":"1"}',
            string(abi.encodePacked('{"value":', _q(x.coverageUtilization(1, 1e18, 1)), '}'))
        );
        _append(
            "liquidity-util-zero-minimum", "liquidity-utilization", "liquidityUtilization",
            '{"stEffectiveNAV":"1000000000000000000000","minLiquidityWAD":"0","lptRawNAV":"0"}',
            string(abi.encodePacked('{"value":', _q(x.liquidityUtilization(1000e18, 0, 0)), '}'))
        );
        _append(
            "liquidity-util-zero-senior", "liquidity-utilization", "liquidityUtilization",
            '{"stEffectiveNAV":"0","minLiquidityWAD":"50000000000000000","lptRawNAV":"0"}',
            string(abi.encodePacked('{"value":', _q(x.liquidityUtilization(0, 0.05e18, 0)), '}'))
        );
        _append(
            "liquidity-util-zero-pool", "liquidity-utilization", "liquidityUtilization",
            '{"stEffectiveNAV":"1000000000000000000000","minLiquidityWAD":"50000000000000000","lptRawNAV":"0"}',
            string(abi.encodePacked('{"value":', _q(x.liquidityUtilization(1000e18, 0.05e18, 0)), '}'))
        );
        _append(
            "liquidity-util-half", "liquidity-utilization", "liquidityUtilization",
            '{"stEffectiveNAV":"1000000000000000000000","minLiquidityWAD":"50000000000000000","lptRawNAV":"100000000000000000000"}',
            string(abi.encodePacked('{"value":', _q(x.liquidityUtilization(1000e18, 0.05e18, 100e18)), '}'))
        );
        _append(
            "liquidity-util-over", "liquidity-utilization", "liquidityUtilization",
            '{"stEffectiveNAV":"1000000000000000000000","minLiquidityWAD":"200000000000000000","lptRawNAV":"50000000000000000000"}',
            string(abi.encodePacked('{"value":', _q(x.liquidityUtilization(1000e18, 0.2e18, 50e18)), '}'))
        );
    }

    function _valuationVectors() internal {
        DayVectorLogicExposer x = new DayVectorLogicExposer();
        _append(
            "virtual-shares-healthy", "virtual-share-valuation", "sharesForValue",
            '{"value":"10000000000000000000","totalValue":"1000000000000000000000","supply":"1000000000000000000000"}',
            string(abi.encodePacked('{"shares":', _q(x.sharesForValue(10e18, 1000e18, 1000e18)), '}'))
        );
        _append(
            "virtual-shares-bootstrap", "virtual-share-valuation", "sharesForValue",
            '{"value":"10000000000000000000","totalValue":"0","supply":"0"}',
            string(abi.encodePacked('{"shares":', _q(x.sharesForValue(10e18, 0, 0)), '}'))
        );
        _append(
            "mint-dilution-clamp", "mint-dilution-clamp", "sharesForValue",
            '{"value":"1000000000000000000","totalValue":"0","supply":"1000000000000000000"}',
            string(abi.encodePacked('{"shares":', _q(x.sharesForValue(1e18, 0, 1e18)), '}'))
        );
        _append(
            "virtual-value-redemption", "virtual-share-valuation", "valueForShares",
            '{"shares":"10000000000000000000","supply":"1000000000000000000000","totalValue":"1200000000000000000000"}',
            string(abi.encodePacked('{"value":', _q(x.valueForShares(10e18, 1000e18, 1200e18)), '}'))
        );

        (uint256 premiumShares, uint256 feeShares, uint256 supplyAfter) = x.feePremiumShares(1120e18, 10e18, 5e18, 1e18, 1000e18);
        _append(
            "premium-lpt-fe-carveout", "premium-share-mint", "feePremiumShares",
            '{"stEffective":"1120000000000000000000","grossPremium":"10000000000000000000","stFee":"5000000000000000000","lptFee":"1000000000000000000","supply":"1000000000000000000000"}',
            string(abi.encodePacked('{"premiumShares":', _q(premiumShares), ',"feeShares":', _q(feeShares), ',"supplyAfter":', _q(supplyAfter), '}'))
        );
        _append(
            "virtual-shares-one-wei", "rounding-boundaries", "sharesForValue",
            '{"value":"1","totalValue":"1000000000000000000000","supply":"1000000000000000000000"}',
            string(abi.encodePacked('{"shares":', _q(x.sharesForValue(1, 1000e18, 1000e18)), '}'))
        );
        _append(
            "virtual-shares-zero-supply", "virtual-share-valuation", "sharesForValue",
            '{"value":"10000000000000000000","totalValue":"1000000000000000000000","supply":"0"}',
            string(abi.encodePacked('{"shares":', _q(x.sharesForValue(10e18, 1000e18, 0)), '}'))
        );
        _append(
            "virtual-shares-wiped-large", "mint-dilution-clamp", "sharesForValue",
            '{"value":"10000000000000000000","totalValue":"0","supply":"1000000000000000000000"}',
            string(abi.encodePacked('{"shares":', _q(x.sharesForValue(10e18, 0, 1000e18)), '}'))
        );
        _append(
            "virtual-value-zero-shares", "virtual-share-valuation", "valueForShares",
            '{"shares":"0","supply":"1000000000000000000000","totalValue":"1200000000000000000000"}',
            string(abi.encodePacked('{"value":', _q(x.valueForShares(0, 1000e18, 1200e18)), '}'))
        );
        _append(
            "virtual-value-zero-supply", "virtual-share-valuation", "valueForShares",
            '{"shares":"10000000000000000000","supply":"0","totalValue":"0"}',
            string(abi.encodePacked('{"value":', _q(x.valueForShares(10e18, 0, 0)), '}'))
        );
        _append(
            "virtual-value-full-supply", "virtual-share-valuation", "valueForShares",
            '{"shares":"1000000000000000000000","supply":"1000000000000000000000","totalValue":"1200000000000000000000"}',
            string(abi.encodePacked('{"value":', _q(x.valueForShares(1000e18, 1000e18, 1200e18)), '}'))
        );
        _append(
            "virtual-value-one-wei-share", "rounding-boundaries", "valueForShares",
            '{"shares":"1","supply":"1000000000000000000000","totalValue":"1200000000000000000000"}',
            string(abi.encodePacked('{"value":', _q(x.valueForShares(1, 1000e18, 1200e18)), '}'))
        );
    }

    function _deployZeroFee() internal {
        IRoycoDayAccountant.RoycoDayAccountantInitParams memory p = _defaultParams();
        p.stProtocolFeeWAD = 0;
        p.jtProtocolFeeWAD = 0;
        p.jtYieldShareProtocolFeeWAD = 0;
        p.lptYieldShareProtocolFeeWAD = 0;
        _deploy(p);
    }

    function _waterfallVectors() internal {
        _deployZeroFee();
        _seedSymmetric(1000e18, 300e18, 100e18);
        SyncedAccountingState memory loss = kernel.doPreOp(toNAVUnits(uint256(1170e18)));
        _append(
            "covered-loss", "waterfall", "accountantSync",
            '{"seedCollateral":"1300000000000000000000","seedST":"1000000000000000000000","seedJT":"300000000000000000000","newCollateral":"1170000000000000000000","fixedTermDurationSec":"604800","graceSec":"0"}',
            _stateOutputs(loss)
        );
        SyncedAccountingState memory partialRecovery = kernel.doPreOp(toNAVUnits(uint256(1230e18)));
        _append(
            "partial-recovery", "recovery", "accountantSync",
            '{"seedCollateral":"1170000000000000000000","seedST":"1000000000000000000000","seedJT":"170000000000000000000","seedJTIL":"130000000000000000000","newCollateral":"1230000000000000000000","fixedTermDurationSec":"604800","graceSec":"0"}',
            _stateOutputs(partialRecovery)
        );
        SyncedAccountingState memory full = kernel.doPreOp(toNAVUnits(uint256(1300e18)));
        _append(
            "full-recovery", "recovery", "accountantSync",
            '{"seedCollateral":"1230000000000000000000","seedST":"1000000000000000000000","seedJT":"230000000000000000000","seedJTIL":"70000000000000000000","newCollateral":"1300000000000000000000","fixedTermDurationSec":"604800","graceSec":"0"}',
            _stateOutputs(full)
        );

        _deployZeroFee();
        _seedSymmetric(1000e18, 200e18, 100e18);
        SyncedAccountingState memory wipe = kernel.doPreOp(toNAVUnits(uint256(600e18)));
        _append(
            "junior-wipe-and-senior-loss", "waterfall", "accountantSync",
            '{"seedCollateral":"1200000000000000000000","seedST":"1000000000000000000000","seedJT":"200000000000000000000","newCollateral":"600000000000000000000","fixedTermDurationSec":"604800","graceSec":"0"}',
            _stateOutputs(wipe)
        );
    }

    function _additionalWaterfallVectors() internal {
        _oneStepAccountingVector("loss-one-unit", 1000e18, 300e18, 1299e18, 7 days);
        _oneStepAccountingVector("loss-exactly-junior", 1000e18, 200e18, 1000e18, 7 days);
        _oneStepAccountingVector("loss-through-junior", 1000e18, 200e18, 999e18, 7 days);
        _oneStepAccountingVector("gain-one-wei", 1000e18, 200e18, 1200e18 + 1, 7 days);
        _oneStepAccountingVector("gain-ten-units", 1000e18, 200e18, 1210e18, 7 days);
        _oneStepAccountingVector("loss-below-liquidation", 1000e18, 200e18, 1110e18, 7 days);
        _oneStepAccountingVector("loss-at-liquidation", 1000e18, 200e18, 1100e18, 7 days);
        _oneStepAccountingVector("flat-accounting-sync", 1000e18, 200e18, 1200e18, 7 days);
        _oneStepAccountingVector("loss-zero-duration", 1000e18, 200e18, 1150e18, 0);
        _oneStepAccountingVector("loss-maximum-v3-duration", 1000e18, 200e18, 1150e18, 194 days);
    }

    function _oneStepAccountingVector(
        string memory id,
        uint256 seedST,
        uint256 seedJT,
        uint256 newCollateral,
        uint24 duration
    )
        internal
    {
        IRoycoDayAccountant.RoycoDayAccountantInitParams memory p = _defaultParams();
        p.stProtocolFeeWAD = 0;
        p.jtProtocolFeeWAD = 0;
        p.jtYieldShareProtocolFeeWAD = 0;
        p.lptYieldShareProtocolFeeWAD = 0;
        p.fixedTermDurationSeconds = duration;
        _deploy(p);
        _seedSymmetric(seedST, seedJT, 100e18);
        SyncedAccountingState memory s = kernel.doPreOp(toNAVUnits(newCollateral));
        _append(
            id, "waterfall", "accountantSync",
            string(abi.encodePacked(
                '{"seedCollateral":', _q(seedST + seedJT), ',"seedST":', _q(seedST), ',"seedJT":', _q(seedJT),
                ',"newCollateral":', _q(newCollateral), ',"fixedTermDurationSec":', _q(duration), ',"graceSec":"0"}'
            )),
            _stateOutputs(s)
        );
    }

    function _graceVectors() internal {
        IRoycoDayAccountant.RoycoDayAccountantInitParams memory p = _defaultParams();
        p.stProtocolFeeWAD = 0;
        p.jtProtocolFeeWAD = 0;
        p.jtYieldShareProtocolFeeWAD = 0;
        p.lptYieldShareProtocolFeeWAD = 0;
        _deployWithGrace(p, 30 days);
        _seedSymmetric(1000e18, 300e18, 100e18);
        SyncedAccountingState memory inside = kernel.doPreOp(toNAVUnits(uint256(1200e18)));
        _append(
            "loss-inside-deployment-grace", "fixed-term-grace", "accountantSync",
            '{"seedCollateral":"1300000000000000000000","seedST":"1000000000000000000000","seedJT":"300000000000000000000","newCollateral":"1200000000000000000000","fixedTermDurationSec":"604800","graceSec":"2592000","elapsed":"0"}',
            _stateOutputs(inside)
        );

        _deployWithGrace(p, 30 days);
        _seedSymmetric(1000e18, 300e18, 100e18);
        vm.warp(block.timestamp + 30 days);
        SyncedAccountingState memory afterGrace = kernel.doPreOp(toNAVUnits(uint256(1200e18)));
        _append(
            "loss-at-deployment-grace-boundary", "fixed-term-grace", "accountantSync",
            '{"seedCollateral":"1300000000000000000000","seedST":"1000000000000000000000","seedJT":"300000000000000000000","newCollateral":"1200000000000000000000","fixedTermDurationSec":"604800","graceSec":"2592000","elapsed":"2592000"}',
            _stateOutputs(afterGrace)
        );
    }

    function _freshSeed() internal {
        _deployZeroFee();
        _seedSymmetric(1000e18, 200e18, 100e18);
    }

    function _premiumInputs(
        uint256 newCollateral,
        uint256 elapsedSincePremium,
        uint256 twJT,
        uint256 twLPT,
        uint256 spotJT,
        uint256 spotLPT
    )
        internal
        view
        returns (string memory)
    {
        return string(
            abi.encodePacked(
                '{"seedCollateral":"1200000000000000000000","seedST":"1000000000000000000000",',
                '"seedJT":"200000000000000000000","seedLPT":"100000000000000000000","newCollateral":', _q(newCollateral),
                ',"elapsedSincePremium":', _q(elapsedSincePremium), ',"twJT":', _q(twJT), ',"twLPT":', _q(twLPT),
                ',"spotJT":', _q(spotJT), ',"spotLPT":', _q(spotLPT),
                ',"stProtocolFeeWAD":"100000000000000000","jtProtocolFeeWAD":"100000000000000000",',
                '"jtYieldShareProtocolFeeWAD":"100000000000000000","lptYieldShareProtocolFeeWAD":"100000000000000000",',
                '"maxJTYieldShareWAD":"200000000000000000","maxLPTYieldShareWAD":"100000000000000000",',
                '"fixedTermDurationSec":"604800","graceSec":"0"}'
            )
        );
    }

    function _premiumAccountingVectors() internal {
        // The first initialized gain happens in the premium-payment block and
        // therefore prices both tranches from their instantaneous preview rates.
        _deploy(_defaultParams());
        _seedAndInitAccrual();
        jtYDM.setPreviewYieldShareReturn(0.07e18);
        lptYDM.setPreviewYieldShareReturn(0.03e18);
        SyncedAccountingState memory instantaneous = kernel.doPreOp(toNAVUnits(uint256(1300e18)));
        _append(
            "premium-same-block-instantaneous", "premium-accounting", "premiumAccounting",
            _premiumInputs(1300e18, 0, 0, 0, 0.07e18, 0.03e18),
            _stateOutputs(instantaneous)
        );

        // A real elapsed window whose accrued rates were zero must remain a
        // zero-premium window even if the current spot rates are now nonzero.
        _deploy(_defaultParams());
        _seedAndInitAccrual();
        uint256 zeroWindowStart = accountant.getState().lastPremiumPaymentTimestamp;
        vm.warp(zeroWindowStart + 100);
        kernel.doPreOp(toNAVUnits(uint256(1200e18)));
        jtYDM.setRates(0.07e18);
        lptYDM.setRates(0.03e18);
        SyncedAccountingState memory zeroWindow = kernel.doPreOp(toNAVUnits(uint256(1300e18)));
        _append(
            "premium-elapsed-zero-accumulators", "premium-accounting", "premiumAccounting",
            _premiumInputs(1300e18, 100, 0, 0, 0.07e18, 0.03e18),
            _stateOutputs(zeroWindow)
        );

        // Two unequal rate windows produce an accumulator that does not divide
        // evenly by elapsed time. LPT's accrued side remains zero while its
        // preview rate is nonzero, pinning both the one-mulDiv rounding and the
        // shared elapsed-time branch predicate. Default protocol fees stay live.
        _deploy(_defaultParams());
        _seedAndInitAccrual();
        uint256 weightedWindowStart = accountant.getState().lastPremiumPaymentTimestamp;
        jtYDM.setRates(0.1e18);
        lptYDM.setRates(0);
        vm.warp(weightedWindowStart + 1);
        kernel.doPreOp(toNAVUnits(uint256(1200e18)));
        jtYDM.setYieldShareReturn(0.2e18);
        jtYDM.setPreviewYieldShareReturn(0.2e18);
        lptYDM.setYieldShareReturn(0);
        lptYDM.setPreviewYieldShareReturn(0.08e18);
        vm.warp(weightedWindowStart + 3);
        SyncedAccountingState memory weighted = kernel.doPreOp(toNAVUnits(uint256(1300e18)));
        _append(
            "premium-time-weighted-nondivisible", "premium-accounting", "premiumAccounting",
            _premiumInputs(1300e18, 3, 0.5e18, 0, 0.2e18, 0.08e18),
            _stateOutputs(weighted)
        );
    }

    function _postOperationVectors() internal {
        _postOperation("post-st-deposit", Operation.ST_DEPOSIT, 1300e18, 100e18, 0);
        _postOperation("post-jt-deposit", Operation.JT_DEPOSIT, 1250e18, 100e18, 0);
        _postOperation("post-lpt-deposit", Operation.LPT_DEPOSIT, 1200e18, 150e18, 0);
        _postOperation("post-st-redemption", Operation.ST_REDEMPTION, 1100e18, 100e18, 0);
        _postOperation("post-jt-redemption", Operation.JT_REDEMPTION, 1150e18, 100e18, 0);
        _postOperation("post-lpt-redemption", Operation.LPT_REDEMPTION, 1200e18, 50e18, 0);
        _postOperation("post-st-redemption-bonus", Operation.ST_REDEMPTION, 1090e18, 100e18, 10e18);
        _postOperation("post-st-deposit-one", Operation.ST_DEPOSIT, 1200e18 + 1, 100e18, 0);
        _postOperation("post-jt-deposit-one", Operation.JT_DEPOSIT, 1200e18 + 1, 100e18, 0);
        _postOperation("post-lpt-deposit-one", Operation.LPT_DEPOSIT, 1200e18, 100e18 + 1, 0);
        _postOperation("post-st-redemption-one", Operation.ST_REDEMPTION, 1200e18 - 1, 100e18, 0);
        _postOperation("post-jt-redemption-one", Operation.JT_REDEMPTION, 1200e18 - 1, 100e18, 0);
        _postOperation("post-lpt-redemption-one", Operation.LPT_REDEMPTION, 1200e18, 100e18 - 1, 0);

        _deployZeroFee();
        _seedState(1000e18, 200e18, 100e18, 100e18, MarketState.FIXED_TERM);
        IRoycoDayAccountant.RoycoDayAccountantState memory seeded = accountant.getState();
        SyncedAccountingState memory jtIL =
            kernel.doPostOp(Operation.JT_REDEMPTION, toNAVUnits(uint256(1140e18)), toNAVUnits(uint256(100e18)), toNAVUnits(uint256(0)));
        _append(
            "post-jt-redemption-preserves-il", "jt-il-post-operation", "postOp",
            string(
                abi.encodePacked(
                    '{"operation":"JT_REDEMPTION","seedCollateral":"1200000000000000000000",',
                    '"seedST":"1000000000000000000000","seedJT":"200000000000000000000",',
                    '"seedJTIL":"100000000000000000000","seedLPTRaw":"100000000000000000000",',
                    '"seedMarketState":"FIXED_TERM","seedFixedTermEndTimestamp":', _q(seeded.fixedTermEndTimestamp),
                    ',"collateralNAV":"1140000000000000000000","lptRawNAV":"100000000000000000000","bonusNAV":"0"}'
                )
            ),
            _stateOutputs(jtIL)
        );
    }

    function _postOperation(string memory id, Operation op, uint256 collateralNAV, uint256 lptRawNAV, uint256 bonusNAV) internal {
        _freshSeed();
        SyncedAccountingState memory s = kernel.doPostOp(op, toNAVUnits(collateralNAV), toNAVUnits(lptRawNAV), toNAVUnits(bonusNAV));
        _append(
            id, "post-operations", "postOp",
            string(abi.encodePacked(
                '{"operation":"', _opName(op), '","seedCollateral":"1200000000000000000000","seedST":"1000000000000000000000",',
                '"seedJT":"200000000000000000000","seedLPTRaw":"100000000000000000000","collateralNAV":', _q(collateralNAV),
                ',"lptRawNAV":', _q(lptRawNAV), ',"bonusNAV":', _q(bonusNAV), '}'
            )),
            _stateOutputs(s)
        );
    }

    function _opName(Operation op) internal pure returns (string memory) {
        if (op == Operation.ST_DEPOSIT) return "ST_DEPOSIT";
        if (op == Operation.ST_REDEMPTION) return "ST_REDEMPTION";
        if (op == Operation.JT_DEPOSIT) return "JT_DEPOSIT";
        if (op == Operation.JT_REDEMPTION) return "JT_REDEMPTION";
        if (op == Operation.LPT_DEPOSIT) return "LPT_DEPOSIT";
        return "LPT_REDEMPTION";
    }

    function _feeMintVector() internal {
        _feeMintCase("fee-and-premium-mints", 10e18, 5e18, 2e18, 1e18);
        _feeMintCase("fee-mints-zero", 0, 0, 0, 0);
        _feeMintCase("fee-mints-st-only", 0, 5e18, 0, 0);
        _feeMintCase("fee-mints-jt-only", 0, 0, 2e18, 0);
        _feeMintCase("fee-mints-premium-fully-carved", 10e18, 0, 0, 10e18);
    }

    function _feeMintCase(
        string memory id,
        uint256 grossPremium,
        uint256 stFee,
        uint256 jtFee,
        uint256 lptFee
    )
        internal
    {
        FeeAndLiquidityPremiumHarness h = new FeeAndLiquidityPremiumHarness();
        h.ST_LEDGER().setTotalSupply(1000e18);
        h.JT_LEDGER().setTotalSupply(200e18);
        h.LPT_LEDGER().setTotalSupply(100e18);
        SyncedAccountingState memory s;
        s.stEffectiveNAV = toNAVUnits(uint256(1120e18));
        s.jtEffectiveNAV = toNAVUnits(uint256(220e18));
        s.lptLiquidityPremium = toNAVUnits(grossPremium);
        s.stProtocolFee = toNAVUnits(stFee);
        s.jtProtocolFee = toNAVUnits(jtFee);
        s.lptProtocolFee = toNAVUnits(lptFee);
        h.processFeesAndLiquidityPremium(s);
        _append(
            id, "fee-processing", "feeProcessing",
            string(abi.encodePacked(
                '{"stEffective":"1120000000000000000000","jtEffective":"220000000000000000000","grossPremium":', _q(grossPremium),
                ',"stFee":', _q(stFee), ',"jtFee":', _q(jtFee), ',"lptFee":', _q(lptFee),
                ',"stSupply":"1000000000000000000000","jtSupply":"200000000000000000000","lptSupply":"100000000000000000000"}'
            )),
            string(abi.encodePacked(
                '{"stSupplyAfter":', _q(h.ST_LEDGER().totalSupply()), ',"jtSupplyAfter":', _q(h.JT_LEDGER().totalSupply()),
                ',"lptSupplyAfter":', _q(h.LPT_LEDGER().totalSupply()), ',"premiumShares":', _q(h.ST_LEDGER().lastPremiumSharesMinted()),
                ',"stFeeShares":', _q(h.ST_LEDGER().lastFeeSharesMinted()), ',"jtFeeShares":', _q(h.JT_LEDGER().lastFeeSharesMinted()),
                ',"lptFeeShares":', _q(h.LPT_LEDGER().lastFeeSharesMinted()), ',"idlePremiumShares":', _q(h.lptOwnedSeniorTrancheShares()), '}'
            ))
        );
    }

    function _selfLiquidationVectors() internal {
        _selfLiquidation("self-liquidation-healthy", 1e18, 2e18);
        _selfLiquidation("self-liquidation-breached", 3e18, 2e18);
        _selfLiquidation("self-liquidation-at-threshold", 2e18, 2e18);
        _selfLiquidation("self-liquidation-one-wei-below", 2e18 - 1, 2e18);
        _selfLiquidation("self-liquidation-one-wei-above", 2e18 + 1, 2e18);
    }

    function _selfLiquidation(string memory id, uint256 coverageUtilWAD, uint256 liquidationUtilWAD) internal {
        SelfLiquidationHarness h = new SelfLiquidationHarness();
        h.setSelfLiquidationBonusWAD(0.1e18);
        SyncedAccountingState memory s;
        s.collateralNAV = toNAVUnits(uint256(1040e18));
        s.stEffectiveNAV = toNAVUnits(uint256(1000e18));
        s.jtEffectiveNAV = toNAVUnits(uint256(40e18));
        s.coverageUtilizationWAD = coverageUtilWAD;
        s.coverageLiquidationUtilizationWAD = liquidationUtilWAD;
        AssetClaims memory claims;
        claims.collateralAssets = toTrancheUnits(uint256(100e18));
        claims.nav = toNAVUnits(uint256(100e18));
        (AssetClaims memory out, NAV_UNIT bonus) = h.applyBonus(s, claims);
        _append(
            id, "self-liquidation", "selfLiquidation",
            string(abi.encodePacked(
                '{"bonusWAD":"100000000000000000","collateralNAV":"1040000000000000000000","stEffective":"1000000000000000000000",',
                '"jtEffective":"40000000000000000000","coverageUtilWAD":', _q(coverageUtilWAD), ',"liquidationUtilWAD":', _q(liquidationUtilWAD),
                ',"claimCollateral":"100000000000000000000","claimNAV":"100000000000000000000"}'
            )),
            string(abi.encodePacked(
                '{"bonus":', _q(toUint256(bonus)), ',"claimCollateral":', _q(toUint256(out.collateralAssets)),
                ',"claimNAV":', _q(toUint256(out.nav)), '}'
            ))
        );
    }

    function _adaptiveYDMVectors() internal {
        vm.warp(1 days);
        DayVectorYDMCaller y = new DayVectorYDMCaller();
        y.initialize();
        _append(
            "adaptive-initial-zero-util", "adaptive-ydm-v2", "adaptiveYDM",
            '{"initialTarget":"300000000000000000","utilizationWAD":"0","elapsed":"0","marketState":"PERPETUAL"}',
            string(abi.encodePacked('{"yieldShareWAD":', _q(y.preview(MarketState.PERPETUAL, 0)), ',"targetWAD":"300000000000000000"}'))
        );
        _append(
            "adaptive-initial-half-target-util", "adaptive-ydm-v2", "adaptiveYDM",
            '{"initialTarget":"300000000000000000","utilizationWAD":"450000000000000000","elapsed":"0","marketState":"PERPETUAL"}',
            string(abi.encodePacked('{"yieldShareWAD":', _q(y.preview(MarketState.PERPETUAL, 0.45e18)), ',"targetWAD":"300000000000000000"}'))
        );
        _append(
            "adaptive-initial-target-util", "adaptive-ydm-v2", "adaptiveYDM",
            '{"initialTarget":"300000000000000000","utilizationWAD":"900000000000000000","elapsed":"0","marketState":"PERPETUAL"}',
            string(abi.encodePacked('{"yieldShareWAD":', _q(y.preview(MarketState.PERPETUAL, 0.9e18)), ',"targetWAD":"300000000000000000"}'))
        );
        _append(
            "adaptive-initial-mid-upper-util", "adaptive-ydm-v2", "adaptiveYDM",
            '{"initialTarget":"300000000000000000","utilizationWAD":"950000000000000000","elapsed":"0","marketState":"PERPETUAL"}',
            string(abi.encodePacked('{"yieldShareWAD":', _q(y.preview(MarketState.PERPETUAL, 0.95e18)), ',"targetWAD":"300000000000000000"}'))
        );
        _append(
            "adaptive-initial-full-util", "adaptive-ydm-v2", "adaptiveYDM",
            '{"initialTarget":"300000000000000000","utilizationWAD":"1000000000000000000","elapsed":"0","marketState":"PERPETUAL"}',
            string(abi.encodePacked('{"yieldShareWAD":', _q(y.preview(MarketState.PERPETUAL, 1e18)), ',"targetWAD":"300000000000000000"}'))
        );
        y.commit(MarketState.PERPETUAL, 0.9e18);
        vm.warp(block.timestamp + 30 days);
        uint256 highOutput = y.commit(MarketState.PERPETUAL, 1e18);
        (uint256 highTarget,) = y.target();
        _append(
            "adaptive-high-util-30d", "adaptive-ydm-v2", "adaptiveYDM",
            '{"initialTarget":"300000000000000000","utilizationWAD":"1000000000000000000","elapsed":"2592000","marketState":"PERPETUAL"}',
            string(abi.encodePacked('{"yieldShareWAD":', _q(highOutput), ',"targetWAD":', _q(highTarget), '}'))
        );
        vm.warp(block.timestamp + 30 days);
        uint256 frozenOutput = y.commit(MarketState.FIXED_TERM, 0);
        (uint256 frozenTarget,) = y.target();
        _append(
            "adaptive-frozen-fixed-term", "adaptive-ydm-v2", "adaptiveYDM",
            string(abi.encodePacked(
                '{"initialTarget":', _q(highTarget), ',"utilizationWAD":"0","elapsed":"2592000","marketState":"FIXED_TERM"}'
            )),
            string(abi.encodePacked('{"yieldShareWAD":', _q(frozenOutput), ',"targetWAD":', _q(frozenTarget), '}'))
        );

        DayVectorYDMCaller z = new DayVectorYDMCaller();
        z.initialize();
        z.commit(MarketState.PERPETUAL, 0.9e18);
        vm.warp(block.timestamp + 1 days);
        uint256 unsaturatedOutput = z.commit(MarketState.PERPETUAL, 0.91e18);
        (uint256 unsaturatedTarget,) = z.target();
        _append(
            "adaptive-unsaturated-one-day", "adaptive-ydm-v2", "adaptiveYDM",
            '{"initialTarget":"300000000000000000","utilizationWAD":"910000000000000000","elapsed":"86400","marketState":"PERPETUAL"}',
            string(abi.encodePacked('{"yieldShareWAD":', _q(unsaturatedOutput), ',"targetWAD":', _q(unsaturatedTarget), '}'))
        );
    }
}
