import { spawn } from "node:child_process";

console.log("Preview URL: http://localhost:3000/day-sim");
const child = spawn("npm", ["run", "dev"], {
  cwd: process.cwd(),
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 0));
