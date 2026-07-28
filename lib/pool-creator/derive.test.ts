// Run: npx tsx lib/pool-creator/derive.test.ts

import { createPoolBase } from "@/lib/pool-creator/config";
import { createEmptyDraft, suggestIdentity, type PoolDraft, type RiskProfile } from "@/lib/pool-creator/draft";
import { deriveManifest, marketModuleSource, routeSource } from "@/lib/pool-creator/derive";
import { exportFiles, publishCommands } from "@/lib/pool-creator/export";
import { solvePool } from "@/lib/pool-creator/solver";
import { validateManifest, blockingIssues } from "@/lib/pool-creator/validate";
import { buildSyntheticSeries } from "@/lib/pool-creator/synthetic";
import { seriesApy } from "@/lib/pool-creator/preview";
import { annualizedSeriesApy } from "@/lib/day-simulator-template/series";
import { validateDayMarketCustomization } from "@/lib/day-simulator-template/market";

let failures = 0;
let checks = 0;
const ok = (c: boolean, label: string, detail = "") => {
  checks += 1;
  if (!c) {
    failures += 1;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
};

function buildDraft(over: Partial<PoolDraft["goals"]>, label: string, risk: RiskProfile): PoolDraft {
  const draft = createEmptyDraft();
  return {
    ...draft,
    source: {
      kind: "series",
      series: buildSyntheticSeries({ expectedApy: 0.094, risk, anchorDate: "2026-07-01" }),
      origin: {
        kind: "upload",
        label,
        provider: "Test issuer",
        sourceUrl: "https://example.com/strategy",
        priceType: "nav",
        cadence: "daily",
        feesIncluded: true,
      },
    },
    identity: suggestIdentity(label),
    identityTouched: true,
    goals: { ...draft.goals, ...over },
    acknowledged: { erasure: true, immutable: true, seeding: true },
  };
}

function emit(draft: PoolDraft) {
  const series = draft.source?.kind === "series" ? draft.source.series : [];
  const base = createPoolBase({
    sourceApy: seriesApy(series),
    exitBufferPct: draft.goals.exitBufferPct,
    initialSeniorSize: draft.goals.initialSeniorSize,
  });
  const solved = solvePool(base, draft.goals);
  return { ...deriveManifest(draft, base, solved, series), base, solved };
}

// ---------------------------------------------------------------------------
console.log("\n1. A matrix of drafts all emit manifests with zero blocking issues");
// ---------------------------------------------------------------------------
{
  const matrix: Array<{ label: string; risk: RiskProfile; goals: Partial<PoolDraft["goals"]> }> = [];
  const drawdowns = [0.02, 0.05, 0.1];
  const exits = [0.02, 0.03];
  const windows = [7, 30, 90];
  const risks: RiskProfile[] = ["steady", "mild", "choppy", "credit"];
  let n = 0;
  for (const protectedDrawdown of drawdowns) {
    for (const exitShareOfSenior of exits) {
      for (const recoveryDays of windows) {
        for (const risk of risks) {
          n += 1;
          matrix.push({
            label: `Fixture ${n}`,
            risk,
            goals: { protectedDrawdown, exitShareOfSenior, recoveryDays, seniorApy: 0.065, liquidityApy: 0.12 },
          });
        }
      }
    }
  }

  let clean = 0;
  for (const item of matrix) {
    const draft = buildDraft(item.goals, item.label, item.risk);
    const { manifest, series } = emit(draft);
    const blocking = blockingIssues(validateManifest(manifest, series));
    if (blocking.length === 0) clean += 1;
    else if (clean + 1 === matrix.length) {
      console.error(`   ${item.label}:`, blocking.map((b) => b.message).join("; "));
    }
  }
  ok(clean === matrix.length, `all ${matrix.length} fixtures validate clean`, `${clean}/${matrix.length}`);
  console.log(`     ${clean}/${matrix.length} fixtures emitted a publishable manifest`);
}

// ---------------------------------------------------------------------------
console.log("2. The invariants verify.mjs asserts hold exactly");
// ---------------------------------------------------------------------------
{
  const draft = buildDraft({ protectedDrawdown: 0.05, recoveryDays: 7 }, "Invariants", "choppy");
  const { manifest, series } = emit(draft);
  const d = manifest.defaults;

  // sourceApy must equal the annualized series to 1e-12.
  const derivedApy = annualizedSeriesApy(series);
  ok(Math.abs(derivedApy - d.sourceApy) <= 1e-12, "sourceApy matches the series to 1e-12",
    `${Math.abs(derivedApy - d.sourceApy)}`);

  // Sizing relations to 1e-9.
  ok(Math.abs(d.initialJT - (d.initialST * d.coverage) / (0.9 - d.coverage)) <= 1e-9,
    "initialJT is accountant-sized");
  ok(Math.abs(d.initialLT - (d.initialST * d.minLiquidity) / 0.9) <= 1e-9,
    "initialLT is accountant-sized");
  ok(Math.abs(d.liquidationUtilization - 100 / d.exitBufferPct) <= 1e-9,
    "liquidationUtilization derives from exitBufferPct");

  // Ranges.
  ok(d.coverage > 0 && d.coverage < 0.9, "coverage within (0, 0.9)");
  ok(d.minLiquidity > 0 && d.minLiquidity < 1, "minLiquidity within (0, 1)");
  ok(d.observationDays >= 7 && d.observationDays <= 194, "observationDays within [7, 194]");
  ok(d.exitBufferPct >= 1 && d.exitBufferPct <= 99.91, "exitBufferPct within [1, 99.91]");
  ok(d.linkJuniorToFirstLoss === true, "Junior stays linked to first loss");
  ok(d.maintainCoverage === true, "Junior replenishment enabled");

  // Curves.
  for (const [name, curve] of [["risk", d.riskYDM], ["liq", d.liqYDM]] as const) {
    ok(curve.y0 <= curve.yTarget && curve.yTarget <= curve.y100, `${name} anchors monotonic`);
  }
  for (const anchor of ["y0", "yTarget", "y100"] as const) {
    ok(d.riskYDM[anchor] + d.liqYDM[anchor] <= 1, `combined ${anchor} within 100%`);
  }

  // Series shape.
  ok(series.every((p, i) => i === 0 || p.date > series[i - 1].date), "series dates strictly increasing");
  ok(series.every((p) => p.price > 0), "series prices positive");
  ok(manifest.provenance.observationCount === series.length, "observationCount matches");
  ok(manifest.provenance.firstDate === series[0].date, "firstDate matches");
  ok(manifest.provenance.lastDate === series[series.length - 1].date, "lastDate matches");
  ok(manifest.provenance.seriesPath === `lib/day-markets/${manifest.id}/series.json`, "seriesPath matches id");

  // Targets bracket what the accountant actually produces.
  const t = manifest.targets;
  ok(t.seniorApyMin <= manifest.defaults.sourceApy, "senior target band is below the base strategy");
  ok(t.seniorApyMin < t.seniorApyMax && t.juniorApyMin < t.juniorApyMax, "target bands ordered");

  // Customization must be the empty authorized-nothing object.
  ok(validateDayMarketCustomization(manifest.customization).length === 0,
    "customization passes the locked validator");
}

// ---------------------------------------------------------------------------
console.log("3. A perpetual pool is refused publication, honestly");
// ---------------------------------------------------------------------------
{
  const draft = buildDraft({ recoveryDays: 0 }, "Perpetual", "steady");
  const { manifest, series } = emit(draft);
  const blocking = blockingIssues(validateManifest(manifest, series));
  ok(blocking.length > 0, "a perpetual pool cannot be published as a simulator page");
  ok(
    blocking.some((b) => b.message.includes("can be deployed") && b.message.includes("can't be published")),
    "the message distinguishes deployable from publishable",
    blocking.map((b) => b.message).join(" | "),
  );
}

// ---------------------------------------------------------------------------
console.log("4. Missing provenance blocks, and says why it matters");
// ---------------------------------------------------------------------------
{
  const draft = buildDraft({}, "Provenance", "mild");
  const { manifest, series } = emit(draft);

  manifest.provenance.feesIncluded = "unknown";
  let blocking = blockingIssues(validateManifest(manifest, series));
  ok(blocking.some((b) => b.message.includes("net of fees")),
    "unknown fee treatment blocks an imported history");

  manifest.provenance.feesIncluded = true;
  manifest.provenance.sourceProvider = "";
  blocking = blockingIssues(validateManifest(manifest, series));
  ok(blocking.some((b) => b.message.includes("who publishes")), "a missing publisher blocks");

  manifest.provenance.sourceProvider = "Someone";
  manifest.provenance.sourceUrl = "not-a-url";
  blocking = blockingIssues(validateManifest(manifest, series));
  ok(blocking.some((b) => b.message.includes("http(s)")), "a malformed source URL blocks");
}

// ---------------------------------------------------------------------------
console.log("5. Unconfirmed acknowledgements block certification");
// ---------------------------------------------------------------------------
{
  const draft = { ...buildDraft({}, "Unconfirmed", "mild"), acknowledged: { erasure: true } };
  const { manifest, series } = emit(draft);
  ok(manifest.certification.intakeConfirmed === false, "intake is not confirmed");
  ok(
    blockingIssues(validateManifest(manifest, series)).some((b) => b.message.includes("three statements")),
    "validation asks for the confirmations",
  );
}

// ---------------------------------------------------------------------------
console.log("5b. A modelled strategy never claims a track record");
// ---------------------------------------------------------------------------
{
  const draft = createEmptyDraft();
  const modelled: PoolDraft = {
    ...draft,
    source: { kind: "described", label: "Modelled", expectedApy: 0.094, risk: "choppy", anchorDate: "2026-07-01" },
    identity: suggestIdentity("Modelled"),
    identityTouched: true,
    acknowledged: { erasure: true, immutable: true, seeding: true },
  };
  const synthetic = buildSyntheticSeries({ expectedApy: 0.094, risk: "choppy", anchorDate: "2026-07-01" });
  const base = createPoolBase({ sourceApy: 0.094, initialSeniorSize: modelled.goals.initialSeniorSize });
  const solved = solvePool(base, modelled.goals);
  const { manifest, series } = deriveManifest(modelled, base, solved, synthetic);

  // The synthetic path exists for the simulator, but must never be published
  // as though it were observed.
  ok(synthetic.length > 300, "a path was modelled for the simulator");
  ok(series.length === 0, "but the published series is empty");
  ok(manifest.provenance.observationCount === 0, "and it claims zero observations");
  ok(manifest.provenance.dataMode === "published-apy-forward", "labelled as a forward, not history",
    manifest.provenance.dataMode);
  ok(manifest.provenance.dataCadence === "none", "cadence none");
  ok(manifest.provenance.priceType === "published-apy", "priceType published-apy");
  ok(manifest.provenance.firstDate === "not-applicable", "no first date is claimed");
  ok(
    manifest.provenance.publishedApy === manifest.defaults.sourceApy,
    "published APY matches the base yield exactly",
  );

  const issues = validateManifest(manifest, series);
  ok(blockingIssues(issues).length === 0, "a modelled market still validates",
    blockingIssues(issues).map((b) => b.message).join("; "));
  ok(
    issues.some((i) => i.severity === "warning" && i.message.includes("no track record")),
    "and warns that it has no track record",
  );
}

// ---------------------------------------------------------------------------
console.log("6. Emitted files match the factory's contracts");
// ---------------------------------------------------------------------------
{
  const draft = buildDraft({}, "Files", "mild");
  const { manifest, series } = emit(draft);
  const files = exportFiles(manifest, series);

  ok(files.length === 4, "four files emitted");
  const names = files.map((f) => f.path.split("/").pop()).sort();
  ok(names.join(",") === "market.json,market.ts,page.tsx,series.json", "expected filenames", names.join(","));

  // verify.mjs greps market.ts for these three strings and rejects logic in it.
  const moduleSource = marketModuleSource();
  for (const contract of ['import series from "./series.json"', "dayMarketFromManifest", "type DayMarketManifest"]) {
    ok(moduleSource.includes(contract), `market.ts contains factory contract: ${contract}`);
  }
  ok(!moduleSource.includes("defaultConfig"), "market.ts has no accounting");
  ok(!moduleSource.includes("function "), "market.ts has no functions");
  ok(!moduleSource.includes("<"), "market.ts has no JSX or generics");

  // The route must be the strict shell with no design overrides.
  const route = routeSource(manifest.id, manifest);
  ok(route.includes("StrictDaySimulatorPageShell"), "route uses the strict shell");
  ok(route.includes(`@/lib/day-markets/${manifest.id}/market`), "route imports its market");
  ok(!route.includes("variant=") && !route.includes("style=") && !route.includes("className="),
    "route has no design overrides");

  // market.json must round-trip as JSON.
  const json = files.find((f) => f.path.endsWith("market.json"))!;
  ok(JSON.parse(json.contents).id === manifest.id, "market.json parses back");

  ok(publishCommands(manifest.id).length === 3, "three publish commands");
  ok(publishCommands(manifest.id)[2].includes("certify"), "certification is the last step");
}

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${checks - failures}/${checks} checks passed\n`);
process.exit(failures === 0 ? 0 : 1);
