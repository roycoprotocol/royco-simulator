// =============================================================================
// Pool creator — pre-flight validation
// -----------------------------------------------------------------------------
// Mirrors the manifest rules in `scripts/day-simulator/verify.mjs` so the UI can
// tell the user whether their pool would certify *before* they download
// anything. Each issue carries the plain-English consequence, not the rule name.
//
// This is a mirror, not the authority: `day-sim:verify` remains the gate. The
// test suite runs a matrix of drafts through both and asserts they agree.
// =============================================================================

import { validateDayMarketCustomization } from "@/lib/day-simulator-template/market";
import type { DayMarketManifest, DaySeriesPoint } from "@/lib/day-simulator-template/market";
import { annualizedSeriesApy } from "@/lib/day-simulator-template/series";
import {
  MAX_PUBLISHABLE_OBSERVATION_DAYS,
  MIN_PUBLISHABLE_OBSERVATION_DAYS,
} from "@/lib/pool-creator/derive";

export type ValidationIssue = {
  /** Blocking issues stop publication; warnings are judgement calls. */
  severity: "error" | "warning";
  /** What the user should read. */
  message: string;
  /** Which step to jump to in order to fix it. */
  step?: 1 | 2 | 3 | 4 | 5;
};

export function validateManifest(
  manifest: DayMarketManifest,
  series: DaySeriesPoint[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const d = manifest.defaults;
  const error = (message: string, step?: ValidationIssue["step"]) =>
    issues.push({ severity: "error", message, step });
  const warn = (message: string, step?: ValidationIssue["step"]) =>
    issues.push({ severity: "warning", message, step });

  // -- identity ------------------------------------------------------------
  if (!manifest.id || !/^[a-z0-9-]+$/.test(manifest.id)) {
    error("Your pool needs a name we can turn into a web address.", 5);
  }
  for (const [field, label] of [
    ["marketName", "pool name"],
    ["underlyingAsset", "underlying asset"],
    ["seniorSymbol", "Senior token ticker"],
    ["juniorSymbol", "Junior token ticker"],
  ] as const) {
    if (!manifest.identity[field]?.trim()) error(`Fill in the ${label}.`, 5);
  }

  // -- the ranges the template enforces ------------------------------------
  if (!(d.coverage > 0 && d.coverage < 0.9)) {
    error("The cushion has to sit between 0% and 90% of Senior.", 2);
  }
  if (!(d.minLiquidity > 0 && d.minLiquidity < 1)) {
    error("The exit pool has to be between 0% and 100% of Senior.", 3);
  }
  if (d.observationDays < MIN_PUBLISHABLE_OBSERVATION_DAYS || d.observationDays > MAX_PUBLISHABLE_OBSERVATION_DAYS) {
    error(
      d.observationDays === 0
        ? `A pool with no recovery window can be deployed, but it can't be published as a simulator page — that needs a window of ${MIN_PUBLISHABLE_OBSERVATION_DAYS}–${MAX_PUBLISHABLE_OBSERVATION_DAYS} days.`
        : `The recovery window has to be between ${MIN_PUBLISHABLE_OBSERVATION_DAYS} and ${MAX_PUBLISHABLE_OBSERVATION_DAYS} days.`,
      2,
    );
  }
  if (!(d.exitBufferPct >= 1 && d.exitBufferPct <= 99.91)) {
    error("The early-exit level is outside the range the template allows.", 2);
  }
  if (!(d.sourceApy > -1 && Number.isFinite(d.sourceApy))) {
    error("We couldn't work out a base yield from your strategy.", 1);
  }

  // -- fees and model inputs must be explicit ------------------------------
  for (const [field, label] of [
    ["stProtocolFee", "Senior protocol fee"],
    ["jtProtocolFee", "Junior protocol fee"],
    ["jtYieldShareProtocolFee", "risk-premium protocol fee"],
    ["ltYieldShareProtocolFee", "liquidity-premium protocol fee"],
  ] as const) {
    const value = d[field];
    if (!(Number.isFinite(value) && value >= 0 && value <= 1)) {
      error(`The ${label} has to be between 0% and 100%.`, 4);
    }
  }
  for (const field of ["stableYield", "swapFeeBps", "poolTurnoverPerYear", "eclpBandWidth"] as const) {
    if (!Number.isFinite(d[field])) error("A venue assumption is missing a value.", 3);
  }

  // -- sizing relations ----------------------------------------------------
  const expectedJT = (d.initialST * d.coverage) / (0.9 - d.coverage);
  const expectedLT = (d.initialST * d.minLiquidity) / 0.9;
  if (Math.abs(d.initialJT - expectedJT) > 1e-9) {
    error("The Junior size doesn't match the cushion it's meant to fund.", 5);
  }
  if (Math.abs(d.initialLT - expectedLT) > 1e-9) {
    error("The exit-pool size doesn't match the exit depth it's meant to support.", 5);
  }
  if (Math.abs(d.liquidationUtilization - 100 / d.exitBufferPct) > 1e-9) {
    error("The early-exit threshold is inconsistent with its utilization.", 2);
  }
  if (d.linkJuniorToFirstLoss !== true) {
    error("Junior sizing has to stay linked to the cushion.", 2);
  }
  if (d.maintainCoverage !== true) {
    warn("Junior top-ups are switched off. Only closed, issuer-funded Junior markets may do that.", 2);
  }

  // -- YDM curves ----------------------------------------------------------
  for (const [name, curve] of [["risk", d.riskYDM], ["liquidity", d.liqYDM]] as const) {
    if (![curve.y0, curve.yTarget, curve.y100].every(Number.isFinite)) {
      error(`The ${name} curve is missing an anchor.`, 4);
    } else if (!(curve.y0 <= curve.yTarget && curve.yTarget <= curve.y100)) {
      error(`The ${name} curve's anchors aren't in order.`, 4);
    }
  }
  for (const anchor of ["y0", "yTarget", "y100"] as const) {
    const total = d.riskYDM[anchor] + d.liqYDM[anchor];
    if (!Number.isFinite(total) || total > 1) {
      error("Junior and the exit pool together would take more than all of Senior's yield.", 4);
    }
  }

  // -- targets -------------------------------------------------------------
  const t = manifest.targets;
  for (const field of ["seniorApyMin", "seniorApyMax", "juniorApyMin", "juniorApyMax"] as const) {
    if (!Number.isFinite(t[field])) error("A target return band is missing.", 4);
  }
  if (t.seniorApyMin > t.seniorApyMax || t.juniorApyMin > t.juniorApyMax) {
    error("A target return band is the wrong way round.", 4);
  }

  // -- provenance ----------------------------------------------------------
  const p = manifest.provenance;
  if (!p.sourceProvider?.trim()) {
    error("Say who publishes your strategy's numbers, so depositors can check them.", 1);
  }
  if (!/^https?:\/\//.test(p.sourceUrl ?? "")) {
    error("The source link has to be a full http(s) address.", 1);
  }
  const isForward = p.dataMode === "published-apy-forward";
  // Only demanded where there IS a published price. A modelled forward market
  // has no fee treatment to declare, and verify.mjs accepts "unknown" — being
  // stricter here would block a market the real gate would pass.
  if (!isForward && p.feesIncluded === "unknown") {
    error("Say whether your published price is net of fees — it changes the yield depositors see.", 1);
  }
  if (p.seriesPath !== `lib/day-markets/${manifest.id}/series.json`) {
    error("The series path doesn't match the pool's name.", 5);
  }

  // -- the series itself ---------------------------------------------------
  if (isForward) {
    // A forward market must claim no history at all, and its published APY must
    // match the base yield exactly.
    if (series.length !== 0 || p.observationCount !== 0) {
      error("A modelled strategy may not claim historical observations.", 1);
    }
    if (p.dataCadence !== "none" || p.priceType !== "published-apy") {
      error("A modelled strategy must be labelled as a published-APY forward.", 1);
    }
    if (!Number.isFinite(p.publishedApy) || Math.abs((p.publishedApy ?? NaN) - d.sourceApy) > 1e-12) {
      error("The published yield doesn't match the base yield.", 1);
    }
    warn(
      "This pool has no track record. Its page will say so plainly, and the chart will be a modelled " +
        "forward path rather than a backtest.",
      1,
    );
  } else if (series.length < 2) {
    error("A backtest needs at least two observations.", 1);
  } else {
    if (p.observationCount !== series.length) {
      error("The recorded observation count doesn't match the data.", 1);
    }
    if (p.firstDate !== series[0].date || p.lastDate !== series[series.length - 1].date) {
      error("The recorded date range doesn't match the data.", 1);
    }
    for (let i = 0; i < series.length; i += 1) {
      const point = series[i];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(point.date) || !(point.price > 0)) {
        error(`Row ${i + 1} of your history isn't a valid date and price.`, 1);
        break;
      }
      if (i > 0 && point.date <= series[i - 1].date) {
        error(`Row ${i + 1} of your history is out of order or a duplicate date.`, 1);
        break;
      }
    }
    // The 1e-12 equality verify.mjs asserts for historical-series markets.
    if (p.dataMode === "historical-series") {
      const derived = annualizedSeriesApy(series);
      if (!Number.isFinite(derived) || Math.abs(derived - d.sourceApy) > 1e-12) {
        error("The base yield doesn't match the history it was derived from.", 1);
      }
    }
  }

  // -- customization -------------------------------------------------------
  for (const issue of validateDayMarketCustomization(manifest.customization)) {
    error(`Presentation: ${issue}`, 5);
  }

  // -- certification -------------------------------------------------------
  if (manifest.certification.intakeConfirmed !== true) {
    error("Confirm the three statements before publishing.", 5);
  }

  return issues;
}

export const blockingIssues = (issues: ValidationIssue[]): ValidationIssue[] =>
  issues.filter((issue) => issue.severity === "error");
