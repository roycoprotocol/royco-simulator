import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
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
  const requiredGroups = [
    "liquidity-utilization",
    "rounding-boundaries",
    "premium-share-mint",
    "mint-dilution-clamp",
    "nonzero-fees",
    "lt-raw-commit",
    "post-operations",
    "operation-gates",
    "premium-reinvestment",
    "self-liquidation",
  ];
  const actualGroups = new Set(vectors.map((vector) => vector.group));
  for (const group of requiredGroups) {
    if (!actualGroups.has(group)) throw new Error(`generated vector inventory is missing ${group}`);
  }

  const harnessSha256 = createHash("sha256").update(readFileSync(harnessSource)).digest("hex");
  const bundle = {
    schemaVersion: lock.schemaVersion,
    provenance: {
      repository: lock.repository,
      commit: lock.commit,
      solc: lock.solc,
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
