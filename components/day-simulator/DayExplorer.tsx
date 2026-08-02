"use client";

import { useMemo, useState } from "react";

import DayMarketSimulator from "@/components/day-simulator/DayMarketSimulator";
import {
  buildDayDraftMarket,
  type DayDraftSource,
} from "@/lib/day-simulator-template/explorer-market";
import type {
  DayMarket,
  DayMarketManifest,
  DaySeriesPoint,
} from "@/lib/day-simulator-template/market";
import {
  inferCadence,
  parseSourceText,
} from "@/lib/day-simulator-template/source-parser.mjs";

const COLORS = {
  card: "#FFFFFF",
  border: "#DEDDD7",
  text: "#1D1C19",
  muted: "#68665F",
  eyebrow: "#817A70",
  olive: "#3F7D5A",
  warning: "#A24737",
  rust: "#A65B20",
  soft: "#F4F3EF",
};

const MONO = '"SFMono-Regular", Consolas, monospace';
const SANS = "var(--font-inter), Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const DRAFT_OPTION = "__draft__";

type ImportedUrlResponse = {
  series: DaySeriesPoint[];
  cadence: "daily" | "monthly" | "irregular";
  sourceUrl: string;
  provider: string;
  label: string;
  error?: string;
};

const fieldStyle = {
  background: COLORS.card,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 8,
  color: COLORS.text,
  fontFamily: SANS,
  fontSize: 13,
  minHeight: 44,
  padding: "10px 12px",
  width: "100%",
} as const;

function marketLabel(market: DayMarket): string {
  const assetLabel = market.customization.vaultTabs?.label
    ?? market.identity.displayAssetName;
  return assetLabel === market.identity.marketName
    ? market.identity.marketName
    : `${market.identity.marketName} · ${assetLabel}`;
}

