"use client";
// =============================================================================
// Dusk vs Day — steady-state tranche-yield comparison.
// Ported VERBATIM from the user's component (Dusk taken as correct, per brief).
// Engine = Dawn steady-state mechanics. Two levers per tranche: SIZE and PRICE.
// =============================================================================
import { useState } from "react";

const TIER: Record<string, string> = { cons: "#5BC8AF", mod: "#4EA8DE", "mod+": "#7C9CE0", aggr: "#F0A04B" };

// Defaults are tuned so that, at target utilization with β=1 (co-invested):
//   • ST net ≥ 65% of base yield  (s_risk + s_liq ≤ 0.35)
//   • the Day (co-invested) JT earns ~1.5–1.7× base
//   • the LT lands between ST and JT, compensated for lockup / swap / IL risk.
// Risk premiums and coverage scale with each source's confidence tier (conf).
type Source = {
  id: number; name: string; apy: number; tier: string; cov: number; beta: number;
  sRisk: number; minLiq: number; sLiq: number; conf: string;
};
type Globals = {
  Ustar: number; Lustar: number; rfr: number; stable: number; wST: number; turnover: number; feeBps: number;
};
type GlobalsWithSwap = Globals & { swap: number };
type Computed = {
  jtSize: number; ltSize: number; duskSize: number; dep: number; duskST: number;
  duskJT: number; dayST: number; dayJT: number; dayLT: number; liqBinds: boolean;
};
type InitRow = [string, number, string, number, number, number, number, number, string];

const INIT: Source[] = ([
  ["InfiniFi 13w", 0.12, "mod", 0.2, 0, 0.2, 0.12, 0.1, "low"],
  ["reUSDe", 0.14, "mod+", 0.2, 0, 0.2, 0.12, 0.1, "low"],
  ["Ember eEARN", 0.1, "mod", 0.16, 0, 0.16, 0.11, 0.09, "v.low"],
  ["apyUSD", 0.11, "mod", 0.16, 0, 0.16, 0.11, 0.09, "v.low"],
  ["msY", 0.1, "mod", 0.16, 0, 0.16, 0.11, 0.09, "v.low"],
  ["Re7 Midas Vault", 0.18, "aggr", 0.24, 0, 0.22, 0.13, 0.11, "low-mod"],
  ["Tulipa RE RWA", 0.1, "cons", 0.16, 0, 0.16, 0.11, 0.09, "v.low"],
  ["ACRDX Centrifuge", 0.085, "cons", 0.28, 0, 0.24, 0.14, 0.11, "mod"],
  ["D2 Finance", 0.2, "aggr", 0.2, 0, 0.2, 0.12, 0.1, "low"],
  ["Zivoe", 0.1, "mod", 0.2, 0, 0.2, 0.12, 0.1, "low"],
  ["Dual Mint", 0.1, "mod", 0.16, 0, 0.16, 0.11, 0.09, "v.low"],
  ["Pareto Rockaway", 0.12, "mod", 0.24, 0, 0.22, 0.13, 0.11, "low-mod"],
] as InitRow[]).map(([name, apy, tier, cov, , sRisk, minLiq, sLiq, conf], i) => ({ id: i, name, apy, tier, cov, beta: 1, sRisk, minLiq, sLiq, conf }));

function compute(s: Source, g: GlobalsWithSwap): Computed {
  const wStab = 1 - g.wST;
  // JT capital as % of senior (coverage need), β=1. Guard the denominator: coverage
  // must be < target utilization for a finite JT size (at cov ≥ Ustar the coverage
  // requirement is unachievable → size diverges).
  const covGap = g.Ustar - s.cov;
  const jtSize = covGap > 1e-9 ? s.cov / covGap : Infinity;
  const ltSize = s.minLiq / g.Lustar; // LT capital as % of senior (liquidity need)
  const dep = s.apy; // JT is co-invested with ST (β=1): earns the source yield
  const dayST = s.apy * (1 - s.sRisk - s.sLiq);
  const dayJT = dep + (s.sRisk * s.apy) / jtSize;
  const dayLT = (s.sLiq * s.apy) / ltSize + g.swap + (g.wST * dayST + wStab * g.stable);
  const duskSize = Math.max(jtSize, ltSize); // one tranche does both jobs → larger requirement binds
  const duskST = dayST;
  const duskJT = ((s.sRisk + s.sLiq) * s.apy) / duskSize + g.swap + (g.wST * duskST + wStab * g.stable);
  return { jtSize, ltSize, duskSize, dep, duskST, duskJT, dayST, dayJT, dayLT, liqBinds: ltSize > jtSize };
}

