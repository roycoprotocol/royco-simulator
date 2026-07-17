import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const marketId = process.argv[2];
const failures = [];
const requiredFiles = [
  "app/day-sim/page.tsx",
  "components/day-simulator/DaySimulatorPageShell.tsx",
  "lib/day-simulator-template/locked-copy.ts",
  "lib/day-simulator-template/manifest.ts",
  "lib/day/engine/engine.ts",
  "lib/day/engine/runner.ts",
  "lib/day/engine/engine.test.ts",
];

for (const relativePath of requiredFiles) {
  try {
    await access(path.join(root, relativePath));
  } catch {
    failures.push(`missing required file: ${relativePath}`);
  }
}

const route = await readFile(path.join(root, "app/day-sim/page.tsx"), "utf8");
if (!route.includes("DaySimulatorPageShell")) {
  failures.push("public Day route must use the shared Day page shell");
}

const shell = await readFile(
  path.join(root, "components/day-simulator/DaySimulatorPageShell.tsx"),
  "utf8",
);
if (!shell.includes("market?.copy ?? DAY_LOCKED_COPY")) {
  failures.push("Day page shell must fall back to the locked template copy");
}
if (!shell.includes("DaySimulatorSidebar")) {
  failures.push("Day page shell must render the shared Day simulator component");
}

const simulator = await readFile(
  path.join(root, "app/DaySimulatorSidebar.tsx"),
  "utf8",
);
if (!simulator.includes("DAY_TEMPLATE_MANIFEST.defaults.coverage")) {
  failures.push("Day simulator coverage default must come from the template manifest");
}
if (!simulator.includes("DAY_TEMPLATE_MANIFEST.defaults.minLiquidity")) {
  failures.push("Day simulator liquidity default must come from the template manifest");
}
if (!simulator.includes("DAY_TEMPLATE_MANIFEST.defaults.liquidationUtilization")) {
  failures.push("Day simulator liquidation default must come from the template manifest");
}

const manifest = await readFile(
  path.join(root, "lib/day-simulator-template/manifest.ts"),
  "utf8",
);
for (const contract of [
  'route: "/day-sim"',
  'accountant: "lib/day/engine"',
  'dataMode: "deterministic-scenarios"',
]) {
  if (!manifest.includes(contract)) failures.push(`manifest contract missing: ${contract}`);
}

