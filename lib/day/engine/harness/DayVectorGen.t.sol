// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

// This file is copied to royco-day/test/vectors/ by generate-day-vectors.mjs.
// Imports are intentionally relative to that destination.
import { Math } from "../../lib/openzeppelin-contracts/contracts/utils/math/Math.sol";
import { IRoycoDayAccountant } from "../../src/interfaces/IRoycoDayAccountant.sol";
import { AssetClaims, MarketState, Operation, SyncedAccountingState } from "../../src/libraries/Types.sol";
import { NAV_UNIT, toNAVUnits, toTrancheUnits, toUint256 } from "../../src/libraries/Units.sol";
import { FeeAndLiquidityPremiumLogic } from "../../src/libraries/logic/FeeAndLiquidityPremiumLogic.sol";
import { UtilizationLogic } from "../../src/libraries/logic/UtilizationLogic.sol";
import { ValuationLogic } from "../../src/libraries/logic/ValuationLogic.sol";
import { AccountantTestBase } from "../utils/AccountantTestBase.sol";
import { FeeAndLiquidityPremiumHarness } from "../mocks/FeeAndLiquidityPremiumHarness.sol";
import { SelfLiquidationHarness } from "../mocks/SelfLiquidationHarness.sol";

contract DayVectorLogicExposer {
    function liquidityUtilization(uint256 stEffective, uint256 minLiquidityWAD, uint256 ltRaw) external pure returns (uint256) {
        return UtilizationLogic._computeLiquidityUtilization(toNAVUnits(stEffective), minLiquidityWAD, toNAVUnits(ltRaw));
    }

    function sharesForValue(uint256 value, uint256 totalValue, uint256 supply) external pure returns (uint256) {
        return ValuationLogic._convertToShares(toNAVUnits(value), toNAVUnits(totalValue), supply, Math.Rounding.Floor);
    }

    function feePremiumShares(uint256 stEffective, uint256 premium, uint256 fee, uint256 supply)
        external
        pure
        returns (uint256 premiumShares, uint256 feeShares, uint256 supplyAfter)
    {
        SyncedAccountingState memory s;
        s.stEffectiveNAV = toNAVUnits(stEffective);
        s.ltLiquidityPremium = toNAVUnits(premium);
        s.stProtocolFee = toNAVUnits(fee);
        return FeeAndLiquidityPremiumLogic._computeSTFeeAndLiquidityPremiumSharesToMint(s, supply);
    }
}

