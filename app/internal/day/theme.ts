// Shared palette + formatters. Dawn v1 LIGHT visual language, matching the
// public simulator page so the internal Day view reads as one instrument.

export const C = {
  bg: "#FBFBF8",      // page background (Dawn cream)
  panel: "#ffffff",   // cards / surfaces (white)
  panel2: "#fafaf7",  // inset / recessed surface
  line: "#e5e5e0",    // borders & dividers
  text: "#0a0a0a",    // primary text
  mut: "#666666",     // muted/secondary text
  dim: "#999999",     // dimmed/tertiary text
  sr: "#C8873E",      // SENIOR — amber (matches Dawn's senior line color)
  jt: "#16A34A",      // JUNIOR — green (matches Dawn's junior line color)
  lt: "#2563EB",      // LIQUIDITY — blue (distinct, legible on light)
  neg: "#DC2626",     // negative (red)
  pos: "#16A34A",     // positive (green)
  warn: "#D97706",    // warning (amber)
  sizeTint: "rgba(37,99,235,0.06)",   // very light blue tint
  priceTint: "rgba(200,135,62,0.06)", // very light amber tint
};

export const pct = (x: number) => (x * 100).toFixed(1) + "%";
export const p0 = (x: number) => (x * 100).toFixed(0) + "%";
export const p1 = (x: number) => (x * 100).toFixed(1) + "%";
export const sp = (x: number) => (x >= 0 ? "+" : "−") + Math.abs(x * 100).toFixed(1) + "%";

export const usd = (x: number) => {
  const a = Math.abs(x);
  const s = x < 0 ? "−$" : "$";
  if (a >= 1e6) return s + (a / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return s + (a / 1e3).toFixed(1) + "k";
  return s + a.toFixed(0);
};

export const days = (sec: number) => {
  const d = sec / 86400;
  if (d >= 365) return (d / 365).toFixed(2) + "y";
  if (d >= 1) return d.toFixed(0) + "d";
  return (sec / 3600).toFixed(0) + "h";
};
