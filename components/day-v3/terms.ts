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
 * `coverage * DAY_JR_PREMIUM_PER_COVERAGE`. Twelve of the thirteen registry
 * markets sit exactly on the flat rule and the two forms agree for them, but
 * `muga` is a reverse market with bespoke terms (6.7% coverage priced at 1.4%),
 * and the flat form would overwrite its real numbers with invented ones. Scaling
 * from the default reproduces every market exactly at its own terms and keeps
 * the proportionality as the slider moves.
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
