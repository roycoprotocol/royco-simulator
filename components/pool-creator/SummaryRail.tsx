"use client";

// The persistent right-hand rail. Not a passive checklist — a live simulator
// readout. The three APYs recompute as the user drags, which is the hook that
// carries them through the flow.

import type { ReactNode } from "react";
import * as T from "@/components/pool-creator/tokens";
import { CapitalStackBar } from "@/components/pool-creator/diagrams";
import { Button, Eyebrow } from "@/components/pool-creator/primitives";
import { days, pct, usdCompact } from "@/lib/pool-creator/format";
import type { PoolDraft, StepId } from "@/lib/pool-creator/draft";
import { isSourceNamed, sourceLabel } from "@/lib/pool-creator/draft";
import type { PoolModel } from "@/components/pool-creator/usePoolModel";

/**
 * How a value came to be. The distinction does real teaching: after a minute
 * with this rail the user understands the pool's actual degrees of freedom
 * without having read a word about them.
 */
type Provenance = "chosen" | "derived" | "advanced";

function Row({
  label,
  value,
  provenance,
  onJump,
}: {
  label: string;
  value: ReactNode;
  provenance: Provenance;
  onJump?: () => void;
}) {
  const clickable = provenance !== "derived" && Boolean(onJump);
  const tag =
    provenance === "derived" ? "derived" : provenance === "advanced" ? "advanced" : null;

  return (
    <div
      onClick={clickable ? onJump : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onJump?.();
              }
            }
          : undefined
      }
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) auto auto",
        gap: 8,
        alignItems: "baseline",
        padding: "5px 0",
        cursor: clickable ? "pointer" : "default",
      }}
    >
      <span style={{ fontSize: 11, color: T.C.muted }}>{label}</span>
      <span style={{ ...T.num, fontSize: 11.5, color: T.C.text }}>{value}</span>
      {tag ? (
        <span
          style={{
            fontSize: 8.2,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: provenance === "advanced" ? T.C.eyebrow : T.C.kpiLabel,
            fontWeight: 700,
          }}
        >
          {tag}
        </span>
      ) : (
        <span style={{ fontSize: 10, color: clickable ? T.C.accent : "transparent" }}>✎</span>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ borderTop: `1px solid ${T.C.border}`, paddingTop: 9, marginTop: 9 }}>
      <div style={{ ...T.miniMetricLabel, marginBottom: 4 }}>{title}</div>
      {children}
    </div>
  );
}

const apy = (value: number): string => (Number.isFinite(value) ? pct(value, 2) : "—");

