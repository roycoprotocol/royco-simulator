"use client";

// =============================================================================
// The wizard steps.
// -----------------------------------------------------------------------------
// Every question is stated as an outcome, never as an accountant parameter.
// The copy here IS the abstraction layer — see the translation table in
// docs/POOL_CREATOR.md for what each question stands in for.
//
// House rules, applied throughout:
//   - Every control carries a one-line explanation. Never optional.
//   - The diagram sits ABOVE the inputs: show the picture, then ask.
//   - "What happens if it doesn't recover" is always visible, never revealed.
//   - Amber means "pay attention"; red is reserved for blocking errors.
// =============================================================================

import { useMemo, useState } from "react";
import * as T from "@/components/pool-creator/tokens";
import {
  Button,
  Callout,
  Card,
  Disclosure,
  Eyebrow,
  Guardrail,
  Hint,
  InfoReveal,
  LabeledRow,
  MiniMetric,
  Prose,
  SourceNote,
  StatusPill,
} from "@/components/pool-creator/primitives";
import {
  Acknowledgement,
  ChipGroup,
  MoneyField,
  PercentField,
  Segmented,
  Slider,
  TextField,
  Toggle,
} from "@/components/pool-creator/fields";
import {
  CushionDiagram,
  ExitLadderDiagram,
  RecoveryWindowDiagram,
  YieldSplitDiagram,
} from "@/components/pool-creator/diagrams";
import { AddressPanel } from "@/components/pool-creator/AddressPanel";
import type { PoolModel } from "@/components/pool-creator/usePoolModel";
import type { PoolDraft, RiskProfile } from "@/lib/pool-creator/draft";
import { RISK_PROFILES, suggestIdentity } from "@/lib/pool-creator/draft";
import { days, longDate, monthYear, pct, usd, usdCompact } from "@/lib/pool-creator/format";
import { referenceRange } from "@/lib/pool-creator/presets";
import { seniorApyBand, exitShareBand, protectedDrawdownBand } from "@/lib/pool-creator/solver";
import { deriveManifest } from "@/lib/pool-creator/derive";
import { blockingIssues, validateManifest } from "@/lib/pool-creator/validate";
import { bundleText, downloadFile, publishCommands } from "@/lib/pool-creator/export";
import { seriesApy } from "@/lib/pool-creator/preview";
import { todayIso } from "@/lib/pool-creator/synthetic";

/** Which of the three ways of supplying a strategy the user is on. */
export type SourceMode = "address" | "upload" | "describe";

export type StepProps = {
  draft: PoolDraft;
  model: PoolModel;
  update: (mutate: (draft: PoolDraft) => PoolDraft) => void;
};

const setGoal = <K extends keyof PoolDraft["goals"]>(key: K, value: PoolDraft["goals"][K]) =>
  (draft: PoolDraft): PoolDraft => ({
    ...draft,
    presetId: null,
    goals: { ...draft.goals, [key]: value },
  });

function StepHeader({
  step,
  title,
  children,
}: {
  step: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <Eyebrow>{step}</Eyebrow>
      <h2 style={{ ...T.leadTitle, maxWidth: 620 }}>{title}</h2>
      <Prose style={{ marginBottom: 0, maxWidth: 620 }}>{children}</Prose>
    </div>
  );
}

// ===========================================================================
// 1. STRATEGY
// ===========================================================================

export function Step1Strategy({ draft, model, update }: StepProps) {
  const source = draft.source;
  const [mode, setMode] = useState<SourceMode>(() =>
    source?.kind === "series"
      ? source.origin.kind === "onchain"
        ? "address"
        : "upload"
      : "address",
  );

  const setDescribed = (patch: Partial<{ expectedApy: number; risk: RiskProfile; label: string }>) =>
    update((d) => {
      const current =
        d.source?.kind === "described"
          ? d.source
          : { kind: "described" as const, label: "", expectedApy: 0.09, risk: "mild" as RiskProfile, anchorDate: todayIso() };
      const next = { ...current, ...patch };
      // Keep the identity tracking the label until the user names something
      // themselves, so "sUSDai" flows into the pool name and both tickers.
      const identity = d.identityTouched ? d.identity : suggestIdentity(next.label);
      return { ...d, source: next, identity };
    });

  return (
    <Card>
      <StepHeader step="Strategy" title="Point Day at your yield.">
        A Day pool sits on top of a strategy you already run. It doesn&rsquo;t change how your strategy
        works — it splits the return it produces into a protected side and a leveraged one.
      </StepHeader>

      <Segmented
        ariaLabel="How to supply your strategy"
        value={mode}
        options={[
          { value: "address" as SourceMode, label: "Vault address" },
          { value: "upload" as SourceMode, label: "Paste history" },
          { value: "describe" as SourceMode, label: "Describe it" },
        ]}
        onChange={(next) => {
          setMode(next);
          if (next === "describe") setDescribed({});
          if (next === "upload") {
            update((d) => ({
              ...d,
              source: {
                kind: "series",
                series: [],
                origin: {
                  kind: "upload",
                  label: "",
                  provider: "",
                  sourceUrl: "",
                  priceType: "nav",
                  cadence: "daily",
                  feesIncluded: null,
                },
              },
            }));
          }
        }}
      />

      {mode === "address" ? <AddressPanel draft={draft} update={update} /> : null}

      {mode === "describe" ? (
        <div style={{ marginTop: 14 }}>
          <LabeledRow
            label="What do you call this strategy?"
            explanation="Used to name your pool and its two tranche tokens. You can change it later."
            control={
              <TextField
                ariaLabel="Strategy name"
                value={source?.kind === "described" ? source.label : ""}
                placeholder="e.g. sUSDai"
                onChange={(label) => setDescribed({ label })}
                width={220}
              />
            }
          />

          <LabeledRow
            label="What does it earn in a normal year?"
            explanation="Before any Day mechanics. Everything downstream is a split of this number."
            control={
              <PercentField
                ariaLabel="Expected annual yield"
                value={source?.kind === "described" ? source.expectedApy : 0.09}
                step={0.25}
                min={0}
                max={100}
                onChange={(expectedApy) => setDescribed({ expectedApy })}
              />
            }
          />

          <LabeledRow
            label="How bumpy is it?"
            explanation="Shapes the path we model, and therefore how often Junior has to step in."
            info={
              <div style={{ marginTop: 4 }}>
                <ChipGroup
                  columns={2}
                  value={source?.kind === "described" ? source.risk : "mild"}
                  onChange={(risk) => setDescribed({ risk })}
                  options={RISK_PROFILES.map((p) => ({
                    value: p.id,
                    label: p.label,
                    caption: p.caption,
                  }))}
                />
              </div>
            }
          />

          <Callout tone="warn">
            <b>This is a model, not a track record.</b> With no history to import we simulate a path
            with your expected yield and the shape you picked. Your pool page will say so plainly, and
            a backtest of a modelled path is not evidence of anything.
          </Callout>
        </div>
      ) : null}

      {mode === "upload" ? (
        <div style={{ marginTop: 14 }}>
          <Callout>
            <b>Paste a price history.</b> Two columns — a date and a price or NAV per share. Daily,
            weekly or monthly all work. Use this when your strategy has no on-chain price feed we can
            read.
          </Callout>
          <div style={{ marginTop: 10 }}>
            <CsvPaste draft={draft} update={update} />
          </div>
        </div>
      ) : null}

      {/*
        Only summarise data that belongs to the tab being looked at. The draft
        opens with a modelled strategy so the rail has live numbers from the
        first paint, and reporting its stats under "Vault address" would read as
        though we had found them on-chain.
      */}
      {model.hasSource && sourceMatchesMode(draft, mode) ? <WhatWeRead model={model} /> : null}
    </Card>
  );
}

