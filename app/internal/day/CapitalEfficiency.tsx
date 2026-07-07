"use client";
// =============================================================================
// Capital efficiency — Day vs Dusk.  One scorecard: coverage, capital, per-tranche yield.
//
// Both cover the senior at the steady state. Each BPT's ST shares are counted at their
// real weight wST (the rest of the pool is stable and doesn't draw down):
// Capital:  Day = 1 + J + L,  J = cov·(1+wST·L)/(U*−cov)  (JT, β=1, covers senior + LT's
//           ST shares; L = minLiq/L*).  Dusk = 1 + max(cov/(U*−wST·cov), minLiq/L*)
//           (one junior covers senior + its own wST·D ST shares; β_eff = wST at the peg).
//           Under a run the pool drifts senior-heavy → β→1 (the reflexive fixed point).
// Per-tranche yield (premium shares s_risk → JT, s_liq → LT are inputs; same model as
// the Dusk vs Day tab):
//   ST net = APY·(1 − s_risk − s_liq)                          (identical both designs)
//   Day JT = APY + s_risk·APY/jtSize                           (co-invested in source)
//   Day LT = s_liq·APY/ltSize + carry
//   Dusk JT = (s_risk+s_liq)·APY/duskSize + carry              (one junior, both jobs)
//   Dusk LT = N/A                                              (no separate liquidity tranche)
//   carry = wST·ST_net + (1−wST)·stable + swap   (BPT carry).  See CLAUDE.md §5 / §7.
// =============================================================================
import { useState, type ReactNode } from "react";
import { C } from "./theme";

type Source = { id: number; name: string; cov: number; minLiq: number; sRisk: number; sLiq: number };
type Globals = { Ustar: number; Lustar: number; wST: number; APY: number; stable: number; turnover: number; feeBps: number };
type Calc = {
  ltSize: number; jtSize: number; duskSize: number; dayCap: number; duskCap: number;
  stNet: number; dayJT: number; dayLT: number; duskJT: number; capSave: number;
};

const SOURCES: Source[] = ([
  ["InfiniFi 13w", 0.2, 0.12, 0.2, 0.1], ["reUSDe", 0.2, 0.12, 0.2, 0.1], ["Ember eEARN", 0.16, 0.11, 0.16, 0.09],
  ["apyUSD", 0.16, 0.11, 0.16, 0.09], ["msY", 0.16, 0.11, 0.16, 0.09], ["Re7 Midas Vault", 0.22, 0.13, 0.22, 0.11],
  ["Tulipa RE RWA", 0.16, 0.11, 0.16, 0.09], ["ACRDX Centrifuge", 0.24, 0.14, 0.24, 0.11], ["D2 Finance", 0.2, 0.12, 0.2, 0.1],
  ["Zivoe", 0.2, 0.12, 0.2, 0.1], ["Dual Mint", 0.16, 0.11, 0.16, 0.09], ["Pareto Rockaway", 0.22, 0.13, 0.22, 0.11],
] as [string, number, number, number, number][]).map(([name, cov, minLiq, sRisk, sLiq], id) => ({ id, name, cov, minLiq, sRisk, sLiq }));

const DAY = C.lt, DUSK = C.jt, POS = C.pos;
const mlt = (x: number) => x.toFixed(2) + "×";
const pc1 = (x: number) => (x * 100).toFixed(1) + "%";

function calc(s: Source, g: Globals): Calc {
  const ltSize = s.minLiq / g.Lustar;
  // Day JT (β=1, co-invested in source) covers external senior + the LT's ST shares (wST·L):
  //   U = cov·(1 + wST·L + J)/J = U*  ⇒  J = cov·(1 + wST·L)/(U* − cov)
  const jtSize = (s.cov * (1 + g.wST * ltSize)) / (g.Ustar - s.cov);
  // Dusk junior (the BPT) covers external senior + ITS OWN ST shares (wST·D) — the only
  // source-exposed part of the pool (the 90% stable leg doesn't draw down), exactly
  // parallel to Day's wST·L. So β_eff = wST at the peg:
  //   U = cov·(1 + wST·D)/D = U*  ⇒  D = cov/(U* − wST·cov).  (Under a run the pool drifts
  //   senior-heavy and β→1 — the reflexive fixed point; see the Failure-mode row.)
  const duskSize = Math.max(s.cov / (g.Ustar - g.wST * s.cov), ltSize);
  const dayCap = 1 + jtSize + ltSize;
  const duskCap = 1 + duskSize;
  const swap = (g.turnover * g.feeBps) / 10000;
  const stNet = g.APY * (1 - s.sRisk - s.sLiq);
  const carry = g.wST * stNet + (1 - g.wST) * g.stable + swap;
  const dayJT = g.APY + (s.sRisk * g.APY) / jtSize;
  const dayLT = (s.sLiq * g.APY) / ltSize + carry;
  const duskJT = ((s.sRisk + s.sLiq) * g.APY) / duskSize + carry;
  return { ltSize, jtSize, duskSize, dayCap, duskCap, stNet, dayJT, dayLT, duskJT, capSave: (dayCap - duskCap) / dayCap };
}

