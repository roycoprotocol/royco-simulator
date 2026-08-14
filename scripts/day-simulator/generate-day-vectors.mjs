import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const REQUIRED_VECTOR_COUNT = 78;
const repo = process.env.ROYCO_DAY_REPO;
if (!repo) throw new Error("Set ROYCO_DAY_REPO to a local royco-day checkout");

const lockPath = path.join(root, "lib/day/engine/vectors/contract-lock.json");
const lock = JSON.parse(readFileSync(lockPath, "utf8"));
const git = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" });
if (git.status !== 0) throw new Error(git.stderr || "Unable to read royco-day HEAD");
const head = git.stdout.trim();
if (head !== lock.commit) {
  throw new Error(`royco-day HEAD ${head} does not match pinned commit ${lock.commit}`);
}
const worktree = spawnSync(
  "git",
  ["status", "--porcelain", "--untracked-files=all"],
  { cwd: repo, encoding: "utf8" },
);
if (worktree.status !== 0) {
  throw new Error(worktree.stderr || "Unable to inspect royco-day worktree");
}
if (worktree.stdout.trim().length > 0) {
  throw new Error("royco-day worktree must be clean before generating pinned vectors");
}

const forgeVersion = spawnSync("forge", ["--version"], { encoding: "utf8" });
if (forgeVersion.status !== 0) throw new Error(forgeVersion.stderr || "Unable to read Foundry version");
const foundry = forgeVersion.stdout.split("\n")[0].replace(/^forge Version:\s*/, "").trim();
if (foundry !== lock.foundry) {
  throw new Error(`Foundry ${foundry} does not match pinned version ${lock.foundry}`);
}

const harnessSource = path.join(root, "lib/day/engine/harness/DayVectorGen.t.sol");
const harnessTarget = path.join(repo, "test/vectors/DayVectorGen.t.sol");
const outputDir = path.join(repo, "output");
const rawPath = path.join(outputDir, "day-solidity-vectors.raw.json");
mkdirSync(path.dirname(harnessTarget), { recursive: true });
mkdirSync(outputDir, { recursive: true });
copyFileSync(harnessSource, harnessTarget);

try {
  const forge = spawnSync(
    "forge",
    ["test", "--match-contract", "DayVectorGenTest", "--match-test", "testGenerateDaySolidityVectors"],
    { cwd: repo, encoding: "utf8", stdio: "inherit" },
  );
  if (forge.status !== 0) throw new Error(`Foundry vector generation failed with exit ${forge.status}`);

  const vectors = JSON.parse(readFileSync(rawPath, "utf8"));
  if (!Array.isArray(vectors) || vectors.length !== REQUIRED_VECTOR_COUNT) {
    throw new Error(`generated vector inventory must contain exactly ${REQUIRED_VECTOR_COUNT} rows; found ${Array.isArray(vectors) ? vectors.length : "non-array"}`);
  }
  const vectorIds = vectors.map((vector) => vector?.id);
  if (vectorIds.some((id) => typeof id !== "string" || id.length === 0)) {
    throw new Error("every generated vector must have a non-empty string id");
  }
  if (new Set(vectorIds).size !== vectorIds.length) {
    throw new Error("generated vector inventory contains duplicate ids");
  }
  const requiredGroups = [
    "coverage-utilization",
    "liquidity-utilization",
    "rounding-boundaries",
    "virtual-share-valuation",
    "premium-share-mint",
    "mint-dilution-clamp",
    "waterfall",
    "recovery",
    "fixed-term-grace",
    "premium-accounting",
    "post-operations",
    "jt-il-post-operation",
    "fee-processing",
    "self-liquidation",
    "adaptive-ydm-v2",
  ];
  const actualGroups = new Set(vectors.map((vector) => vector.group));
  for (const group of requiredGroups) {
    if (!actualGroups.has(group)) throw new Error(`generated vector inventory is missing ${group}`);
  }

  const harnessSha256 = createHash("sha256").update(readFileSync(harnessSource)).digest("hex");
  const bundle = {
    schemaVersion: lock.schemaVersion,
    expectedVectorCount: REQUIRED_VECTOR_COUNT,
    expectedVectorIds: vectorIds,
    provenance: {
      repository: lock.repository,
      commit: lock.commit,
      solc: lock.solc,
      foundry: lock.foundry,
      harness: "lib/day/engine/harness/DayVectorGen.t.sol",
      harnessSha256,
      generator: "scripts/day-simulator/generate-day-vectors.mjs",
    },
    requiredGroups,
    vectors,
  };
  const target = path.join(root, "lib/day/engine/vectors/golden.json");
  writeFileSync(target, `${JSON.stringify(bundle, null, 2)}\n`);
  console.log(`Wrote ${vectors.length} pinned Day Solidity vectors to ${target}`);
} finally {
  rmSync(harnessTarget, { force: true });
}