/**
 * Split one CSV row, honouring double quotes so a quoted "1,000.00" survives,
 * then rejoin unquoted thousands groups: `$1,000.00` naively splits into `$1`
 * and `000.00`, which reads as a price of 1 and produces a wildly wrong yield.
 */
function splitRow(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      // A doubled quote inside a quoted field is a literal quote.
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());

  // Only attempt a rejoin when the raw line actually contains a thousands
  // pattern. Without that gate, an ordinary third column (`date,price,volume`)
  // would be swallowed into the price.
  //
  // One case stays genuinely ambiguous: `2025-01-01,105,250` is equally valid
  // as the number 105,250 and as two columns. We resolve it as a number, which
  // is the commoner shape for a price column, and the absurd-yield check in
  // `parse` is the backstop when that guess is wrong.
  if (delimiter !== "," || !/\d,\d{3}(\D|$)/.test(line)) return cells;

  const merged: string[] = [];
  for (const cell of cells) {
    const previous = merged[merged.length - 1];
    // A thousands group is exactly three digits; only the final group may carry
    // decimals, so a previous value that already has a decimal point is done.
    const isGroup = /^\d{3}(\.\d+)?$/.test(cell);
    const previousIsOpen = previous !== undefined && /^[$£€]?\d+$/.test(previous);
    if (isGroup && previousIsOpen) {
      merged[merged.length - 1] = `${previous}${cell}`;
      continue;
    }
    merged.push(cell);
  }
  return merged;
}

/** Tolerate currency symbols and separators when reading a price. */
const numeric = (cell: string): number => Number(cell.replace(/[$£€\s,]/g, ""));

/** Is the loaded strategy the one this tab is responsible for? */
function sourceMatchesMode(draft: PoolDraft, mode: SourceMode): boolean {
  if (!draft.source) return false;
  if (draft.source.kind === "described") return mode === "describe";
  return draft.source.origin.kind === "onchain" ? mode === "address" : mode === "upload";
}

