// =============================================================================
// Pool creator — design tokens
// -----------------------------------------------------------------------------
// Mirrors the Dawn / Tenbin visual contract used by `public/tenbin-sims/`
// (the Dawn Market Builder) and `components/day-simulator/DayMarketSimulator.tsx`.
//
// Those files are SHA-locked by `scripts/day-simulator/template-lock.json` and
// their tokens are module-private, so this is a deliberate fresh copy — the same
// convention `MarketSimulator.tsx` and `DayMarketSimulator.tsx` already follow
// (each carries its own `C`). Keep the hex values synchronized with the
// `:root` block at the top of `public/tenbin-sims/index.html`.
// =============================================================================

import type { CSSProperties } from "react";

export const C = {
  pageBg: "#FBFAF7",
  cardBg: "#FFFDF9",
  border: "#E8E2D8",
  text: "#171511",
  muted: "#6D6860",
  eyebrow: "#967756",
  accent: "#967756",
  kpiLabel: "#A49B90",
  faint: "#B9B1A5",
  olive: "#319C61",
  danger: "#8F4D42",
  seniorLine: "#8E7355",
  juniorLine: "#1B1A17",
  juniorFill: "#C9B8A2",
  strategyLine: "#A7A39A",
  obsFill: "#F4C77B",
  freeLine: "#4BCB81",
  sourceNote: "#9E968A",
  rule: "#11100E",
} as const;

export const SERIF = 'Georgia, "Times New Roman", serif';
export const MONO = '"SFMono-Regular", Consolas, monospace';

/** Tint helpers — the Tenbin sheet expresses fills as rgba over the cream page. */
export const tint = {
  accent: (a: number) => `rgba(150, 119, 86, ${a})`,
  olive: (a: number) => `rgba(49, 156, 97, ${a})`,
  danger: (a: number) => `rgba(143, 77, 66, ${a})`,
  panel: (a: number) => `rgba(255, 253, 249, ${a})`,
} as const;

// ---------------------------------------------------------------------------
// Reusable style objects — one per class in the Tenbin stylesheet.
// ---------------------------------------------------------------------------

/** `.card` */
export const card: CSSProperties = {
  background: tint.panel(0.94),
  border: `1px solid ${C.border}`,
  borderRadius: 0,
  padding: 14,
  minWidth: 0,
  boxShadow: "0 34px 70px rgba(60, 45, 28, 0.045)",
};

/** `.eyebrow` */
export const eyebrow: CSSProperties = {
  fontSize: 9.5,
  textTransform: "uppercase",
  letterSpacing: "0.22em",
  color: C.eyebrow,
  fontWeight: 600,
  marginBottom: 6,
};

/** `.topline` — the olive-dot kicker above an H1. */
export const topline: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  color: C.accent,
  fontSize: 10.5,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.28em",
  marginBottom: 8,
};

/** `h1` */
export const h1: CSSProperties = {
  fontFamily: SERIF,
  fontWeight: 400,
  fontSize: "clamp(32px, 3.4vw, 44px)",
  lineHeight: 1,
  letterSpacing: "-0.02em",
  margin: "0 0 6px",
  maxWidth: 760,
};

/** `.setupTitle` — the serif heading inside a card. */
export const cardTitle: CSSProperties = {
  fontFamily: SERIF,
  fontSize: 20,
  fontWeight: 400,
  lineHeight: 1.12,
  margin: "0 0 5px",
};

/** `.recLead h2` — the larger serif heading on a hero card. */
export const leadTitle: CSSProperties = {
  fontFamily: SERIF,
  fontSize: 22,
  fontWeight: 400,
  lineHeight: 1.08,
  margin: "0 0 7px",
  maxWidth: 560,
};

/** `.sub` */
export const sub: CSSProperties = {
  color: C.muted,
  fontSize: 13,
  lineHeight: 1.42,
  margin: "0 0 14px",
  maxWidth: 680,
  fontWeight: 400,
};

/** `.plain` / `.setupCopy` — body prose inside a card. */
export const prose: CSSProperties = {
  color: C.muted,
  margin: "0 0 10px",
  maxWidth: 720,
  fontSize: 12.5,
  lineHeight: 1.38,
  fontWeight: 400,
};

/** `.hint` — the one-line explanation under a control. */
export const hint: CSSProperties = {
  color: C.muted,
  fontSize: 10,
  lineHeight: 1.35,
  marginTop: 2,
};

/** `.ctl label` */
export const ctlLabel: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  fontWeight: 500,
  fontSize: 10.5,
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  color: C.text,
};

/** `.ctl label b` — the live mono readout on the right of a control label. */
export const ctlValue: CSSProperties = {
  color: C.accent,
  fontVariantNumeric: "tabular-nums",
  fontFamily: MONO,
  letterSpacing: 0,
  textTransform: "none",
  fontSize: 11,
  fontWeight: 600,
};

/** `.miniMetric` */
export const miniMetric: CSSProperties = {
  border: `1px solid ${C.border}`,
  background: tint.panel(0.78),
  padding: "8px 9px",
  minWidth: 0,
};

export const miniMetricLabel: CSSProperties = {
  display: "block",
  fontSize: 8.8,
  textTransform: "uppercase",
  letterSpacing: "0.14em",
  color: C.kpiLabel,
  fontWeight: 700,
  lineHeight: 1.25,
};

