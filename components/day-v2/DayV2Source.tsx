"use client";

import { useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { pct } from "@/components/day-v2/format";
import { buildDayDraftMarket } from "@/lib/day-simulator-template/explorer-market";
import type { DayMarket } from "@/lib/day-simulator-template/market";
import { inferCadence, parseSourceText } from "@/lib/day-simulator-template/source-parser.mjs";

// Parsing and validation are the shared source parser and draft builder, the
// same ones the root explorer uses. This file only drives them and shows what
// they say. Their error strings are surfaced verbatim: they are specific and
// actionable, and paraphrasing them would only make them vaguer.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ACCEPT = ".csv,.tsv,.txt,.json,.html,.htm";

/** Title-cased filename without its extension, matching the explorer. */
function filenameLabel(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  if (!base) return "Uploaded yield source";
  return base.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

const errorMessage = (cause: unknown) =>
  cause instanceof Error ? cause.message : "The source could not be imported.";

export default function DayV2Source({
  activeDraft,
  onClear,
  onImport,
}: {
  activeDraft: DayMarket | null;
  onClear: () => void;
  onImport: (market: DayMarket) => void;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"file" | "url" | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const activate = (source: Parameters<typeof buildDayDraftMarket>[0]) => {
    // Build eagerly so the draft builder's own validation lands in the alert
    // rather than throwing during a later render.
    const market = buildDayDraftMarket(source);
    onImport(market);
    setError("");
    setOpen(false);
  };

  const importFile = async (file: File) => {
    setBusy("file");
    setError("");
    try {
      if (file.size > MAX_UPLOAD_BYTES) throw new Error("Files must be 5 MB or smaller.");
      const text = await file.text();
      // Uploads are parsed here and never leave the browser.
      const series = parseSourceText(text, { contentType: file.type, label: file.name });
      activate({
        label: filenameLabel(file.name),
        provider: "User upload",
        sourceUrl: "",
        series,
        cadence: inferCadence(series),
        priceType: "unknown",
      });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const importUrl = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Paste a public CSV, JSON, Google Sheet, or HTML-table URL.");
      return;
    }
    setBusy("url");
    setError("");
    try {
      const response = await fetch("/api/day-explorer/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      // The route answers with JSON on every path it controls, but a proxy or a
      // gateway in front of it may not, and a raw SyntaxError from parsing an
      // HTML error page is not a useful thing to show anyone.
      let payload: { series?: unknown; error?: string; cadence?: string; provider?: string; label?: string };
      try {
        payload = await response.json();
      } catch {
        throw new Error(`The import service returned an unreadable response (HTTP ${response.status}).`);
      }
      if (!response.ok) throw new Error(payload.error || "The URL could not be imported.");
      activate({
        label: payload.label || trimmed,
        provider: payload.provider || "Imported URL",
        sourceUrl: trimmed,
        series: payload.series as { date: string; price: number }[],
        cadence: (payload.cadence as "daily" | "monthly") ?? "daily",
        priceType: "unknown",
      });
      setUrl("");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const series = activeDraft?.series ?? [];

  // Closed, with nothing imported, this section has one thing to offer: a way
  // in. A full card with a title and a description spent a band of the page
  // above the fold on a secondary action, so it collapses to a single line
  // until it actually has something to show.
  if (!open && !activeDraft) {
    return (
      <div
        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-xl border border-dashed border-[var(--border-subtle)] px-4 py-2.5"
        data-day-v2-section="source"
      >
        <span className="text-[12px] text-[var(--secondary)]">
          Run this mechanism over your own dated price history instead.
        </span>
        <button
          className="text-[12px] font-semibold underline underline-offset-2"
          onClick={() => setOpen(true)}
          type="button"
        >
          Import a source
        </button>
      </div>
    );
  }

  return (
    <Card data-day-v2-section="source">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Your own source</CardTitle>
          <div className="flex items-center gap-2">
            {activeDraft ? <Badge tone="caution">unverified import</Badge> : null}
            <button
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--card)] px-3 py-1.5 text-[12px] font-semibold"
              onClick={() => setOpen((value) => !value)}
              type="button"
            >
              {open ? "Close" : activeDraft ? "Replace source" : "Import a source"}
            </button>
          </div>
        </div>
        <CardDescription>
          Run this market&apos;s mechanism over your own dated price history.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {activeDraft ? (
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-4 py-3">
            <span className="text-[13px] font-semibold">{activeDraft.identity.marketName}</span>
            <span className="font-mono text-[11.5px] tabular-nums text-[var(--secondary)]">
              {series.length} observations, {series[0]?.date} to {series[series.length - 1]?.date}
            </span>
            <span className="font-mono text-[11.5px] tabular-nums text-[var(--secondary)]">
              {pct(activeDraft.defaults.sourceApy)} a year implied
            </span>
            <button
              className="ml-auto text-[11.5px] font-semibold underline underline-offset-2"
              onClick={onClear}
              type="button"
            >
              Remove
            </button>
          </div>
        ) : null}

        {open ? (
          <div className="flex flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-4 py-3.5">
            <label className="flex flex-col gap-1.5">
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
                Upload a file
              </span>
              <input
                accept={ACCEPT}
                className="text-[12px] file:mr-3 file:rounded-md file:border file:border-[var(--border-subtle)] file:bg-[var(--card)] file:px-2.5 file:py-1 file:text-[12px] file:font-semibold"
                disabled={busy !== null}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importFile(file);
                }}
                ref={fileRef}
                type="file"
              />
              <span className="text-[10px] leading-snug text-[var(--tertiary)]">
                CSV, TSV, JSON, or an HTML table, up to 5 MB. It needs a date column and
                one of NAV, price, close, value, or index. Parsed in your browser, never uploaded.
              </span>
            </label>

            <label className="flex flex-col gap-1.5 border-t border-[var(--border-subtle)] pt-3">
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
                Or import a public URL
              </span>
              <span className="flex flex-wrap gap-2">
                <input
                  className="min-w-[240px] flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--card)] px-2.5 py-1.5 text-[12px]"
                  disabled={busy !== null}
                  onChange={(event) => setUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void importUrl();
                    }
                  }}
                  placeholder="https://example.com/nav-history.csv"
                  value={url}
                />
                <button
                  className="rounded-md border border-[var(--foreground)] bg-[var(--foreground)] px-3 py-1.5 text-[12px] font-semibold text-[var(--background)] disabled:opacity-50"
                  disabled={busy !== null}
                  onClick={() => void importUrl()}
                  type="button"
                >
                  {busy === "url" ? "Importing" : "Import"}
                </button>
              </span>
              <span className="text-[10px] leading-snug text-[var(--tertiary)]">
                Public http and https only. Private hosts, credentials in the URL, and
                anything over 5 MB are refused. Google Sheets links are converted for you.
              </span>
            </label>

            <p className="text-[10px] leading-snug text-[var(--tertiary)]">
              Rows without a readable date and a positive price are skipped rather than
              rejected, so check the observation count above matches what you expected.
              Percent values are not prices and will not be read.
            </p>
          </div>
        ) : null}

        {error ? (
          <p
            className="rounded-lg border border-[color-mix(in_srgb,var(--theme-red)_35%,transparent)] bg-[color-mix(in_srgb,var(--theme-red)_8%,transparent)] px-3 py-2 text-[12px] leading-relaxed text-[var(--red-emphasis)]"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
