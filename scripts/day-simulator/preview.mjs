import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const marketId = process.argv[2];
let route = "/day-sim";
if (marketId) {
  const manifest = JSON.parse(
    await readFile(path.join(process.cwd(), "lib", "day-markets", marketId, "market.json"), "utf8"),
  );
  route = manifest.route;
}
console.log(`Preview URL: http://localhost:3000${route}`);
const child = spawn("npm", ["run", "dev"], {
  cwd: process.cwd(),
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 0));
