import type { DaySimulatorDefaults } from "@/lib/day-simulator-template/market";

/**
 * What each tranche is paid, given what it is being asked to supply.
 *
 * `issuer-presets.ts` states the rule this follows: a tranche is paid in
 * proportion to its requirement, and the shipped market defaults, the preset
 * buttons and the issuer presets all derive from it "so the three cannot drift
 * apart". /v2 has one slider per requirement rather than a separate slider for
 * the share, so it has to decide what the share does when the requirement
 * moves, and holding it fixed is the one answer that leaves that line.
 *
 * The scaling is relative to the market's own default rather than a flat
 * `coverage * DAY_JR_PREMIUM_PER_COVERAGE`. Every registry market currently
 * sits exactly on the flat rule, so today the two forms agree everywhere — but
 * they are not the same rule. A reverse market pricing 6.7% coverage at 1.4%
 * (the removed `muga` was one) has bespoke terms that the flat form would
 * overwrite with invented numbers. Scaling from each market's own default
 * reproduces any market exactly at its own terms and keeps the proportionality
 * as the slider moves, so it stays.
 *
 * A requirement of zero pays zero, which is the behaviour this replaces: a
 * tranche with no capital in it cannot be paid a premium, or Sr keeps
 * paying a counterparty that does not exist. That case now falls out of the
 * ratio instead of being special-cased.
 */
export function dayV3EffectiveShares(
  defaults: DaySimulatorDefaults,
  coverage: number,
  minLiquidity: number,
): { riskYieldShare: number; liquidityYieldShare: number } {
  const scale = (share: number, requirement: number, defaultRequirement: number) => {
    if (requirement <= 0 || defaultRequirement <= 0) return 0;
    return share * (requirement / defaultRequirement);
  };
  return {
    riskYieldShare: scale(defaults.riskYDM.yTarget, coverage, defaults.coverage),
    liquidityYieldShare: scale(defaults.liqYDM.yTarget, minLiquidity, defaults.minLiquidity),
  };
}
