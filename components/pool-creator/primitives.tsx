"use client";

// Presentational primitives for the pool creator, styled to the Dawn / Tenbin
// contract in `components/pool-creator/tokens.ts`. The equivalents inside
// `DayMarketSimulator.tsx` are module-private and SHA-locked, so these are new.

import type { CSSProperties, ReactNode } from "react";
import { useId, useState } from "react";
import * as T from "@/components/pool-creator/tokens";

// ---------------------------------------------------------------------------

export function Card({
  children,
  style,
  as: Tag = "section",
}: {
  children: ReactNode;
  style?: CSSProperties;
  as?: "section" | "div" | "aside";
}) {
  return <Tag style={{ ...T.card, ...style }}>{children}</Tag>;
}

export function Eyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...T.eyebrow, ...style }}>{children}</div>;
}

/** The olive-dot kicker above a page title. */
export function Topline({ children }: { children: ReactNode }) {
  return (
    <div style={T.topline}>
      <span
        style={{
          display: "inline-flex",
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: T.C.olive,
        }}
      />
      {children}
    </div>
  );
}

export function Prose({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <p style={{ ...T.prose, ...style }}>{children}</p>;
}

export function Hint({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...T.hint, ...style }}>{children}</div>;
}

// ---------------------------------------------------------------------------

export function MiniMetric({
  label,
  value,
  note,
  color,
  hero = false,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  color?: string;
  hero?: boolean;
}) {
  return (
    <div
      style={{
        ...T.miniMetric,
        ...(hero ? { padding: "12px 14px", minHeight: 76, display: "flex", flexDirection: "column", justifyContent: "center" } : null),
      }}
    >
      <span style={hero ? T.heroMetricLabel : T.miniMetricLabel}>{label}</span>
      <b style={{ ...(hero ? T.heroMetricValue : T.miniMetricValue), ...(color ? { color } : null) }}>
        {value}
      </b>
      {note ? (
        <small
          style={{
            display: "block",
            color: T.C.muted,
            fontSize: 9.8,
            lineHeight: 1.28,
            marginTop: 5,
          }}
        >
          {note}
        </small>
      ) : null}
    </div>
  );
}

export type Tone = "neutral" | "ok" | "warn";

/** A bordered mini-card stating one checked condition. */
export function Guardrail({
  title,
  children,
  tone = "neutral",
}: {
  title: string;
  children: ReactNode;
  tone?: Tone;
}) {
  const color = tone === "ok" ? T.C.olive : tone === "warn" ? T.C.danger : T.C.text;
  return (
    <div style={T.guardrail}>
      <b style={{ ...T.guardrailTitle, color }}>{title}</b>
      {children}
    </div>
  );
}

export function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  const toneStyle: CSSProperties =
    tone === "ok"
      ? { color: T.C.olive, borderColor: T.tint.olive(0.32), background: T.tint.olive(0.08) }
      : tone === "warn"
        ? { color: T.C.danger, borderColor: T.tint.danger(0.35), background: T.tint.danger(0.08) }
        : {};
  return <span style={{ ...T.statusPill, ...toneStyle }}>{children}</span>;
}

/**
 * An explanatory strip.
 *
 * `warn` is amber-on-cream, not red: amber reads as "pay attention", red reads
 * as "you broke something". Red is reserved for `danger`, which is for blocking
 * errors and the loss line in the diagrams — never for ordinary explanation.
 */
export function Callout({
  children,
  tone = "note",
  action,
}: {
  children: ReactNode;
  tone?: "note" | "warn" | "danger";
  action?: ReactNode;
}) {
  const style: CSSProperties =
    tone === "danger"
      ? T.warn
      : tone === "warn"
        ? {
            ...T.note,
            color: T.C.text,
            background: T.tint.accent(0.07),
            borderLeft: `3px solid ${T.C.accent}`,
          }
        : T.note;
  return (
    <div style={style}>
      <div>{children}</div>
      {action ? <div style={{ marginTop: 8 }}>{action}</div> : null}
    </div>
  );
}

