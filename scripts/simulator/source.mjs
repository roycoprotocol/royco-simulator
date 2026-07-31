import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  inferCadence,
  normalizeDate,
  parseSourceText,
} from '../../lib/day-simulator-template/source-parser.mjs';

export {
  inferCadence,
  normalizeDate,
  parseSourceText,
};

const googleSheetsCsvUrl = (sourceUrl) => {
  const url = new URL(sourceUrl);
  if (url.hostname !== 'docs.google.com' || !url.pathname.includes('/spreadsheets/d/')) return sourceUrl;
  const id = url.pathname.split('/spreadsheets/d/')[1]?.split('/')[0];
  if (!id) return sourceUrl;
  const hashGid = new URLSearchParams(url.hash.replace(/^#/, '')).get('gid');
  const gid = url.searchParams.get('gid') ?? hashGid ?? '0';
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
};

export async function loadSeriesSource(source, { cwd = process.cwd(), fetchImpl = fetch } = {}) {
  if (/^https?:\/\//i.test(source)) {
    const fetchUrl = googleSheetsCsvUrl(source);
    const response = await fetchImpl(fetchUrl, {
      redirect: 'follow',
      headers: {
        accept: 'text/csv, application/json, text/html;q=0.9, */*;q=0.8',
        'user-agent': 'Royco-Simulator-Importer/1.0',
      },
    });
    if (!response.ok) throw new Error(`Website returned HTTP ${response.status}: ${source}`);
    const text = await response.text();
    return {
      series: parseSourceText(text, {
        contentType: response.headers.get('content-type') ?? '',
        label: source,
      }),
      sourceType: 'url',
      sourceUrl: source,
      resolvedUrl: response.url || fetchUrl,
    };
  }
  const absolutePath = path.resolve(cwd, source);
  const text = await readFile(absolutePath, 'utf8');
  return {
    series: parseSourceText(text, { label: absolutePath }),
    sourceType: 'file',
    sourceUrl: null,
    resolvedUrl: absolutePath,
  };
}
