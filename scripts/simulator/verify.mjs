import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const id = process.argv[2];
if (!id) {
  console.error('Usage: npm run sim:verify -- <market-id>');
  process.exit(1);
}
const root = process.cwd();
const marketDir = path.join(root, 'lib', 'markets', id);
const manifest = JSON.parse(await readFile(path.join(marketDir, 'market.json'), 'utf8'));
const series = JSON.parse(await readFile(path.join(marketDir, 'series.json'), 'utf8'));
const failures = [];
const placeholderPattern = /REPLACE(?:_|\s+WITH|\s+THIS\s+SENTENCE)/i;
const findPlaceholder = (value, field = 'manifest') => {
  if (typeof value === 'string') {
    if (placeholderPattern.test(value)) failures.push(`${field} still contains placeholder copy`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => findPlaceholder(item, `${field}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => findPlaceholder(item, `${field}.${key}`));
  }
};
findPlaceholder(manifest);
if (manifest.id !== id) failures.push('manifest id does not match folder');
if (manifest.route !== `/${id}-sim`) failures.push('route must match /<id>-sim');
if (manifest.provenance?.feesIncluded === 'unknown') failures.push('feesIncluded must be true or false before certification');
if (!['nav', 'total-return-index', 'price'].includes(manifest.provenance?.priceType)) failures.push('priceType must be nav, total-return-index, or price');
if (manifest.provenance?.sourceUrl && !/^https?:\/\//.test(manifest.provenance.sourceUrl)) failures.push('sourceUrl must be a complete http(s) URL');
if (manifest.provenance?.sourceUrl && !/^\d{4}-\d{2}-\d{2}$/.test(manifest.provenance?.retrievedAt ?? '')) failures.push('website imports must record retrievedAt as YYYY-MM-DD');
if (!Array.isArray(series) || series.length < 3) failures.push('at least three data points are required');
let previous = '';
const seen = new Set();
for (const [index, point] of series.entries()) {
  if (!/^\d{4}-\d{2}(?:-\d{2})?$/.test(point.date)) failures.push(`row ${index + 1}: invalid date`);
  if (!Number.isFinite(point.price) || point.price <= 0) failures.push(`row ${index + 1}: invalid price`);
  if (point.date <= previous) failures.push(`row ${index + 1}: dates must be unique and ascending`);
  if (seen.has(point.date)) failures.push(`row ${index + 1}: duplicate date`);
  seen.add(point.date);
  previous = point.date;
}
const preset = manifest.presets;
if (!(preset.conservative.minimumCoveragePct >= preset.balanced.minimumCoveragePct && preset.balanced.minimumCoveragePct >= preset.aggressive.minimumCoveragePct)) failures.push('coverage must decrease down the ladder');
if (!(preset.conservative.observationDays >= preset.balanced.observationDays && preset.balanced.observationDays >= preset.aggressive.observationDays)) failures.push('observation period must decrease down the ladder');
if (!(preset.conservative.seniorYieldShareToJuniorPct <= preset.balanced.seniorYieldShareToJuniorPct && preset.balanced.seniorYieldShareToJuniorPct <= preset.aggressive.seniorYieldShareToJuniorPct)) failures.push('Junior yield share must increase down the ladder');
const marketFiles = await readdir(marketDir);
if (marketFiles.some((file) => file.endsWith('.css') || file.endsWith('.tsx'))) failures.push('market folders may not contain CSS or React components');
const templateLock = JSON.parse(await readFile(path.join(root, 'scripts', 'simulator', 'template-lock.json'), 'utf8'));
for (const [relativePath, expectedHash] of Object.entries(templateLock)) {
  const contents = await readFile(path.join(root, relativePath));
  const actualHash = createHash('sha256').update(contents).digest('hex');
  if (actualHash !== expectedHash) {
    failures.push(`shared template changed: ${relativePath}; full visual audit and lock review required`);
  }
}
const component = await readFile(path.join(root, 'components/simulator/MarketSimulator.tsx'), 'utf8');
for (const key of ['overviewDescription', 'customizeDescription', 'reviewDescription', 'deployDescription']) {
  if (!component.includes(`LOCKED_COPY.${key}`)) failures.push(`shared component is not using locked copy: ${key}`);
}
if (failures.length) {
  console.error(`${id}: verification FAILED`);
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}
const runtime = spawnSync('npx', ['tsx', 'scripts/simulator/verify-runtime.ts', id], { cwd: root, stdio: 'inherit' });
if (runtime.status !== 0) process.exit(runtime.status ?? 1);
console.log(`${id}: data integrity PASS`);
console.log(`${id}: copy contract PASS`);
console.log(`${id}: design boundary PASS`);