export function SourceNote({ children }: { children: ReactNode }) {
  return <div style={T.sourceNote}>{children}</div>;
}

// ---------------------------------------------------------------------------

export function Button({
  children,
  onClick,
  disabled,
  primary = false,
  style,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
  style?: CSSProperties;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...T.button,
        // A disabled primary keeps its dark fill at reduced opacity, which reads
        // as "muted but clickable" and sits oddly beside disabled secondaries.
        // Disabled drops the primary treatment entirely, so every disabled
        // button looks the same whatever it would have been.
        ...(primary && !disabled
          ? { background: T.C.text, color: "#FBFAF7", borderColor: T.C.text }
          : null),
        ...(disabled
          ? {
              background: T.tint.panel(0.5),
              color: T.C.faint,
              borderColor: T.C.border,
              cursor: "not-allowed",
            }
          : null),
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/**
 * A labelled row: label and one-line explanation on the left, control on the
 * right. The explanation is never optional — a tooltip must never carry
 * information needed to answer the question.
 */
export function LabeledRow({
  label,
  explanation,
  control,
  children,
  info,
}: {
  label: ReactNode;
  explanation: ReactNode;
  control?: ReactNode;
  children?: ReactNode;
  info?: ReactNode;
}) {
  return (
    <div
      style={{
        borderTop: `1px solid ${T.C.border}`,
        paddingTop: 12,
        marginTop: 12,
        display: "grid",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0, flex: "1 1 260px" }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: T.C.text, marginBottom: 3 }}>
            {label}
          </div>
          <div style={{ ...T.hint, marginTop: 0, maxWidth: 460 }}>{explanation}</div>
        </div>
        {control ? <div style={{ flex: "0 0 auto" }}>{control}</div> : null}
      </div>
      {children}
      {info}
    </div>
  );
}

/**
 * The `ⓘ` reveal. Click, not hover — hover is unusable on touch and feels
 * unserious in a form that deploys money. Expands inline and pushes content
 * down rather than floating over it.
 */
export function InfoReveal({
  what,
  benchmark,
  parameter,
}: {
  what: ReactNode;
  benchmark?: ReactNode;
  parameter?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          border: `1px solid ${T.C.border}`,
          background: open ? T.tint.accent(0.06) : "transparent",
          color: T.C.accent,
          fontSize: 9.5,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          lineHeight: 1,
          cursor: "pointer",
          borderRadius: 0,
          padding: "5px 8px",
        }}
      >
        <span style={{ fontFamily: T.MONO, fontSize: 11 }}>i</span>
        {open ? "Hide" : "What is this?"}
      </button>
      {open ? (
        <div
          id={id}
          style={{
            marginTop: 8,
            border: `1px solid ${T.C.border}`,
            background: T.tint.accent(0.04),
            padding: "10px 11px",
            display: "grid",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 11.5, lineHeight: 1.42, color: T.C.text }}>{what}</div>
          {benchmark ? (
            <div style={{ fontSize: 11, lineHeight: 1.4, color: T.C.muted }}>{benchmark}</div>
          ) : null}
          {parameter ? (
            <div style={{ fontFamily: T.MONO, fontSize: 10.5, color: T.C.kpiLabel }}>
              In the contracts: {parameter}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** A collapsible section with the Tenbin `+` / `−` affordance. */
export function Disclosure({
  title,
  summary,
  pill,
  children,
  defaultOpen = false,
}: {
  title: ReactNode;
  summary?: ReactNode;
  pill?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: pill ? "minmax(0,1fr) auto auto" : "minmax(0,1fr) auto",
          gap: 12,
          alignItems: "center",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: T.C.text }}>{title}</div>
          {summary ? <div style={T.hint}>{summary}</div> : null}
        </div>
        {pill ? <span style={T.summaryPill}>{pill}</span> : null}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          style={T.disclosureToggle}
        >
          {open ? "−" : "+"}
        </button>
      </div>
      {open ? (
        <div
          id={id}
          style={{
            borderTop: `1px solid ${T.C.border}`,
            paddingTop: 12,
            marginTop: 12,
            display: "grid",
            gap: 12,
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
