import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
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
for (const key of ["eyebrow", "title", "description", "disclosure"]) {
  if (!shell.includes(`DAY_LOCKED_COPY.${key}`)) {
    failures.push(`Day page shell is not using locked copy: ${key}`);
  }
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

if (failures.length) {
  console.error("Day template verification: FAILED");
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}

const runtime = spawnSync(
  "npx",
  ["tsx", "scripts/day-simulator/verify-runtime.ts"],
  { cwd: root, stdio: "inherit" },
);
if (runtime.status !== 0) process.exit(runtime.status ?? 1);

console.log("Day configuration integrity: PASS");
console.log("Day locked copy: PASS");
console.log("Day design boundary: PASS");