const pct = (x: number) => (x * 100).toFixed(1) + "%";
const sp = (x: number) => (x >= 0 ? "+" : "−") + Math.abs(x * 100).toFixed(1) + "%";
const p0 = (x: number) => (x * 100).toFixed(0) + "%";
const p1 = (x: number) => (x * 100).toFixed(1) + "%";

const C = { bg: "#FBFBF8", panel: "#ffffff", panel2: "#fafaf7", line: "#e5e5e0", text: "#0a0a0a", mut: "#666666", dim: "#999999", sr: "#C8873E", jt: "#16A34A", lt: "#2563EB", neg: "#DC2626", pos: "#16A34A", warn: "#D97706", sizeTint: "rgba(37,99,235,0.06)", priceTint: "rgba(200,135,62,0.06)" };

const EXPL: Record<string, [string, string, string]> = {
  APY: ["Strategy base-asset APY", C.text, "The modeled return of the strategy base asset. ST and JT economics begin with this yield; SLP return also includes pool carry and trading fees. Edit it to match the source you are evaluating."],
  coverage: ["coverage → JT size", C.lt, "SIZES the Junior Tranche (JT). Coverage is JT divided by JT plus ST. A higher minimum means more first-loss capital; because the same risk premium is spread over more JT capital, it lowers JT's per-dollar yield."],
  minLiq: ["minLiq → SLP size", C.lt, "SIZES the SLP. This is the minimum SLP capital required relative to ST. A higher minimum creates a larger SLP; because the liquidity premium is spread across more SLP capital, it lowers per-dollar SLP yield."],
  sRisk: ["s_risk → JT premium", C.jt, "PRICES first-loss coverage. This is the share of ST yield paid to JT as the risk premium. A higher value means ST keeps less and JT earns more. It is a premium, not a size."],
  sLiq: ["s_liq → SLP premium", C.jt, "PRICES secondary liquidity. This is the share of ST yield paid to SLP for providing the immediate secondary exit. A higher s_liq means ST keeps less and SLP earns more. It is a premium, not a size."],
  beta: ["β — JT deployment", C.jt, "Where JT capital sits. 0 = a risk-free asset; 1 = the same strategy base asset as ST. Co-investment earns the base-asset yield but also exposes JT to the losses it covers. β also feeds the JT sizing formula. NOTE: this is a modelling dial only — in Royco Day co-investment is structural (Sr and Jr deposit the one collateral asset), so every real market is β=1 and there is no on-chain setting for it."],
  Ustar: ["coverage util target", C.mut, "How fully the JT's coverage capacity is used at steady state. 90% means the JT runs slightly larger than the bare minimum so it stays perpetually liquid. Feeds JT sizing."],
  Lustar: ["Liquidity-utilization target", C.mut, "How close SLP capital sits to its required minimum at steady state. This drives the SLP liquidity premium."],
  rfr: ["risk-free rate", C.mut, "What the JT earns on its own capital when β=0 (parked in T-bills / a money-market asset)."],
  stable: ["Stable-asset yield", C.mut, "Yield on the stable-asset side of the SLP pool. It contributes to SLP pool carry alongside the liquidity premium and trading fees."],
  wST: ["SLP pool % in ST", C.mut, "Share of the SLP pool held as ST versus stable assets. The pool is stable-asset-heavy in the healthy state so it can absorb ST sales, then fills with ST under exit pressure. The ST side earns ST yield; the stable-asset side earns its configured yield."],
  turnover: ["turnover ×/yr", C.mut, "How many times per year the pool's value trades through it. Drives swap-fee income. Swap APY = turnover × fee."],
  feeBps: ["swap fee", C.mut, "The pool's trading fee in basis points. Swap APY = turnover × fee."],
};