export const miniMetricValue: CSSProperties = {
  display: "block",
  fontFamily: MONO,
  fontSize: 17,
  lineHeight: 1.1,
  fontWeight: 600,
  letterSpacing: "-0.04em",
  marginTop: 4,
  overflowWrap: "anywhere",
};

/** The 28px hero variant used in `.recommendation .miniMetric`. */
export const heroMetricValue: CSSProperties = {
  ...miniMetricValue,
  fontSize: 28,
  lineHeight: 1,
  marginTop: 7,
  letterSpacing: "-0.05em",
};

export const heroMetricLabel: CSSProperties = {
  ...miniMetricLabel,
  fontSize: 9.2,
  letterSpacing: "0.16em",
};

/** `.guardrail` */
export const guardrail: CSSProperties = {
  border: `1px solid ${C.border}`,
  background: tint.panel(0.76),
  padding: "9px 10px",
  fontSize: 11,
  lineHeight: 1.3,
  color: C.muted,
};

export const guardrailTitle: CSSProperties = {
  display: "block",
  color: C.text,
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  marginBottom: 4,
  fontWeight: 600,
};

/** `.statusPill` */
export const statusPill: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: `1px solid ${C.border}`,
  background: tint.accent(0.06),
  color: C.accent,
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  padding: "6px 8px",
  whiteSpace: "nowrap",
};

/** `.summaryPill` — the mono chip on a collapsed disclosure header. */
export const summaryPill: CSSProperties = {
  fontFamily: MONO,
  color: C.accent,
  fontSize: 10.5,
  fontWeight: 600,
  whiteSpace: "nowrap",
  border: `1px solid ${C.border}`,
  padding: "7px 9px",
  background: tint.accent(0.05),
};

/** `.sourceNote` — provenance / disclosure footer. */
export const sourceNote: CSSProperties = {
  color: C.sourceNote,
  fontSize: 9.5,
  lineHeight: 1.35,
  marginTop: 8,
  borderTop: `1px solid ${C.border}`,
  paddingTop: 8,
  fontFamily: MONO,
};

/** `.exitModelNote` — the accent-tinted explanatory strip. */
export const note: CSSProperties = {
  fontSize: 11,
  lineHeight: 1.42,
  color: C.muted,
  border: `1px solid ${C.border}`,
  background: tint.accent(0.045),
  padding: "9px 10px",
};

/** `.scenarioWarn` — the blocking / warning strip. */
export const warn: CSSProperties = {
  color: C.danger,
  fontSize: 11,
  lineHeight: 1.4,
  border: `1px solid ${tint.danger(0.35)}`,
  background: tint.danger(0.06),
  padding: "8px 10px",
};

/** `.copyBtn` */
export const button: CSSProperties = {
  border: `1px solid ${C.border}`,
  background: C.cardBg,
  color: C.text,
  padding: "9px 12px",
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  cursor: "pointer",
  borderRadius: 0,
};

/** `.presets button` — a preset / choice chip. `on` adds the accent underline. */
export const chip = (on: boolean): CSSProperties => ({
  border: `1px solid ${on ? C.accent : C.border}`,
  background: on ? C.cardBg : tint.panel(0.84),
  padding: "8px 11px",
  cursor: "pointer",
  fontSize: 10.5,
  fontWeight: 500,
  color: C.text,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  borderRadius: 0,
  boxShadow: on ? `inset 0 -2px 0 ${C.accent}` : "none",
  textAlign: "left",
});

export const chipSub: CSSProperties = {
  display: "block",
  fontWeight: 400,
  color: C.muted,
  fontSize: 9.5,
  marginTop: 2,
  letterSpacing: 0,
  textTransform: "none",
};

/** `.seg button` — segmented control segment. */
export const segButton = (on: boolean, first: boolean): CSSProperties => ({
  border: 0,
  borderLeft: first ? 0 : `1px solid ${C.border}`,
  background: on ? C.cardBg : "transparent",
  padding: "9px 14px",
  fontWeight: 500,
  fontSize: 11,
  color: on ? C.text : C.muted,
  cursor: "pointer",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  boxShadow: on ? `inset 0 -2px 0 ${C.accent}` : "none",
});

export const seg: CSSProperties = {
  display: "inline-flex",
  background: tint.panel(0.75),
  border: `1px solid ${C.border}`,
  padding: 0,
};

/** The 28×28 `+` / `−` disclosure affordance on `.infoSummary`. */
export const disclosureToggle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  border: `1px solid ${C.border}`,
  fontFamily: MONO,
  color: C.accent,
  fontSize: 18,
  lineHeight: 1,
  background: "transparent",
  cursor: "pointer",
  borderRadius: 0,
  flex: "0 0 auto",
};

/** `.deploySnapshot` — the mono config readout. */
export const snapshot: CSSProperties = {
  width: "100%",
  border: `1px solid ${C.border}`,
  background: tint.panel(0.72),
  padding: "10px 12px",
  fontFamily: MONO,
  fontSize: 10.5,
  lineHeight: 1.45,
  color: "#554E45",
  whiteSpace: "pre",
  overflow: "auto",
  borderRadius: 0,
};

/** Tabular mono for any inline number. */
export const num: CSSProperties = {
  fontFamily: MONO,
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "-0.02em",
};