contract DayVectorGenTest is AccountantTestBase {
    string internal vectors;

    function testGenerateDaySolidityVectors() public {
        _logicVectors();
        _syncAndFeeVectors();
        _postOperationVectors();
        _reinvestmentVectors();
        _selfLiquidationVector();
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

    function _logicVectors() internal {
        DayVectorLogicExposer x = new DayVectorLogicExposer();
        uint256 st = 1000e18;
        uint256 minLiq = 0.05e18;
        uint256 exactLT = 50e18;
        _append(
            "liq-util-exact",
            "liquidity-utilization",
            "liquidityUtilization",
            string(abi.encodePacked('{"stEffective":', _q(st), ',"minLiquidityWAD":', _q(minLiq), ',"ltRaw":', _q(exactLT), '}')),
            string(abi.encodePacked('{"value":', _q(x.liquidityUtilization(st, minLiq, exactLT)), '}'))
        );
        _append(
            "liq-util-one-wei-short",
            "rounding-boundaries",
            "liquidityUtilization",
            string(abi.encodePacked('{"stEffective":', _q(st), ',"minLiquidityWAD":', _q(minLiq), ',"ltRaw":', _q(exactLT - 1), '}')),
            string(abi.encodePacked('{"value":', _q(x.liquidityUtilization(st, minLiq, exactLT - 1)), '}'))
        );

        (uint256 premiumShares, uint256 feeShares, uint256 supplyAfter) = x.feePremiumShares(1120e18, 10e18, 5e18, 1000e18);
        _append(
            "premium-and-fee-share-mint",
            "premium-share-mint",
            "feePremiumShares",
            '{"stEffective":"1120000000000000000000","premium":"10000000000000000000","fee":"5000000000000000000","supply":"1000000000000000000000"}',
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
        _deploy(true, p);
        _seedAndInitAccrual();
        jtYDM.setRates(0.2e18);
        ltYDM.setRates(0.1e18);
        vm.warp(block.timestamp + 1 days);
        SyncedAccountingState memory s = kernel.doPreOp(toNAVUnits(uint256(1100e18)), toNAVUnits(uint256(220e18)));
        _append(
            "nonzero-four-fees-sync",
            "nonzero-fees",
            "accountantSync",
            '{"seedST":"1000000000000000000000","seedJT":"200000000000000000000","seedLT":"100000000000000000000","newST":"1100000000000000000000","newJT":"220000000000000000000","jtShareWAD":"200000000000000000","ltShareWAD":"100000000000000000","elapsed":"86400"}',
            _syncOutputs(s)
        );

        _isolatedFeeVector("fee-st-only", 0.1e18, 0, 0, 0);
        _isolatedFeeVector("fee-jt-only", 0, 0.1e18, 0, 0);
        _isolatedFeeVector("fee-jt-yield-share-only", 0, 0, 0.1e18, 0);
        _isolatedFeeVector("fee-lt-yield-share-only", 0, 0, 0, 0.1e18);

        kernel.doCommit(toNAVUnits(uint256(123e18)));
        _append(
            "post-mint-lt-raw-commit",
            "lt-raw-commit",
            "ltCommit",
            '{"ltRaw":"123000000000000000000"}',
            string(abi.encodePacked('{"lastLTRawNAV":', _q(toUint256(accountant.getState().lastLTRawNAV)), '}'))
        );
    }

    function _isolatedFeeVector(string memory id, uint64 stFeeRate, uint64 jtFeeRate, uint64 jtShareFeeRate, uint64 ltShareFeeRate) internal {
        IRoycoDayAccountant.RoycoDayAccountantInitParams memory p = _defaultParams();
        p.stProtocolFeeWAD = stFeeRate;
        p.jtProtocolFeeWAD = jtFeeRate;
        p.jtYieldShareProtocolFeeWAD = jtShareFeeRate;
        p.ltYieldShareProtocolFeeWAD = ltShareFeeRate;
        _deploy(true, p);
        _seedAndInitAccrual();
        jtYDM.setRates(0.2e18);
        ltYDM.setRates(0.1e18);
        vm.warp(block.timestamp + 1 days);
        SyncedAccountingState memory s = kernel.doPreOp(toNAVUnits(uint256(1100e18)), toNAVUnits(uint256(220e18)));
        _append(
            id,
            "nonzero-fees",
            "accountantSync",
            string(
                abi.encodePacked(
                    '{"seedST":"1000000000000000000000","seedJT":"200000000000000000000","seedLT":"100000000000000000000",',
                    '"newST":"1100000000000000000000","newJT":"220000000000000000000","jtShareWAD":"200000000000000000","ltShareWAD":"100000000000000000","elapsed":"86400",',
                    '"stFeeRate":', _q(stFeeRate), ',"jtFeeRate":', _q(jtFeeRate), ',"jtShareFeeRate":', _q(jtShareFeeRate), ',"ltShareFeeRate":', _q(ltShareFeeRate), '}'
                )
            ),
            _syncOutputs(s)
        );
    }

    function _syncOutputs(SyncedAccountingState memory s) internal view returns (string memory) {
        return string(
            abi.encodePacked(
                '{"marketState":"', s.marketState == MarketState.PERPETUAL ? "PERPETUAL" : "FIXED_TERM",
                '","stRaw":', _q(toUint256(s.stRawNAV)), ',"jtRaw":', _q(toUint256(s.jtRawNAV)),
                ',"ltRaw":', _q(toUint256(s.ltRawNAV)), ',"stEffective":', _q(toUint256(s.stEffectiveNAV)),
                ',"jtEffective":', _q(toUint256(s.jtEffectiveNAV)), ',"jtIL":', _q(toUint256(s.jtCoverageImpermanentLoss)),
                ',"liquidityPremium":', _q(toUint256(s.ltLiquidityPremium)), ',"stFee":', _q(toUint256(s.stProtocolFee)),
                ',"jtFee":', _q(toUint256(s.jtProtocolFee)), ',"ltFee":', _q(toUint256(s.ltProtocolFee)),
                ',"coverageUtilWAD":', _q(s.coverageUtilizationWAD), ',"liquidityUtilWAD":', _q(s.liquidityUtilizationWAD), '}'
            )
        );
    }

    function _freshSeed() internal {
        _deploy(true, _defaultParams());
        _seedSymmetric(1000e18, 200e18, 100e18);
    }

    function _postOperationVectors() internal {
        _postSuccess("post-st-deposit", Operation.ST_DEPOSIT, 1100e18, 200e18, 100e18, 0);
        _postSuccess("post-jt-deposit", Operation.JT_DEPOSIT, 1000e18, 250e18, 100e18, 0);
        _postSuccess("post-lt-deposit", Operation.LT_DEPOSIT, 1000e18, 200e18, 150e18, 0);
        _postSuccess("post-st-redeem", Operation.ST_REDEEM, 900e18, 200e18, 100e18, 0);
        _postSuccess("post-jt-redeem", Operation.JT_REDEEM, 1000e18, 150e18, 100e18, 0);
        _postSuccess("post-lt-redeem", Operation.LT_REDEEM, 1000e18, 200e18, 50e18, 0);
        _postSuccess("post-st-redeem-bonus", Operation.ST_REDEEM, 900e18, 199e18, 100e18, 1e18);

        _postRevert("gate-st-deposit-coverage-liquidity", Operation.ST_DEPOSIT, 2001e18, 200e18, 100e18, 0);
        _postRevert("gate-lt-redeem-liquidity", Operation.LT_REDEEM, 1000e18, 200e18, 49e18, 0);
    }

    function _postSuccess(string memory id, Operation op, uint256 stRaw, uint256 jtRaw, uint256 ltRaw, uint256 bonus) internal {
        _freshSeed();
        SyncedAccountingState memory s = kernel.doPostOp(op, toNAVUnits(stRaw), toNAVUnits(jtRaw), toNAVUnits(ltRaw), toNAVUnits(bonus), true);
        _append(
            id,
            "post-operations",
            "postOp",
            string(
                abi.encodePacked(
                    '{"operation":"', _opName(op), '","seedST":"1000000000000000000000","seedJT":"200000000000000000000","seedLT":"100000000000000000000",',
                    '"stRaw":', _q(stRaw), ',"jtRaw":', _q(jtRaw), ',"ltRaw":', _q(ltRaw), ',"bonus":', _q(bonus), '}'
                )
            ),
            _syncOutputs(s)
        );
    }

    function _postRevert(string memory id, Operation op, uint256 stRaw, uint256 jtRaw, uint256 ltRaw, uint256 bonus) internal {
        _freshSeed();
        bool reverted;
        uint32 selector;
        try kernel.doPostOp(op, toNAVUnits(stRaw), toNAVUnits(jtRaw), toNAVUnits(ltRaw), toNAVUnits(bonus), true) returns (SyncedAccountingState memory) {
            reverted = false;
        } catch (bytes memory reason) {
            reverted = true;
            if (reason.length >= 4) {
                bytes4 raw;
                assembly { raw := mload(add(reason, 32)) }
                selector = uint32(raw);
            }
        }
        _append(
            id,
            "operation-gates",
            "postOpRevert",
            string(
                abi.encodePacked(
                    '{"operation":"', _opName(op), '","seedST":"1000000000000000000000","seedJT":"200000000000000000000","seedLT":"100000000000000000000",',
                    '"stRaw":', _q(stRaw), ',"jtRaw":', _q(jtRaw), ',"ltRaw":', _q(ltRaw), ',"bonus":', _q(bonus), '}'
                )
            ),
            string(abi.encodePacked('{"reverted":', reverted ? "true" : "false", ',"selector":', _q(selector), '}'))
        );
    }

    function _opName(Operation op) internal pure returns (string memory) {
        if (op == Operation.ST_DEPOSIT) return "ST_DEPOSIT";
        if (op == Operation.ST_REDEEM) return "ST_REDEEM";
        if (op == Operation.JT_DEPOSIT) return "JT_DEPOSIT";
        if (op == Operation.JT_REDEEM) return "JT_REDEEM";
        if (op == Operation.LT_DEPOSIT) return "LT_DEPOSIT";
        return "LT_REDEEM";
    }

    function _reinvestmentVectors() internal {
        _reinvestment("premium-reinvestment-success", true);
        _reinvestment("premium-reinvestment-deferred", false);
    }

    function _reinvestment(string memory id, bool success) internal {
        FeeAndLiquidityPremiumHarness h = new FeeAndLiquidityPremiumHarness();
        h.ST_LEDGER().setTotalSupply(1000e18);
        h.JT_LEDGER().setTotalSupply(200e18);
        h.LT_LEDGER().setTotalSupply(100e18);
        h.setLTOwnedYieldBearingAssets(100e18);
        h.setReinvestSharesToDrain(success ? type(uint256).max : 0);
        SyncedAccountingState memory s;
        s.stEffectiveNAV = toNAVUnits(uint256(1120e18));
        s.jtEffectiveNAV = toNAVUnits(uint256(220e18));
        s.ltRawNAV = toNAVUnits(uint256(100e18));
        s.ltLiquidityPremium = toNAVUnits(uint256(10e18));
        s.stProtocolFee = toNAVUnits(uint256(5e18));
        s.jtProtocolFee = toNAVUnits(uint256(2e18));
        s.ltProtocolFee = toNAVUnits(uint256(1e18));
        h.processFeesAndLiquidityPremium(s);
        _append(
            id,
            "premium-reinvestment",
            "reinvestment",
            string.concat('{"success":', success ? "true" : "false", ',"stEffective":"1120000000000000000000","jtEffective":"220000000000000000000","ltRaw":"100000000000000000000","premium":"10000000000000000000","stFee":"5000000000000000000","jtFee":"2000000000000000000","ltFee":"1000000000000000000","stSupply":"1000000000000000000000","jtSupply":"200000000000000000000","ltSupply":"100000000000000000000"}'),
            string(
                abi.encodePacked(
                    '{"stSupplyAfter":', _q(h.ST_LEDGER().totalSupply()), ',"jtSupplyAfter":', _q(h.JT_LEDGER().totalSupply()),
                    ',"ltSupplyAfter":', _q(h.LT_LEDGER().totalSupply()), ',"premiumShares":', _q(h.ST_LEDGER().lastPremiumSharesMinted()),
                    ',"stFeeShares":', _q(h.ST_LEDGER().lastFeeSharesMinted()), ',"jtFeeShares":', _q(h.JT_LEDGER().lastFeeSharesMinted()),
                    ',"ltFeeShares":', _q(h.LT_LEDGER().lastFeeSharesMinted()), ',"idlePremiumShares":', _q(h.ltOwnedSeniorTrancheShares()), '}'
                )
            )
        );
    }

    function _selfLiquidationVector() internal {
        SelfLiquidationHarness h = new SelfLiquidationHarness();
        h.setSelfLiquidationBonusWAD(0.01e18);
        SyncedAccountingState memory s;
        s.stRawNAV = toNAVUnits(uint256(800e18));
        s.jtRawNAV = toNAVUnits(uint256(240e18));
        s.stEffectiveNAV = toNAVUnits(uint256(1000e18));
        s.jtEffectiveNAV = toNAVUnits(uint256(40e18));
        s.coverageUtilizationWAD = 5.2e18;
        s.coverageLiquidationUtilizationWAD = 4e18;
        s.minCoverageWAD = 0.2e18;
        s.jtCoinvested = true;
        AssetClaims memory claims;
        claims.stAssets = toTrancheUnits(uint256(80e18));
        claims.jtAssets = toTrancheUnits(uint256(20e18));
        claims.nav = toNAVUnits(uint256(100e18));
        (AssetClaims memory out, NAV_UNIT bonus) = h.applyBonus(s, claims);
        _append(
            "self-liquidation-bonus",
            "self-liquidation",
            "selfLiquidation",
            '{"bonusWAD":"10000000000000000","stRaw":"800000000000000000000","jtRaw":"240000000000000000000","stEffective":"1000000000000000000000","jtEffective":"40000000000000000000","coverageUtilWAD":"5200000000000000000","liquidationUtilWAD":"4000000000000000000","jtCoinvested":true,"claimST":"80000000000000000000","claimJT":"20000000000000000000","claimNAV":"100000000000000000000"}',
            string(abi.encodePacked('{"bonus":', _q(toUint256(bonus)), ',"claimST":', _q(toUint256(out.stAssets)), ',"claimJT":', _q(toUint256(out.jtAssets)), ',"claimNAV":', _q(toUint256(out.nav)), '}'))
        );
    }
}
