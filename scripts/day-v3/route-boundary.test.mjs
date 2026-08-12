import assert from "node:assert/strict";
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
assert.match(v2Route, /components\/day-v2\/DayV2Summary/);
assert.doesNotMatch(v2Route, /day-v3|\/v3/);
assert.match(v3Route, /components\/day-v3\/DayV3Summary/);
assert.match(v3Route, /index:\s*false/);
assert.match(v3Route, /follow:\s*false/);

console.log(
  `Day V3 route boundary: PASS (${v2Files.length} V2 files isolated; ${v3Files.length} V3 files isolated)`,
);
