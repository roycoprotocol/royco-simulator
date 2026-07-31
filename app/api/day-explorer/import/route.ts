import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import {
  inferCadence,
  parseSourceText,
} from "@/lib/day-simulator-template/source-parser.mjs";

export const runtime = "nodejs";

const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized.startsWith("::ffff:")) {
    return isPrivateAddress(normalized.slice("::ffff:".length));
  }
  if (isIP(normalized) === 4) {
    const [a, b] = normalized.split(".").map(Number);
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || a >= 224;
  }
  if (isIP(normalized) === 6) {
    return normalized === "::"
      || normalized === "::1"
      || normalized.startsWith("fc")
      || normalized.startsWith("fd")
      || /^fe[89ab]/.test(normalized)
      || normalized.startsWith("ff")
      || normalized.startsWith("2001:db8");
  }
  return true;
}

async function validatePublicUrl(value: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a complete public http(s) URL.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only public http(s) URLs can be imported.");
  }
  if (url.username || url.password) {
    throw new Error("URLs containing credentials cannot be imported.");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
  ) {
    throw new Error("Local or private network URLs cannot be imported.");
  }
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new Error("Local or private network URLs cannot be imported.");
    }
    return url;
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("The URL must resolve only to public network addresses.");
  }
  return url;
}

function googleSheetsCsvUrl(sourceUrl: URL): URL {
  if (
    sourceUrl.hostname !== "docs.google.com"
    || !sourceUrl.pathname.includes("/spreadsheets/d/")
  ) {
    return sourceUrl;
  }
  const id = sourceUrl.pathname.split("/spreadsheets/d/")[1]?.split("/")[0];
  if (!id) return sourceUrl;
  const hashGid = new URLSearchParams(sourceUrl.hash.replace(/^#/, "")).get("gid");
  const gid = sourceUrl.searchParams.get("gid") ?? hashGid ?? "0";
  return new URL(
    `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`,
  );
}

async function fetchPublicSource(initialUrl: URL): Promise<{
  response: Response;
  resolvedUrl: URL;
}> {
  let currentUrl = googleSheetsCsvUrl(initialUrl);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    currentUrl = await validatePublicUrl(currentUrl.toString());
    const response = await fetch(currentUrl, {
      cache: "no-store",
      headers: {
        accept: "text/csv, application/json, text/html;q=0.9, */*;q=0.8",
        "user-agent": "Royco-Day-Explorer/1.0",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("The source returned an invalid redirect.");
      if (redirect === MAX_REDIRECTS) throw new Error("The source redirected too many times.");
      currentUrl = new URL(location, currentUrl);
      continue;
    }
    if (!response.ok) {
      throw new Error(`The source returned HTTP ${response.status}.`);
    }
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_SOURCE_BYTES) {
      throw new Error("The remote source is larger than 5 MB.");
    }
    return { response, resolvedUrl: currentUrl };
  }
  throw new Error("The source could not be fetched.");
}

async function readLimitedText(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_SOURCE_BYTES) {
      await reader.cancel();
      throw new Error("The remote source is larger than 5 MB.");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function sourceLabel(url: URL): string {
  const filename = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "")
    .replace(/\.(csv|tsv|txt|json|html?)$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
  if (url.hostname === "docs.google.com") return "Google Sheet";
  return filename || url.hostname.replace(/^www\./, "");
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { url?: unknown };
    if (typeof body.url !== "string" || !body.url.trim()) {
      return Response.json(
        { error: "Paste a public CSV, JSON, Google Sheet, or HTML-table URL." },
        { status: 400 },
      );
    }
    const sourceUrl = await validatePublicUrl(body.url.trim());
    const { response, resolvedUrl } = await fetchPublicSource(sourceUrl);
    const text = await readLimitedText(response);
    const series = parseSourceText(text, {
      contentType: response.headers.get("content-type") ?? "",
      label: sourceUrl.toString(),
    });
    return Response.json({
      series,
      cadence: inferCadence(series),
      sourceUrl: sourceUrl.toString(),
      resolvedUrl: resolvedUrl.toString(),
      provider: sourceUrl.hostname.replace(/^www\./, ""),
      label: sourceLabel(sourceUrl),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The source could not be imported.";
    const status = /could not find a date\/price series/i.test(message) ? 422 : 400;
    return Response.json({ error: message }, { status });
  }
}
