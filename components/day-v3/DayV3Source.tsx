"use client";

import { useId, useRef, useState } from "react";

import DayV3Button, {
  dayV3ButtonVariants,
} from "@/components/day-v3/DayV3Button";
import { cn } from "@/lib/utils";

import { buildDayDraftMarket } from "@/lib/day-simulator-template/explorer-market";
import type { DayMarket } from "@/lib/day-simulator-template/market";
import {
  inferCadence,
  parseSourceText,
} from "@/lib/day-simulator-template/source-parser.mjs";

// Parsing and validation are the shared source parser and draft builder, the
// same ones the root explorer uses. This file only drives them and shows what
// they say. Their error strings are surfaced verbatim: they are specific and
// actionable, and paraphrasing them would only make them vaguer.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ACCEPT = ".csv,.tsv,.txt,.json,.html,.htm";

/** Title-cased filename without its extension, matching the explorer. */
function filenameLabel(name: string): string {
  const base = name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!base) return "Uploaded yield source";
  return base.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

const errorMessage = (cause: unknown) =>
  cause instanceof Error ? cause.message : "The source could not be imported.";

export default function DayV3Source({
  onImport,
}: {
  onImport: (market: DayMarket) => void;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"file" | "url" | null>(null);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("No file chosen");
  const fileRef = useRef<HTMLInputElement>(null);
  const fileInputId = useId();
  const urlInputId = useId();

  const activate = (source: Parameters<typeof buildDayDraftMarket>[0]) => {
    // Build eagerly so the draft builder's own validation lands in the alert
    // rather than throwing during a later render.
    const market = buildDayDraftMarket(source);
    onImport(market);
    setError("");
  };

  const importFile = async (file: File) => {
    setBusy("file");
    setError("");
    try {
      if (file.size > MAX_UPLOAD_BYTES)
        throw new Error("Files must be 5 MB or smaller.");
      const text = await file.text();
      // Uploads are parsed here and never leave the browser.
      const series = parseSourceText(text, {
        contentType: file.type,
        label: file.name,
      });
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
      let payload: {
        series?: unknown;
        error?: string;
        cadence?: string;
        provider?: string;
        label?: string;
      };
      try {
        payload = await response.json();
      } catch {
        throw new Error(
          `The import service returned an unreadable response (HTTP ${response.status}).`,
        );
      }
      if (!response.ok)
        throw new Error(payload.error || "The URL could not be imported.");
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

  return (
    <div className="flex flex-col gap-3" data-day-v3-section="source">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="flex flex-col gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3.5">
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
            Upload history
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <input
              accept={ACCEPT}
              className="peer sr-only"
              disabled={busy !== null}
              id={fileInputId}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  setFileName(file.name);
                  void importFile(file);
                }
              }}
              ref={fileRef}
              type="file"
            />
            <label
              className={cn(
                dayV3ButtonVariants({ size: "sm", variant: "secondary" }),
                "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--foreground)] peer-disabled:cursor-not-allowed peer-disabled:opacity-45",
              )}
              htmlFor={fileInputId}
            >
              {busy === "file" ? "Importing" : "Choose file"}
            </label>
            <span
              aria-live="polite"
              className="min-w-0 truncate text-[11px] text-[var(--secondary)]"
            >
              {fileName}
            </span>
          </span>
          <span className="text-[10px] leading-snug text-[var(--tertiary)]">
            CSV, TSV, JSON, or HTML · 5 MB max · include date and NAV or price.
          </span>
        </div>

        <div className="flex flex-col gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3.5">
          <label
            className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]"
            htmlFor={urlInputId}
          >
            Import a public URL
          </label>
          <span className="flex flex-wrap gap-2">
            <input
              className="min-h-9 min-w-[240px] flex-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--card)] px-3 py-2 text-[12px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)]"
              disabled={busy !== null}
              id={urlInputId}
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
            <DayV3Button
              disabled={busy !== null}
              onClick={() => void importUrl()}
              size="sm"
              variant="primary"
            >
              {busy === "url" ? "Importing" : "Import"}
            </DayV3Button>
          </span>
          <span className="text-[10px] leading-snug text-[var(--tertiary)]">
            CSV, JSON, Google Sheets, or an HTML table.
          </span>
        </div>
      </div>

      {error ? (
        <p
          className="rounded-lg border border-[color-mix(in_srgb,var(--theme-red)_35%,transparent)] bg-[color-mix(in_srgb,var(--theme-red)_8%,transparent)] px-3 py-2 text-[12px] leading-relaxed text-[var(--red-emphasis)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
