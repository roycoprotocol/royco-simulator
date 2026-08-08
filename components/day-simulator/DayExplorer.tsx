"use client";

import { useMemo, useState } from "react";

import DayMarketSimulator from "@/components/day-simulator/DayMarketSimulator";
import {
  buildDayDraftMarket,
  buildDayYieldDraftMarket,
  type DayDraftSource,
  type DayYieldDraftSource,
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
import {
  DAY_SIMULATOR_THEME,
  DAY_SIMULATOR_TYPE,
  DayButton,
  DayFieldCaption,
  DayFieldLabel,
  DaySectionHeader,
  DaySegmentedButton,
  DaySegmentedControl,
  DaySurface,
  DayZoneHeader,
} from "@/components/day-simulator/DaySimulatorUI";

const COLORS = {
  card: DAY_SIMULATOR_THEME.cardBg,
  border: DAY_SIMULATOR_THEME.border,
  text: DAY_SIMULATOR_THEME.text,
  muted: DAY_SIMULATOR_THEME.muted,
  eyebrow: DAY_SIMULATOR_THEME.eyebrow,
  olive: DAY_SIMULATOR_THEME.olive,
  warning: DAY_SIMULATOR_THEME.danger,
  rust: DAY_SIMULATOR_THEME.accent,
  soft: DAY_SIMULATOR_THEME.pageBg,
};

const MONO = DAY_SIMULATOR_TYPE.mono;
const SANS = DAY_SIMULATOR_TYPE.sans;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const DRAFT_OPTION = "__draft__";
const DEFAULT_CUSTOM_SOURCE_APY_PCT = 5;

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

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function shortMonthYear(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(isoDate);
  if (!match) return isoDate;
  const monthName = SHORT_MONTHS[Number(match[2]) - 1];
  return monthName ? `${monthName} ${match[1]}` : isoDate;
}

function coverageLabel(market: DayMarket): string {
  const { firstDate, lastDate } = market.provenance;
  if (!firstDate || !lastDate) return "Date range unknown";
  return `${shortMonthYear(firstDate)} – ${shortMonthYear(lastDate)}`;
}

function marketLabel(market: DayMarket): string {
  const assetLabel = market.customization.vaultTabs?.label
    ?? market.identity.displayAssetName;
  if (market.provenance.dataMode === "published-apy-forward") {
    return `${assetLabel} · Published APY sample · No dated history`;
  }
  return `${assetLabel} · Historical data · ${coverageLabel(market)}`;
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
  const [yieldDraft, setYieldDraft] = useState<DayYieldDraftSource | null>({
    label: "Custom yield source",
    sourceApy: DEFAULT_CUSTOM_SOURCE_APY_PCT / 100,
  });
  const [draftVersion, setDraftVersion] = useState(0);
  const [sourceMode, setSourceMode] = useState<"yield" | "history">("yield");
  const [yieldLabel, setYieldLabel] = useState("Custom yield source");
  // A custom yield source starts from a neutral 5% net APY rather than the
  // loaded sample's APY, so the typed input is not anchored to another market.
  const [yieldApyPct, setYieldApyPct] = useState(DEFAULT_CUSTOM_SOURCE_APY_PCT);
  const [sourceUrl, setSourceUrl] = useState("");
  const [importingUrl, setImportingUrl] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [error, setError] = useState("");

  const selectedMarket = markets.find((market) => market.id === selectedMarketId)
    ?? initialMarket;
  const draftMarket = useMemo(
    () => draftSource ? buildDayDraftMarket(draftSource) : null,
    [draftSource],
  );
  const yieldDraftMarket = useMemo(
    () => yieldDraft ? buildDayYieldDraftMarket(yieldDraft) : null,
    [yieldDraft],
  );
  const activeMarket = yieldDraftMarket ?? draftMarket ?? selectedMarket;
  const activeKey = yieldDraftMarket || draftMarket
    ? `${activeMarket.id}-${draftVersion}`
    : activeMarket.id;
  const isDraft = draftMarket !== null || yieldDraftMarket !== null;
  const isYieldDraft = yieldDraftMarket !== null;
  const yieldModelIsCurrent = isYieldDraft
    && yieldDraft?.label === yieldLabel
    && Math.abs((yieldDraft?.sourceApy ?? 0) - yieldApyPct / 100) < 1e-9;

  const selectMarket = (marketId: string) => {
    if (marketId === DRAFT_OPTION && draftSource) return;
    setDraftSource(null);
    setYieldDraft(null);
    setSourceMode("history");
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
    setYieldDraft(null);
    setSourceMode("history");
    setDraftVersion((current) => current + 1);
    setError("");
    const nextUrl = new URL(window.location.href);
    nextUrl.pathname = routePath;
    nextUrl.search = "";
    window.history.replaceState(null, "", nextUrl);
  };

  const activateYieldDraft = () => {
    const nextSource: DayYieldDraftSource = {
      label: yieldLabel,
      sourceApy: yieldApyPct / 100,
    };
    buildDayYieldDraftMarket(nextSource);
    setYieldDraft(nextSource);
    setDraftSource(null);
    setDraftVersion((current) => current + 1);
    setError("");
    // The outcomes this run produces are further down the page; without this the
    // click appears to do nothing at all.
    window.requestAnimationFrame(() => {
      document
        .getElementById("day-sim-live-outcomes")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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
      <DaySurface id="day-sim-source" padding="spacious" style={{ scrollMarginTop: 16 }}>
        <div className={experience === "learning" ? undefined : "grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_auto]"}>
          <div>
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
            {/* The hero states the mechanism as a claim and sets the position
                vocabulary before any control appears, rather than explaining
                the page to the reader. */}
            <h1
              className="mt-3"
              style={{
                color: COLORS.text,
                fontFamily: SANS,
                fontSize: experience === "learning"
                  ? "clamp(22px,2vw,28px)"
                  : "clamp(32px,4.4vw,58px)",
                fontWeight: 500,
                letterSpacing: "-0.04em",
                lineHeight: 1.02,
                marginBottom: 0,
                textWrap: "balance",
              }}
            >
              {experience === "learning" ? "Choose a yield source" : (
                <>
                  One yield source.
                  <br />
                  <span style={{ color: COLORS.muted }}>Three different risks.</span>
                </>
              )}
            </h1>
            {experience === "learning" ? (
              <p className="mt-1.5" style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.5 }}>
                {activeMarket.identity.displayAssetName} is loaded. Keep it, choose another example, or import your own history.
              </p>
            ) : (
              <p
                className="mt-4"
                style={{
                  color: COLORS.muted,
                  fontSize: "clamp(14px,1.15vw,16.5px)",
                  lineHeight: 1.55,
                  maxWidth: "62ch",
                }}
              >
                Royco Day is a mechanism that splits one yield source into positions with distinct risk, return, and liquidity profiles.
                Set the terms below and watch what each position earns, and what it stands to lose.
              </p>
            )}
          </div>

          {experience !== "learning" && (
            <DayButton
              aria-label={showTutorial ? "Close tutorial" : "New to Royco?"}
              aria-pressed={showTutorial}
              className="justify-self-start lg:justify-self-end"
              onClick={() => setShowTutorial((value) => !value)}
              variant={showTutorial ? "quiet" : "primary"}
            >
              {showTutorial ? "Close tutorial" : "New to Royco?"}
            </DayButton>
          )}
        </div>

        {experience !== "learning" && (
          <>
            {/* Names the three positions and their colours up front, so the
                chart, tables, and diagrams below arrive already legible. */}
            <div
              className="mt-6 grid grid-cols-1 sm:grid-cols-3"
              style={{ borderTop: `1px solid ${COLORS.border}`, gap: 0 }}
            >
              {[
                { color: DAY_SIMULATOR_THEME.seniorLine, name: "Sr", role: "Senior — protected, and can sell early" },
                { color: DAY_SIMULATOR_THEME.juniorLine, name: "Jr", role: "Junior — absorbs losses first, paid for it" },
                { color: DAY_SIMULATOR_THEME.olive, name: "SLP", role: "Liquidity — supplies the pool Sr sells into" },
              ].map((position) => (
                <div
                  key={position.name}
                  style={{
                    borderTop: `2px solid ${position.color}`,
                    marginTop: -1,
                    paddingRight: 16,
                    paddingTop: 10,
                  }}
                >
                  <span
                    style={{
                      color: position.color,
                      fontFamily: MONO,
                      fontSize: 15,
                      fontWeight: 700,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {position.name}
                  </span>
                  <p className="mt-1" style={{ color: COLORS.muted, fontSize: 11.5, lineHeight: 1.45 }}>
                    {position.role}
                  </p>
                </div>
              ))}
            </div>

            <p
              className="mt-5"
              style={{ color: DAY_SIMULATOR_THEME.kpiLabel, fontSize: 10, lineHeight: 1.5, maxWidth: "88ch" }}
            >
              <strong style={{ color: COLORS.muted, fontWeight: 600 }}>Educational simulator only.</strong>{" "}
              No securities are offered or available through this page. Sample datasets provide source inputs only and do not imply issuer participation, endorsement, or proposed market terms. All simulation assumptions are illustrative and user-adjustable.
            </p>
          </>
        )}
      </DaySurface>

      {experience !== "learning" && (
        <DayZoneHeader label="Design" zone="input" />
      )}

      <DaySurface
        padding="spacious"
        tone={experience === "learning" ? "output" : "input"}
      >
        <div>
          {experience === "learning" ? (
            <DayFieldCaption>Input · Yield source</DayFieldCaption>
          ) : (
            <DaySectionHeader title="Yield source" />
          )}
          <div className="mt-2">
            <DaySegmentedControl label="Source model">
              <DaySegmentedButton
                active={sourceMode === "yield"}
                onClick={() => setSourceMode("yield")}
              >
                <strong style={{ display: "block" }}>Expected yield only</strong>
                <span style={{ color: COLORS.muted, display: "block", fontSize: 10, marginTop: 2 }}>One net APY · No historical backtest</span>
              </DaySegmentedButton>
              <DaySegmentedButton
                active={sourceMode === "history"}
                onClick={() => {
                  setSourceMode("history");
                  setYieldDraft(null);
                }}
              >
                <strong style={{ display: "block" }}>Historical data</strong>
                <span style={{ color: COLORS.muted, display: "block", fontSize: 10, marginTop: 2 }}>Sample or imported dated values</span>
              </DaySegmentedButton>
            </DaySegmentedControl>
          </div>
        </div>

        {sourceMode === "yield" ? (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(150px,.55fr)_auto]" style={{ alignItems: "end" }}>
            <DayFieldLabel>
              <DayFieldCaption>Source name</DayFieldCaption>
              <input aria-label="Yield source name" onChange={(event) => setYieldLabel(event.target.value)} style={fieldStyle} value={yieldLabel} />
            </DayFieldLabel>
            <DayFieldLabel>
              <DayFieldCaption>Net APY</DayFieldCaption>
              <input aria-label="Net source APY" inputMode="decimal" min="-99.99" onChange={(event) => setYieldApyPct(Number(event.target.value))} step="0.1" style={fieldStyle} type="number" value={yieldApyPct} />
            </DayFieldLabel>
            <DayButton
              disabled={yieldModelIsCurrent}
              onClick={activateYieldDraft}
              style={{
                cursor: yieldModelIsCurrent ? "default" : "pointer",
                minHeight: 44,
                whiteSpace: "nowrap",
              }}
              variant={yieldModelIsCurrent ? "secondary" : "primary"}
            >
              {yieldModelIsCurrent ? "Model applied ✓" : "Run yield model"}
            </DayButton>
          </div>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,max-content)_max-content]">
              {/* minWidth:0 on both the grid item and the select lets the
                  control shrink below its widest option instead of forcing the
                  page to scroll horizontally on narrow viewports. */}
              <DayFieldLabel style={{ minWidth: 0 }}>
                <DayFieldCaption>Sample yield source</DayFieldCaption>
                <select aria-label="Explore a yield source" onChange={(event) => selectMarket(event.target.value)} style={{ ...fieldStyle, maxWidth: "100%", minWidth: 0, width: "auto" }} value={draftSource ? DRAFT_OPTION : selectedMarket.id}>
                  {draftSource && <option value={DRAFT_OPTION}>{draftSource.label} · Draft</option>}
                  <optgroup label="Sample yield sources">
                    {markets.map((market) => <option key={market.id} value={market.id}>{marketLabel(market)}</option>)}
                  </optgroup>
                </select>
              </DayFieldLabel>
              <DayButton aria-expanded={showImport || Boolean(draftSource)} onClick={() => setShowImport((value) => !value)} style={{ alignSelf: "end", minHeight: 44, whiteSpace: "nowrap" }}>
                {showImport || draftSource ? "Hide import" : "Import historical data"}
              </DayButton>
            </div>

            {(showImport || draftSource) && (
              <div className="mt-3" style={{ background: COLORS.soft, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 12 }}>
                <DayFieldCaption>Import dated values</DayFieldCaption>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                  <label style={{ alignItems: "center", background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text, cursor: "pointer", display: "flex", fontSize: 13, fontWeight: 600, justifyContent: "center", minHeight: 44, padding: "10px 12px", whiteSpace: "nowrap" }}>
                    <input accept=".csv,.tsv,.txt,.json,.html,.htm,text/csv,text/tab-separated-values,application/json,text/html" aria-label="Upload dated NAV or price history" className="sr-only" onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ""; }} type="file" />
                    Upload file
                  </label>
                  <input aria-label="Public yield source URL" onChange={(event) => setSourceUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void importUrl(); } }} placeholder="Paste a CSV, Google Sheet, JSON, or HTML table URL" style={fieldStyle} type="url" value={sourceUrl} />
                  <DayButton disabled={importingUrl} onClick={() => void importUrl()} style={{ cursor: importingUrl ? "wait" : "pointer", minHeight: 44, opacity: importingUrl ? 0.65 : 1, whiteSpace: "nowrap" }} variant="primary">{importingUrl ? "Importing…" : "Import link"}</DayButton>
                </div>
                <p className="mt-2" style={{ color: COLORS.muted, fontSize: 10 }}>CSV, JSON, Google Sheet, or public HTML table. Imports stay private and unverified.</p>
              </div>
            )}

            {draftSource && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2" style={{ background: COLORS.soft, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 12 }}>
                <DayFieldLabel><DayFieldCaption>Source name</DayFieldCaption><input aria-label="Imported source name" onChange={(event) => updateDraft({ label: event.target.value || "Imported yield source" })} style={fieldStyle} value={draftSource.label} /></DayFieldLabel>
                <DayFieldLabel><DayFieldCaption>Value type</DayFieldCaption><select aria-label="Imported data value type" onChange={(event) => updateDraft({ priceType: event.target.value as DayDraftSource["priceType"] })} style={fieldStyle} value={draftSource.priceType}><option value="unknown">Not specified</option><option value="nav">NAV — accounting value</option><option value="price">Price — tradable market value</option><option value="total-return-index">Total-return index</option></select></DayFieldLabel>
                <p className="sm:col-span-2" style={{ color: COLORS.muted, fontSize: 10 }}>Imported values are treated as net of source-level fees.</p>
              </div>
            )}
          </>
        )}

        {error && (
          <p
            className="mt-3"
            role="alert"
            style={{ color: COLORS.warning, fontSize: 13, lineHeight: 1.45 }}
          >
            {error}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1" style={{ color: COLORS.muted, fontSize: 10 }}>
          {sourceMode === "yield" && !isYieldDraft ? (
            <span>Enter a net APY and run the yield model to replace the current sample.</span>
          ) : (
            <>
          {isDraft && (
            <strong style={{ color: COLORS.warning, fontWeight: 600 }}>
              {isYieldDraft ? "Yield-only model" : "Unverified upload"}
            </strong>
          )}
          {isYieldDraft ? (
            <span>{yieldApyPct.toFixed(1)}% net APY · No historical backtest</span>
          ) : (
            <span>
              {activeMarket.provenance.observationCount} {describeCadence(activeMarket.provenance.dataCadence)} values · {describePriceType(activeMarket.provenance.priceType)} · {describeFees(activeMarket.provenance.feesIncluded)}
            </span>
          )}
          {draftSource && (
            <p className="basis-full" style={{ color: COLORS.muted, fontSize: 10 }}>
              Confirm the value type and source before publishing.
            </p>
          )}
            </>
          )}
        </div>
      </DaySurface>

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
          onExitTutorial={() => setShowTutorial(false)}
          variant={showTutorial ? "tutorial" : "guided"}
        />
      )}
    </div>
  );
}