/** Minimal, forgiving CSV/TSV paste. Recovers in place rather than scolding. */
function CsvPaste({ draft, update }: { draft: PoolDraft; update: StepProps["update"] }) {
  const [problems, setProblems] = useState<string[]>([]);
  const [name, setName] = useState("");

  /**
   * Forgiving on purpose. A price history arrives with headers, thousands
   * separators, currency symbols and blank rows, and being told "invalid
   * format" helps nobody — so we take what we can read and report precisely
   * what we skipped.
   */
  const parse = (text: string, sourceName?: string) => {
    const issues: string[] = [];
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);

    // Pick the delimiter from the data rather than assuming a comma: a comma
    // file whose numbers carry thousands separators is the worst case, so
    // prefer tab or semicolon whenever they are actually present.
    const delimiter = lines.some((l) => l.includes("\t"))
      ? "\t"
      : lines.some((l) => l.includes(";"))
        ? ";"
        : ",";

    const rows = lines.map((line) => splitRow(line, delimiter));

    const points: Array<{ date: string; price: number }> = [];
    let skipped = 0;

    for (const [index, cells] of rows.entries()) {
      const dateCell = cells.find((c) => /^\d{4}-\d{2}-\d{2}/.test(c));
      const priceCell = cells.find((c) => c !== dateCell && c !== "" && Number.isFinite(numeric(c)));

      if (!dateCell || priceCell === undefined) {
        // A header row is expected, not an error worth reporting.
        if (index > 0) skipped += 1;
        continue;
      }
      const price = numeric(priceCell);
      if (!(price > 0)) {
        issues.push(`Row ${index + 1} has a price of ${priceCell}. Prices need to be positive.`);
        continue;
      }
      points.push({ date: dateCell.slice(0, 10), price });
    }

    points.sort((a, b) => a.date.localeCompare(b.date));
    const duplicates = points.filter((p, i) => i > 0 && p.date === points[i - 1].date);
    if (duplicates.length > 0) {
      issues.push(
        `${duplicates.length} duplicate date${duplicates.length === 1 ? "" : "s"} (first: ${duplicates[0].date}). We kept the earliest of each.`,
      );
    }
    if (skipped > 0) {
      issues.push(
        skipped === 1
          ? "1 row had no recognisable date and price, and was skipped."
          : `${skipped} rows had no recognisable date and price, and were skipped.`,
      );
    }
    if (points.length === 1) {
      issues.push("We found 1 observation. We need at least 2 to work out a yield.");
    }
    if (points.length === 0 && text.trim().length > 0) {
      issues.push("We couldn't find a date column. Each row needs a YYYY-MM-DD date and a positive number.");
    }

    const deduped = points.filter((p, i) => i === 0 || p.date !== points[i - 1].date);

    // A last sanity check. A misparsed column (a thousands separator read as a
    // delimiter, a price column that is really a share count) shows up as an
    // absurd annualised return long before it shows up as anything else.
    if (deduped.length >= 2) {
      const implied = seriesApy(deduped);
      if (Number.isFinite(implied) && Math.abs(implied) > 5) {
        issues.push(
          `That works out to ${pct(implied, 0)} a year, which almost certainly means a column was read wrongly. ` +
            "Check the price column — thousands separators and stray currency symbols are the usual cause.",
        );
      }
    }

    setProblems(issues);

    const label = sourceName ?? name;
    update((d) => ({
      ...d,
      source: {
        kind: "series",
        series: deduped,
        origin:
          d.source?.kind === "series" && d.source.origin.kind === "upload"
            ? { ...d.source.origin, label: label || d.source.origin.label }
            : {
                kind: "upload",
                label,
                provider: "",
                sourceUrl: "",
                priceType: "nav",
                cadence: "daily",
                feesIncluded: null,
              },
      },
      identity: d.identityTouched || !label ? d.identity : suggestIdentity(label),
    }));
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const derived = file.name.replace(/\.[^.]+$/, "");
    setName(derived);
    parse(text, derived);
  };

  const count = draft.source?.kind === "series" ? draft.source.series.length : 0;
  const origin = draft.source?.kind === "series" ? draft.source.origin : null;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <label style={{ ...T.button, display: "inline-flex", alignItems: "center" }}>
          Choose a CSV
          <input
            type="file"
            accept=".csv,.tsv,.txt,text/csv"
            onChange={(e) => void onFile(e.target.files?.[0])}
            style={{ display: "none" }}
          />
        </label>
        <span style={{ ...T.hint, marginTop: 0 }}>or paste below</span>
      </div>

      <textarea
        aria-label="Paste a price history"
        placeholder={"date,price\n2025-01-01, 1.0000\n2025-01-02, 1.0002\n2025-01-03, 1.0005"}
        onChange={(e) => parse(e.target.value)}
        style={{
          ...T.snapshot,
          minHeight: 120,
          whiteSpace: "pre",
          fontSize: 11,
          resize: "vertical",
        }}
      />

      <Hint>
        {count >= 2
          ? `Read ${count} observations.`
          : "Each row needs a YYYY-MM-DD date and a positive number. Headers are fine."}
      </Hint>

      {problems.length > 0 ? (
        <div style={{ marginTop: 8, display: "grid", gap: 5 }}>
          {problems.map((problem) => (
            <Callout key={problem} tone="warn">
              {problem}
            </Callout>
          ))}
        </div>
      ) : null}

      {count >= 2 ? (
        <div style={{ marginTop: 10 }}>
          <LabeledRow
            label="What do you call this strategy?"
            explanation="Names your pool and its two tranche tokens."
            control={
              <TextField
                ariaLabel="Strategy name"
                value={origin?.label ?? ""}
                placeholder="e.g. sUSDai"
                width={200}
                onChange={(label) =>
                  update((d) =>
                    d.source?.kind === "series"
                      ? {
                          ...d,
                          source: { ...d.source, origin: { ...d.source.origin, label } },
                          identity: d.identityTouched ? d.identity : suggestIdentity(label),
                        }
                      : d,
                  )
                }
              />
            }
          />
          <LabeledRow
            label="Is this price net of your fees?"
            explanation="If fees aren't already taken out, the yield we show depositors would be too high."
            control={
              <ChipGroup
                columns={2}
                value={origin?.feesIncluded === null || origin === null ? "" : origin.feesIncluded ? "yes" : "no"}
                onChange={(v) =>
                  update((d) =>
                    d.source?.kind === "series"
                      ? { ...d, source: { ...d.source, origin: { ...d.source.origin, feesIncluded: v === "yes" } } }
                      : d,
                  )
                }
                options={[
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No" },
                ]}
              />
            }
          />
          <LabeledRow
            label="Who publishes this?"
            explanation="Named on your pool page so depositors can check the numbers themselves."
            control={
              <TextField
                ariaLabel="Data provider"
                value={origin?.provider ?? ""}
                placeholder="e.g. USD.AI"
                width={200}
                onChange={(provider) =>
                  update((d) =>
                    d.source?.kind === "series"
                      ? { ...d, source: { ...d.source, origin: { ...d.source.origin, provider } } }
                      : d,
                  )
                }
              />
            }
          />
        </div>
      ) : null}
    </div>
  );
}

function WhatWeRead({ model }: { model: PoolModel }) {
  const { series, sourceApy, worstDrawdown, worstDrawdownDate } = model;
  return (
    <div style={{ marginTop: 16, borderTop: `1px solid ${T.C.border}`, paddingTop: 12 }}>
      <Eyebrow>What we read</Eyebrow>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 7 }}>
        <MiniMetric label="BASE YIELD" value={pct(sourceApy, 2)} note="derived from your history" />
        <MiniMetric label="OBSERVATIONS" value={String(series.length)}
          note={series.length ? `${longDate(series[0].date)} → ${longDate(series[series.length - 1].date)}` : ""} />
        <MiniMetric
          label="WORST DRAWDOWN"
          value={pct(worstDrawdown, 2)}
          color={worstDrawdown < -0.001 ? T.C.danger : T.C.text}
          note={worstDrawdownDate ? monthYear(worstDrawdownDate) : "no falls in this sample"}
        />
      </div>
      {worstDrawdown > -0.0005 ? (
        <div style={{ marginTop: 8 }}>
          <Callout tone="warn">
            <b>Your history never really falls.</b> That is a calm sample, not a guarantee. Set the
            cushion for the strategy you actually run, not the one the data happened to capture.
          </Callout>
        </div>
      ) : null}
    </div>
  );
}