function Num({ value, onChange, suffix = "%", scale = 100, w = 52, step = 0.5 }: { value: number; onChange: (v: number) => void; suffix?: string; scale?: number; w?: number; step?: number }) {
  return (
    <span className="inline-flex items-center">
      <input type="number" step={step} value={+(value * scale).toFixed(2)} onChange={(e) => onChange((parseFloat(e.target.value) || 0) / scale)} style={{ width: w, background: C.panel2, color: C.text, border: `1px solid ${C.line}` }} className="font-mono text-[12px] tabular-nums rounded px-1.5 py-0.5 text-right outline-none focus:border-sky-500" />
      <span style={{ color: C.dim }} className="text-[10px] ml-0.5">{suffix}</span>
    </span>
  );
}

type BreakdownRow = { l: string; v: number; sub: string };
// Two tooltip shapes: a yield breakdown (total + rows) or a plain explanation (text).
type Breakdown =
  | { name: string; color: string; total: number; rows: BreakdownRow[]; text?: undefined }
  | { name: string; color: string; total?: undefined; rows?: undefined; text: string };

function breakdown(kind: string, s: Source, g: GlobalsWithSwap, c: Computed): Breakdown {
  const wStab = 1 - g.wST;
  const carry = (st: number) => g.wST * st + wStab * g.stable;
  const swapSub = `${g.turnover}×/yr × ${g.feeBps}bps`;
  const carrySub = (st: number) => `${p0(g.wST)}×${p1(st)} (senior shares) + ${p0(wStab)}×${p1(g.stable)} (stable)`;
  if (kind === "st") return { name: "Senior net (both designs)", color: C.sr, total: c.dayST, rows: [
    { l: "Base APY", v: s.apy, sub: "the source yield" },
    { l: "− Risk premium", v: -s.sRisk * s.apy, sub: `s_risk ${p0(s.sRisk)} × APY → paid to JT` },
    { l: "− Liquidity premium", v: -s.sLiq * s.apy, sub: `s_liq ${p0(s.sLiq)} × APY → paid to SLP` },
  ] };
  if (kind === "duskjt") { const prem = ((s.sRisk + s.sLiq) * s.apy) / c.duskSize;
    return { name: "Dusk JT (one position, both roles)", color: C.jt, total: c.duskJT, rows: [
      { l: "Premium income", v: prem, sub: `both premiums (s_risk+s_liq ${p0(s.sRisk + s.sLiq)}) × APY = ${p1((s.sRisk + s.sLiq) * s.apy)} of ST yield, ÷ JT size ${p0(c.duskSize)} → ${c.liqBinds ? "liquidity" : "coverage"} sets the size` },
      { l: "Swap fees", v: g.swap, sub: swapSub },
      { l: "BPT carry", v: carry(c.duskST), sub: carrySub(c.duskST) },
    ] };
  }
  if (kind === "dayjt") { const prem = (s.sRisk * s.apy) / c.jtSize;
    return { name: "Royco Day JT (first-loss coverage)", color: C.jt, total: c.dayJT, rows: [
      { l: "Deployment (co-invested)", v: c.dep, sub: "JT sits in the same asset as ST (β=1) → earns the source APY" },
      { l: "Risk premium", v: prem, sub: `s_risk ${p0(s.sRisk)} × APY = ${p1(s.sRisk * s.apy)} of ST yield, ÷ JT size ${p0(c.jtSize)}` },
    ] };
  }
  const prem = (s.sLiq * s.apy) / c.ltSize;
  return { name: "Royco Day SLP (secondary liquidity)", color: C.lt, total: c.dayLT, rows: [
    { l: "Liquidity premium", v: prem, sub: `s_liq ${p0(s.sLiq)} × APY = ${p1(s.sLiq * s.apy)} of ST yield, ÷ SLP size ${p0(c.ltSize)}` },
    { l: "Swap fees", v: g.swap, sub: swapSub },
    { l: "BPT carry", v: carry(c.dayST), sub: carrySub(c.dayST) },
  ] };
}

type Tip = { x: number; y: number; d: Breakdown };
type HovHandlers = {
  onMouseEnter: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseLeave: () => void;
};

function Lbl({ k, hovT }: { k: string; hovT: (key: string) => HovHandlers }) {
  return (
    <span {...hovT(k)} style={{ color: C.mut, borderBottom: `1px dotted ${C.dim}` }} className="text-[10px] uppercase tracking-wider cursor-help">{EXPL[k][0].split(" — ")[0].split(" →")[0]}</span>
  );
}

