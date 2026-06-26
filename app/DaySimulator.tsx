'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
} from 'recharts';
import { Sim, defaultConfig, type StepInput, type Op } from '@/lib/day/engine/runner';
import { type MarketConfig, type YDMConfig } from '@/lib/day/engine/types';
import { YEAR_SEC, ydmShare } from '@/lib/day/engine/ydm';

// duplicated from app/internal/day/Simulator.tsx — keep in sync
// ---------------------------------------------------------------------------
// Scenario builders. Each returns a labelled program of steps.
// ---------------------------------------------------------------------------
type ScenarioKey = 'calm' | 'recover' | 'distress' | 'liquidation' | 'run';

const MONTH = YEAR_SEC / 12;
const yieldStep = (apy: number, beta: number, stable: number, op?: Op): StepInput => ({
  dtSec: MONTH,
  stReturn: apy / 12,
  jtReturn: (beta === 1 ? apy : stable) / 12,
  op,
});

function buildScenario(
  key: ScenarioKey,
  cfg: MarketConfig,
  apy: number,
  init: { st: number; jt: number; lt: number },
): StepInput[] {
  const b = cfg.beta;
  const sy = cfg.stableYield;
  const Y = (op?: Op) => yieldStep(apy, b, sy, op);
  const S = (r: number, label?: string, op?: Op): StepInput => ({
    dtSec: 0,
    stReturn: r,
    jtReturn: b === 1 ? r : 0,
    op,
    label,
  });
  switch (key) {
    case 'calm':
      return Array.from({ length: 12 }, () => Y());
    case 'recover':
      return [
        Y(), Y(), Y(),
        S(-0.05, '−5% source shock (JT co-invested takes it too, then covers ST)'),
        Y(), Y(),
        S(+0.055, '+5.5% source recovery (ST IL first, then repays JT coverage)'),
        Y(), Y(), Y(), Y(), Y(),
      ];
    case 'distress':
      return [
        Y(), Y(), Y(),
        S(-0.28, '−28% source shock (JT eats its own loss + ST coverage → ST IL)'),
        Y(), Y(), Y(),
        S(+0.1, '+10% partial recovery (ST IL repaid first)'),
        Y(), Y(), Y(), Y(),
      ];
    case 'liquidation':
      return [
        Y(), Y(),
        S(-0.15, '−15% source shock (both legs)'),
        S(-0.12, '−12% source shock (utilization breaches liq threshold)'),
        S(0, 'ST self-liquidates (bonus from JT delevers)', { type: 'stRedeem', shares: init.st * 0.2 }),
        Y(), Y(), Y(), Y(),
      ];
    case 'run': {
      const sells = Math.max(1, Math.round(init.lt / 12));
      return [
        Y(), Y(), Y(),
        ...Array.from({ length: 8 }, (_, i) => ({
          dtSec: 0,
          stReturn: 0,
          jtReturn: 0,
          op: { type: 'secondarySell', amount: sells } as Op,
          label:
            i === 0
              ? 'secondary selling begins (ST holders exit into the pool)'
              : undefined,
        })),
        S(-0.06, '−6% source shock — pool is now ST-heavy (wrong-way risk)'),
        Y(), Y(),
      ];
    }
  }
}