// ===========================================================================
// 2. PROTECTION
// ===========================================================================

export function Step2Protection({ draft, model, update }: StepProps) {
  const { solved, balances, base, worstDrawdown, worstDrawdownDate, cushionPoints } = model;
  const band = useMemo(() => protectedDrawdownBand(base, solved), [base, solved]);

  const cushion = Number.isFinite(solved.coverageLossLimit)
    ? solved.coverageLossLimit
    : draft.goals.protectedDrawdown;
  const worst = Math.abs(worstDrawdown);
  const uncovered = worst > cushion + 1e-6;
  const covRange = referenceRange("coverage");

  return (
    <Card>
      <StepHeader step="Protection" title="Decide how much of a fall Senior never feels.">
        Junior deposits sit underneath Senior and take losses first. You&rsquo;re choosing how deep
        that cushion is. Deeper means safer for Senior — but Junior has to be paid more for holding it.
      </StepHeader>

      <CushionDiagram
        points={cushionPoints}
        cushion={cushion}
        worstDrawdown={worst > 0.0005 ? worst : null}
        worstDrawdownLabel={worstDrawdownDate ? `${monthYear(worstDrawdownDate)} · ${pct(worstDrawdown, 1)}` : null}
        juniorCapital={balances.jt}
        seniorSize={balances.st}
      />

      <LabeledRow
        label={`Protect Senior from the first ${pct(draft.goals.protectedDrawdown)} drawdown`}
        explanation="Below this, Senior's balance doesn't move at all. Above it, Senior starts taking the excess."
        info={
          <InfoReveal
            what={
              <>
                Junior capital is reserved against Senior&rsquo;s balance. A fall inside the cushion is
                absorbed entirely by Junior; only what is left over reaches Senior.
              </>
            }
            benchmark={
              <>
                Live markets run cushions from {pct(covRange.min)} to {pct(covRange.max)} of Senior,
                median {pct(covRange.median)}.
              </>
            }
            parameter={`coverage = ${solved.coverage.toFixed(4)}`}
          />
        }
      >
        <Slider
          label=""
          value={draft.goals.protectedDrawdown * 100}
          display={pct(draft.goals.protectedDrawdown)}
          min={Math.max(0.5, band.min * 100)}
          max={Math.min(50, band.max * 100)}
          step={0.5}
          accent={T.C.seniorLine}
          onChange={(v) => update(setGoal("protectedDrawdown", v / 100))}
          hint={
            <>
              At <b>{usd(balances.st)}</b> of Senior, this needs <b>{usd(balances.jt)}</b> of Junior
              capital.
            </>
          }
        />
      </LabeledRow>

      {uncovered && worst > 0.0005 ? (
        <div style={{ marginTop: 12 }}>
          <Callout
            tone="warn"
            action={
              <Button onClick={() => update(setGoal("protectedDrawdown", Math.min(0.5, worst * 1.1)))}>
                Cover my worst drawdown → {pct(worst * 1.1)}
              </Button>
            }
          >
            <b>Your history has a bigger fall than this.</b> {sourceName(draft)} fell{" "}
            <b>{pct(worstDrawdown, 1)}</b>
            {worstDrawdownDate ? <> in {monthYear(worstDrawdownDate)}</> : null}. A {pct(cushion)}{" "}
            cushion would have left Senior down about{" "}
            <b>${((worst - cushion) * 100).toFixed(2)} per $100</b>.
          </Callout>
        </div>
      ) : null}

      <LabeledRow
        label={`How long does the strategy get to recover? ${days(draft.goals.recoveryDays)}`}
        explanation="If Junior ever covers a loss, the pool holds still while the strategy tries to climb back."
        info={
          <InfoReveal
            what={
              <>
                While the window is open, Senior can&rsquo;t redeem directly and Junior can&rsquo;t
                deposit. Selling into the exit pool stays open the whole time.
              </>
            }
            benchmark={<>Live markets use 7 or 30 days. Production stablecoin markets often use none at all.</>}
            parameter={`fixedTermDurationSeconds = ${solved.recoveryDays * 86400}`}
          />
        }
      >
        <div style={{ marginTop: 8 }}>
          <ChipGroup
            columns={4}
            value={draft.goals.recoveryDays}
            onChange={(v) => update(setGoal("recoveryDays", v))}
            options={[
              { value: 0, label: "None", caption: "Perpetual. Nothing ever freezes." },
              { value: 7, label: "7 days", caption: "The common choice." },
              { value: 30, label: "30 days", caption: "More room to recover." },
              { value: 90, label: "90 days", caption: "For slow-settling credit." },
            ]}
          />
        </div>
      </LabeledRow>

      <div style={{ marginTop: 14 }}>
        <RecoveryWindowDiagram recoveryDays={draft.goals.recoveryDays} />
      </div>

      {/* Always visible. Hiding the worst case is what destroys trust later. */}
      <div
        style={{
          marginTop: 14,
          border: `1px solid ${T.C.border}`,
          borderTop: `3px solid ${T.C.obsFill}`,
          padding: "11px 12px",
        }}
      >
        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 5 }}>
          What happens if it doesn&rsquo;t recover
        </div>
        <div style={{ fontSize: 11.5, lineHeight: 1.45, color: T.C.muted }}>
          {draft.goals.recoveryDays === 0 ? (
            <>
              With no recovery window, Junior absorbs losses as they happen and there is never a
              freeze. Junior is never made whole by a later rebound — what it covers, it has covered.
            </>
          ) : (
            <>
              If the {days(draft.goals.recoveryDays)} run out and Junior hasn&rsquo;t been made whole,
              Junior&rsquo;s claim on that loss is written off. Junior eats it permanently. Senior
              keeps the protection it was promised, and the pool reopens.
            </>
          )}
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <Disclosure
          title="Advanced — early exit, refills, exact coverage"
          summary="Optional. Sensible defaults are already applied."
          pill={`${countAdvanced(draft, ["coverage", "selfLiquidationBonus", "maintainCoverage"])} changed`}
        >
          <LabeledRow
            label="When can Senior take an early exit?"
            explanation="An escape hatch that opens once the cushion has been drawn down to this much."
            info={
              <InfoReveal
                what={
                  <>
                    Senior can exit immediately rather than waiting out a recovery window. Opening it
                    early is friendlier to Senior; opening it late keeps more capital in the pool.
                  </>
                }
                parameter={`exitBufferPct = ${draft.goals.exitBufferPct}, liquidationUtilization = ${(100 / Math.max(draft.goals.exitBufferPct, 0.01)).toFixed(4)}`}
              />
            }
          >
            <div style={{ marginTop: 8 }}>
              <ChipGroup
                columns={3}
                value={draft.goals.exitBufferPct}
                onChange={(v) => update(setGoal("exitBufferPct", v))}
                options={[
                  { value: 99.91, label: "Immediately", caption: "As soon as the cushion is touched." },
                  { value: 50, label: "Halfway", caption: "Once half the cushion is gone." },
                  { value: 1, label: "Last resort", caption: "Only when it is nearly gone." },
                ]}
              />
            </div>
          </LabeledRow>

          <LabeledRow
            label="Top the cushion back up automatically"
            explanation="After a recovery window closes, bring Junior back to its required size."
            control={
              <Toggle
                checked={draft.overrides.maintainCoverage ?? base.maintainCoverage}
                onChange={(v) => update((d) => ({ ...d, overrides: { ...d.overrides, maintainCoverage: v } }))}
                label=""
              />
            }
          />

          <LabeledRow
            label="Cushion size, exactly"
            explanation="Set the raw coverage parameter instead of letting the protection goal derive it."
            control={
              <PercentField
                ariaLabel="Coverage"
                value={draft.overrides.coverage ?? solved.coverage}
                step={0.5}
                onChange={(v) => update((d) => ({ ...d, overrides: { ...d.overrides, coverage: v } }))}
              />
            }
          />
          {draft.overrides.coverage !== undefined ? (
            <Button onClick={() => update((d) => ({ ...d, overrides: { ...d.overrides, coverage: undefined } }))}>
              Back to the derived value
            </Button>
          ) : null}
        </Disclosure>
      </div>
    </Card>
  );
}

