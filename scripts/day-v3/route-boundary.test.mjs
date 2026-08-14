import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : /\.(?:ts|tsx)$/.test(entry)
        ? [path]
        : [];
  });
}

const v2Files = sourceFiles(join(root, "components/day-v2"));
const v3Files = sourceFiles(join(root, "components/day-v3"));
const v2RouteFiles = sourceFiles(join(root, "app/v2"));

// This digest freezes the exact V2 snapshot from which V3 was created. It is
// intentionally independent from git state, so later V3 work cannot quietly
// alter the stable route even in a dirty worktree.
const v2Snapshot = createHash("sha256");
for (const file of [...v2Files, ...v2RouteFiles].sort()) {
  const relative = file.slice(root.length + 1);
  v2Snapshot.update(relative);
  v2Snapshot.update("\0");
  v2Snapshot.update(readFileSync(file));
  v2Snapshot.update("\0");
}
assert.equal(
  v2Snapshot.digest("hex"),
  "1579eac8c234ef5dac295eeef8c52c87123e2b55e28257624c33d46748ccb879",
  "V2 changed after the V3 snapshot; review and deliberately refresh the baseline",
);

for (const file of v2Files) {
  const source = readFileSync(file, "utf8");
  assert.doesNotMatch(
    source,
    /(?:components|lib)\/day-v3|\/v3(?:["'/?])/,
    `${file} crosses from the stable V2 boundary into V3`,
  );
}

for (const file of v3Files) {
  const source = readFileSync(file, "utf8");
  assert.doesNotMatch(
    source,
    /from\s+["']@\/components\/day-v2\//,
    `${file} imports a V2 runtime component`,
  );
}

const v2Route = readFileSync(join(root, "app/v2/page.tsx"), "utf8");
const v3Route = readFileSync(join(root, "app/v3/page.tsx"), "utf8");
const rootRoute = readFileSync(join(root, "app/page.tsx"), "utf8");
assert.match(v2Route, /components\/day-v2\/DayV2Summary/);
assert.doesNotMatch(v2Route, /day-v3|\/v3/);
assert.match(v3Route, /components\/day-v3\/DayV3Summary/);
assert.match(v3Route, /index:\s*false/);
assert.match(v3Route, /follow:\s*false/);
assert.match(rootRoute, /export \{ default, metadata \} from "\.\/v3\/page"/);
assert.doesNotMatch(rootRoute, /\.\/v2\/page/);

console.log(
  `Day V3 route boundary: PASS (${v2Files.length} V2 files isolated; ${v3Files.length} V3 files isolated)`,
);
