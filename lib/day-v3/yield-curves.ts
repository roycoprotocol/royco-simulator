export interface DayV3YieldCurveAnchors {
  y0Pct: number;
  yTargetPct: number;
  y100Pct: number;
}

export interface DayV3YieldCurveDesign {
  junior: DayV3YieldCurveAnchors;
  slp: DayV3YieldCurveAnchors;
}

export interface DayV3YieldCurveValidation {
  valid: boolean;
  issues: string[];
  juniorPeakPct: number;
  slpPeakPct: number;
  combinedPeakPct: number;
}

export interface DayV3StartingYieldCurveDefaults {
  coverage: number;
  minLiquidity: number;
  riskYDM: {
    y0: number;
    yTarget: number;
    y100: number;
  };
  liqYDM: {
    y0: number;
    yTarget: number;
    y100: number;
  };
}

export interface DayV3StartingYieldCurvePolicy {
  status: "resolved" | "unresolved";
  design: DayV3YieldCurveDesign | null;
  evidence: string[];
  /**
   * Multiplier applied only to both curves' above-target spreads when their raw
   * combined Y100 would exceed Senior's yield budget. Y0 and YT are never
   * changed by this multiplier. `null` means no policy was derived.
   */
  budgetScale: number | null;
}

const zeroCurve = (): DayV3YieldCurveAnchors => ({
  y0Pct: 0,
  yTargetPct: 0,
  y100Pct: 0,
});

const formatPct = (value: number) => `${value.toFixed(2)}%`;

/**
 * Bound the one issuer-editable curve point to the derived curve endpoints.
 *
 * V3 intentionally hides Y0 and Y100. Older links can still contain a YT that
 * predates those derived bounds, so the visible slider and the accountant must
 * agree on the same valid value instead of showing one number and modeling
 * another. This only constrains an input; curve evaluation remains in the
 * shared Day engine.
 */
export function boundDayV3YieldShareAtTarget({
  targetPct,
  y0Pct,
  y100Pct,
}: {
  targetPct: number;
  y0Pct: number;
  y100Pct: number;
}) {
  return Math.min(Math.max(targetPct, y0Pct), Math.max(y0Pct, y100Pct));
}

/**
 * Produce V3's transparent capital-parity starting floor. Each target anchor
 * receives one percentage point of Senior yield share per percentage point of
 * required capital at the operating target. This removes the prior unexplained
 * 2x uplift, which could materially overpay both risk and liquidity before an
 * issuer had expressed a required return. The selected source supplies only the
 * shape around that target: its Y0/YT and Y100/YT ratios. This remains a
 * starting floor, not a claim about market-clearing compensation; the shared
 * accountant reports the resulting return next to the editable curve.
 */