// ===========================================================================
// 3. EXITS
// ===========================================================================

export function Step3Exits({ draft, model, update }: StepProps) {
  const { solved, balances, base, liquidityCurve } = model;
  const band = useMemo(() => exitShareBand(base, solved), [base, solved]);

  return (
    <Card>
      <StepHeader step="Exits" title="Give Senior a way out before the strategy matures.">
        Day funds a small side pool that Senior holders can sell into any day, at a price that depends
        on how much they sell at once. It isn&rsquo;t a redemption queue — it&rsquo;s a market, so
        large exits cost more than small ones.
      </StepHeader>

      <ExitLadderDiagram
        curve={liquidityCurve}
        seniorSize={balances.st}
        referenceShare={Number.isFinite(solved.exitShareOfSenior) ? solved.exitShareOfSenior : 0.03}
      />

      <LabeledRow
        label={`A Senior holder should be able to sell ${pct(draft.goals.exitShareOfSenior, 1)} of their position in one go for under a 1% discount`}
        explanation="Bigger than that and they still get out — just at a steeper discount, which is what makes it worth someone's while to buy."
        info={
          <InfoReveal
            what={
              <>
                The exit pool holds roughly 10% Senior shares against 90% short-term treasuries. A
                bigger pool flattens the price curve, so larger exits stay cheap.
              </>
            }
            benchmark={
              <>
                Reachable here: {pct(band.min, 1)} to {pct(band.max, 1)} of a position at the 1%
                reference.
              </>
            }
            parameter={`minLiquidity = ${solved.minLiquidity.toFixed(4)}`}
          />
        }
      >
        <Slider
          label=""
          value={draft.goals.exitShareOfSenior * 100}
          display={pct(draft.goals.exitShareOfSenior, 1)}
          min={Math.max(0.5, band.min * 100)}
          max={Math.max(1, band.max * 100)}
          step={0.1}
          accent={T.C.olive}
          onChange={(v) => update(setGoal("exitShareOfSenior", v / 100))}
          hint={
            <>
              Requires an exit pool of <b>{usd(balances.lt)}</b> alongside <b>{usd(balances.st)}</b> of
              Senior.
            </>
          }
        />
      </LabeledRow>

      <div style={{ marginTop: 12 }}>
        <Callout tone="warn">
          <b>Someone has to fund this pool.</b> It earns swap fees, the treasury rate on its stable
          leg, and a share of Senior&rsquo;s yield — roughly{" "}
          <b>{Number.isFinite(solved.liquidityApy) ? pct(solved.liquidityApy, 1) : "—"}/yr</b> at your
          settings. You can seed it yourself or open it to LPs.
        </Callout>
      </div>

      <div style={{ marginTop: 14 }}>
        <Disclosure
          title="Advanced — venue assumptions"
          summary="These shape the projected exit-pool return, not the deployed contract."
        >
          <Callout>
            The four values below are <b>modelling inputs only</b>. They change what this page
            projects for the exit pool; they are not terms written into your market on deployment.
          </Callout>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 12 }}>
            <LabeledRow
              label="Treasury rate on the stable leg"
              explanation="What the 90% stablecoin side earns."
              control={
                <PercentField
                  ariaLabel="Stable yield"
                  value={draft.overrides.stableYield ?? base.stableYield}
                  step={0.1}
                  onChange={(v) => update((d) => ({ ...d, overrides: { ...d.overrides, stableYield: v } }))}
                />
              }
            />
            <LabeledRow
              label="Trading fee"
              explanation="Charged on every swap through the exit pool, in basis points."
              control={
                <TextField
                  ariaLabel="Swap fee bps"
                  mono
                  width={92}
                  value={String(draft.overrides.swapFeeBps ?? base.swapFeeBps)}
                  onChange={(v) => {
                    const n = Number(v);
                    if (Number.isFinite(n) && n >= 0) {
                      update((d) => ({ ...d, overrides: { ...d.overrides, swapFeeBps: n } }));
                    }
                  }}
                />
              }
            />
          </div>
        </Disclosure>
      </div>
    </Card>
  );
}

