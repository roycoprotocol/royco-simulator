import type { MarketConfig } from "@/lib/day/engine/types";

export type DayTemplateManifest = {
  id: "day";
  route: "/day-sim";
  version: 2;
  accountant: "lib/day/engine";
  dataMode: "source-explorer";
  defaults: Pick<
    MarketConfig,
    | "coverage"
    | "targetUtilization"
    | "liquidationUtilization"
    | "minLiquidity"
    | "liqTargetUtilization"
  >;
};

export const DAY_TEMPLATE_MANIFEST: DayTemplateManifest = {
  id: "day",
  route: "/day-sim",
  version: 2,
  accountant: "lib/day/engine",
  dataMode: "source-explorer",
  defaults: {
    coverage: 0.2,
    targetUtilization: 0.9,
    liquidationUtilization: 1.5,
    minLiquidity: 0.12,
    liqTargetUtilization: 0.9,
  },
};
