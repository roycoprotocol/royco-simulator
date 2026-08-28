export type DayV3InputRequirement = {
  id: string;
  label: string;
  ready: boolean;
};

export type DayV3InputReadiness = {
  complete: boolean;
  missing: string[];
};

/**
 * Input completion is deliberately independent from live validation.
 *
 * A canonical service outage or an infeasible E-CLP result may block the final
 * handoff, but neither means the issuer failed to answer a visible question.
 */
export function dayV3InputReadiness(
  requirements: readonly DayV3InputRequirement[],
): DayV3InputReadiness {
  const missing = requirements
    .filter((requirement) => !requirement.ready)
    .map((requirement) => requirement.label);
  return { complete: missing.length === 0, missing };
}

export function dayV3ExitInputReadiness({
  enabled,
  exitSharePct,
  minimumProceedsPer100,
}: {
  enabled: boolean;
  exitSharePct: number | null;
  minimumProceedsPer100: number | null;
}): DayV3InputReadiness {
  if (!enabled) return { complete: true, missing: [] };
  return dayV3InputReadiness([
    {
      id: "exit-amount",
      label: "Depth at NAV",
      ready: exitSharePct !== null && exitSharePct > 0,
    },
    {
      id: "payout-floor",
      label: "Maximum discount",
      ready: minimumProceedsPer100 !== null,
    },
  ]);
}

export function dayV3MissingPreview(missing: readonly string[]): string {
  if (missing.length === 0) return "";
  if (missing.length <= 2) return missing.join(" and ");
  return `${missing.slice(0, 2).join(", ")} +${missing.length - 2} more`;
}