// ---------------------------------------------------------------------------
// Local formatters (copied from app/internal/day/theme.ts — do NOT import internal)
// ---------------------------------------------------------------------------
const pct = (x: number) => (x * 100).toFixed(1) + '%';
const usd = (x: number) => {
  const a = Math.abs(x);
  const s = x < 0 ? '−$' : '$';
  if (a >= 1e6) return s + (a / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return s + (a / 1e3).toFixed(1) + 'k';
  return s + a.toFixed(0);
};

// ---------------------------------------------------------------------------
// ResponsiveContainer — no SSR (mirrors app/page.tsx:7-10)
// ---------------------------------------------------------------------------
const ResponsiveContainerNoSSR = dynamic(
  () => import('recharts').then((mod) => mod.ResponsiveContainer),
  { ssr: false },
);

// ---------------------------------------------------------------------------
// Light-theme UI atoms
// ---------------------------------------------------------------------------
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center justify-between gap-2 py-[3px]">
      <span
        className="text-[10.5px] uppercase tracking-wider text-[#666666]"
        title={hint}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function NumIn({
  value,
  onChange,
  scale = 1,
  step = 1,
  w = 60,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  scale?: number;
  step?: number;
  w?: number;
  suffix?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        step={step}
        value={+(value * scale).toFixed(4)}
        onChange={(e) => onChange((parseFloat(e.target.value) || 0) / scale)}
        style={{ width: w }}
        className="font-mono text-[12px] tabular-nums rounded px-1.5 py-[3px] text-right outline-none border border-[#e5e5e0] bg-white text-[#0a0a0a] focus:border-[#8A6A41]"
      />
      {suffix && (
        <span className="text-[9px] text-[#999999]">{suffix}</span>
      )}
    </span>
  );
}

function Card({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg border border-[#e5e5e0] p-4 shadow-sm">
      {title && (
        <p className="text-[10px] uppercase tracking-[0.12em] text-[#666666] mb-2">
          {title}
        </p>
      )}
      {children}
    </div>
  );
}

// Draggable anchor slider — one HTML range input per YDM anchor, expressed as
// % of senior yield (0–100). The accent colour tints the track + thumb via
// accentColor (light-theme, no globals.css edit required).
function AnchorSlider({
  label,
  value,
  accent,
  onChange,
}: {
  label: string;
  value: number; // decimal 0–1
  accent: string;
  onChange: (v: number) => void; // emits decimal 0–1
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono text-[#999999]">{label}</span>
        <span
          className="text-[11px] font-mono tabular-nums font-semibold"
          style={{ color: accent }}
        >
          {(value * 100).toFixed(0)}%
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(value * 100)}
        onChange={(e) => onChange((parseFloat(e.target.value) || 0) / 100)}
        className="utilization-slider w-full"
        style={{ accentColor: accent, background: accent }}
      />
    </div>
  );
}


// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function DaySimulator() {
  // --- primary inputs ---
  const [apy, setApy] = useState(0.12);
  const [coverage, setCoverage] = useState(0.2);
  const [minLiq, setMinLiq] = useState(0.12);
  const [initST, setInitST] = useState(40_000_000);
  const [initJT, setInitJT] = useState(10_000_000);
  const [initLT, setInitLT] = useState(6_000_000);

  // --- operating utilization (drives premium shares → APYs / split bar / chart dots) ---
  const [covUtil, setCovUtil] = useState(90); // coverage utilization %, 0–100
  const [lqUtil, setLqUtil] = useState(90); // liquidity utilization %, 0–100

  // --- advanced inputs ---
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [stableYield, setStableYield] = useState(0.035);
  const [swapBps, setSwapBps] = useState(10);
  const [turnover, setTurnover] = useState(8);
  const [bandWidth, setBandWidth] = useState(0.15);
  const [riskYDM, setRiskYDM] = useState<YDMConfig>({
    mode: 'static',
    y0: 0.25,
    yTarget: 0.35,
    y100: 0.55,
  });
  const [liqYDM, setLiqYDM] = useState<YDMConfig>({
    mode: 'static',
    y0: 0.08,
    yTarget: 0.12,
    y100: 0.2,
  });
  const [termDays, setTermDays] = useState(30);
  const [selfLiq, setSelfLiq] = useState(0.02);
  const [liqUtil, setLiqUtil] = useState(1.5);

  // beta=1 locked const (JT is always co-invested with ST)
  const beta = 1;

  // ---------------------------------------------------------------------------
  // Combined-≤100% clamp for the two YDM anchors (per anchor key y0/yTarget/y100),
  // plus per-tranche monotonicity: the @100% util anchor (y100) can never sit
  // below the @90% target anchor (yTarget). The EDITED side takes priority: it
  // can reach 100%, sliding the other side down so riskYDM[k] + liqYDM[k] never
  // exceeds 1. Both states update together so cfg always stays consistent.
  // ---------------------------------------------------------------------------
  const setRiskAnchor = (k: keyof YDMConfig, raw: number) => {
    const v = Math.max(0, Math.min(1, raw));
    const r = { ...riskYDM, [k]: v };
    const l = { ...liqYDM };
    // monotonicity: y100 >= yTarget for the edited tranche
    if (k === 'yTarget') r.y100 = Math.max(r.y100, v);
    if (k === 'y100') r.y100 = Math.max(v, r.yTarget); // y100 can't be set below yTarget
    // existing combined-<=100% cap, per anchor (reduce the OTHER tranche)
    (['y0', 'yTarget', 'y100'] as const).forEach((a) => {
      if ((r[a] ?? 0) + (l[a] ?? 0) > 1) l[a] = Math.max(0, 1 - r[a]);
    });
    // if the cap pushed liq.y100 below liq.yTarget, pull liq.yTarget down to keep liq monotonic
    l.yTarget = Math.min(l.yTarget, l.y100);
    setRiskYDM(r);
    setLiqYDM(l);
  };
  const setLiqAnchor = (k: keyof YDMConfig, raw: number) => {
    const v = Math.max(0, Math.min(1, raw));
    const l = { ...liqYDM, [k]: v };
    const r = { ...riskYDM };
    // monotonicity: y100 >= yTarget for the edited tranche
    if (k === 'yTarget') l.y100 = Math.max(l.y100, v);
    if (k === 'y100') l.y100 = Math.max(v, l.yTarget); // y100 can't be set below yTarget
    // existing combined-<=100% cap, per anchor (reduce the OTHER tranche)
    (['y0', 'yTarget', 'y100'] as const).forEach((a) => {
      if ((l[a] ?? 0) + (r[a] ?? 0) > 1) r[a] = Math.max(0, 1 - l[a]);
    });
    // if the cap pushed risk.y100 below risk.yTarget, pull risk.yTarget down to keep risk monotonic
    r.yTarget = Math.min(r.yTarget, r.y100);
    setLiqYDM(l);
    setRiskYDM(r);
  };

  // --- explainer ---
  const [showExplainer, setShowExplainer] = useState(false);

  // --- yield-split bar per-segment width measurement ---
  // Each of the three segments gets its own ref. We observe the BAR CONTAINER
  // (not the segments) and read each segment's real rendered offsetWidth inside
  // the callback. This avoids any render→resize→render loop: the labels we write
  // are flex-centered inside fixed-`%`-width segments, so they never change a
  // segment's px width, and we never observe an element whose size our state
  // could alter.
  const barRef = useRef<HTMLDivElement>(null);
  const segRefs = useRef<Array<HTMLDivElement | null>>([null, null, null]);
  const [segWidths, setSegWidths] = useState<[number, number, number]>([
    600, 120, 90,
  ]);
  useEffect(() => {
    const container = barRef.current;
    if (!container) return;
    const update = () =>
      setSegWidths((prev) => {
        const next: [number, number, number] = [
          segRefs.current[0]?.offsetWidth ?? prev[0],
          segRefs.current[1]?.offsetWidth ?? prev[1],
          segRefs.current[2]?.offsetWidth ?? prev[2],
        ];
        return next[0] === prev[0] && next[1] === prev[1] && next[2] === prev[2]
          ? prev
          : next;
      });
    update();
    const rafId = requestAnimationFrame(update);
    // Observe every segment so a `%`-driven width change (when the split
    // shifts) is measured even though the container itself never resizes.
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(update);
      ro.observe(container);
      segRefs.current.forEach((el) => el && ro!.observe(el));
    }
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(rafId);
      ro?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Config + sim (duplicated from app/internal/day/Simulator.tsx — keep in sync)
  // ---------------------------------------------------------------------------
  const cfg: MarketConfig = useMemo(
    () =>
      defaultConfig({
        coverage,
        beta,
        liquidationUtilization: liqUtil,
        fixedTermDurationSec: termDays * 86400,
        minLiquidity: minLiq,
        riskYDM,
        liqYDM,
        premiumPriority: 'jtPriority',
        stableYield,
        swapFeeBps: swapBps,
        poolTurnoverPerYear: turnover,
        eclpBandWidth: bandWidth,
        stSelfLiquidationBonus: selfLiq,
      }),
    [
      coverage,
      liqUtil,
      termDays,
      minLiq,
      riskYDM,
      liqYDM,
      stableYield,
      swapBps,
      turnover,
      bandWidth,
      selfLiq,
    ],
  );

  const sim = useMemo(() => {
    const s = new Sim(cfg, { st: initST, jt: initJT, lt: initLT });
    buildScenario('calm', cfg, apy, {
      st: initST,
      jt: initJT,
      lt: initLT,
    }).forEach((step) => s.step(step));
    return s;
  }, [cfg, apy, initST, initJT, initLT]);

  // Final snapshot (no timeline scrubber)
  const cur = sim.history[sim.history.length - 1];

  // Clamp helper — keeps a value in [0,1] and guards against non-finite inputs.
  const safeFrac = (x: number) =>
    Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0;

  // ---------------------------------------------------------------------------
  // Premium shares — driven by the two operating-utilization sliders (NOT the
  // engine snapshot). Same ydmShare call shape the curve charts use, so at the
  // 90% defaults these reproduce the @90 target anchors exactly.
  // ---------------------------------------------------------------------------
  const riskShare = safeFrac(
    ydmShare(riskYDM, riskYDM.yTarget, covUtil / 100, cfg.targetUtilization),
  );
  const liqShare = safeFrac(
    ydmShare(liqYDM, liqYDM.yTarget, lqUtil / 100, cfg.liqTargetUtilization),
  );

  // ---------------------------------------------------------------------------
  // APY derivation (duplicated from app/internal/day/Simulator.tsx — keep in sync)
  // Ustar / Lustar come from cfg (target utilizations, both default 0.9).
  // wST = 0.1 matches CapitalEfficiency's default globals (10% ST weight in the BPT at peg).
  // ---------------------------------------------------------------------------
  const Ustar = cfg.targetUtilization;
  const Lustar = cfg.liqTargetUtilization;
  const wST = 0.1; // ST weight in the E-CLP BPT at the default peg (the displayed pool composition varies with market conditions / the concentration band, but the APY math uses the peg weight)
  const ltSize = minLiq / Lustar;
  const jtSize = (coverage * (1 + wST * ltSize)) / (Ustar - coverage);
  const stNet = apy * (1 - riskShare - liqShare);
  const swap = (turnover * swapBps) / 10000;
  const carry = wST * stNet + (1 - wST) * stableYield + swap;
  const stAPY = stNet;
  const jtAPY = apy + (riskShare * apy) / jtSize;
  const ltAPY = (liqShare * apy) / ltSize + carry;

  // ---------------------------------------------------------------------------
  // YDM chart data — 101 points sweeping each curve over its OWN utilization
  // axis. The risk YDM (→JT) is keyed on coverage utilization; the liquidity
  // YDM (→LT) is keyed on liquidity utilization. These two utilizations move
  // independently, so each curve gets its own chart and axis.
  // ---------------------------------------------------------------------------
  const riskCurveData = useMemo(() => {
    return Array.from({ length: 101 }, (_, i) => {
      const share =
        ydmShare(riskYDM, riskYDM.yTarget, i / 100, cfg.targetUtilization) *
        100;
      return { x: i, share };
    });
  }, [riskYDM, cfg.targetUtilization]);

  const liqCurveData = useMemo(() => {
    return Array.from({ length: 101 }, (_, i) => {
      const share =
        ydmShare(liqYDM, liqYDM.yTarget, i / 100, cfg.liqTargetUtilization) *
        100;
      return { x: i, share };
    });
  }, [liqYDM, cfg.liqTargetUtilization]);

  // Clamp to the [0,100] axis and guard against non-finite utilizations
  // (e.g. ∞ when a denominator collapses) so Recharts never receives NaN/∞.
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  // "now" dots follow the operating-utilization sliders, not the engine snapshot.
  const riskDotX = covUtil;
  const riskDotY = riskShare * 100;
  const liqDotX = lqUtil;
  const liqDotY = liqShare * 100;
  const showRiskDot = Number.isFinite(riskDotX) && Number.isFinite(riskDotY);
  const showLiqDot = Number.isFinite(liqDotX) && Number.isFinite(liqDotY);

  // ---------------------------------------------------------------------------
  // Yield-split bar — how the senior yield divides between the three tranches,
  // driven by the operating-utilization sliders (riskShare / liqShare above).
  // ---------------------------------------------------------------------------
  const riskShareFrac = riskShare;
  const liqShareFrac = liqShare;
  const seniorKeepFrac = safeFrac(1 - riskShareFrac - liqShareFrac);
  const seniorKeepPct = Math.round(seniorKeepFrac * 100);
  const riskSharePct = Math.round(riskShareFrac * 100);
  const liqSharePct = Math.round(liqShareFrac * 100);

  // ---------------------------------------------------------------------------
  // Premium-budget meter — the anchor sum the combined-≤100% clamp caps at 1.
  // ---------------------------------------------------------------------------
  const budgetFrac = safeFrac(riskYDM.yTarget + liqYDM.yTarget);
  const budgetPct = Math.round(budgetFrac * 100);
  const budgetKeptPct = Math.max(0, 100 - budgetPct);
  const budgetCaution = budgetFrac >= 0.9;

  return (
    <div className="w-full">
      {/* ================================================================== */}
      {/* A) EXPLAINER — top of page                                          */}
      {/* ================================================================== */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-[11px] tracking-wide uppercase text-[#0a0a0a] bg-[#eef0f4] border border-[#e5e5e0] rounded-full px-3 py-1">
          Explainer
        </span>
        <span className="flex-1 h-px bg-gradient-to-r from-[#d6d6d0] via-[#e5e5e0] to-transparent" />
      </div>

      <div className="bg-white rounded-lg border border-[#e5e5e0] p-6 mb-8 shadow-sm">
        <button
          onClick={() => setShowExplainer(!showExplainer)}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-3">
            <div className="bg-[#0a0a0a] rounded-full p-2">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[#0a0a0a]">
                How V2 - Day works
              </h3>
              <p className="text-sm text-[#666666]">
                Click to learn about the three-tranche structure
              </p>
            </div>
          </div>
          <svg
            className={`w-6 h-6 text-[#666666] transition-transform ${showExplainer ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        {showExplainer && (
          <div className="mt-6 text-[#0a0a0a] border-t border-[#e5e5e0] pt-6">
            <div className="bg-gradient-to-br from-[#fff7e8] via-[#f6fbff] to-[#eef4ff] border border-[#e7e2d8] rounded-xl p-6 md:p-8 shadow-sm space-y-6">

              {/* Key takeaway */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="bg-[#0a0a0a] text-white text-xs font-semibold rounded-full px-3 py-1 tracking-wide">
                    Key Takeaway
                  </div>
                  <p className="text-sm text-[#444444]">
                    Day adds a Liquidity Tranche (LT) that backs senior redemptions via an E-CLP BPT pool, earning swap fees and a liquidity premium from the YDM.
                  </p>
                </div>
              </div>

              {/* Concept grid — 4 cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg border border-[#e5e5e0] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-bold tracking-wide text-[#0a0a0a] bg-[#f1f3f5] px-2 py-1 rounded">
                      1
                    </span>
                    <p className="text-sm font-semibold text-[#0a0a0a]">
                      One pool, three slices
                    </p>
                  </div>
                  <p className="text-sm text-[#555555] leading-relaxed">
                    Senior (ST) = paid first, protected. Junior (JT) = first-loss buffer. Liquidity (LT) = pool-backed redemption layer.
                  </p>
                </div>

                <div className="bg-white rounded-lg border border-[#e5e5e0] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-bold tracking-wide text-[#0a0a0a] bg-[#f1f3f5] px-2 py-1 rounded">
                      2
                    </span>
                    <p className="text-sm font-semibold text-[#0a0a0a]">
                      Two YDMs, dual premiums
                    </p>
                  </div>
                  <p className="text-sm text-[#555555] leading-relaxed">
                    Utilization drives a <span className="font-semibold text-[#3F6B4E]">risk premium to JT</span> and a separate <span className="font-semibold text-[#3C5A82]">liquidity premium to LT</span>. Senior keeps what remains. Combined, the two premiums are capped at 100% of senior yield — raising one reduces the other, so senior yield never goes negative.
                  </p>
                </div>

                <div className="bg-white rounded-lg border border-[#e5e5e0] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-bold tracking-wide text-[#0a0a0a] bg-[#f1f3f5] px-2 py-1 rounded">
                      3
                    </span>
                    <p className="text-sm font-semibold text-[#0a0a0a]">
                      E-CLP BPT pool
                    </p>
                  </div>
                  <p className="text-sm text-[#555555] leading-relaxed">
                    The pool targets a concentrated mix — roughly <strong>10% senior shares to 90% tokenized T-bills</strong> by default — but the actual split shifts with market conditions and the E-CLP concentration band (advanced). Min liquidity = the % of senior assets that must stay pool-backed.
                  </p>
                </div>

                <div className="bg-white rounded-lg border border-[#e5e5e0] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-bold tracking-wide text-[#0a0a0a] bg-[#f1f3f5] px-2 py-1 rounded">
                      4
                    </span>
                    <p className="text-sm font-semibold text-[#0a0a0a]">
                      Liquidity slice (LT)
                    </p>
                  </div>
                  <p className="text-sm text-[#555555] leading-relaxed">
                    LT earns swap fees + T-bill yield + net senior yield on its ST leg + a liquidity premium routed by the liquidity YDM.
                  </p>
                </div>
              </div>

              {/* Slice strip — 3 cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-[#8A6A41] text-white rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-white/70">
                      Senior slice (ST)
                    </p>
                    <p className="text-base font-semibold">Gets paid first</p>
                  </div>
                  <span className="text-sm bg-white text-[#8A6A41] px-3 py-1 rounded-full font-medium">
                    Lower risk
                  </span>
                </div>
                <div className="bg-white rounded-lg border border-[#e5e5e0] p-4 flex items-center justify-between shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[#3F6B4E]">
                      Junior slice (JT)
                    </p>
                    <p className="text-base font-semibold text-[#0a0a0a]">
                      Takes first losses
                    </p>
                  </div>
                  <span className="text-sm bg-[#3F6B4E] text-white px-3 py-1 rounded-full font-medium">
                    Higher upside
                  </span>
                </div>
                <div className="bg-white rounded-lg border border-[#3C5A82] p-4 flex items-center justify-between shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[#3C5A82]">
                      Liquidity slice (LT)
                    </p>
                    <p className="text-base font-semibold text-[#0a0a0a]">
                      Backs redemptions
                    </p>
                  </div>
                  <span className="text-sm bg-[#3C5A82] text-white px-3 py-1 rounded-full font-medium">
                    Pool provider
                  </span>
                </div>
              </div>

              {/* TBD placeholders */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#666666]">
                  Open specification questions
                </p>
                <div className="space-y-2">
                  <div className="rounded-lg border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-xs text-[#854d0e]">
                    <span className="font-semibold">TBD — needs input:</span> Exact utilization threshold / governance rule at which LT redemptions are blocked versus allowed (the simulation blocks when liquidityUtilization exceeds 1 but the on-chain threshold and any override path are not yet specified).
                  </div>
                  <div className="rounded-lg border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-xs text-[#854d0e]">
                    <span className="font-semibold">TBD — needs input:</span> LP-facing fee-split framing and headline-APY presentation beyond the formula above (swap fee + T-bill yield + net senior yield on the ST leg + liquidity premium).
                  </div>
                  <div className="rounded-lg border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-xs text-[#854d0e]">
                    <span className="font-semibold">TBD — needs input:</span> Lock-up period, secondary-market access, and &apos;run&apos; mitigation narrative for LT holders beyond what the scenario engine models.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================== */}
      {/* B) CONTROLS CARD                                                    */}
      {/* ================================================================== */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-[11px] tracking-wide uppercase text-[#0a0a0a] bg-[#eef0f4] border border-[#e5e5e0] rounded-full px-3 py-1">
          Simulator Inputs
        </span>
        <span className="flex-1 h-px bg-gradient-to-r from-[#d6d6d0] via-[#e5e5e0] to-transparent" />
      </div>

      <div className="bg-white rounded-lg border border-[#e5e5e0] p-6 md:p-8 mb-8 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <h2 className="text-2xl font-semibold text-[#0a0a0a]">
            Input Parameters
          </h2>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-sm font-medium text-[#0a0a0a] bg-[#f4f4f0] border border-[#e5e5e0] rounded-md px-3 py-1.5 hover:bg-[#eaeae4] transition-colors"
          >
            {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
          </button>
        </div>

        {/* Core inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <Card title="Coverage (Dawn)">
            <Field label="Source APY" hint="underlying yield">
              <NumIn value={apy} scale={100} step={0.5} suffix="%" onChange={setApy} />
            </Field>
            <Field label="Coverage" hint="min senior protection">
              <NumIn value={coverage} scale={100} step={1} suffix="%" onChange={setCoverage} />
            </Field>
            <Field label="Min liquidity" hint="% of senior that must be pool-backed">
              <NumIn value={minLiq} scale={100} step={1} suffix="%" onChange={setMinLiq} />
            </Field>
          </Card>

          <Card title="Initial Deposits">
            <Field label="Senior (ST)">
              <NumIn value={initST} step={1_000_000} w={96} onChange={setInitST} />
            </Field>
            <Field label="Junior (JT)">
              <NumIn value={initJT} step={1_000_000} w={96} onChange={setInitJT} />
            </Field>
            <Field label="Liquidity (LT)">
              <NumIn value={initLT} step={500_000} w={96} onChange={setInitLT} />
            </Field>
          </Card>
        </div>

        {/* Operating utilization — drives the premium shares (and so the APYs,
            the split bar, and the chart "now" dots) via the same ydmShare the
            curves use. At 90% these reproduce the @90 target anchors. */}
        <div className="mb-6">
          <Card title="Operating utilization">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10.5px] uppercase tracking-wider text-[#666666]">
                    Coverage utilization
                  </span>
                  <span
                    className="text-[11px] font-mono tabular-nums font-semibold"
                    style={{ color: '#3F6B4E' }}
                  >
                    {Math.round(covUtil)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(covUtil)}
                  onChange={(e) => setCovUtil(parseFloat(e.target.value) || 0)}
                  className="utilization-slider w-full"
                  style={{ accentColor: '#3F6B4E', background: '#3F6B4E' }}
                />
                <p className="mt-0.5 text-[9px] text-[#999999]">
                  &#x2192; risk premium {Math.round(riskShare * 100)}% of senior yield
                </p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10.5px] uppercase tracking-wider text-[#666666]">
                    Liquidity utilization
                  </span>
                  <span
                    className="text-[11px] font-mono tabular-nums font-semibold"
                    style={{ color: '#3C5A82' }}
                  >
                    {Math.round(lqUtil)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(lqUtil)}
                  onChange={(e) => setLqUtil(parseFloat(e.target.value) || 0)}
                  className="utilization-slider w-full"
                  style={{ accentColor: '#3C5A82', background: '#3C5A82' }}
                />
                <p className="mt-0.5 text-[9px] text-[#999999]">
                  &#x2192; liquidity premium {Math.round(liqShare * 100)}% of senior yield
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Premium YDMs — the two @90% target sliders + budget meter */}
        <Card title="Premium YDMs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <AnchorSlider
                label="Risk premium → JT"
                value={riskYDM.yTarget}
                accent="#3F6B4E"
                onChange={(v) => setRiskAnchor('yTarget', v)}
              />
              <p className="mt-0.5 text-[9px] text-[#999999]">at 90% utilization (target)</p>
            </div>
            <div>
              <AnchorSlider
                label="Liquidity premium → LT"
                value={liqYDM.yTarget}
                accent="#3C5A82"
                onChange={(v) => setLiqAnchor('yTarget', v)}
              />
              <p className="mt-0.5 text-[9px] text-[#999999]">at 90% utilization (target)</p>
            </div>
          </div>

          {/* Premium-budget meter */}
          <div className="mt-4 pt-3 border-t border-[#e5e5e0]">
            <div
              className="w-full rounded-full overflow-hidden"
              style={{ height: 6, background: '#E5E5E0' }}
            >
              <div
                style={{
                  width: `${budgetFrac * 100}%`,
                  height: '100%',
                  background: budgetCaution ? '#F59E0B' : '#888780',
                  transition: 'width .25s ease',
                }}
              />
            </div>
            <p className="mt-1.5 text-[12px] text-[#999999]">
              Premium budget &#8212; <span className="font-mono tabular-nums">{budgetPct}%</span> of senior yield allocated at target, <span className="font-mono tabular-nums">{budgetKeptPct}%</span> kept by senior. Risk + liquidity premiums can never exceed 100% combined &#8212; at any utilization.
            </p>
          </div>
        </Card>

        {/* Advanced drawer */}
        {showAdvanced && (
          <div className="border-t border-[#e5e5e0] pt-6 mt-6">
            <p className="text-xs uppercase tracking-wide text-[#666666] mb-4">
              Advanced Parameters
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Pool / LT */}
              <Card title="Liquidity Tranche (E-CLP BPT)">
                <Field label="T-bill stable yield" hint="yield on the tokenized-treasury leg (≈90% of the pool at the default peg)">
                  <NumIn value={stableYield} scale={100} step={0.5} suffix="%" onChange={setStableYield} />
                </Field>
                <Field label="Swap fee">
                  <NumIn value={swapBps} scale={1} step={1} suffix="bps" onChange={setSwapBps} />
                </Field>
                <Field label="Turnover /yr">
                  <NumIn value={turnover} scale={1} step={1} suffix="×" onChange={setTurnover} />
                </Field>
                <Field label="E-CLP band" hint="concentration band — price drop to stable exhaustion; governs how far the pool split moves off the default ~10/90 peg">
                  <NumIn value={bandWidth} scale={100} step={1} suffix="%" onChange={setBandWidth} />
                </Field>
              </Card>

              {/* YDM curve tails */}
              <Card title="YDM curve shape">
                <div className="flex flex-col gap-2.5">
                  <p className="text-[9px] uppercase tracking-wider text-[#3F6B4E] mb-0.5">Risk premium → JT</p>
                  <AnchorSlider
                    label="@0% util"
                    value={riskYDM.y0}
                    accent="#3F6B4E"
                    onChange={(v) => setRiskAnchor('y0', v)}
                  />
                  <AnchorSlider
                    label="@100% util"
                    value={riskYDM.y100}
                    accent="#3F6B4E"
                    onChange={(v) => setRiskAnchor('y100', v)}
                  />
                  <div className="border-t border-[#e5e5e0] my-1" />
                  <p className="text-[9px] uppercase tracking-wider text-[#3C5A82] mb-0.5">Liquidity premium → LT</p>
                  <AnchorSlider
                    label="@0% util"
                    value={liqYDM.y0}
                    accent="#3C5A82"
                    onChange={(v) => setLiqAnchor('y0', v)}
                  />
                  <AnchorSlider
                    label="@100% util"
                    value={liqYDM.y100}
                    accent="#3C5A82"
                    onChange={(v) => setLiqAnchor('y100', v)}
                  />
                </div>
                <p className="mt-3 pt-2 border-t border-[#e5e5e0] text-[10px] leading-snug text-[#999999]">
                  Tail anchors shape the curve outside the 90% target point. Combined ≤100% clamp applies per anchor.
                </p>
              </Card>

              {/* Other advanced */}
              <Card title="Liquidation &amp; Term">
                <Field label="Liq. utilization" hint="self-liquidation threshold (>1)">
                  <NumIn value={liqUtil} scale={1} step={0.05} suffix="×" onChange={setLiqUtil} />
                </Field>
                <Field label="Fixed term" hint="recovery window">
                  <NumIn value={termDays} scale={1} step={5} suffix="d" onChange={setTermDays} />
                </Field>
                <Field label="Self-liq bonus">
                  <NumIn value={selfLiq} scale={100} step={0.5} suffix="%" onChange={setSelfLiq} />
                </Field>
              </Card>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================== */}
      {/* C) HERO BAND — results, now in-flow (not sticky)                   */}
      {/* ================================================================== */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-[11px] tracking-wide uppercase text-[#0a0a0a] bg-[#eef0f4] border border-[#e5e5e0] rounded-full px-3 py-1">
          Results
        </span>
        <span className="flex-1 h-px bg-gradient-to-r from-[#d6d6d0] via-[#e5e5e0] to-transparent" />
      </div>

      <div className="py-4 mb-8">
        {/* Three big APY cards */}
        <div
          key={`${stAPY.toFixed(4)}-${jtAPY.toFixed(4)}-${ltAPY.toFixed(4)}`}
          className="grid grid-cols-1 sm:grid-cols-3 gap-3"
        >
          <div className="group relative kpi-flash bg-white rounded-lg border border-[#E5E5E0] p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full" style={{ background: '#8A6A41' }} />
              <span className="text-[13px] text-[#666666]">Senior · ST</span>
            </div>
            <p className="font-mono tabular-nums text-4xl sm:text-5xl leading-none text-[#0A0A0A]" style={{ fontWeight: 600 }}>
              {(stAPY * 100).toFixed(1)}
              <span className="text-2xl sm:text-3xl">%</span>
            </p>
            <p className="text-[12px] text-[#999999] mt-1.5">paid first · lower risk</p>
            {/* Hover breakdown */}
            <div className="hidden group-hover:block absolute left-0 top-full mt-2 z-20 w-72 text-left bg-white border border-[#E5E5E0] rounded-lg shadow-lg p-3">
              <p className="text-[12px] font-medium text-[#0a0a0a]">
                ST Net &#183; <span className="font-mono" style={{ color: '#8A6A41' }}>{Math.round(stAPY * 100)}%</span>
              </p>
              <p className="text-[11px] text-[#666666] mt-0.5">APY &#215; (1 &#8722; risk &#8722; liq)</p>
              <div className="mt-2 space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] text-[#666666]">Base APY</span>
                  <span className="text-[11px] font-mono" style={{ color: '#8A6A41' }}>{Math.round(apy * 100)}%</span>
                </div>
                <p className="text-[10px] text-[#999999] -mt-1">the source yield</p>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] text-[#666666]">&#8722; Risk premium</span>
                  <span className="text-[11px] font-mono" style={{ color: '#8A6A41' }}>{Math.round(riskShare * 100)}% &#215; APY</span>
                </div>
                <p className="text-[10px] text-[#999999] -mt-1">paid to JT</p>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] text-[#666666]">&#8722; Liquidity premium</span>
                  <span className="text-[11px] font-mono" style={{ color: '#8A6A41' }}>{Math.round(liqShare * 100)}% &#215; APY</span>
                </div>
                <p className="text-[10px] text-[#999999] -mt-1">paid to LT</p>
              </div>
            </div>
          </div>

          <div className="group relative kpi-flash bg-white rounded-lg border border-[#E5E5E0] p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full" style={{ background: '#3F6B4E' }} />
              <span className="text-[13px] text-[#666666]">Junior · JT</span>
            </div>
            <p className="font-mono tabular-nums text-4xl sm:text-5xl leading-none text-[#0A0A0A]" style={{ fontWeight: 600 }}>
              {(jtAPY * 100).toFixed(1)}
              <span className="text-2xl sm:text-3xl">%</span>
            </p>
            <p className="text-[12px] text-[#999999] mt-1.5">first-loss · earns risk premium</p>
            {/* Hover breakdown */}
            <div className="hidden group-hover:block absolute left-0 top-full mt-2 z-20 w-72 text-left bg-white border border-[#E5E5E0] rounded-lg shadow-lg p-3">
              <p className="text-[12px] font-medium text-[#0a0a0a]">
                Day JT &#183; <span className="font-mono" style={{ color: '#3F6B4E' }}>{Math.round(jtAPY * 100)}%</span>
              </p>
              <p className="text-[11px] text-[#666666] mt-0.5">APY + (risk &#215; APY) &#247; JT size</p>
              <div className="mt-2 space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] text-[#666666]">Co-invested (&#946;=1)</span>
                  <span className="text-[11px] font-mono" style={{ color: '#3F6B4E' }}>{Math.round(apy * 100)}%</span>
                </div>
                <p className="text-[10px] text-[#999999] -mt-1">JT sits in the same asset as ST &#8594; earns the source APY</p>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] text-[#666666]">Risk premium</span>
                  <span className="text-[11px] font-mono" style={{ color: '#3F6B4E' }}>{Math.round(riskShare * 100)}% &#215; APY &#247; JT size {Math.round(jtSize * 100)}%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="group relative kpi-flash bg-white rounded-lg border border-[#E5E5E0] p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full" style={{ background: '#3C5A82' }} />
              <span className="text-[13px] text-[#666666]">Liquidity · LT</span>
            </div>
            <p className="font-mono tabular-nums text-4xl sm:text-5xl leading-none text-[#0A0A0A]" style={{ fontWeight: 600 }}>
              {(ltAPY * 100).toFixed(1)}
              <span className="text-2xl sm:text-3xl">%</span>
            </p>
            <p className="text-[12px] text-[#999999] mt-1.5">backs redemptions · earns liquidity premium</p>
            {/* Hover breakdown */}
            <div className="hidden group-hover:block absolute left-0 top-full mt-2 z-20 w-72 text-left bg-white border border-[#E5E5E0] rounded-lg shadow-lg p-3">
              <p className="text-[12px] font-medium text-[#0a0a0a]">
                Day LT &#183; <span className="font-mono" style={{ color: '#3C5A82' }}>{Math.round(ltAPY * 100)}%</span>
              </p>
              <p className="text-[11px] text-[#666666] mt-0.5">(liq &#215; APY) &#247; LT size + swap + BPT carry</p>
              <div className="mt-2 space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] text-[#666666]">Liquidity premium</span>
                  <span className="text-[11px] font-mono" style={{ color: '#3C5A82' }}>{Math.round(liqShare * 100)}% &#215; APY &#247; LT size {Math.round(ltSize * 100)}%</span>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] text-[#666666]">Swap fees</span>
                  <span className="text-[11px] font-mono" style={{ color: '#3C5A82' }}>{turnover}&#215;/yr &#215; {swapBps}bps</span>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] text-[#666666]">BPT carry</span>
                  <span className="text-[11px] font-mono" style={{ color: '#3C5A82' }}>{Math.round(wST * 100)}% &#215; ST-yield + {Math.round((1 - wST) * 100)}% &#215; {Math.round(stableYield * 100)}% stable</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Yield-split bar */}
        <div className="mt-4">
          <p className="text-[12px] text-[#666666] mb-1.5">Where each $1 of senior yield goes</p>
          <div
            ref={barRef}
            className="w-full flex overflow-hidden rounded-md border border-[#E5E5E0]"
            style={{ height: 54, gap: '2px' }}
          >
            {/* Segment: Senior keeps — hidden when 0% */}
            {seniorKeepFrac > 0.005 && (() => {
              const w = segWidths[0];
              return (
                <div
                  ref={(el) => {
                    segRefs.current[0] = el;
                  }}
                  style={{
                    width: `${seniorKeepFrac * 100}%`,
                    background: '#8A6A41',
                    transition: 'width .25s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    padding: '0 8px',
                  }}
                >
                  {w >= 96 ? (
                    <>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', lineHeight: 1.2 }}>Senior keeps</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>{seniorKeepPct}%</span>
                    </>
                  ) : w >= 36 ? (
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{seniorKeepPct}%</span>
                  ) : null}
                </div>
              );
            })()}
            {/* Segment: Risk → JT — hidden when 0% */}
            {riskShareFrac > 0.005 && (() => {
              const w = segWidths[1];
              return (
                <div
                  ref={(el) => {
                    segRefs.current[1] = el;
                  }}
                  style={{
                    width: `${riskShareFrac * 100}%`,
                    background: '#3F6B4E',
                    transition: 'width .25s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    padding: '0 8px',
                  }}
                >
                  {w >= 96 ? (
                    <>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', lineHeight: 1.2 }}>Risk &#x2192; JT</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>{riskSharePct}%</span>
                    </>
                  ) : w >= 36 ? (
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{riskSharePct}%</span>
                  ) : null}
                </div>
              );
            })()}
            {/* Segment: Liquidity → LT — hidden when 0% */}
            {liqShareFrac > 0.005 && (() => {
              const w = segWidths[2];
              return (
                <div
                  ref={(el) => {
                    segRefs.current[2] = el;
                  }}
                  style={{
                    width: `${liqShareFrac * 100}%`,
                    background: '#3C5A82',
                    transition: 'width .25s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    padding: '0 8px',
                  }}
                >
                  {w >= 96 ? (
                    <>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', lineHeight: 1.2 }}>Liquidity &#x2192; LT</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>{liqSharePct}%</span>
                    </>
                  ) : w >= 36 ? (
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{liqSharePct}%</span>
                  ) : null}
                </div>
              );
            })()}
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mt-2">
            <span className="flex items-center gap-1.5 text-[12px] text-[#666666]">
              <span className="w-2 h-2 rounded-full" style={{ background: '#8A6A41' }} />
              Senior keeps <span className="font-mono tabular-nums font-semibold text-[#0a0a0a]">{seniorKeepPct}%</span>
            </span>
            <span className="flex items-center gap-1.5 text-[12px] text-[#666666]">
              <span className="w-2 h-2 rounded-full" style={{ background: '#3F6B4E' }} />
              Risk &#x2192; JT <span className="font-mono tabular-nums font-semibold text-[#0a0a0a]">{riskSharePct}%</span>
            </span>
            <span className="flex items-center gap-1.5 text-[12px] text-[#666666]">
              <span className="w-2 h-2 rounded-full" style={{ background: '#3C5A82' }} />
              Liquidity &#x2192; LT <span className="font-mono tabular-nums font-semibold text-[#0a0a0a]">{liqSharePct}%</span>
            </span>
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* D) PREMIUM CURVES — unchanged charts                                */}
      {/* ================================================================== */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-[11px] tracking-wide uppercase text-[#0a0a0a] bg-[#eef0f4] border border-[#e5e5e0] rounded-full px-3 py-1">
          YDM Curves
        </span>
        <span className="flex-1 h-px bg-gradient-to-r from-[#d6d6d0] via-[#e5e5e0] to-transparent" />
      </div>

      <div className="bg-white rounded-lg border border-[#e5e5e0] p-6 shadow-sm mb-8">
        <p className="text-sm font-semibold text-[#0a0a0a] mb-1">
          Premium share of senior yield vs. Utilization
        </p>
        <p className="text-xs text-[#666666] mb-4">
          JT&apos;s risk premium tracks coverage utilization; LT&apos;s liquidity premium tracks liquidity utilization. These two utilizations move independently — each premium responds only to its own.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 1 — Risk premium → JT (vs coverage utilization) */}
          <div>
            <p className="text-sm font-semibold text-[#3F6B4E] mb-0.5">
              Risk premium → JT
            </p>
            <p className="text-xs text-[#666666] mb-2">vs coverage utilization</p>
            <div className="h-64">
              <ResponsiveContainerNoSSR width="100%" height="100%" minWidth={0} minHeight={256}>
                <LineChart
                  data={riskCurveData}
                  margin={{ top: 10, right: 20, left: 50, bottom: 30 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e0" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    domain={[0, 100]}
                    ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}
                    label={{
                      value: 'Coverage utilization (%)',
                      position: 'insideBottom',
                      offset: -10,
                      fill: '#0a0a0a',
                      fontSize: 12,
                    }}
                    stroke="#666666"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                  />
                  <YAxis
                    label={{
                      value: 'Premium share of senior yield (%)',
                      angle: -90,
                      position: 'insideLeft',
                      style: { textAnchor: 'middle' },
                      fill: '#0a0a0a',
                      fontSize: 11,
                    }}
                    domain={[0, 100]}
                    stroke="#666666"
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload as {
                          x: number;
                          share: number;
                        };
                        return (
                          <div className="bg-white p-3 rounded-lg border-2 border-[#0a0a0a] shadow-lg">
                            <p className="text-xs font-semibold text-[#0a0a0a] mb-1">
                              At {d.x.toFixed(0)}% coverage utilization
                            </p>
                            <div className="flex justify-between gap-4 text-sm">
                              <span className="text-[#3F6B4E]">Risk share (JT):</span>
                              <span className="font-semibold text-[#3F6B4E]">
                                {d.share.toFixed(2)}%
                              </span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <ReferenceLine
                    x={90}
                    stroke="#999999"
                    strokeDasharray="4 4"
                    label={{
                      value: 'target 90%',
                      position: 'top',
                      fill: '#999999',
                      fontSize: 10,
                    }}
                  />
                  {showRiskDot && (
                    <ReferenceDot
                      x={clamp(riskDotX)}
                      y={riskDotY}
                      r={6}
                      fill="#3F6B4E"
                      stroke="#fff"
                      strokeWidth={2}
                      label={{ value: 'now', position: 'top', fill: '#3F6B4E', fontSize: 10 }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="share"
                    name="Risk share → JT"
                    stroke="#3F6B4E"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 5, fill: '#3F6B4E' }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainerNoSSR>
            </div>
          </div>
          {/* Chart 2 — Liquidity premium → LT (vs liquidity utilization) */}
          <div>
            <p className="text-sm font-semibold text-[#3C5A82] mb-0.5">
              Liquidity premium → LT
            </p>
            <p className="text-xs text-[#666666] mb-2">vs liquidity utilization</p>
            <div className="h-64">
              <ResponsiveContainerNoSSR width="100%" height="100%" minWidth={0} minHeight={256}>
                <LineChart
                  data={liqCurveData}
                  margin={{ top: 10, right: 20, left: 50, bottom: 30 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e0" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    domain={[0, 100]}
                    ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}
                    label={{
                      value: 'Liquidity utilization (%)',
                      position: 'insideBottom',
                      offset: -10,
                      fill: '#0a0a0a',
                      fontSize: 12,
                    }}
                    stroke="#666666"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                  />
                  <YAxis
                    label={{
                      value: 'Premium share of senior yield (%)',
                      angle: -90,
                      position: 'insideLeft',
                      style: { textAnchor: 'middle' },
                      fill: '#0a0a0a',
                      fontSize: 11,
                    }}
                    domain={[0, 100]}
                    stroke="#666666"
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload as {
                          x: number;
                          share: number;
                        };
                        return (
                          <div className="bg-white p-3 rounded-lg border-2 border-[#0a0a0a] shadow-lg">
                            <p className="text-xs font-semibold text-[#0a0a0a] mb-1">
                              At {d.x.toFixed(0)}% liquidity utilization
                            </p>
                            <div className="flex justify-between gap-4 text-sm">
                              <span className="text-[#3C5A82]">Liq share (LT):</span>
                              <span className="font-semibold text-[#3C5A82]">
                                {d.share.toFixed(2)}%
                              </span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <ReferenceLine
                    x={90}
                    stroke="#999999"
                    strokeDasharray="4 4"
                    label={{
                      value: 'target 90%',
                      position: 'top',
                      fill: '#999999',
                      fontSize: 10,
                    }}
                  />
                  {showLiqDot && (
                    <ReferenceDot
                      x={clamp(liqDotX)}
                      y={liqDotY}
                      r={6}
                      fill="#3C5A82"
                      stroke="#fff"
                      strokeWidth={2}
                      label={{ value: 'now', position: 'top', fill: '#3C5A82', fontSize: 10 }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="share"
                    name="Liq share → LT"
                    stroke="#3C5A82"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 5, fill: '#3C5A82' }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainerNoSSR>
            </div>
          </div>
        </div>
      </div>

      {/* Snapshot metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        {/* ST effective NAV */}
        <div className="bg-white rounded-lg border border-[#e5e5e0] p-4 shadow-sm">
          <p className="text-[9px] uppercase tracking-wider text-[#666666] mb-1">
            ST effective NAV
          </p>
          <p className="font-mono text-[14px] tabular-nums text-[#8A6A41]">
            {usd(cur.stEffectiveNAV)}
          </p>
          <p className="text-[9px] font-mono text-[#999999]">
            price {cur.stPrice.toFixed(4)}
          </p>
        </div>
        {/* JT effective NAV */}
        <div className="bg-white rounded-lg border border-[#e5e5e0] p-4 shadow-sm">
          <p className="text-[9px] uppercase tracking-wider text-[#666666] mb-1">
            JT effective NAV
          </p>
          <p className="font-mono text-[14px] tabular-nums text-[#3F6B4E]">
            {usd(cur.jtEffectiveNAV)}
          </p>
          <p className="text-[9px] font-mono text-[#999999]">
            price {cur.jtPrice.toFixed(4)}
          </p>
        </div>
        {/* LT value */}
        <div className="bg-white rounded-lg border border-[#e5e5e0] p-4 shadow-sm">
          <p className="text-[9px] uppercase tracking-wider text-[#666666] mb-1">
            LT value
          </p>
          <p className="font-mono text-[14px] tabular-nums text-[#3C5A82]">
            {usd(cur.ltNAV)}
          </p>
          <p className="text-[9px] font-mono text-[#999999]">
            pool {pct(cur.poolPctST)} ST
          </p>
        </div>
      </div>

    </div>
  );
}
