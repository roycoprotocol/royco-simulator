import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { inferCadence, loadSeriesSource } from './source.mjs';

const [id, source] = process.argv.slice(2);
if (!id || !source) {
  console.error('Usage: npm run sim:new -- <market-id> <date-price.csv-or-public-url>');
  process.exit(1);
}
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
  console.error('Market id must use lowercase letters, numbers, and hyphens.');
  process.exit(1);
}

const root = process.cwd();
const imported = await loadSeriesSource(source, { cwd: root });
const series = imported.series;

const marketDir = path.join(root, 'lib', 'markets', id);
const routeDir = path.join(root, 'app', `${id}-sim`);
await mkdir(marketDir, { recursive: true });
await mkdir(routeDir, { recursive: true });
const manifestPath = path.join(marketDir, 'market.json');
try {
  await access(manifestPath);
  throw new Error(`${manifestPath} already exists; refusing to overwrite it.`);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const title = id.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ');
const cadence = inferCadence(series);
const manifest = {
  id,
  route: `/${id}-sim`,
  dataCadence: cadence,
  copy: {
    marketEyebrow: `ROYCO · ${title.toUpperCase()} MARKET`,
    title: `${title} Sim`,
    hero: `A hypothetical Royco Senior/Junior market over the ${title} strategy. Senior is protected by Junior's first-loss buffer; Junior earns yield for taking that risk.`,
    loadedMarket: `${title} strategy (${cadence} data)`,
    strategyLegend: 'Underlying strategy',
    seniorTrancheName: `Royco-ST ${title} Senior`,
    seniorTrancheSymbol: `ST-${id.toUpperCase()}`,
    juniorTrancheName: `Royco-JT ${title} Junior`,
    juniorTrancheSymbol: `JT-${id.toUpperCase()}`,
    integrationLabel: id.toUpperCase().replaceAll('-', '_'),
    footerParagraphs: [
      `The underlying series contains ${series.length} ${cadence} observations from ${series[0].date} to ${series.at(-1).date}. Replace this sentence with the verified source, fee treatment, and provenance.`,
      'This is a counterfactual mechanism illustration, not a track record or announced product.',
      'Backtest math uses the shared Royco Day accountant engine. Parameters remain illustrative until the full certification command passes.',
    ],
  },
  defaults: {
    depositST: 1000,
    exitBufferPct: 5,
    linkJuniorToFirstLoss: true,
    minCoveragePct: 20,
    observationDays: 45,
    seniorShareToJuniorPct: 47,
    yieldShareAtFullUtilPct: 47,
    selfLiquidationBonusPct: 0.25,
  },
  presets: {
    conservative: { minimumCoveragePct: 24, observationDays: 60, seniorYieldShareToJuniorPct: 34 },
    balanced: { minimumCoveragePct: 20, observationDays: 45, seniorYieldShareToJuniorPct: 47 },
    aggressive: { minimumCoveragePct: 18, observationDays: 16, seniorYieldShareToJuniorPct: 59 },
  },
  certification: {
    label: 'Shared accountant engine',
    detail: 'Backtest math uses the shared Royco Day accountant engine and must pass the repository parity suite before publication.',
  },
  provenance: {
    source: imported.sourceUrl ?? 'REPLACE_WITH_SOURCE',
    sourceUrl: imported.sourceUrl ?? undefined,
    retrievedAt: imported.sourceUrl ? new Date().toISOString().slice(0, 10) : undefined,
    priceType: 'price',
    feesIncluded: 'unknown',
    notes: 'REPLACE_WITH_DATA_NOTES',
  },
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(path.join(marketDir, 'series.json'), `${JSON.stringify(series, null, 2)}\n`);
await writeFile(path.join(marketDir, 'market.ts'), `import manifest from './market.json';\nimport series from './series.json';\nimport { marketFromManifest, type MarketManifest } from '@/lib/simulator-template/manifest';\n\nexport const MARKET = marketFromManifest(manifest as MarketManifest, series);\n`);
await writeFile(path.join(routeDir, 'page.tsx'), `import type { Metadata } from 'next';\nimport MarketSimulator from '@/components/simulator/MarketSimulator';\nimport SimulatorPageShell from '@/components/simulator/SimulatorPageShell';\nimport { MARKET } from '@/lib/markets/${id}/market';\nimport type { InitialQuery } from '@/lib/simulator-template/permalink';\n\nexport const metadata: Metadata = { title: MARKET.copy.title };\n\nexport default async function Page({ searchParams }: { searchParams: Promise<InitialQuery> }) {\n  const query = await searchParams;\n  return (\n    <SimulatorPageShell>\n      <MarketSimulator initialQuery={query} market={MARKET} />\n    </SimulatorPageShell>\n  );\n}\n`);

console.log(`Created ${id} simulator at /${id}-sim`);
console.log(`Imported ${series.length} ${cadence} observations from ${imported.sourceType === 'url' ? imported.sourceUrl : source}`);
console.log(`Edit: lib/markets/${id}/market.json`);
console.log(`Verify: npm run sim:verify -- ${id}`);
