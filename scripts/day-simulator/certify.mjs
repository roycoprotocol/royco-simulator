import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const marketId = process.argv[2];
const vectorLock = JSON.parse(readFileSync("lib/day/engine/vectors/contract-lock.json", "utf8"));
const vectorBundle = JSON.parse(readFileSync("lib/day/engine/vectors/golden.json", "utf8"));
if (!Number.isInteger(vectorBundle.expectedVectorCount) || vectorBundle.expectedVectorCount < 78) {
  throw new Error("Day certification requires a manifest of at least 78 pinned Solidity vectors");
}
if (!Array.isArray(vectorBundle.vectors) || vectorBundle.vectors.length !== vectorBundle.expectedVectorCount) {
  throw new Error(`Day Solidity vector count drift: expected ${vectorBundle.expectedVectorCount}, found ${vectorBundle.vectors?.length ?? "non-array"}`);
}
const vectorIds = vectorBundle.vectors.map((vector) => vector?.id);
if (new Set(vectorIds).size !== vectorIds.length) {
  throw new Error("Day Solidity vector inventory contains duplicate ids");
}
if (!Array.isArray(vectorBundle.expectedVectorIds)
  || vectorBundle.expectedVectorIds.length !== vectorIds.length
  || vectorBundle.expectedVectorIds.some((id, index) => id !== vectorIds[index])) {
  throw new Error("Day Solidity vector id inventory does not match its generated manifest");
}
run("node", ["scripts/day-simulator/verify.mjs", ...(marketId ? [marketId] : [])]);
run("npx", ["tsx", "lib/day/engine/parity.ts"]);
run("node", ["scripts/simulator/source.test.mjs"]);
run("npm", ["test"]);
run("npm", ["run", "lint"]);
run("npm", ["run", "build"]);

console.log("Data integrity: PASS");
console.log(
  `Accountant parity: PASS (${vectorBundle.expectedVectorCount}/${vectorBundle.expectedVectorCount} replayed vectors from royco-day @${vectorLock.commit.slice(0, 10)})`,
);
console.log("Calibration guardrails: PASS");
console.log("Locked copy: PASS");
console.log("Design contract: PASS");
console.log("Tests and build: PASS");
console.log("SLP yield/volume economics: OFF-CHAIN MODEL SCOPE — invariant-tested, not represented as fixed onchain economics");