// ===========================================================================
// 4. RETURNS
// ===========================================================================

export function Step4Returns({ draft, model, update }: StepProps) {
  const { solved, balances, base } = model;
  const band = useMemo(() => seniorApyBand(base, solved), [base, solved]);

  return (
    <Card>
      <StepHeader step="Returns" title="Now price it.">
        Protection and liquidity aren&rsquo;t free — Senior pays for them out of its yield. Set what
        each side should earn and we&rsquo;ll solve the curves that produce it.
      </StepHeader>

      <YieldSplitDiagram
        sourceApy={base.sourceApy}
        seniorApy={solved.seniorApy}
        juniorApy={solved.juniorApy}
        liquidityApy={solved.liquidityApy}
        seniorSize={balances.st}
        juniorSize={balances.jt}
        liquiditySize={balances.lt}
        cushion={Number.isFinite(solved.coverageLossLimit) ? solved.coverageLossLimit : 0}
        exitShare={Number.isFinite(solved.exitShareOfSenior) ? solved.exitShareOfSenior : 0}
      />

      <LabeledRow
        label={`Senior should earn about ${pct(draft.goals.seniorApy, 2)}`}
        explanation="What a protected depositor earns. Lower leaves more for Junior and the exit pool."
        info={
          <InfoReveal
            what={
              <>
                Senior hands part of its yield to Junior as a risk premium and part to the exit pool as
                a liquidity premium. We solve both curves to land on the number you set.
              </>
            }
            benchmark={
              <>
                Reachable here: {pct(band.min, 2)} to {pct(band.max, 2)}, against a base strategy of{" "}
                {pct(base.sourceApy, 2)}.
              </>
            }
            parameter={`riskYDM.yTarget = ${solved.riskYieldShare.toFixed(4)}`}
          />
        }
      >
        <Slider
          label=""
          value={draft.goals.seniorApy * 100}
          display={pct(draft.goals.seniorApy, 2)}
          min={Math.max(0, band.min * 100)}
          max={Math.max(0.1, band.max * 100)}
          step={0.05}
          accent={T.C.seniorLine}
          onChange={(v) => update(setGoal("seniorApy", v / 100))}
          hint={
            <>
              Junior is an output, not an input: with this cushion, every $1 of Junior backs about{" "}
              <b>${(balances.st / Math.max(balances.jt, 1)).toFixed(0)}</b> of Senior.
            </>
          }
        />
      </LabeledRow>

      <LabeledRow
        label={`The exit pool should earn about ${pct(draft.goals.liquidityApy, 2)}`}
        explanation="What an LP earns for funding Senior's way out. Also paid from Senior's yield."
        info={
          <InfoReveal
            what={<>Solved the same way, on its own curve keyed to how heavily the exit pool is used.</>}
            parameter={`liqYDM.yTarget = ${solved.liquidityYieldShare.toFixed(4)}`}
          />
        }
      >
        <Slider
          label=""
          value={draft.goals.liquidityApy * 100}
          display={pct(draft.goals.liquidityApy, 2)}
          min={1}
          max={30}
          step={0.25}
          accent={T.C.olive}
          onChange={(v) => update(setGoal("liquidityApy", v / 100))}
        />
      </LabeledRow>

      <div style={{ marginTop: 14 }}>
        <Disclosure
          title="Advanced — curve shape and protocol fees"
          summary="Set the yield-distribution curves directly instead of solving for target returns."
        >
          <LabeledRow
            label="Curve type"
            explanation="Adaptive lets the split drift with utilization over time. Static holds it fixed."
            control={
              <Segmented
                ariaLabel="YDM mode"
                value={draft.overrides.ydmMode ?? base.ydmMode}
                options={[
                  { value: "adaptive", label: "Adaptive" },
                  { value: "static", label: "Static" },
                ]}
                onChange={(v) => update((d) => ({ ...d, overrides: { ...d.overrides, ydmMode: v } }))}
              />
            }
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 12 }}>
            <LabeledRow
              label="Senior protocol fee"
              explanation="Royco's cut of Senior's kept yield."
              control={
                <PercentField
                  ariaLabel="Senior protocol fee"
                  value={draft.overrides.stProtocolFee ?? base.stProtocolFee}
                  step={1}
                  onChange={(v) => update((d) => ({ ...d, overrides: { ...d.overrides, stProtocolFee: v } }))}
                />
              }
            />
            <LabeledRow
              label="Risk-premium protocol fee"
              explanation="Royco's cut of the premium Senior pays Junior."
              control={
                <PercentField
                  ariaLabel="Risk premium protocol fee"
                  value={draft.overrides.jtYieldShareProtocolFee ?? base.jtYieldShareProtocolFee}
                  step={1}
                  onChange={(v) =>
                    update((d) => ({ ...d, overrides: { ...d.overrides, jtYieldShareProtocolFee: v } }))
                  }
                />
              }
            />
          </div>
          <SourceNote>
            Defaults match the live snUSD market: 10% on Senior&rsquo;s kept yield and 45% on the risk
            premium. Every market in the public simulator runs zero fees, which is why its projected
            returns sit higher.
          </SourceNote>
        </Disclosure>
      </div>

      <SourceNote>
        Scenario outputs are mechanism simulations, not historical backtests, forecasts, or an
        announced product.
      </SourceNote>
    </Card>
  );
}

// ===========================================================================
// 5. LAUNCH
// ===========================================================================