type Cell = {
  v: string; win?: string; na?: boolean; dim?: boolean; big?: boolean;
  mark?: string; bar?: number; note?: string;
};

function Row({ label, day, dusk, accentRow, last }: { label: string; day: Cell; dusk: Cell; accentRow?: string; last?: boolean }) {
  const cell = (d: Cell, accent: string) => (
    <div className="flex-1 flex flex-col justify-center gap-2.5 px-6 py-4" style={{ background: d.win ? `${POS}0F` : "transparent" }}>
      <div className="flex items-baseline gap-2">
        <span style={{ color: d.na ? C.dim : d.dim ? C.text : accent }} className={d.big ? "font-mono text-[23px] font-bold tabular-nums leading-none tracking-tight" : "text-[13px] font-medium leading-snug"}>{d.v}</span>
        {d.mark && <span style={{ color: d.mark === "✓" ? POS : C.neg }} className="text-[13px] leading-none">{d.mark}</span>}
        {d.win && <span style={{ color: POS, background: `${POS}1C` }} className="text-[10px] font-bold rounded-md px-2 py-1 leading-none ml-auto whitespace-nowrap">▲ {d.win}</span>}
      </div>
      {d.bar != null && <div style={{ height: 6, borderRadius: 99, background: C.panel2 }} className="w-full overflow-hidden"><div style={{ width: `${Math.max(0, d.bar) * 100}%`, height: "100%", borderRadius: 99, background: `linear-gradient(90deg, ${accent}88, ${accent})`, transition: "width .55s cubic-bezier(.4,0,.2,1)" }} /></div>}
      {d.note && <span style={{ color: C.dim }} className="text-[10.5px] leading-snug">{d.note}</span>}
    </div>
  );
  return (
    <div className="flex items-stretch" style={{ borderBottom: last ? "none" : `1px solid ${C.line}` }}>
      <div className="flex items-center gap-2 px-6 py-4" style={{ width: 188, background: C.panel2 }}>
        {accentRow && <span style={{ width: 3, height: 22, borderRadius: 99, background: accentRow }} />}
        <span className="text-[11.5px] font-medium leading-snug" style={{ color: C.mut }}>{label}</span>
      </div>
      <div className="flex flex-1" style={{ borderLeft: `1px solid ${C.line}` }}>
        {cell(day, DAY)}
        <div style={{ width: 1, background: C.line }} />
        {cell(dusk, DUSK)}
      </div>
    </div>
  );
}

function Pct({ value, onChange, w = 46 }: { value: number; onChange: (v: number) => void; w?: number }) {
  return <span className="inline-flex items-center"><input type="number" step={0.5} value={+(value * 100).toFixed(1)} onChange={(e) => onChange((parseFloat(e.target.value) || 0) / 100)} style={{ width: w, background: C.panel2, color: C.text, border: `1px solid ${C.line}` }} className="font-mono text-[12px] tabular-nums rounded-lg px-2 py-1 text-right outline-none focus:border-sky-500" /><span style={{ color: C.dim }} className="text-[10px] ml-0.5">%</span></span>;
}
const F = ({ l, children }: { l: string; children: ReactNode }) => <span className="inline-flex items-center gap-1.5"><span style={{ color: C.mut }} className="text-[10.5px]">{l}</span>{children}</span>;

