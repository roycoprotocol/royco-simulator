import { spawnSync } from 'node:child_process';

const id = process.argv[2];
if (!id) {
  console.error('Usage: npm run sim:certify -- <market-id>');
  process.exit(1);
}
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: process.cwd(), stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
};
run('node', ['scripts/simulator/verify.mjs', id]);
run('npm', ['run', 'parity']);
console.log(`${id}: shared accountant parity PASS`);
console.log(`${id}: certification PASS`);
