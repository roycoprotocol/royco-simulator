import type {
  DayV3PoolDesignResult,
} from "@/lib/day-v3/pool-design";
import type { DayV3Goals } from "@/lib/day-v3/types";

export const DAY_V3_HANDOFF_SCHEMA = "royco.day.v3-handoff" as const;
export const DAY_V3_HANDOFF_VERSION = 1 as const;

type ResolvedPoolDesign = Extract<
  DayV3PoolDesignResult,
  { status: "resolved" }
>;

export interface DayV3HandoffV1 {
  schema: typeof DAY_V3_HANDOFF_SCHEMA;
  version: typeof DAY_V3_HANDOFF_VERSION;
  exportedAt: string;
  status: "ready-for-revalidation";
  normalization: { senior: 100; targetUtilizationPct: 90 };
  source: {
    marketId: string;
    name: string;
    asset: string;
    sourceApyPct: number;
  };
  goals: DayV3Goals;
  recommendations: {
    minimumCoveragePct: number;
    minimumLiquidityPct: number;
    protectedExitThresholdPct: number;
    protectedExitBonusPct: number;
    canonicalPoolSnapshot: ResolvedPoolDesign;
  };
  warnings: string[];
}

export function buildDayV3HandoffV1(input: {
  exportedAt: string;
  source: DayV3HandoffV1["source"];
  goals: DayV3Goals;
  minimumCoveragePct: number;
  minimumLiquidityPct: number;
  protectedExitThresholdPct: number;
  protectedExitBonusPct: number;
  canonicalPoolSnapshot: ResolvedPoolDesign;
}): DayV3HandoffV1 {
  return {
    schema: DAY_V3_HANDOFF_SCHEMA,
    version: DAY_V3_HANDOFF_VERSION,
    exportedAt: input.exportedAt,
    status: "ready-for-revalidation",
    normalization: { senior: 100, targetUtilizationPct: 90 },
    source: input.source,
    goals: input.goals,
    recommendations: {
      minimumCoveragePct: input.minimumCoveragePct,
      minimumLiquidityPct: input.minimumLiquidityPct,
      protectedExitThresholdPct: input.protectedExitThresholdPct,
      protectedExitBonusPct: input.protectedExitBonusPct,
      canonicalPoolSnapshot: input.canonicalPoolSnapshot,
    },
    warnings: [
      "This handoff is untrusted input to deployment.",
      "Deployment must validate every goal, refresh template policy, recompute E-CLP fields, and scale relative capital to the actual raise.",
      "Imported price history is intentionally excluded.",
    ],
  };
}

export function buildDayV3DeploymentUrl(
  baseUrl: string,
  handoff: DayV3HandoffV1,
): string {
  const url = new URL(baseUrl);
  url.searchParams.set("dayV3", JSON.stringify(handoff));
  return url.toString();
}