export default function CapitalEfficiency() {
  const [g, setG] = useState({ Ustar: 0.9, Lustar: 0.9, wST: 0.1, APY: 0.12, stable: 0.035, turnover: 8, feeBps: 10 });
  const [rows, setRows] = useState(SOURCES);
  const [id, setId] = useState(0);
  const s = rows[id];
  const c = calc(s, g);
  const setS = (k: "cov" | "minLiq" | "sRisk" | "sLiq", v: number) => setRows((xs) => xs.map((x) => (x.id === id ? { ...x, [k]: v } : x)));
  const set = (k: "APY" | "stable" | "wST", v: number) => setG({ ...g, [k]: v });
  const capMax = Math.max(c.dayCap, c.duskCap);
  const yMax = Math.max(c.dayJT, c.dayLT, c.duskJT, c.stNet) * 1.05;
  // dynamic junior-yield descriptor (so the prose never contradicts the numbers)
  const jtGapPt = (c.duskJT - c.dayJT) * 100;
  const jtCmp = Math.abs(jtGapPt) < 0.75 ? "about the same"
    : jtGapPt > 0 ? `Dusk's ${jtGapPt.toFixed(1)}pt higher`
    : `Day's ${(-jtGapPt).toFixed(1)}pt higher`;

  return (
    <div className="w-full" style={{ color: C.text, background: `radial-gradient(1100px 460px at 74% -8%, ${DAY}0E, transparent), radial-gradient(900px 460px at 2% 2%, ${DUSK}0A, transparent)` }}>
      <div className="max-w-[900px] mx-auto">
        {/* header */}
        <div className="flex items-start justify-between flex-wrap gap-3 mb-1">
          <div>
            <h1 className="text-[24px] font-semibold tracking-tight leading-none">Capital Efficiency</h1>
            <p style={{ color: C.mut }} className="text-[12.5px] mt-2">Coverage, capital, and per-tranche yield — <span style={{ color: DAY }}>Day</span> <span style={{ color: C.dim }}>vs</span> <span style={{ color: DUSK }}>Dusk</span>, per $1 of senior.</p>
          </div>
          <div style={{ background: `linear-gradient(135deg, ${POS}22, ${POS}08)`, border: `1px solid ${POS}55`, color: POS }} className="rounded-full px-3.5 py-1.5 text-[11px] font-semibold flex items-center gap-1.5">
            <span style={{ width: 7, height: 7, borderRadius: 99, background: POS, boxShadow: `0 0 8px ${POS}` }} /> Both guarantee min coverage
          </div>
        </div>

        {/* controls */}
        <div style={{ background: C.panel, border: `1px solid ${C.line}` }} className="rounded-xl px-4 py-3 my-5 flex items-center gap-x-4 gap-y-2.5 flex-wrap text-[11px]">
          <select value={id} onChange={(e) => setId(+e.target.value)} style={{ background: C.panel2, color: C.text, border: `1px solid ${C.line}` }} className="rounded-lg px-3 py-1.5 text-[12.5px] font-medium outline-none focus:border-sky-500">
            {rows.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <F l="cov"><Pct value={s.cov} onChange={(v) => setS("cov", v)} /></F>
          <F l="minLiq"><Pct value={s.minLiq} onChange={(v) => setS("minLiq", v)} /></F>
          <F l="s_risk"><Pct value={s.sRisk} onChange={(v) => setS("sRisk", v)} /></F>
          <F l="s_liq"><Pct value={s.sLiq} onChange={(v) => setS("sLiq", v)} /></F>
          <span style={{ color: C.line }}>│</span>
          <F l="APY"><Pct value={g.APY} onChange={(v) => set("APY", v)} /></F>
          <F l="stable"><Pct value={g.stable} onChange={(v) => set("stable", v)} /></F>
          <F l="BPT%ST"><Pct value={g.wST} onChange={(v) => set("wST", v)} /></F>
        </div>

        {/* scorecard */}
        <div style={{ background: `linear-gradient(180deg, ${C.panel}, ${C.panel2})`, border: `1px solid ${C.line}` }} className="rounded-2xl overflow-hidden shadow-xl">
          {/* headers */}
          <div className="flex items-stretch" style={{ borderBottom: `1px solid ${C.line}` }}>
            <div style={{ width: 188 }} />
            <div className="flex flex-1" style={{ borderLeft: `1px solid ${C.line}` }}>
              <div className="flex-1 px-6 py-3.5 flex items-center gap-2.5" style={{ background: `${DAY}0E` }}><span style={{ background: DAY, color: "#ffffff" }} className="rounded-md text-[12px] font-bold px-2.5 py-1">DAY</span><span style={{ color: C.dim }} className="text-[10px]">JT + LT</span></div>
              <div style={{ width: 1, background: C.line }} />
              <div className="flex-1 px-6 py-3.5 flex items-center gap-2.5" style={{ background: `${DUSK}0E` }}><span style={{ background: DUSK, color: "#ffffff" }} className="rounded-md text-[12px] font-bold px-2.5 py-1">DUSK</span><span style={{ color: C.dim }} className="text-[10px]">one BPT-junior</span></div>
            </div>
          </div>

          <Row label="Min coverage"
            day={{ v: "Guaranteed", mark: "✓", dim: true }}
            dusk={{ v: "Guaranteed", mark: "✓", dim: true }} />

          <Row label="Capital locked / $1 senior"
            day={{ v: mlt(c.dayCap), big: true, bar: c.dayCap / capMax }}
            dusk={{ v: mlt(c.duskCap), big: true, bar: c.duskCap / capMax, win: `${Math.round(c.capSave * 100)}% leaner` }} />

          <Row label="Senior (ST) yield" accentRow={C.sr}
            day={{ v: pc1(c.stNet), big: true, bar: c.stNet / yMax, note: "net of both premiums" }}
            dusk={{ v: pc1(c.stNet), big: true, bar: c.stNet / yMax, note: "identical — same premiums" }} />

          <Row label="Junior (JT) yield" accentRow={DUSK}
            day={{ v: pc1(c.dayJT), big: true, bar: c.dayJT / yMax, note: "mostly source yield + premium" }}
            dusk={{ v: pc1(c.duskJT), big: true, bar: c.duskJT / yMax, note: "premium-heavy (both cuts, lazy BPT)" }} />

          <Row label="Liquidity (LT) yield" accentRow={DAY}
            day={{ v: pc1(c.dayLT), big: true, bar: c.dayLT / yMax, note: "separate BPT tranche" }}
            dusk={{ v: "N/A", na: true, note: "no LT — the junior provides liquidity" }} />

          <Row label="Failure mode" last
            day={{ v: "Graceful", mark: "✓", note: "coverage independent of the pool" }}
            dusk={{ v: "Reflexive", mark: "✗", note: "a run drifts the pool senior-heavy → β→1 (fixed point)" }} />
        </div>

        {/* takeaway */}
        <div style={{ color: C.mut }} className="text-[12.5px] leading-relaxed mt-4 px-1">
          <b style={{ color: C.text }}>The read:</b> the senior earns the same, and the juniors are {jtCmp} (<span style={{ color: DAY }}>Day {pc1(c.dayJT)}</span> from source + premium; <span style={{ color: DUSK }}>Dusk {pc1(c.duskJT)}</span>, premium-heavy on lazy BPT capital). So the trade is structural: <span style={{ color: DUSK }}>Dusk</span> locks <b style={{ color: POS }}>{Math.round(c.capSave * 100)}% less capital</b> (one pool, sized to <span className="font-mono">max(coverage, liquidity)</span>) — but its coverage is <b style={{ color: DUSK }}>reflexive</b> (a run drives the pool senior-heavy → β→1, the fixed point), and it has no separate LT. <span style={{ color: DAY }}>Day</span> pays more capital for coverage that&apos;s independent of the pool and a distinct LT ({pc1(c.dayLT)}). <span style={{ color: C.dim }}>Less capital vs robustness — that&apos;s the trade.</span>
        </div>

        {/* all sources */}
        <details className="mt-4">
          <summary style={{ color: C.mut }} className="text-[11px] cursor-pointer mb-2">All sources ▾</summary>
          <div style={{ border: `1px solid ${C.line}`, background: C.panel }} className="rounded-xl overflow-hidden">
            <table className="w-full border-collapse text-[12px]">
              <thead><tr style={{ background: C.panel2, color: C.dim }} className="text-[9px] uppercase tracking-wider">
                <th className="text-left px-4 py-2.5">Source</th>
                <th className="px-3 py-2.5 text-right" style={{ color: DAY }}>Day cap</th><th className="px-3 py-2.5 text-right" style={{ color: DUSK }}>Dusk cap</th>
                <th className="px-3 py-2.5 text-right" style={{ color: C.sr }}>ST yld</th>
                <th className="px-3 py-2.5 text-right" style={{ color: DAY }}>Day JT</th><th className="px-3 py-2.5 text-right" style={{ color: DUSK }}>Dusk JT</th><th className="px-4 py-2.5 text-right" style={{ color: DAY }}>Day LT</th>
              </tr></thead>
              <tbody className="font-mono tabular-nums">
                {rows.map((x, i) => { const cc = calc(x, g); return (
                  <tr key={x.id} onClick={() => setId(x.id)} style={{ background: id === x.id ? `${DUSK}12` : i % 2 ? C.panel2 : "transparent", borderTop: `1px solid ${C.line}`, cursor: "pointer" }} className="hover:opacity-80 transition">
                    <td className="px-4 py-2 font-sans whitespace-nowrap" style={{ color: id === x.id ? C.text : C.mut }}>{x.name}</td>
                    <td className="px-3 py-2 text-right" style={{ color: DAY }}>{mlt(cc.dayCap)}</td>
                    <td className="px-3 py-2 text-right" style={{ color: DUSK }}>{mlt(cc.duskCap)}</td>
                    <td className="px-3 py-2 text-right" style={{ color: C.sr }}>{pc1(cc.stNet)}</td>
                    <td className="px-3 py-2 text-right" style={{ color: DAY }}>{pc1(cc.dayJT)}</td>
                    <td className="px-3 py-2 text-right" style={{ color: DUSK }}>{pc1(cc.duskJT)}</td>
                    <td className="px-4 py-2 text-right" style={{ color: DAY }}>{pc1(cc.dayLT)}</td>
                  </tr>); })}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </div>
  );
}