export function deriveDayV3StartingYieldCurvePolicy(
  defaults: DayV3StartingYieldCurveDefaults,
  requirements: { coveragePct: number; minimumLiquidityPct: number },
): DayV3StartingYieldCurvePolicy {
  const evidence: string[] = [];
  const { coveragePct, minimumLiquidityPct } = requirements;
  if (
    !Number.isFinite(coveragePct) ||
    !Number.isFinite(minimumLiquidityPct) ||
    coveragePct < 0 ||
    minimumLiquidityPct < 0
  ) {
    return {
      status: "unresolved",
      design: null,
      evidence: [
        "Minimum Coverage and Minimum Liquidity must be finite, non-negative percentages before a starting curve can be derived.",
      ],
      budgetScale: null,
    };
  }

  const juniorTargetPct = coveragePct;
  const slpTargetPct = minimumLiquidityPct;
  const targetSumPct = juniorTargetPct + slpTargetPct;
  if (targetSumPct > 100) {
    return {
      status: "unresolved",
      design: null,
      evidence: [
        `The capital-parity rule requires ${formatPct(juniorTargetPct)} at Junior's target and ${formatPct(slpTargetPct)} at SLP's target, totaling ${formatPct(targetSumPct)}. The requested target anchors exceed Senior's 100% yield budget and cannot be changed silently.`,
      ],
      budgetScale: null,
    };
  }

  if (coveragePct > 0 && !(defaults.riskYDM.yTarget > 0)) {
    return {
      status: "unresolved",
      design: null,
      evidence: [
        "Junior is active, but the selected source has no positive Junior YT anchor from which to preserve its curve shape.",
      ],
      budgetScale: null,
    };
  }
  if (minimumLiquidityPct > 0 && !(defaults.liqYDM.yTarget > 0)) {
    return {
      status: "unresolved",
      design: null,
      evidence: [
        "SLP is active, but the selected source has no positive SLP YT anchor from which to preserve its curve shape.",
      ],
      budgetScale: null,
    };
  }

  const shapeAroundTarget = (
    curve: DayV3StartingYieldCurveDefaults["riskYDM"],
    targetPct: number,
  ): DayV3YieldCurveAnchors => ({
    y0Pct: targetPct * (curve.y0 / curve.yTarget),
    yTargetPct: targetPct,
    y100Pct: targetPct * (curve.y100 / curve.yTarget),
  });
  const rawDesign: DayV3YieldCurveDesign = {
    junior:
      coveragePct === 0
        ? zeroCurve()
        : shapeAroundTarget(defaults.riskYDM, juniorTargetPct),
    slp:
      minimumLiquidityPct === 0
        ? zeroCurve()
        : shapeAroundTarget(defaults.liqYDM, slpTargetPct),
  };

  evidence.push(
    coveragePct === 0
      ? "Minimum Coverage is 0%, so the Junior starting curve is 0% at every utilization."
      : `Junior YT uses the capital-parity starting floor: ${formatPct(coveragePct)} Minimum Coverage maps to ${formatPct(juniorTargetPct)} of Senior yield. Y0 and Y100 preserve the selected source's ratios around YT.`,
    minimumLiquidityPct === 0
      ? "Minimum Liquidity is 0%, so the SLP starting curve is 0% at every utilization."
      : `SLP YT uses the capital-parity starting floor: ${formatPct(minimumLiquidityPct)} Minimum Liquidity maps to ${formatPct(slpTargetPct)} of Senior yield. Y0 and Y100 preserve the selected source's ratios around YT.`,
  );

  const rawCombinedY100Pct = rawDesign.junior.y100Pct + rawDesign.slp.y100Pct;
  if (!Number.isFinite(rawCombinedY100Pct)) {
    return {
      status: "unresolved",
      design: null,
      evidence: [
        ...evidence,
        "The selected source's scaled Y100 anchors did not produce a finite shared yield budget.",
      ],
      budgetScale: null,
    };
  }
  const rawUpperSpreadPct = rawCombinedY100Pct - targetSumPct;
  const availableUpperSpreadPct = 100 - targetSumPct;
  const budgetScale =
    rawCombinedY100Pct > 100 ? availableUpperSpreadPct / rawUpperSpreadPct : 1;
  const compressUpperSpread = (
    curve: DayV3YieldCurveAnchors,
  ): DayV3YieldCurveAnchors => ({
    y0Pct: curve.y0Pct,
    yTargetPct: curve.yTargetPct,
    y100Pct:
      curve.yTargetPct + (curve.y100Pct - curve.yTargetPct) * budgetScale,
  });
  const design: DayV3YieldCurveDesign = {
    junior: compressUpperSpread(rawDesign.junior),
    slp: compressUpperSpread(rawDesign.slp),
  };
  if (budgetScale < 1) {
    evidence.push(
      `The raw Y100 anchors totaled ${formatPct(rawCombinedY100Pct)}. Only the two above-target spreads were multiplied by ${budgetScale.toFixed(6)} so combined Y100 is 100%; both capital-parity YT anchors and both Y0 ratios remain unchanged.`,
    );
  } else {
    evidence.push(
      `The scaled Y100 anchors use ${formatPct(rawCombinedY100Pct)} of Senior's 100% yield budget, so no shared-budget adjustment was needed.`,
    );
  }

  const validation = validateDayV3YieldCurveDesign(design);
  if (!validation.valid) {
    return {
      status: "unresolved",
      design: null,
      evidence: [
        ...evidence,
        ...validation.issues.map(
          (issue) => `Starting policy unresolved: ${issue}`,
        ),
      ],
      budgetScale: null,
    };
  }
  return { status: "resolved", design, evidence, budgetScale };
}

/**
 * Validate issuer-entered static anchors before they reach the accountant.
 * Curve evaluation remains exclusively in the shared Day engine.
 */
export function validateDayV3YieldCurveDesign(
  design: DayV3YieldCurveDesign,
): DayV3YieldCurveValidation {
  const issues: string[] = [];
  const validateSide = (
    label: string,
    curve: DayV3YieldCurveAnchors,
  ): number => {
    const values = [curve.y0Pct, curve.yTargetPct, curve.y100Pct];
    if (values.some((value) => !Number.isFinite(value))) {
      issues.push(`${label} curve anchors must be finite numbers.`);
      return 0;
    }
    if (values.some((value) => value < 0 || value > 100)) {
      issues.push(`${label} curve anchors must stay between 0% and 100%.`);
    }
    if (!(
      curve.y0Pct <= curve.yTargetPct && curve.yTargetPct <= curve.y100Pct
    )) {
      issues.push(`${label} must satisfy Y0 ≤ YT ≤ Y100.`);
    }
    return Math.max(...values);
  };

  const juniorPeakPct = validateSide("Junior", design.junior);
  const slpPeakPct = validateSide("SLP", design.slp);
  const combinedPeakPct = juniorPeakPct + slpPeakPct;
  if (combinedPeakPct > 100 + 1e-9) {
    issues.push(
      "This uncapped simulation requires the Junior and SLP full-utilization anchors to total 100% or less. Deployment hard caps are configured separately.",
    );
  }

  return {
    valid: issues.length === 0,
    issues,
    juniorPeakPct,
    slpPeakPct,
    combinedPeakPct,
  };
}