export function Step5Launch({ draft, model, update }: StepProps) {
  const { solved, balances, base, preview } = model;
  const seeding = balances.jt + balances.lt;

  const setIdentity = <K extends keyof PoolDraft["identity"]>(key: K, value: string) =>
    update((d) => ({ ...d, identityTouched: true, identity: { ...d.identity, [key]: value } }));

  const ack = (id: string) => draft.acknowledged[id] === true;
  const setAck = (id: string, value: boolean) =>
    update((d) => ({ ...d, acknowledged: { ...d.acknowledged, [id]: value } }));

  return (
    <Card>
      <StepHeader step="Launch · 1 of 2 · Review" title="Name it, size it, ship it.">
        Last stop. These are the labels your depositors will see and the capital the pool opens with.
      </StepHeader>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 12 }}>
        <LabeledRow
          label="Pool name"
          explanation="Appears at the top of your pool page."
          control={
            <TextField
              ariaLabel="Pool name"
              value={draft.identity.marketName}
              onChange={(v) => setIdentity("marketName", v)}
              width={200}
            />
          }
        />
        <LabeledRow
          label="Underlying asset"
          explanation="What depositors are actually holding."
          control={
            <TextField
              ariaLabel="Underlying asset"
              value={draft.identity.underlyingAsset}
              onChange={(v) => setIdentity("underlyingAsset", v)}
              width={200}
            />
          }
        />
        <LabeledRow
          label="Senior token"
          explanation="The protected tranche's ticker."
          control={
            <TextField
              ariaLabel="Senior symbol"
              mono
              value={draft.identity.seniorSymbol}
              onChange={(v) => setIdentity("seniorSymbol", v)}
              width={200}
            />
          }
        />
        <LabeledRow
          label="Junior token"
          explanation="The first-loss tranche's ticker."
          control={
            <TextField
              ariaLabel="Junior symbol"
              mono
              value={draft.identity.juniorSymbol}
              onChange={(v) => setIdentity("juniorSymbol", v)}
              width={200}
            />
          }
        />
      </div>

      <LabeledRow
        label="How much Senior are you opening with?"
        explanation="Everything else scales from this."
        control={
          <MoneyField
            ariaLabel="Initial Senior size"
            value={draft.goals.initialSeniorSize}
            onChange={(v) => update(setGoal("initialSeniorSize", v))}
          />
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 7, marginTop: 8 }}>
          <MiniMetric label="SENIOR" value={usdCompact(balances.st)} note="you chose" />
          <MiniMetric label="JUNIOR" value={usdCompact(balances.jt)} note={`from your ${pct(solved.coverageLossLimit)} cushion`} />
          <MiniMetric label="EXIT POOL" value={usdCompact(balances.lt)} note="from your exit target" />
        </div>
      </LabeledRow>

      <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
        <Eyebrow>Before you launch</Eyebrow>
        <Acknowledgement checked={ack("erasure")} onChange={(v) => setAck("erasure", v)}>
          {draft.goals.recoveryDays === 0 ? (
            <>
              I understand that with no recovery window, whatever Junior covers is covered
              permanently — a later rebound does not pay Junior back.
            </>
          ) : (
            <>
              I understand that if the strategy hasn&rsquo;t recovered within{" "}
              {days(draft.goals.recoveryDays)}, Junior&rsquo;s claim on the covered loss is written off
              permanently. Junior depositors are not repaid.
            </>
          )}
        </Acknowledgement>
        <Acknowledgement checked={ack("immutable")} onChange={(v) => setAck("immutable", v)}>
          I understand the {pct(solved.coverageLossLimit)} cushion, the{" "}
          {days(draft.goals.recoveryDays)} recovery window and the early-exit level are fixed when this
          pool deploys.
        </Acknowledgement>
        <Acknowledgement checked={ack("seeding")} onChange={(v) => setAck("seeding", v)}>
          I understand this pool needs <b>{usd(balances.jt)}</b> of Junior capital and{" "}
          <b>{usd(balances.lt)}</b> of exit-pool capital — <b>{usd(seeding)}</b> in total — before
          Senior can deposit, and that sourcing it is my responsibility.
        </Acknowledgement>
      </div>

      <div style={{ marginTop: 14 }}>
        <Disclosure
          title="Advanced — size the tranches by hand"
          summary="Optional. Both are derived from your cushion and exit target."
          pill={
            draft.overrides.initialJT !== undefined || draft.overrides.initialLT !== undefined
              ? "overridden"
              : "derived"
          }
        >
          <Callout tone="warn">
            Sizing these by hand breaks the relationship the accountant expects. The pool will still
            simulate, but the publish check below will refuse it until the numbers line up again.
          </Callout>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 12 }}>
            <LabeledRow
              label="Junior capital"
              explanation={`Derived: ${usd((balances.st * solved.coverage) / (0.9 - solved.coverage))}`}
              control={
                <MoneyField
                  ariaLabel="Junior capital"
                  value={draft.overrides.initialJT ?? balances.jt}
                  onChange={(v) => update((d) => ({ ...d, overrides: { ...d.overrides, initialJT: v } }))}
                />
              }
            />
            <LabeledRow
              label="Exit pool capital"
              explanation={`Derived: ${usd((balances.st * solved.minLiquidity) / 0.9)}`}
              control={
                <MoneyField
                  ariaLabel="Exit pool capital"
                  value={draft.overrides.initialLT ?? balances.lt}
                  onChange={(v) => update((d) => ({ ...d, overrides: { ...d.overrides, initialLT: v } }))}
                />
              }
            />
          </div>
          {draft.overrides.initialJT !== undefined || draft.overrides.initialLT !== undefined ? (
            <Button
              onClick={() =>
                update((d) => ({
                  ...d,
                  overrides: { ...d.overrides, initialJT: undefined, initialLT: undefined },
                }))
              }
            >
              Back to the derived sizes
            </Button>
          ) : null}
        </Disclosure>
      </div>

      <PublishPanel draft={draft} model={model} />

      <div style={{ marginTop: 14 }}>
        <Disclosure
          title="What the contracts receive"
          summary="The same settings, mapped onto RoycoDayAccountantInitParams."
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 7 }}>
            <Guardrail title="Cushion" tone="ok">{pct(solved.coverageLossLimit)} of a fall absorbed</Guardrail>
            <Guardrail title="Exit depth" tone="ok">{pct(solved.exitShareOfSenior, 1)} under 1%</Guardrail>
            <Guardrail title="Backtest" tone={preview.error ? "warn" : "ok"}>
              {preview.error ? "did not complete" : `${preview.rows.length} periods`}
            </Guardrail>
            <Guardrail title="Recovery windows" tone="neutral">
              {preview.recoveryWindows.length} in history
            </Guardrail>
          </div>
          <textarea
            readOnly
            aria-label="The configuration, as the accountant sees it"
            value={JSON.stringify(
              {
                identity: draft.identity,
                accountant: {
                  minCoverageWAD: solved.coverage,
                  coverageLiquidationUtilizationWAD: 100 / Math.max(base.exitBufferPct, 0.01),
                  minLiquidityWAD: solved.minLiquidity,
                  fixedTermDurationSeconds: solved.recoveryDays * 86400,
                  jtYDM: { mode: base.ydmMode, yTarget: solved.riskYieldShare },
                  lptYDM: { mode: base.ydmMode, yTarget: solved.liquidityYieldShare },
                  stProtocolFeeWAD: base.stProtocolFee,
                  jtProtocolFeeWAD: base.jtProtocolFee,
                  jtYieldShareProtocolFeeWAD: base.jtYieldShareProtocolFee,
                  lptYieldShareProtocolFeeWAD: base.ltYieldShareProtocolFee,
                },
                stSelfLiquidationBonusWAD: base.selfLiquidationBonus,
                seed: { senior: balances.st, junior: balances.jt, exitPool: balances.lt },
                projected: {
                  seniorApy: solved.seniorApy,
                  juniorApy: solved.juniorApy,
                  liquidityApy: solved.liquidityApy,
                },
              },
              null,
              2,
            )}
            style={{ ...T.snapshot, minHeight: 240 }}
          />
          <SourceNote>
            These field names map one-to-one onto RoycoDayAccountantInitParams in the Day contracts.
            stableYield, swapFeeBps, poolTurnoverPerYear and eclpBandWidth are excluded on purpose:
            they shape this page&rsquo;s projections, not the deployed market.
          </SourceNote>
        </Disclosure>
      </div>
    </Card>
  );
}