if (marketId) {
  const marketDir = path.join(root, "lib", "day-markets", marketId);
  const marketPath = path.join(marketDir, "market.json");
  let market;
  try {
    market = JSON.parse(await readFile(marketPath, "utf8"));
  } catch {
    failures.push(`missing or invalid Day market manifest: lib/day-markets/${marketId}/market.json`);
  }

  if (market) {
    if (market.id !== marketId) failures.push("Day market id does not match its folder");
    if (market.route !== `/${marketId}-sim`) failures.push("Day market route must match /<market-id>-sim");
    if (!(market.defaults?.minLiquidity > 0 && market.defaults.minLiquidity < 1)) {
      failures.push("Day market minLiquidity must be a fraction between 0 and 1");
    }
    if (!(market.defaults?.sourceApy > -1 && Number.isFinite(market.defaults.sourceApy))) {
      failures.push("Day market sourceApy must be finite and greater than -100%");
    }
    for (const curveName of ["riskYDM", "liqYDM"]) {
      const curve = market.defaults?.[curveName];
      if (!curve || ![curve.y0, curve.yTarget, curve.y100].every(Number.isFinite)) {
        failures.push(`${curveName} must provide finite y0, yTarget, and y100 anchors`);
      } else if (!(curve.y0 <= curve.yTarget && curve.yTarget <= curve.y100)) {
        failures.push(`${curveName} anchors must be monotonic`);
      }
    }
    for (const anchor of ["y0", "yTarget", "y100"]) {
      const total = market.defaults?.riskYDM?.[anchor] + market.defaults?.liqYDM?.[anchor];
      if (!Number.isFinite(total) || total > 1) failures.push(`combined ${anchor} premium shares must not exceed 100%`);
    }
    if (market.targets) {
      const sourceApy = market.defaults.sourceApy;
      const coverage = market.defaults.coverage;
      const minLiquidity = market.defaults.minLiquidity;
      const ltSize = minLiquidity / 0.9;
      const jtSize = (coverage * (1 + 0.1 * ltSize)) / (0.9 - coverage);
      const riskShare = market.defaults.riskYDM.yTarget;
      const liqShare = market.defaults.liqYDM.yTarget;
      const seniorApy = sourceApy * (1 - riskShare - liqShare);
      const juniorApy = sourceApy + (riskShare * sourceApy) / jtSize;
      if (seniorApy < market.targets.seniorApyMin || seniorApy > market.targets.seniorApyMax) {
        failures.push(`target Senior APY ${(seniorApy * 100).toFixed(2)}% is outside its market guardrail`);
      }
      if (juniorApy < market.targets.juniorApyMin || juniorApy > market.targets.juniorApyMax) {
        failures.push(`target Junior APY ${(juniorApy * 100).toFixed(2)}% is outside its market guardrail`);
      }
      console.log(`${marketId} target Senior APY: ${(seniorApy * 100).toFixed(2)}%`);
      console.log(`${marketId} target Junior APY: ${(juniorApy * 100).toFixed(2)}%`);
    }
    if (!/^https?:\/\//.test(market.provenance?.sourceUrl ?? "")) {
      failures.push("Day market sourceUrl must be a complete http(s) URL");
    }
    if (market.provenance?.seriesPath) {
      const sourceSeries = JSON.parse(
        await readFile(path.join(root, market.provenance.seriesPath), "utf8"),
      );
      const first = sourceSeries[0];
      const last = sourceSeries[sourceSeries.length - 1];
      if (sourceSeries.length !== market.provenance.observationCount) {
        failures.push("Day market observationCount does not match its source series");
      }
      if (first?.date !== market.provenance.firstDate || last?.date !== market.provenance.lastDate) {
        failures.push("Day market provenance dates do not match its source series");
      }
      const elapsedDays = (Date.parse(last?.date) - Date.parse(first?.date)) / 86_400_000;
      const derivedApy = Math.pow(last?.price / first?.price, 365 / elapsedDays) - 1;
      if (!Number.isFinite(derivedApy) || Math.abs(derivedApy - market.defaults.sourceApy) > 1e-12) {
        failures.push("Day market sourceApy does not match the annualized source NAV series");
      }
    }
    const marketFiles = await readdir(marketDir);
    if (marketFiles.some((file) => file.endsWith(".css") || file.endsWith(".tsx"))) {
      failures.push("Day market folders may not contain CSS or React components");
    }
  }

  const marketRoute = await readFile(path.join(root, "app", `${marketId}-sim`, "page.tsx"), "utf8");
  if (!marketRoute.includes("DaySimulatorPageShell")) {
    failures.push("Day market route must use the shared Day page shell");
  }
  if (
    marketRoute.includes("@/components/simulator/MarketSimulator") ||
    marketRoute.includes("@/components/simulator/SimulatorPageShell")
  ) {
    failures.push("Day market route must not use the Dawn simulator components");
  }
}

if (failures.length) {
  console.error("Day template verification: FAILED");
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}

const runtime = spawnSync(
  "npx",
  ["tsx", "scripts/day-simulator/verify-runtime.ts", ...(marketId ? [marketId] : [])],
  { cwd: root, stdio: "inherit" },
);
if (runtime.status !== 0) process.exit(runtime.status ?? 1);

console.log("Day configuration integrity: PASS");
console.log("Day locked copy: PASS");
console.log("Day design boundary: PASS");
if (marketId) console.log(`${marketId}: Day market configuration PASS`);
