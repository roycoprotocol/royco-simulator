import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { inferCadence, loadSeriesSource } from "../simulator/source.mjs";

const [id, source, requestedRoute] = process.argv.slice(2);
if (!id || !source) {
  console.error("Usage: npm run day-sim:new -- <market-id> <date-price.csv-or-public-url> [route]");
  process.exit(1);
}
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
  console.error("Market id must use lowercase letters, numbers, and hyphens.");
  process.exit(1);
}

const route = requestedRoute ?? `/${id}-sim`;
if (!/^\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(route)) {
  console.error("Route must be a lowercase absolute path such as /falconx or /markets/falconx.");
  process.exit(1);
}

const root = process.cwd();
const imported = await loadSeriesSource(source, { cwd: root });
const series = imported.series;
const cadence = inferCadence(series);
const first = series[0];
const last = series.at(-1);
const elapsedDays = (Date.parse(last.date) - Date.parse(first.date)) / 86_400_000;
const sourceApy = elapsedDays > 0
  ? Math.pow(last.price / first.price, 365 / elapsedDays) - 1
  : 0;

const marketDir = path.join(root, "lib", "day-markets", id);
const routeDir = path.join(root, "app", ...route.slice(1).split("/"));
const manifestPath = path.join(marketDir, "market.json");
const routePath = path.join(routeDir, "page.tsx");
try {
  await access(manifestPath);
  throw new Error(`${manifestPath} already exists; refusing to overwrite it.`);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
try {
  await access(routePath);
  throw new Error(`${routePath} already exists; refusing to overwrite it.`);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

await mkdir(marketDir, { recursive: true });
await mkdir(routeDir, { recursive: true });

const marketName = id
  .split("-")
  .map((part) => part[0].toUpperCase() + part.slice(1))
  .join(" ");
const coverage = 0.03;
const minLiquidity = 0.15;
const manifest = {
  id,
  route,
  identity: {
    marketName,
    displayAssetName: marketName,
    underlyingAsset: "REPLACE_WITH_UNDERLYING_ASSET",
    seniorName: "REPLACE_WITH_SENIOR_NAME",
    seniorSymbol: "REPLACE_WITH_SENIOR_SYMBOL",
    juniorName: "REPLACE_WITH_JUNIOR_NAME",
    juniorSymbol: "REPLACE_WITH_JUNIOR_SYMBOL",
  },
  defaults: {
    sourceApy,
    coverage,
    minLiquidity,
    liquidationUtilization: 100,
    observationDays: 7,
    exitBufferPct: 1,
    linkJuniorToFirstLoss: true,
    maintainCoverage: true,
    riskYDM: { mode: "static", y0: 0.06, yTarget: 0.06, y100: 0.18 },
    liqYDM: { mode: "static", y0: 0.08, yTarget: 0.17, y100: 0.2 },
    selfLiquidationBonus: 0.01,
    stProtocolFee: 0,
    jtProtocolFee: 0,
    jtYieldShareProtocolFee: 0,
    ltYieldShareProtocolFee: 0,
    stableYield: 0.035,
    swapFeeBps: 10,
    poolTurnoverPerYear: 8,
    eclpBandWidth: 0.1,
    reinvestLiquidityPremium: true,
    initialST: 1000,
    initialJT: (1000 * coverage) / (0.9 - coverage),
    initialLT: (1000 * minLiquidity) / 0.9,
  },
  targets: {
    seniorApyMin: null,
    seniorApyMax: null,
    juniorApyMin: null,
    juniorApyMax: null,
  },
  certification: {
    intakeConfirmed: false,
    templateExceptions: [],
  },
  provenance: {
    source: imported.sourceUrl ?? "REPLACE_WITH_DATA_SOURCE_LABEL",
    sourceUrl: imported.sourceUrl ?? "REPLACE_WITH_DATA_SOURCE_URL",
    sourceProvider: "REPLACE_WITH_DATA_SOURCE_PROVIDER",
    seriesPath: `lib/day-markets/${id}/series.json`,
    dataCadence: cadence,
    priceType: "unknown",
    feesIncluded: "unknown",
    observationCount: series.length,
    firstDate: first.date,
    lastDate: last.date,
    ...(imported.sourceUrl ? { retrievedAt: new Date().toISOString().slice(0, 10) } : {}),
  },
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(path.join(marketDir, "series.json"), `${JSON.stringify(series, null, 2)}\n`);
await writeFile(
  path.join(marketDir, "market.ts"),
  `import manifest from "./market.json";\nimport series from "./series.json";\nimport { dayMarketFromManifest, type DayMarketManifest } from "@/lib/day-simulator-template/market";\n\nexport const MARKET = dayMarketFromManifest(manifest as DayMarketManifest, series);\n`,
);
await writeFile(
  routePath,
  `import type { Metadata } from "next";\nimport { StrictDaySimulatorPageShell } from "@/components/day-simulator/DaySimulatorPageShell";\nimport { MARKET } from "@/lib/day-markets/${id}/market";\n\nexport const metadata: Metadata = {\n  title: \`\${MARKET.copy.title} — Business overview\`,\n  description: \`A business-first overview of the \${MARKET.identity.marketName} Day market.\`,\n};\n\nexport default function Page() {\n  return <StrictDaySimulatorPageShell market={MARKET} />;\n}\n`,
);

console.log(`Created strict Day simulator ${id} at ${route}`);
console.log(`Imported ${series.length} ${cadence} observations from ${imported.sourceUrl ?? source}`);
console.log(`Edit only: lib/day-markets/${id}/market.json`);
console.log(`Calibrate: npm run day-sim:calibrate -- ${id}`);
console.log(`Verify: npm run day-sim:verify -- ${id}`);
