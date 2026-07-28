// =============================================================================
// Emit a wizard-built market into the repo, so it can be run through the real
// certification pipeline.
//
//   npx tsx lib/pool-creator/emit-market.ts <id> [--keep]
//
// This is the end-to-end proof that `/create` produces a *certifiable* market
// rather than merely a plausible-looking JSON blob. It writes the same four
// files the wizard offers for download, then the caller runs:
//
//   npm run day-sim:verify   -- <id>
//   npm run day-sim:calibrate -- <id>
//   npm run day-sim:certify  -- <id>
//
// Without `--keep` the emitted market is a scratch artifact; remove it with
// `npx tsx lib/pool-creator/emit-market.ts <id> --clean`.
// =============================================================================

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createPoolBase } from "@/lib/pool-creator/config";
import { createEmptyDraft, suggestIdentity, type PoolDraft } from "@/lib/pool-creator/draft";
import { deriveManifest } from "@/lib/pool-creator/derive";
import { exportFiles } from "@/lib/pool-creator/export";
import { solvePool } from "@/lib/pool-creator/solver";
import { validateManifest, blockingIssues } from "@/lib/pool-creator/validate";
import { buildSyntheticSeries } from "@/lib/pool-creator/synthetic";
import { seriesApy } from "@/lib/pool-creator/preview";

const root = process.cwd();

/** A representative draft: a described strategy with a real drawdown in it. */
function sampleDraft(id: string): PoolDraft {
  const draft = createEmptyDraft();
  const label = id
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return {
    ...draft,
    // Presented as an imported history so this proof exercises the
    // `historical-series` path, which is the one with the 1e-12 sourceApy
    // equality and the row-by-row series checks.
    source: {
      kind: "series",
      series: buildSyntheticSeries({ expectedApy: 0.094, risk: "choppy", anchorDate: "2026-07-01" }),
      origin: {
        kind: "upload",
        label,
        provider: "Royco pool creator (scratch fixture)",
        sourceUrl: "https://royco.org",
        priceType: "nav",
        cadence: "daily",
        feesIncluded: true,
      },
    },
    identity: { ...suggestIdentity(label), slug: id },
    identityTouched: true,
    goals: {
      ...draft.goals,
      protectedDrawdown: 0.05,
      exitShareOfSenior: 0.03,
      seniorApy: 0.066,
      liquidityApy: 0.12,
      recoveryDays: 7,
      exitBufferPct: 1,
      initialSeniorSize: 1_000_000,
    },
    acknowledged: { erasure: true, immutable: true, seeding: true },
  };
}

async function main(): Promise<void> {
  const [id, ...flags] = process.argv.slice(2);
  if (!id) {
    console.error("usage: npx tsx lib/pool-creator/emit-market.ts <id> [--clean]");
    process.exit(1);
  }

  const marketDir = path.join(root, "lib", "day-markets", id);
  const routeDir = path.join(root, "app", id);

  if (flags.includes("--clean")) {
    await rm(marketDir, { recursive: true, force: true });
    await rm(routeDir, { recursive: true, force: true });
    console.log(`Removed ${marketDir} and ${routeDir}`);
    return;
  }

  const draft = sampleDraft(id);
  const series = draft.source?.kind === "series" ? draft.source.series : [];

  const base = createPoolBase({
    sourceApy: seriesApy(series),
    exitBufferPct: draft.goals.exitBufferPct,
    initialSeniorSize: draft.goals.initialSeniorSize,
  });
  const solved = solvePool(base, draft.goals);
  const { manifest, series: emitted } = deriveManifest(draft, base, solved, series);

  const issues = validateManifest(manifest, emitted);
  const blocking = blockingIssues(issues);
  if (blocking.length > 0) {
    console.error("Pre-flight validation failed before writing anything:");
    for (const issue of blocking) console.error(`  - ${issue.message}`);
    process.exit(1);
  }

  await mkdir(marketDir, { recursive: true });
  await mkdir(routeDir, { recursive: true });
  for (const file of exportFiles(manifest, emitted)) {
    await writeFile(path.join(root, file.path), file.contents);
  }

  console.log(`Emitted market "${id}"`);
  console.log(`  route            ${manifest.route}`);
  console.log(`  observations     ${emitted.length}`);
  console.log(`  sourceApy        ${(manifest.defaults.sourceApy * 100).toFixed(4)}%`);
  console.log(`  coverage         ${manifest.defaults.coverage.toFixed(6)}`);
  console.log(`  minLiquidity     ${manifest.defaults.minLiquidity.toFixed(6)}`);
  console.log(`  riskYDM.yTarget  ${manifest.defaults.riskYDM.yTarget.toFixed(6)}`);
  console.log(`  liqYDM.yTarget   ${manifest.defaults.liqYDM.yTarget.toFixed(6)}`);
  console.log(
    `  targets          senior ${(manifest.targets.seniorApyMin * 100).toFixed(2)}–${(manifest.targets.seniorApyMax * 100).toFixed(2)}%` +
      ` · junior ${(manifest.targets.juniorApyMin * 100).toFixed(2)}–${(manifest.targets.juniorApyMax * 100).toFixed(2)}%`,
  );
  console.log(`  warnings         ${issues.length - blocking.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
