"use client";
import { useMemo, useState } from "react";
import { C, pct, p1, usd, days } from "./theme";
import { LineChart, StateTimeline } from "./charts";
import { Sim, defaultConfig, type StepInput, type Op } from "@/lib/day/engine/runner";
import { MarketState, type MarketConfig, type YDMConfig } from "@/lib/day/engine/types";
import { YEAR_SEC } from "@/lib/day/engine/ydm";

// ---------------------------------------------------------------------------
// Scenario builders. Each returns a labelled program of steps.
// ---------------------------------------------------------------------------
type ScenarioKey = "calm" | "recover" | "distress" | "liquidation" | "run";

const MONTH = YEAR_SEC / 12;
const yieldStep = (apy: number, beta: number, stable: number, op?: Op): StepInput => ({
  dtSec: MONTH,
  stReturn: apy / 12,
  jtReturn: (beta === 1 ? apy : stable) / 12,
  op,
});

function buildScenario(key: ScenarioKey, cfg: MarketConfig, apy: number, init: { st: number; jt: number; lt: number }): StepInput[] {
  const b = cfg.beta;
  const sy = cfg.stableYield;
  const Y = (op?: Op) => yieldStep(apy, b, sy, op);
  // A source shock of r hits BOTH legs when the JT is co-invested (β=1): the
  // junior takes its own drawdown AND must still cover the senior. With β=0 the
  // junior sits in the RFR and only the senior leg moves.
  const S = (r: number, label?: string, op?: Op): StepInput => ({ dtSec: 0, stReturn: r, jtReturn: b === 1 ? r : 0, op, label });
  switch (key) {
    case "calm":
      return Array.from({ length: 12 }, () => Y());
    case "recover":
      return [
        Y(), Y(), Y(),
        S(-0.05, "−5% source shock (JT co-invested takes it too, then covers ST)"),
        Y(), Y(),
        S(+0.055, "+5.5% source recovery (ST IL first, then repays JT coverage)"),
        Y(), Y(), Y(), Y(), Y(),
      ];
    case "distress":
      return [
        Y(), Y(), Y(),
        S(-0.28, "−28% source shock (JT eats its own loss + ST coverage → ST IL)"),
        Y(), Y(), Y(),
        S(+0.1, "+10% partial recovery (ST IL repaid first)"),
        Y(), Y(), Y(), Y(),
      ];
    case "liquidation":
      return [
        Y(), Y(),
        S(-0.15, "−15% source shock (both legs)"),
        S(-0.12, "−12% source shock (utilization breaches liq threshold)"),
        S(0, "ST self-liquidates (bonus from JT delevers)", { type: "stRedeem", shares: init.st * 0.2 }),
        Y(), Y(), Y(), Y(),
      ];
    case "run": {
      const sells = Math.max(1, Math.round(init.lt / 12));
      return [
        Y(), Y(), Y(),
        ...Array.from({ length: 8 }, (_, i) => ({ dtSec: 0, stReturn: 0, jtReturn: 0, op: { type: "secondarySell", amount: sells } as Op, label: i === 0 ? "secondary selling begins (ST holders exit into the pool)" : undefined })),
        S(-0.06, "−6% source shock — pool is now ST-heavy (wrong-way risk)"),
        Y(), Y(),
      ];
    }
  }
}

const SCENARIOS: { key: ScenarioKey; label: string; blurb: string }[] = [
  { key: "calm", label: "Calm year", blurb: "12 months of steady yield. Watch the three premiums split senior yield." },
  { key: "recover", label: "Drawdown & recover", blurb: "A covered ST loss enters FIXED_TERM; recovery repays JT and exits cleanly." },
  { key: "distress", label: "Exceed coverage", blurb: "A loss larger than the JT buffer creates ST IL — distressed, JT claim erased." },
  { key: "liquidation", label: "Liquidation + self-liq", blurb: "Losses breach the liquidation threshold; ST self-liquidates, JT pays the bonus." },
  { key: "run", label: "Secondary run on LT", blurb: "ST holders exit into the pool; it fills with ST right before a shock." },
];