/**
 * The publish check: does this pool actually satisfy everything
 * `day-sim:verify` will assert? Runs the same rules, before anything is
 * downloaded, so a problem is a sentence here rather than a failed command
 * later.
 */
export function PublishPanel({ draft, model }: { draft: PoolDraft; model: PoolModel }) {
  const { manifest, series, issues, errors } = useMemo(() => {
    const derived = deriveManifest(draft, model.base, model.solved, model.series);
    const found = validateManifest(derived.manifest, derived.series);
    return {
      manifest: derived.manifest,
      series: derived.series,
      issues: found,
      errors: blockingIssues(found),
    };
  }, [draft, model.base, model.solved, model.series]);

  const warnings = issues.filter((issue) => issue.severity === "warning");
  const ready = errors.length === 0;

  return (
    <div style={{ marginTop: 16, borderTop: `1px solid ${T.C.border}`, paddingTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <Eyebrow style={{ marginBottom: 0 }}>Publish check</Eyebrow>
        <StatusPill tone={ready ? "ok" : "warn"}>
          {ready ? "Ready to certify" : `${errors.length} to fix`}
        </StatusPill>
      </div>

      <Prose style={{ marginTop: 8, marginBottom: 8 }}>
        These are the same rules <code style={{ fontFamily: T.MONO }}>day-sim:verify</code> applies
        before a market can go live.
      </Prose>

      {errors.length > 0 ? (
        <div style={{ display: "grid", gap: 6 }}>
          {errors.map((issue) => (
            <Callout key={issue.message} tone="danger">
              {issue.message}
            </Callout>
          ))}
        </div>
      ) : (
        <Callout>
          Everything checks out. Your configuration satisfies the accountant&rsquo;s sizing rules,
          the curve limits, and the provenance the template requires.
        </Callout>
      )}

      {warnings.map((issue) => (
        <div key={issue.message} style={{ marginTop: 6 }}>
          <Callout tone="warn">{issue.message}</Callout>
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <Button
          primary
          disabled={!ready}
          onClick={() => downloadFile(`${manifest.id}-market.json`, JSON.stringify(manifest, null, 2))}
        >
          Download market.json
        </Button>
        <Button
          disabled={!ready}
          onClick={() => downloadFile(`${manifest.id}-series.json`, JSON.stringify(series, null, 2))}
        >
          Download series.json
        </Button>
        <Button
          disabled={!ready}
          onClick={() =>
            downloadFile(`${manifest.id}-bundle.txt`, bundleText(manifest, series), "text/plain")
          }
        >
          Download everything
        </Button>
      </div>

      <div style={{ ...T.snapshot, marginTop: 10, padding: "8px 10px", whiteSpace: "pre-wrap" }}>
        {publishCommands(manifest.id).join("\n")}
      </div>
      <Hint>Run these three after applying the files, and the pool gets its own simulator page.</Hint>

      <div style={{ marginTop: 12 }}>
        <Disclosure
          title="What gets written to disk"
          summary="The market.json this page generates, byte for byte."
        >
          <textarea
            readOnly
            aria-label="The generated market.json"
            value={JSON.stringify(manifest, null, 2)}
            spellCheck={false}
            onFocus={(e) => e.currentTarget.select()}
            style={{ ...T.snapshot, minHeight: 320, whiteSpace: "pre" }}
          />
          <SourceNote>
            Read-only on purpose. Every field here is derived from a choice you made, so editing it
            by hand would put the file and the simulator above out of step. Change the choice, not
            the output.
          </SourceNote>
        </Disclosure>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const sourceName = (draft: PoolDraft): string =>
  draft.source?.kind === "series"
    ? draft.source.origin.label || "Your strategy"
    : draft.source?.label || "Your strategy";

const countAdvanced = (draft: PoolDraft, keys: string[]): string => {
  const n = keys.filter((k) => (draft.overrides as Record<string, unknown>)[k] !== undefined).length;
  return n === 0 ? "defaults" : `${n} changed`;
};
