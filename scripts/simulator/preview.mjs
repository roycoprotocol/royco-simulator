import { spawn } from 'node:child_process';

const id = process.argv[2];
if (!id) {
  console.error('Usage: npm run sim:preview -- <market-id>');
  process.exit(1);
}
console.log(`Preview URL: http://localhost:3000/${id}-sim`);
const child = spawn('npm', ['run', 'dev'], { cwd: process.cwd(), stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
