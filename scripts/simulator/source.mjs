import { readFile } from 'node:fs/promises';
import path from 'node:path';

const DATE_HEADERS = ['date', 'as of date', 'asof date', 'valuation date', 'nav date', 'pricing date'];
const PRICE_HEADERS = [
  'nav',
  'price',
  'close',
  'closing price',
  'adjusted close',
  'adj close',
  'value',
  'index',
  'index value',
  'total return index',
];

const cleanText = (value) => String(value ?? '').replace(/\u00a0/g, ' ').trim();
const normalizedHeader = (value) =>
  cleanText(value)
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const decodeHtml = (value) =>
  cleanText(value)
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();

const monthNumber = (name) => {
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const index = months.indexOf(name.slice(0, 3).toLowerCase());
  return index >= 0 ? index + 1 : null;
};

export function normalizeDate(value) {
  const raw = cleanText(value).replace(/\s+\d{1,2}:\d{2}(?::\d{2})?.*$/, '');
  let match = raw.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?(?:T.*)?$/);
  if (match) return match[3] ? `${match[1]}-${match[2]}-${match[3]}` : `${match[1]}-${match[2]}`;
  match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  }
  match = raw.match(/^(\d{1,2})[\s-]([A-Za-z]{3,9})[\s,-]+(\d{4})$/);
  if (match) {
    const month = monthNumber(match[2]);
    return month ? `${match[3]}-${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}` : null;
  }
  match = raw.match(/^([A-Za-z]{3,9})[\s-]+(\d{1,2}),?[\s-]+(\d{4})$/);
  if (match) {
    const month = monthNumber(match[1]);
    return month ? `${match[3]}-${String(month).padStart(2, '0')}-${match[2].padStart(2, '0')}` : null;
  }
  return null;
}

const normalizePrice = (value) => {
  let raw = cleanText(value);
  if (!raw || raw.includes('%')) return null;
  const negative = /^\(.*\)$/.test(raw);
  raw = raw
    .replace(/^\((.*)\)$/, '$1')
    .replace(/(?:USD|EUR|GBP|JPY)/gi, '')
    .replace(/[$£€¥,\s]/g, '');
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw)) return null;
  const price = Number(raw) * (negative ? -1 : 1);
  return Number.isFinite(price) && price > 0 ? price : null;
};

const findColumn = (headers, aliases) => {
  for (const alias of aliases) {
    const exact = headers.findIndex((header) => header === alias);
    if (exact >= 0) return exact;
  }
  return -1;
};

function seriesFromMatrix(matrix, label) {
  for (let headerIndex = 0; headerIndex < Math.min(matrix.length, 8); headerIndex += 1) {
    const headers = matrix[headerIndex].map(normalizedHeader);
    const dateIndex = findColumn(headers, DATE_HEADERS);
    const priceIndex = findColumn(headers, PRICE_HEADERS);
    if (dateIndex < 0 || priceIndex < 0 || dateIndex === priceIndex) continue;
    const points = [];
    for (const row of matrix.slice(headerIndex + 1)) {
      const date = normalizeDate(row[dateIndex]);
      const price = normalizePrice(row[priceIndex]);
      if (date && price !== null) points.push({ date, price });
    }
    if (points.length < 3) continue;
    points.sort((a, b) => a.date.localeCompare(b.date));
    const seen = new Set();
    for (const point of points) {
      if (seen.has(point.date)) throw new Error(`${label} contains duplicate date ${point.date}.`);
      seen.add(point.date);
    }
    return points;
  }
  return null;
}

const splitDelimitedLine = (line, delimiter) => {
  const cells = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(value.trim());
      value = '';
    } else {
      value += char;
    }
  }
  cells.push(value.trim());
  return cells;
};

const parseDelimited = (text, label) => {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return null;
  const delimiters = [',', '\t', ';'];
  const delimiter = delimiters
    .map((candidate) => ({ candidate, count: splitDelimitedLine(lines[0], candidate).length }))
    .sort((a, b) => b.count - a.count)[0];
  if (!delimiter || delimiter.count < 2) return null;
  return seriesFromMatrix(lines.map((line) => splitDelimitedLine(line, delimiter.candidate)), label);
};

const parseHtmlTables = (text, label) => {
  const candidates = [];
  for (const tableMatch of text.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)) {
    const matrix = [];
    for (const rowMatch of tableMatch[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...rowMatch[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)].map((match) =>
        decodeHtml(match[1]),
      );
      if (cells.length) matrix.push(cells);
    }
    const series = seriesFromMatrix(matrix, label);
    if (series) candidates.push(series);
  }
  return candidates.sort((a, b) => b.length - a.length)[0] ?? null;
};

const collectObjectArrays = (value, arrays = []) => {
  if (Array.isArray(value)) {
    if (value.length && value.every((item) => item && typeof item === 'object' && !Array.isArray(item))) arrays.push(value);
    value.forEach((item) => collectObjectArrays(item, arrays));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectObjectArrays(item, arrays));
  }
  return arrays;
};

const parseJson = (text, label) => {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  const candidates = [];
  for (const records of collectObjectArrays(value)) {
    const headers = [...new Set(records.flatMap((record) => Object.keys(record)))];
    const matrix = [headers, ...records.map((record) => headers.map((header) => record[header]))];
    const series = seriesFromMatrix(matrix, label);
    if (series) candidates.push(series);
  }
  return candidates.sort((a, b) => b.length - a.length)[0] ?? null;
};

export function parseSourceText(text, { contentType = '', label = 'source' } = {}) {
  const trimmed = text.trim();
  const attempts = [];
  if (/json/i.test(contentType) || /^[\[{]/.test(trimmed)) attempts.push(() => parseJson(trimmed, label));
  if (/html/i.test(contentType) || /<table\b/i.test(trimmed)) attempts.push(() => parseHtmlTables(trimmed, label));
  attempts.push(() => parseDelimited(trimmed, label));
  for (const attempt of attempts) {
    const series = attempt();
    if (series) return series;
  }
  throw new Error(
    `Could not find a date/price series in ${label}. Use a public page with an HTML table whose headers include Date and NAV/Price/Close/Value, or a direct CSV/JSON URL.`,
  );
}

export function inferCadence(series) {
  if (series.every((point) => point.date.length === 7)) return 'monthly';
  const dayMs = 24 * 60 * 60 * 1000;
  const dayGaps = series
    .slice(1)
    .map((point, index) => (Date.parse(point.date) - Date.parse(series[index].date)) / dayMs)
    .filter((gap) => Number.isFinite(gap) && gap > 0)
    .sort((a, b) => a - b);
  const medianGap = dayGaps[Math.floor(dayGaps.length / 2)] ?? 1;
  return medianGap >= 20 ? 'monthly' : 'daily';
}

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