// ---------------------------------------------------------------------------
// Small UI atoms
// ---------------------------------------------------------------------------
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2 py-[3px]">
      <span style={{ color: C.mut }} className="text-[10.5px] uppercase tracking-wider" title={hint}>{label}</span>
      {children}
    </label>
  );
}
function NumIn({ value, onChange, scale = 1, step = 1, w = 60, suffix }: { value: number; onChange: (v: number) => void; scale?: number; step?: number; w?: number; suffix?: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <input type="number" step={step} value={+(value * scale).toFixed(4)} onChange={(e) => onChange((parseFloat(e.target.value) || 0) / scale)} style={{ width: w, background: C.panel2, color: C.text, border: `1px solid ${C.line}` }} className="font-mono text-[12px] tabular-nums rounded px-1.5 py-[3px] text-right outline-none focus:border-sky-500" />
      {suffix && <span style={{ color: C.dim }} className="text-[9px]">{suffix}</span>}
    </span>
  );
}
function Seg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)} style={{ background: value === o.v ? C.sr : "transparent", color: value === o.v ? "#ffffff" : C.mut }} className="text-[10.5px] font-medium px-2 py-[3px]">{o.l}</button>
      ))}
    </div>
  );
}
function Panel({ title, right, children }: { title?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}` }} className="rounded-lg p-3">
      {title && (
        <div className="flex items-center justify-between mb-2">
          <span style={{ color: C.mut }} className="text-[10px] uppercase tracking-[0.12em]">{title}</span>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}
function YDMEditor({ name, cfg, onChange, accent }: { name: string; cfg: YDMConfig; onChange: (c: YDMConfig) => void; accent: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span style={{ color: accent }} className="text-[10.5px] uppercase tracking-wider">{name}</span>
        <Seg value={cfg.mode} options={[{ v: "static", l: "static" }, { v: "adaptive", l: "adaptive" }]} onChange={(m) => onChange({ ...cfg, mode: m as YDMConfig["mode"] })} />
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {(["y0", "yTarget", "y100"] as const).map((k) => (
          <div key={k} className="flex flex-col items-center">
            <span style={{ color: C.dim }} className="text-[9px] font-mono">{k === "y0" ? "@0%" : k === "yTarget" ? "@90%" : "@100%"}</span>
            <NumIn value={cfg[k]} scale={100} step={1} w={46} onChange={(v) => onChange({ ...cfg, [k]: v })} />
          </div>
        ))}
      </div>
      {cfg.mode === "adaptive" && (
        <div className="mt-1"><Field label="adapt speed /yr"><NumIn value={cfg.maxAdaptSpeedPerYear ?? 1} step={0.25} w={50} onChange={(v) => onChange({ ...cfg, maxAdaptSpeedPerYear: v })} /></Field></div>
      )}
    </div>
  );
}

const stateColor = (s: MarketState) => (s === MarketState.FIXED_TERM ? C.warn : C.pos);

// ---------------------------------------------------------------------------
export default function Simulator() {
  const [coverage, setCoverage] = useState(0.2);
  const beta = 1; // JT is always co-invested with ST
  const [liqUtil, setLiqUtil] = useState(1.5);
  const [termDays, setTermDays] = useState(30);
  const [minLiq, setMinLiq] = useState(0.12);
  const [riskYDM, setRiskYDM] = useState<YDMConfig>({ mode: "static", y0: 0.25, yTarget: 0.35, y100: 0.55 });
  const [liqYDM, setLiqYDM] = useState<YDMConfig>({ mode: "static", y0: 0.08, yTarget: 0.12, y100: 0.2 });
  const [stableYield, setStableYield] = useState(0.035);
  const [swapBps, setSwapBps] = useState(10);
  const [turnover, setTurnover] = useState(8);
  const [bandWidth, setBandWidth] = useState(0.15);
  const [selfLiq, setSelfLiq] = useState(0.02);
  const [apy, setApy] = useState(0.12);
  const [initST, setInitST] = useState(40_000_000);
  const [initJT, setInitJT] = useState(10_000_000);
  const [initLT, setInitLT] = useState(6_000_000);
  const [scenario, setScenario] = useState<ScenarioKey>("recover");
  const [cursor, setCursor] = useState<number | null>(null);

  const cfg: MarketConfig = useMemo(
    () => defaultConfig({
      coverage, beta, liquidationUtilization: liqUtil, fixedTermDurationSec: termDays * 86400,
      minLiquidity: minLiq, riskYDM, liqYDM,
      stableYield, swapFeeBps: swapBps, poolTurnoverPerYear: turnover, eclpBandWidth: bandWidth, stSelfLiquidationBonus: selfLiq,
    }),
    [coverage, beta, liqUtil, termDays, minLiq, riskYDM, liqYDM, stableYield, swapBps, turnover, bandWidth, selfLiq],
  );

  const sim = useMemo(() => {
    const s = new Sim(cfg, { st: initST, jt: initJT, lt: initLT });
    buildScenario(scenario, cfg, apy, { st: initST, jt: initJT, lt: initLT }).forEach((step) => s.step(step));
    return s;
  }, [cfg, scenario, apy, initST, initJT, initLT]);

  const H = sim.history;
  const idx = cursor == null ? H.length - 1 : Math.min(cursor, H.length - 1);
  const cur = H[idx];
  const xs = H.map((h) => h.t);
  const cursorX = xs[idx];
  const worstResidual = Math.max(...H.map((h) => Math.abs(h.conservationResidual)));

  const xFmt = (x: number) => days(x);

  return (
    <div className="w-full" style={{ color: C.text }}>
      <div className="flex items-end justify-between flex-wrap gap-3 mb-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Royco Day — high-fidelity simulator</h1>
          <p style={{ color: C.mut }} className="text-[11.5px] mt-0.5">Time-stepped Dawn accountant + the LP tranche. Loss waterfall, dual YDM, fixed-term state machine, self-liquidation, and a concentrated E-CLP BPT (10% ST / 90% T-bill) — all live.</p>
        </div>
        <div style={{ background: worstResidual < 1e-3 ? "rgba(79,180,119,0.1)" : "rgba(229,83,75,0.12)", border: `1px solid ${worstResidual < 1e-3 ? C.pos : C.neg}` }} className="rounded px-2.5 py-1.5 font-mono text-[10.5px]">
          <span style={{ color: C.mut }}>NAV conservation </span>
          <span style={{ color: worstResidual < 1e-3 ? C.pos : C.neg }}>{worstResidual < 1e-3 ? "✓ holds" : "✗ violated"}</span>
          <span style={{ color: C.dim }}> · max resid {worstResidual.toExponential(1)}</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-[300px_1fr] gap-3">
        {/* ---------- controls ---------- */}
        <div className="flex flex-col gap-3">
          <Panel title="Scenario">
            <div className="flex flex-col gap-1">
              {SCENARIOS.map((s) => (
                <button key={s.key} onClick={() => { setScenario(s.key); setCursor(null); }} style={{ background: scenario === s.key ? C.panel2 : "transparent", border: `1px solid ${scenario === s.key ? C.sr : C.line}` }} className="text-left rounded px-2 py-1.5">
                  <div style={{ color: scenario === s.key ? C.sr : C.text }} className="text-[12px] font-medium">{s.label}</div>
                  <div style={{ color: C.dim }} className="text-[10px] leading-snug mt-0.5">{s.blurb}</div>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Coverage (Dawn)">
            <Field label="source APY" hint="underlying yield"><NumIn value={apy} scale={100} step={0.5} suffix="%" onChange={setApy} /></Field>
            <Field label="coverage" hint="min senior protection"><NumIn value={coverage} scale={100} step={1} suffix="%" onChange={setCoverage} /></Field>
            <Field label="liq. utilization" hint="self-liquidation threshold (>1)"><NumIn value={liqUtil} scale={1} step={0.05} suffix="×" onChange={setLiqUtil} /></Field>
            <Field label="fixed term" hint="recovery window"><NumIn value={termDays} scale={1} step={5} suffix="d" onChange={setTermDays} /></Field>
            <Field label="self-liq bonus"><NumIn value={selfLiq} scale={100} step={0.5} suffix="%" onChange={setSelfLiq} /></Field>
          </Panel>

          <Panel title="Premiums (two YDMs)">
            <YDMEditor name="risk premium → JT" cfg={riskYDM} onChange={setRiskYDM} accent={C.jt} />
            <div className="my-2" style={{ borderTop: `1px solid ${C.line}` }} />
            <YDMEditor name="LP premium → LT" cfg={liqYDM} onChange={setLiqYDM} accent={C.lt} />
            <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
            </div>
          </Panel>

          <Panel title="LP tranche (E-CLP BPT)">
            <Field label="min LP" hint="% of senior pool-backed"><NumIn value={minLiq} scale={100} step={1} suffix="%" onChange={setMinLiq} /></Field>
            <Field label="T-bill stable yield" hint="90% leg in tokenized treasuries"><NumIn value={stableYield} scale={100} step={0.5} suffix="%" onChange={setStableYield} /></Field>
            <Field label="swap fee"><NumIn value={swapBps} scale={1} step={1} suffix="bps" onChange={setSwapBps} /></Field>
            <Field label="turnover /yr"><NumIn value={turnover} scale={1} step={1} suffix="×" onChange={setTurnover} /></Field>
            <Field label="E-CLP band" hint="price drop to stable exhaustion (concentration)"><NumIn value={bandWidth} scale={100} step={1} suffix="%" onChange={setBandWidth} /></Field>
          </Panel>

          <Panel title="Initial deposits">
            <Field label="senior (ST)"><NumIn value={initST} step={1_000_000} w={96} onChange={setInitST} /></Field>
            <Field label="junior (JT)"><NumIn value={initJT} step={1_000_000} w={96} onChange={setInitJT} /></Field>
            <Field label="LP (LT)"><NumIn value={initLT} step={500_000} w={96} onChange={setInitLT} /></Field>
          </Panel>
        </div>

        {/* ---------- output ---------- */}
        <div className="flex flex-col gap-3">
          {/* snapshot strip */}
          <Panel>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span style={{ background: stateColor(cur.state), color: "#ffffff" }} className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">{cur.state}</span>
                {cur.state === MarketState.FIXED_TERM && <span style={{ color: C.warn }} className="text-[10px] font-mono">term {days(cur.fixedTermRemaining)} left</span>}
                <span style={{ color: C.dim }} className="text-[10px] font-mono">t = {days(cur.t)}</span>
              </div>
              <div className="flex items-center gap-3 font-mono text-[10.5px]">
                <span><span style={{ color: C.mut }}>util </span><span style={{ color: cur.utilization > liqUtil ? C.neg : cur.coverageOK ? C.text : C.warn }}>{isFinite(cur.utilization) ? pct(cur.utilization) : "∞"}</span></span>
                <span><span style={{ color: C.mut }}>liqUtil </span><span style={{ color: cur.liquidityUtilization > 1 ? C.neg : C.lt }}>{isFinite(cur.liquidityUtilization) ? pct(cur.liquidityUtilization) : "∞"}</span></span>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { l: "ST effective", v: usd(cur.stEffectiveNAV), c: C.sr, sub: `price ${cur.stPrice.toFixed(4)}` },
                { l: "JT effective", v: usd(cur.jtEffectiveNAV), c: C.jt, sub: `price ${cur.jtPrice.toFixed(4)}` },
                { l: "LT value", v: usd(cur.ltNAV), c: C.lt, sub: `pool ${pct(cur.poolPctST)} ST` },
                { l: "LP premium", v: usd(cur.accruedLiquidityPremium), c: C.lt, sub: "accrued to LT" },
                { l: "ST IL", v: usd(cur.stIL), c: cur.stIL > 1e-6 ? C.neg : C.dim, sub: "senior impairment" },
                { l: "JT IL", v: usd(cur.jtIL), c: cur.jtIL > 1e-6 ? C.warn : C.dim, sub: "coverage claim" },
                { l: "BPT oracle value", v: usd(cur.ltRawNAV), c: C.lt, sub: `pool ${pct(cur.poolPctST)} ST (EclpLPOracle)` },
                { l: "risk / liq share", v: `${p1(cur.riskShare)} / ${p1(cur.liqShare)}`, c: C.text, sub: "this step" },
              ].map((s, i) => (
                <div key={i} style={{ background: C.panel2, border: `1px solid ${C.line}` }} className="rounded px-2 py-1.5">
                  <div style={{ color: C.mut }} className="text-[9px] uppercase tracking-wider">{s.l}</div>
                  <div style={{ color: s.c }} className="font-mono text-[14px] tabular-nums mt-0.5">{s.v}</div>
                  <div style={{ color: C.dim }} className="text-[9px] font-mono">{s.sub}</div>
                </div>
              ))}
            </div>
          </Panel>

          {/* charts */}
          <Panel title="Tranche NAV over time">
            <LineChart xs={xs} cursor={cursorX} yFmt={(y) => usd(y)} xFmt={xFmt} height={170}
              series={[
                { label: "ST effective", color: C.sr, data: H.map((h) => h.stEffectiveNAV) },
                { label: "JT effective", color: C.jt, data: H.map((h) => h.jtEffectiveNAV) },
                { label: "LT value", color: C.lt, data: H.map((h) => h.ltNAV) },
              ]} />
            <Legend items={[["ST effective", C.sr], ["JT effective", C.jt], ["LT value", C.lt]]} />
          </Panel>

          <Panel title="Utilization — coverage health">
            <LineChart xs={xs} cursor={cursorX} yFmt={(y) => pct(y)} xFmt={xFmt} height={150} y0={0} yMaxClamp={Math.max(2, liqUtil + 0.5)}
              bands={[{ y: 1, color: C.mut, label: "100% collateralized" }, { y: liqUtil, color: C.neg, label: "liquidation" }, { y: 0.9, color: C.dim, label: "target" }]}
              series={[{ label: "utilization", color: C.sr, data: H.map((h) => h.utilization) }]} />
          </Panel>

          <Panel title="LP utilization — secondary-market health">
            <LineChart xs={xs} cursor={cursorX} yFmt={(y) => pct(y)} xFmt={xFmt} height={130} y0={0} yMaxClamp={2}
              bands={[{ y: 1, color: C.neg, label: "min LP breached" }, { y: cfg.liqTargetUtilization, color: C.dim, label: "target" }]}
              series={[{ label: "LP utilization", color: C.lt, data: H.map((h) => h.liquidityUtilization) }]} />
          </Panel>

          <Panel title="Premium shares (YDM output)">
            <LineChart xs={xs} cursor={cursorX} yFmt={(y) => pct(y)} xFmt={xFmt} height={120} y0={0}
              series={[
                { label: "risk share → JT", color: C.jt, data: H.map((h) => h.riskShare) },
                { label: "LP share → LT", color: C.lt, data: H.map((h) => h.liqShare) },
              ]} />
            <Legend items={[["risk → JT", C.jt], ["LP → LT", C.lt]]} />
          </Panel>

          <Panel>
            <StateTimeline xs={xs} states={H.map((h) => h.state)} xFmt={xFmt} />
            <div className="mt-2">
              <div className="flex items-center justify-between">
                <span style={{ color: C.mut }} className="text-[10px] uppercase tracking-wider">scrub timeline</span>
                <span style={{ color: C.dim }} className="text-[10px] font-mono">step {idx} / {H.length - 1} · {days(cur.t)}</span>
              </div>
              <input type="range" min={0} max={H.length - 1} value={idx} onChange={(e) => setCursor(Number(e.target.value))} className="w-full mt-1" style={{ accentColor: C.sr }} />
            </div>
          </Panel>

          {/* event log */}
          <Panel title="Event log">
            <div className="font-mono text-[10.5px] max-h-[220px] overflow-y-auto pr-1 flex flex-col gap-0.5">
              {sim.events.filter((e) => e.kind !== "accrue" || e.level !== "info").map((e, i) => (
                <div key={i} className="flex gap-2">
                  <span style={{ color: C.dim }} className="shrink-0 w-12 text-right">{days(e.t)}</span>
                  <span style={{ color: e.level === "danger" ? C.neg : e.level === "warn" ? C.warn : e.level === "good" ? C.pos : C.mut }}>{e.msg}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="flex items-center gap-3 mt-1.5">
      {items.map(([l, c]) => (
        <span key={l} className="inline-flex items-center gap-1.5">
          <span style={{ background: c, width: 9, height: 2.5, display: "inline-block" }} />
          <span style={{ color: C.mut }} className="text-[9.5px]">{l}</span>
        </span>
      ))}
    </div>
  );
}