function filenameLabel(filename: string): string {
  const label = filename
    .replace(/\.(csv|tsv|txt|json|html?)$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
  return label
    ? label.replace(/\b\w/g, (character) => character.toUpperCase())
    : "Uploaded yield source";
}

function describeFees(value: DayMarketManifest["provenance"]["feesIncluded"]): string {
  if (value === true) return "Fees included";
  if (value === false) return "Fees excluded";
  return "Fee treatment unknown";
}

function describePriceType(value: DayMarketManifest["provenance"]["priceType"]): string {
  if (value === "nav") return "NAV";
  if (value === "price") return "Price";
  if (value === "total-return-index") return "Total-return index";
  if (value === "published-apy") return "Published APY";
  return "Data type unknown";
}

function describeCadence(value: DayMarketManifest["provenance"]["dataCadence"]): string {
  if (value === "daily") return "daily";
  if (value === "monthly") return "monthly";
  if (value === "irregular") return "irregularly spaced";
  return "forward-looking";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The source could not be imported.";
}

export default function DayExplorer({
  markets,
  initialMarket,
  experience = "guided",
  routePath = "/day-sim",
}: {
  markets: readonly DayMarket[];
  initialMarket: DayMarket;
  experience?: "guided" | "learning";
  routePath?: string;
}) {
  const [selectedMarketId, setSelectedMarketId] = useState(initialMarket.id);
  const [draftSource, setDraftSource] = useState<DayDraftSource | null>(null);
  const [draftVersion, setDraftVersion] = useState(0);
  const [sourceUrl, setSourceUrl] = useState("");
  const [importingUrl, setImportingUrl] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [error, setError] = useState("");

  const selectedMarket = markets.find((market) => market.id === selectedMarketId)
    ?? initialMarket;
  const draftMarket = useMemo(
    () => draftSource ? buildDayDraftMarket(draftSource) : null,
    [draftSource],
  );
  const activeMarket = draftMarket ?? selectedMarket;
  const activeKey = draftMarket
    ? `${draftMarket.id}-${draftVersion}`
    : activeMarket.id;
  const isDraft = draftMarket !== null;

  const selectMarket = (marketId: string) => {
    if (marketId === DRAFT_OPTION && draftSource) return;
    setDraftSource(null);
    setSelectedMarketId(marketId);
    setError("");
    const nextUrl = new URL(window.location.href);
    nextUrl.pathname = routePath;
    nextUrl.search = "";
    nextUrl.searchParams.set("market", marketId);
    window.history.replaceState(null, "", nextUrl);
  };

  const activateDraft = (nextSource: DayDraftSource) => {
    buildDayDraftMarket(nextSource);
    setDraftSource(nextSource);
    setDraftVersion((current) => current + 1);
    setError("");
    const nextUrl = new URL(window.location.href);
    nextUrl.pathname = routePath;
    nextUrl.search = "";
    window.history.replaceState(null, "", nextUrl);
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > MAX_UPLOAD_BYTES) {
        throw new Error("Files must be 5 MB or smaller.");
      }
      const text = await file.text();
      const series = parseSourceText(text, {
        contentType: file.type,
        label: file.name,
      });
      activateDraft({
        label: filenameLabel(file.name),
        provider: "User upload",
        sourceUrl: "",
        series,
        cadence: inferCadence(series),
        priceType: "unknown",
        feesIncluded: "unknown",
      });
    } catch (fileError) {
      setError(errorMessage(fileError));
    }
  };

  const importUrl = async () => {
    const trimmedUrl = sourceUrl.trim();
    if (!trimmedUrl) {
      setError("Paste a public CSV, JSON, Google Sheet, or HTML-table URL.");
      return;
    }
    setImportingUrl(true);
    setError("");
    try {
      const response = await fetch("/api/day-explorer/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: trimmedUrl }),
      });
      const imported = await response.json() as ImportedUrlResponse;
      if (!response.ok) {
        throw new Error(imported.error || "The URL could not be imported.");
      }
      activateDraft({
        label: imported.label,
        provider: imported.provider,
        sourceUrl: imported.sourceUrl,
        series: imported.series,
        cadence: imported.cadence,
        priceType: "unknown",
        feesIncluded: "unknown",
      });
    } catch (urlError) {
      setError(errorMessage(urlError));
    } finally {
      setImportingUrl(false);
    }
  };

  const updateDraft = (updates: Partial<DayDraftSource>) => {
    setDraftSource((current) => current ? { ...current, ...updates } : current);
  };

  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      <section
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 14,
          boxShadow: "0 1px 2px rgba(29,28,25,.04)",
          padding: 20,
        }}
      >
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            style={{
              background: COLORS.rust,
              borderRadius: 9999,
              display: "inline-block",
              height: 6,
              width: 6,
            }}
          />
          <span
            style={{
              color: COLORS.eyebrow,
              fontFamily: MONO,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            {experience === "learning" ? "Step 1 · Source input" : "Royco Day simulator"}
          </span>
        </div>
        <h1
          className="mt-2"
          style={{
            color: COLORS.text,
            fontFamily: SANS,
            fontSize: "clamp(22px,2vw,28px)",
            fontWeight: 500,
            letterSpacing: "-0.035em",
            lineHeight: 1.08,
            marginBottom: 0,
          }}
        >
          {experience === "learning"
            ? "Choose a yield source"
            : `${activeMarket.identity.displayAssetName} in Royco Day`}
        </h1>
        <p className="mt-1.5" style={{ color: COLORS.muted, fontSize: 12.5, lineHeight: 1.5 }}>
          {experience === "learning"
            ? `${activeMarket.identity.displayAssetName} is loaded. Keep it, choose another example, or import your own history.`
            : "Compare modeled outcomes, liquidity, and first-loss protection."}
        </p>

        <div
          className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
        >
          <label>
            <span
              className="mb-1.5 block"
              style={{
                color: COLORS.eyebrow,
                fontFamily: MONO,
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              {experience === "learning" ? "Input · Yield source" : "Yield source"}
            </span>
            <select
              aria-label="Explore a yield source"
              onChange={(event) => selectMarket(event.target.value)}
              style={fieldStyle}
              value={isDraft ? DRAFT_OPTION : selectedMarket.id}
            >
              {isDraft && <option value={DRAFT_OPTION}>{draftSource?.label} · Draft</option>}
              <optgroup label="Certified Royco examples">
                {markets.map((market) => (
                  <option key={market.id} value={market.id}>
                    {marketLabel(market)}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <button
            aria-expanded={showImport || isDraft}
            onClick={() => setShowImport((value) => !value)}
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              color: COLORS.text,
              fontFamily: SANS,
              fontSize: 12,
              fontWeight: 600,
              minHeight: 44,
              padding: "10px 14px",
              whiteSpace: "nowrap",
              alignSelf: "end",
            }}
            type="button"
          >
            {showImport || isDraft
              ? "Hide import"
              : experience === "learning"
                ? "Import source data"
                : "Use your own data"}
          </button>
        </div>

        {(showImport || isDraft) && (
          <div
            className="mt-3"
            style={{
              background: COLORS.soft,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 10,
              padding: 12,
            }}
          >
            <span
              className="mb-1 block"
              style={{
                color: COLORS.eyebrow,
                fontFamily: MONO,
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              Import dated values
            </span>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
              <label
                style={{
                  alignItems: "center",
                  background: COLORS.card,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8,
                  color: COLORS.text,
                  cursor: "pointer",
                  display: "flex",
                  fontSize: 12,
                  fontWeight: 600,
                  justifyContent: "center",
                  minHeight: 44,
                  padding: "10px 12px",
                  whiteSpace: "nowrap",
                }}
              >
                <input
                  accept=".csv,.tsv,.txt,.json,.html,.htm,text/csv,text/tab-separated-values,application/json,text/html"
                  aria-label="Upload dated NAV or price history"
                  className="sr-only"
                  onChange={(event) => {
                    void importFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                  type="file"
                />
                Upload file
              </label>
              <input
                aria-label="Public yield source URL"
                onChange={(event) => setSourceUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void importUrl();
                  }
                }}
                placeholder="Paste a CSV, Google Sheet, JSON, or HTML table URL"
                style={fieldStyle}
                type="url"
                value={sourceUrl}
              />
              <button
                disabled={importingUrl}
                onClick={() => void importUrl()}
                style={{
                  background: COLORS.rust,
                  border: `1px solid ${COLORS.rust}`,
                  borderRadius: 8,
                  color: COLORS.card,
                  cursor: importingUrl ? "wait" : "pointer",
                  fontFamily: SANS,
                  fontSize: 12,
                  fontWeight: 600,
                  minHeight: 44,
                  opacity: importingUrl ? 0.65 : 1,
                  padding: "10px 14px",
                  whiteSpace: "nowrap",
                }}
                type="button"
              >
                {importingUrl ? "Importing…" : "Import link"}
              </button>
            </div>
            <p className="mt-2" style={{ color: COLORS.muted, fontSize: 10.5 }}>
              CSV, JSON, Google Sheet, or public HTML table. Imports stay private and unverified.
            </p>
          </div>
        )}

        {error && (
          <p
            className="mt-3"
            role="alert"
            style={{ color: COLORS.warning, fontSize: 12, lineHeight: 1.45 }}
          >
            {error}
          </p>
        )}

        {draftSource && (
          <div
            className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3"
            style={{
              background: COLORS.soft,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 10,
              padding: 12,
            }}
          >
            <label>
              <span
                className="mb-1.5 block"
                style={{ color: COLORS.muted, fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase" }}
              >
                Source name
              </span>
              <input
                aria-label="Imported source name"
                onChange={(event) => updateDraft({ label: event.target.value || "Imported yield source" })}
                style={fieldStyle}
                value={draftSource.label}
              />
            </label>

            <label>
              <span
                className="mb-1.5 block"
                style={{ color: COLORS.muted, fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase" }}
              >
                What does each value represent?
              </span>
              <select
                aria-label="Imported data value type"
                onChange={(event) => updateDraft({
                  priceType: event.target.value as DayDraftSource["priceType"],
                })}
                style={fieldStyle}
                value={draftSource.priceType}
              >
                <option value="unknown">I&apos;m not sure yet</option>
                <option value="nav">NAV — accounting value</option>
                <option value="price">Price — tradable market value</option>
                <option value="total-return-index">Total-return index — value plus distributions</option>
              </select>
            </label>

            <label>
              <span
                className="mb-1.5 block"
                style={{ color: COLORS.muted, fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase" }}
              >
                Are fees included?
              </span>
              <select
                aria-label="Imported data fee treatment"
                onChange={(event) => updateDraft({
                  feesIncluded: event.target.value === "true"
                    ? true
                    : event.target.value === "false"
                      ? false
                      : "unknown",
                })}
                style={fieldStyle}
                value={String(draftSource.feesIncluded)}
              >
                <option value="unknown">I&apos;m not sure yet</option>
                <option value="true">Yes — values are after fees</option>
                <option value="false">No — fees are not deducted</option>
              </select>
            </label>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1" style={{ color: COLORS.muted, fontSize: 10.5 }}>
          <strong style={{ color: isDraft ? COLORS.warning : COLORS.olive, fontWeight: 600 }}>
            {isDraft ? "Unverified upload" : "Certified example"}
          </strong>
          <span>·</span>
          <span>{activeMarket.provenance.observationCount} {describeCadence(activeMarket.provenance.dataCadence)} values</span>
          <span>·</span>
          <span>{activeMarket.provenance.firstDate} to {activeMarket.provenance.lastDate}</span>
          <span>·</span>
          <span>{describePriceType(activeMarket.provenance.priceType)} · {describeFees(activeMarket.provenance.feesIncluded)}</span>
          {isDraft && (
            <p className="basis-full" style={{ color: COLORS.muted, fontSize: 10.5 }}>
              Confirm the value type, fees, and source before publishing.
            </p>
          )}
        </div>
      </section>

      {experience === "learning" ? (
        <DayMarketSimulator
          key={activeKey}
          market={activeMarket}
          variant="learning"
        />
      ) : (
        <DayMarketSimulator
          key={activeKey}
          market={activeMarket}
          variant="guided"
        />
      )}
    </div>
  );
}
