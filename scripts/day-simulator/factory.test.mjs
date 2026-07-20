import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const sandbox = await mkdtemp(path.join(os.tmpdir(), "royco-day-factory-"));
const source = path.join(sandbox, "source.csv");
const factory = path.join(process.cwd(), "scripts", "day-simulator", "create.mjs");

try {
  await writeFile(source, "date,nav\n2025-01-01,100\n2025-01-02,100.1\n2025-01-03,100.2\n");
  const first = spawnSync(process.execPath, [factory, "factory-test", source, "/factory-test"], {
    cwd: sandbox,
    encoding: "utf8",
  });
  assert.equal(first.status, 0, first.stderr || first.stdout);

  const marketDir = path.join(sandbox, "lib", "day-markets", "factory-test");
  for (const file of ["market.json", "market.ts", "series.json"]) await access(path.join(marketDir, file));
  await access(path.join(sandbox, "app", "factory-test", "page.tsx"));

  const manifest = JSON.parse(await readFile(path.join(marketDir, "market.json"), "utf8"));
  assert.equal(manifest.id, "factory-test");
  assert.equal(manifest.route, "/factory-test");
  assert.equal(manifest.provenance.observationCount, 3);
  assert.equal(manifest.certification.intakeConfirmed, false);
  assert.equal(manifest.identity.displayAssetName, "Factory Test");
  assert.equal(manifest.customization.explicitlyAuthorized, false);
  assert.deepEqual(manifest.customization.hiddenSections, []);
  assert.deepEqual(manifest.customization.copyOverrides, {});

  const second = spawnSync(process.execPath, [factory, "factory-test", source, "/factory-test"], {
    cwd: sandbox,
    encoding: "utf8",
  });
  assert.notEqual(second.status, 0, "factory must refuse to overwrite a market or route");
  console.log("Strict Day factory creation: PASS");
  console.log("Strict Day overwrite protection: PASS");
} finally {
  await rm(sandbox, { recursive: true, force: true });
}