export default function Comparison() {
  const [g, setG] = useState<Globals>({ Ustar: 0.9, Lustar: 0.9, rfr: 0.045, stable: 0.035, wST: 0.1, turnover: 8, feeBps: 10 });
  const [scenario, setScenario] = useState("base");
  const [rows, setRows] = useState<Source[]>(INIT);
  const [tip, setTip] = useState<Tip | null>(null);

  const swap = (g.turnover * g.feeBps) / 10000;
  const gg: GlobalsWithSwap = { ...g, swap };
  const setScen = (k: string) => { setScenario(k); setG((p) => (k === "cons" ? { ...p, turnover: 2, feeBps: 10 } : { ...p, turnover: 8, feeBps: 10 })); };
  const upd = (id: number, key: keyof Source, val: number) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [key]: val } : r)));
  const results = rows.map((r) => ({ r, c: compute(r, gg) }));

  const at = (e: React.MouseEvent) => ({ x: e.clientX, y: e.clientY });
  const hov = (kind: string, r: Source, c: Computed): HovHandlers => ({
    onMouseEnter: (e) => setTip({ ...at(e), d: breakdown(kind, r, gg, c) }),
    onMouseMove: (e) => setTip((t) => (t ? { ...t, ...at(e) } : t)),
    onMouseLeave: () => setTip(null),
  });
  const hovT = (key: string): HovHandlers => ({
    onMouseEnter: (e) => setTip({ ...at(e), d: { name: EXPL[key][0], color: EXPL[key][1], text: EXPL[key][2] } }),
    onMouseMove: (e) => setTip((t) => (t ? { ...t, ...at(e) } : t)),
    onMouseLeave: () => setTip(null),
  });

  const yieldCell = (kind: string, r: Source, c: Computed, val: number, color: string, size: number | null, extra: React.CSSProperties = {}) => (
    <td style={{ color, ...extra }} className="px-2 py-1.5 text-right cursor-help align-top" {...hov(kind, r, c)}>
      <div className="underline decoration-dotted underline-offset-2" style={{ textDecorationColor: C.dim }}>{pct(val)}</div>
      {size != null && <div style={{ color: C.dim }} className="text-[9px] font-sans mt-0.5 lowercase">size {p0(size)}</div>}
    </td>
  );

  return (
    <div style={{ background: C.bg, color: C.text }} className="w-full font-sans">
      <div className="max-w-[1180px] mx-auto">
        <div className="flex items-end justify-between flex-wrap gap-3 mb-3">
          <h1 className="text-[22px] font-semibold tracking-tight">Dusk <span style={{ color: C.dim }}>vs</span> Royco Day — modeled position yields</h1>
          <div className="flex items-center gap-2">
            <span style={{ color: C.mut }} className="text-[10px] uppercase tracking-wider">swap scenario</span>
            {["cons", "base"].map((k) => (
              <button key={k} onClick={() => setScen(k)} style={{ background: scenario === k ? C.sr : "transparent", color: scenario === k ? "#ffffff" : C.mut, border: `1px solid ${scenario === k ? C.sr : C.line}` }} className="text-[11px] font-medium rounded px-2.5 py-1">{k === "cons" ? "Conservative" : "Base"}</button>
            ))}
          </div>
        </div>

        <div style={{ background: C.panel, border: `1px solid ${C.line}` }} className="rounded-lg p-3.5 mb-4 text-[12px] leading-relaxed">
          <div className="font-semibold mb-1.5" style={{ color: C.text }}>Every yield comes from two separate levers — read them apart</div>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5" style={{ color: C.mut }}>
            <div><span style={{ color: C.lt }} className="font-medium">SIZE</span> — how much capital the position uses, as a % of ST.
              <div style={{ color: C.dim }} className="font-mono text-[10.5px] mt-0.5">JT size = coverage ÷ (util − coverage) &nbsp;·&nbsp; SLP size = minLiq ÷ liquidity utilization</div></div>
            <div><span style={{ color: C.jt }} className="font-medium">PRICE</span> — the position&apos;s premium share of ST yield.
              <div style={{ color: C.dim }} className="font-mono text-[10.5px] mt-0.5">JT risk premium = s_risk &nbsp;·&nbsp; SLP liquidity premium = s_liq</div></div>
          </div>
          <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${C.line}`, color: C.mut }}>
            Per-dollar yield ≈ <span style={{ color: C.text }} className="font-mono text-[11px]">PRICE ÷ SIZE</span> (+ swap + carry). A smaller position earns a higher modeled yield because the same premium is spread over fewer dollars.
            <span className="block mt-1"><span style={{ color: C.jt }}>Dusk</span> runs <b>one</b> junior position for both jobs: its size = the larger of the two requirements, and it collects both premiums (s_risk + s_liq).
            <span style={{ color: C.lt }}> Royco Day</span> separates the roles: JT provides first-loss coverage, while SLP provides secondary liquidity. That uses more total capital but prices each role independently.</span>
          </div>
        </div>

        <div style={{ background: C.panel, border: `1px solid ${C.line}` }} className="rounded-lg p-3 mb-5 flex flex-wrap gap-x-6 gap-y-3 items-center">
          <div className="flex flex-col gap-1"><Lbl k="Ustar" hovT={hovT} /><Num value={g.Ustar} onChange={(v) => setG({ ...g, Ustar: v })} /></div>
          <div className="flex flex-col gap-1"><Lbl k="Lustar" hovT={hovT} /><Num value={g.Lustar} onChange={(v) => setG({ ...g, Lustar: v })} /></div>
          <div className="flex flex-col gap-1"><Lbl k="stable" hovT={hovT} /><Num value={g.stable} onChange={(v) => setG({ ...g, stable: v })} /></div>
          <div className="flex flex-col gap-1"><Lbl k="wST" hovT={hovT} /><Num value={g.wST} onChange={(v) => setG({ ...g, wST: v })} /></div>
          <div className="flex flex-col gap-1"><Lbl k="turnover" hovT={hovT} /><Num value={g.turnover} onChange={(v) => setG({ ...g, turnover: v })} suffix="×" scale={1} step={1} /></div>
          <div className="flex flex-col gap-1"><Lbl k="feeBps" hovT={hovT} /><Num value={g.feeBps / 100} onChange={(v) => setG({ ...g, feeBps: v * 100 })} suffix="bps" scale={100} step={1} w={48} /></div>
          <div style={{ background: C.panel2, border: `1px solid ${C.line}` }} className="rounded px-2.5 py-1.5 font-mono text-[11px]"><span style={{ color: C.mut }}>swap APY </span><span style={{ color: C.lt }}>{pct(swap)}</span></div>
        </div>

        <div style={{ border: `1px solid ${C.line}` }} className="rounded-lg overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr style={{ background: C.panel2, color: C.mut }} className="text-[9px] uppercase tracking-wider">
                <th className="text-left font-medium px-3 py-2 align-bottom">Source</th>
                <th className="font-medium px-1.5 py-2 align-bottom" {...hovT("APY")}><span style={{ borderBottom: `1px dotted ${C.dim}` }} className="cursor-help">APY</span></th>
                <th className="font-medium px-1.5 py-2 align-bottom cursor-help" style={{ background: C.sizeTint }} {...hovT("coverage")}>coverage<br /><span style={{ color: C.lt }}>→ JT size</span></th>
                <th className="font-medium px-1.5 py-2 align-bottom cursor-help" style={{ background: C.sizeTint }} {...hovT("minLiq")}>minLiq<br /><span style={{ color: C.lt }}>→ SLP size</span></th>
                <th className="font-medium px-1.5 py-2 align-bottom cursor-help" style={{ background: C.priceTint }} {...hovT("sRisk")}>s_risk<br /><span style={{ color: C.jt }}>→ JT premium</span></th>
                <th className="font-medium px-1.5 py-2 align-bottom cursor-help" style={{ background: C.priceTint }} {...hovT("sLiq")}>s_liq<br /><span style={{ color: C.jt }}>→ SLP premium</span></th>
                <th style={{ borderLeft: `2px solid ${C.line}`, color: C.sr }} className="font-medium px-2 py-2 align-bottom">ST<br />net</th>
                <th style={{ borderLeft: `2px solid ${C.line}`, color: C.jt }} className="font-medium px-2 py-2 align-bottom">DUSK<br />JT</th>
                <th style={{ borderLeft: `2px solid ${C.line}`, color: C.jt }} className="font-medium px-2 py-2 align-bottom">DAY<br />JT</th>
                <th style={{ color: C.lt }} className="font-medium px-2 py-2 align-bottom">DAY<br />SLP</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {results.map(({ r, c }, i) => {
                const bg = i % 2 ? C.panel2 : C.panel;
                return (
                  <tr key={r.id} style={{ background: bg, borderTop: `1px solid ${C.line}` }}>
                    <td className="px-3 py-1.5 font-sans whitespace-nowrap">
                      <span style={{ color: C.text }}>{r.name}</span>
                      <span style={{ color: TIER[r.tier] }} className="ml-2 text-[9px] uppercase tracking-wide">{r.conf}</span>
                    </td>
                    <td className="px-1.5 py-1.5 text-center"><Num value={r.apy} onChange={(v) => upd(r.id, "apy", v)} /></td>
                    <td className="px-1.5 py-1.5 text-center" style={{ background: C.sizeTint }}><Num value={r.cov} onChange={(v) => upd(r.id, "cov", v)} w={46} /></td>
                    <td className="px-1.5 py-1.5 text-center" style={{ background: C.sizeTint }}><Num value={r.minLiq} onChange={(v) => upd(r.id, "minLiq", v)} w={46} /></td>
                    <td className="px-1.5 py-1.5 text-center" style={{ background: C.priceTint }}><Num value={r.sRisk} onChange={(v) => upd(r.id, "sRisk", v)} w={46} /></td>
                    <td className="px-1.5 py-1.5 text-center" style={{ background: C.priceTint }}><Num value={r.sLiq} onChange={(v) => upd(r.id, "sLiq", v)} w={46} /></td>
                    {yieldCell("st", r, c, c.duskST, C.sr, null, { borderLeft: `2px solid ${C.line}` })}
                    {yieldCell("duskjt", r, c, c.duskJT, C.jt, c.duskSize, { borderLeft: `2px solid ${C.line}` })}
                    {yieldCell("dayjt", r, c, c.dayJT, C.jt, c.jtSize, { borderLeft: `2px solid ${C.line}` })}
                    {yieldCell("daylt", r, c, c.dayLT, C.lt, c.ltSize)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ color: C.mut }} className="text-[11px] mt-3 leading-relaxed">
          The <span style={{ color: C.dim }}>size</span> line under each yield is that position&apos;s capital as a percentage of ST. Only <span style={{ color: C.jt }}>JT</span> is first-loss capital for ST; <span style={{ color: C.lt }}>SLP</span> provides secondary liquidity. Royco Day sizes JT and SLP independently, then combines their capital requirements. Dusk instead reuses one JT pool for both roles. Hover any header to see what the input does; hover any yield to see its components.
        </div>
      </div>

      {tip && (
        <div style={{ position: "fixed", left: Math.min(tip.x + 16, (typeof window !== "undefined" ? window.innerWidth : 1200) - 292), top: Math.min(tip.y + 16, (typeof window !== "undefined" ? window.innerHeight : 800) - 210), width: 276, zIndex: 60, background: C.panel, border: `1px solid ${tip.d.color}`, boxShadow: "0 10px 30px rgba(0,0,0,0.12)" }} className="rounded-lg p-3 pointer-events-none">
          <div className="flex items-baseline justify-between mb-2 pb-2 gap-3" style={{ borderBottom: `1px solid ${C.line}` }}>
            <span style={{ color: tip.d.color }} className="text-[12px] font-semibold tracking-tight">{tip.d.name}</span>
            {tip.d.total != null && <span style={{ color: tip.d.color }} className="font-mono text-[15px] font-bold tabular-nums">{pct(tip.d.total)}</span>}
          </div>
          {tip.d.rows ? (
            <>
              <div className="space-y-1.5">
                {tip.d.rows.map((row, k) => (
                  <div key={k}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span style={{ color: C.text }} className="text-[11px]">{row.l}</span>
                      <span style={{ color: row.v >= 0 ? C.pos : C.neg }} className="font-mono text-[12px] tabular-nums">{sp(row.v)}</span>
                    </div>
                    <div style={{ color: C.dim }} className="text-[9.5px] font-mono leading-snug">{row.sub}</div>
                  </div>
                ))}
              </div>
              <div className="flex items-baseline justify-between mt-2 pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
                <span style={{ color: C.mut }} className="text-[10px] uppercase tracking-wider">= total</span>
                <span style={{ color: tip.d.color }} className="font-mono text-[13px] font-bold tabular-nums">{pct(tip.d.total)}</span>
              </div>
            </>
          ) : (
            <div style={{ color: C.text }} className="text-[11.5px] leading-relaxed">{tip.d.text}</div>
          )}
        </div>
      )}
    </div>
  );
}