export function SummaryRail({
  draft,
  model,
  onJumpToStep,
  onContinue,
  continueLabel,
  continueDisabled,
  blocker,
  mode,
}: {
  draft: PoolDraft;
  model: PoolModel;
  onJumpToStep: (step: StepId) => void;
  onContinue: () => void;
  continueLabel: string;
  continueDisabled: boolean;
  blocker?: string | null;
  mode: "simulate" | "launch";
}) {
  const { solved, balances, base, settling, hasSource } = model;
  const o = draft.overrides;
  const named = isSourceNamed(draft.source);

  return (
    <aside
      style={{
        ...T.card,
        position: "sticky",
        top: 16,
        alignSelf: "start",
        padding: 14,
        opacity: settling ? 0.85 : 1,
        transition: "opacity 120ms linear",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Eyebrow style={{ marginBottom: 0 }}>Pool preview</Eyebrow>
        <span
          style={{
            fontSize: 8.5,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            fontWeight: 700,
            color: settling ? T.C.kpiLabel : T.C.olive,
          }}
        >
          {settling ? "solving…" : "live"}
        </span>
      </div>

      <div
        style={{
          fontFamily: T.SERIF,
          fontSize: 18,
          marginTop: 6,
          lineHeight: 1.15,
          color: named ? T.C.text : T.C.faint,
        }}
      >
        {draft.identity.marketName || (named ? `${sourceLabel(draft.source)} Day pool` : "Untitled pool")}
      </div>
      <div style={{ fontSize: 11, color: T.C.muted, marginTop: 2 }}>
        {hasSource ? (
          <>
            On{" "}
            {named
              ? sourceLabel(draft.source)
              : draft.source?.kind === "series"
                ? "your uploaded history"
                : "a modelled strategy"}{" "}
            · {pct(base.sourceApy, 2)}/yr base
          </>
        ) : (
          "Pick a strategy to see what your depositors would earn."
        )}
      </div>

      {/* The hook: three live numbers. */}
      <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
        {[
          { label: "SENIOR", value: solved.seniorApy, color: T.C.seniorLine },
          { label: "JUNIOR", value: solved.juniorApy, color: T.C.juniorLine },
          { label: "EXIT POOL", value: solved.liquidityApy, color: T.C.olive },
        ].map((tranche) => (
          <div
            key={tranche.label}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}
          >
            <span style={T.miniMetricLabel}>{tranche.label}</span>
            <span
              style={{
                ...T.num,
                fontSize: 26,
                fontWeight: 600,
                letterSpacing: "-0.05em",
                color: tranche.color,
              }}
            >
              {apy(tranche.value)}
              <span style={{ fontSize: 11, color: T.C.muted, letterSpacing: 0 }}>/yr</span>
            </span>
          </div>
        ))}
      </div>

      {hasSource ? (
        <>
          <Section title="Protection">
            <Row
              label="Protected to"
              value={Number.isFinite(solved.coverageLossLimit) ? pct(solved.coverageLossLimit) : "—"}
              provenance={o.coverage !== undefined ? "advanced" : "chosen"}
              onJump={() => onJumpToStep(2)}
            />
            <Row
              label="Recovery window"
              value={days(solved.recoveryDays)}
              provenance="chosen"
              onJump={() => onJumpToStep(2)}
            />
            <Row
              label="Cushion size"
              value={pct(solved.coverage)}
              provenance="derived"
            />
          </Section>

          <Section title="Exits">
            <Row
              label="Sells under 1%"
              value={Number.isFinite(solved.exitShareOfSenior) ? pct(solved.exitShareOfSenior, 1) : "—"}
              provenance={o.minLiquidity !== undefined ? "advanced" : "chosen"}
              onJump={() => onJumpToStep(3)}
            />
            <Row label="Exit pool size" value={usdCompact(balances.lt)} provenance="derived" />
          </Section>

          <Section title="Size">
            <Row
              label="Senior"
              value={usdCompact(balances.st)}
              provenance="chosen"
              onJump={() => onJumpToStep(5)}
            />
            <Row label="Junior" value={usdCompact(balances.jt)} provenance="derived" />
            <Row label="Exit pool" value={usdCompact(balances.lt)} provenance="derived" />
            <div style={{ marginTop: 6 }}>
              <CapitalStackBar
                seniorSize={balances.st}
                juniorSize={balances.jt}
                liquiditySize={balances.lt}
              />
            </div>
          </Section>
        </>
      ) : null}

      {/* Where you are. Two states, not six — the numbers above are the point. */}
      <div
        style={{
          borderTop: `1px solid ${T.C.border}`,
          marginTop: 10,
          paddingTop: 9,
          ...T.hint,
        }}
      >
        {mode === "simulate"
          ? "Exploring. Nothing here is committed."
          : "Launching. Everything below is a real change."}
      </div>

      <div style={{ marginTop: 10 }}>
        <Button primary onClick={onContinue} disabled={continueDisabled} style={{ width: "100%" }}>
          {continueLabel}
        </Button>
        {blocker ? (
          <div style={{ ...T.hint, marginTop: 6, color: T.C.muted }}>{blocker}</div>
        ) : null}
      </div>

      {solved.notes.length > 0 ? (
        <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
          {solved.notes.map((note) => (
            <div
              key={note.code}
              style={{
                fontSize: 10.5,
                lineHeight: 1.35,
                color: T.C.danger,
                borderLeft: `2px solid ${T.tint.danger(0.45)}`,
                paddingLeft: 7,
              }}
            >
              {note.message}
            </div>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
