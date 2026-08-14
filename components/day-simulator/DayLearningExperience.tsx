"use client";

import { useState } from "react";

import type { DayExplainerMetrics } from "@/lib/day-simulator-template/explainer";

const C = {
  page: "#F4F3EF",
  card: "#FFFFFF",
  border: "#DEDDD7",
  text: "#1D1C19",
  muted: "#68665F",
  faint: "#969188",
  rust: "#A65B20",
  rustSoft: "#F4E9DF",
  green: "#3F7D5A",
  greenSoft: "#E7F0E9",
  danger: "#A24737",
  dangerSoft: "#F4E8E5",
  ink: "#25231F",
  tan: "#A48667",
} as const;

const MONO = '"SFMono-Regular", Consolas, monospace';
const SANS = "var(--font-inter), Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export type LearningPosition = {
  symbol: "Sr" | "Jr" | "SLP";
  name: string;
  job: string;
  paidFor: string;
  endValue: string;
  apy: number;
  maxDrawdown: number;
  color: string;
};

type LearningDefaults = {
  sourceApyPct: number;
  coveragePct: number;
  minLiquidityPct: number;
  eclpBandWidthPct: number;
  riskSharePct: number;
  liqSharePct: number;
  observationDays: number;
  maintainCoverage: boolean;
};

type LearningModelAssumptions = {
  stableYieldPct: number;
  swapFeeBps: number;
  poolTurnoverPerYear: number;
  reinvestLiquidityPremium: boolean;
};

export type DayLearningExperienceProps = {
  marketId: string;
  assetName: string;
  dataSummary: string;
  sourceEndValue: string;
  sourceApy: number;
  sourceMaxDrawdown: number;
  positions: LearningPosition[];
  liquidity: DayExplainerMetrics["liquidity"];
  coverage: DayExplainerMetrics["coverage"];
  defaults: LearningDefaults;
  modelAssumptions: LearningModelAssumptions;
  sourceApyPct: number;
  coveragePct: number;
  minLiquidityPct: number;
  eclpBandWidthPct: number;
  riskSharePct: number;
  liqSharePct: number;
  observationDays: number;
  maintainCoverage: boolean;
  onSourceApyChange: (value: number) => void;
  onCoverageChange: (value: number) => void;
  onMinLiquidityChange: (value: number) => void;
  onEclpBandWidthChange: (value: number) => void;
  onRiskShareChange: (value: number) => void;
  onLiquidityShareChange: (value: number) => void;
  onObservationDaysChange: (value: number) => void;
  onMaintainCoverageChange: (value: boolean) => void;
};

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ color: C.faint, fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" }}>
      {children}
    </p>
  );
}

function Badge({ children, tone = "input" }: { children: React.ReactNode; tone?: "input" | "output" | "context" }) {
  const colors = tone === "output"
    ? { background: C.greenSoft, color: C.green }
    : tone === "context"
      ? { background: C.page, color: C.muted }
      : { background: C.rustSoft, color: C.rust };
  return (
    <span style={{ ...colors, borderRadius: 999, display: "inline-flex", fontFamily: MONO, fontSize: 9, fontWeight: 800, letterSpacing: "0.08em", padding: "5px 8px", textTransform: "uppercase" }}>
      {children}
    </span>
  );
}

function RangeControl({
  label,
  value,
  min,
  max,
  step,
  display,
  description,
  tone = C.rust,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  description: string;
  tone?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label style={{ display: "block" }}>
      <span className="flex items-baseline justify-between gap-4">
        <span style={{ color: C.text, fontSize: 13.5, fontWeight: 650 }}>{label}</span>
        <span style={{ color: tone, fontFamily: MONO, fontSize: 13, fontWeight: 750 }}>{display}</span>
      </span>
      <input aria-label={label} className="mt-2.5 w-full" max={max} min={min} onChange={(event) => onChange(Number(event.target.value))} step={step} style={{ accentColor: tone }} type="range" value={value} />
      <span className="mt-1.5 block" style={{ color: C.muted, fontSize: 13, lineHeight: 1.45 }}>{description}</span>
    </label>
  );
}

function formatReturn(value: number): string {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function formatDrawdown(value: number): string {
  return value >= 0.0005 ? `−${(value * 100).toFixed(1)}%` : "0.0%";
}

function formatBand(value: number): string {
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function deltaLabel(value: number): string {
  if (Math.abs(value) < 0.05) return "No change";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)} pts`;
}

function drawdownLabel(value: number): string {
  return value >= 0.0005 ? `${formatDrawdown(value)} worst drop` : "No modeled drop";
}

export default function DayLearningExperience(props: DayLearningExperienceProps) {
  const {
    marketId,
    assetName,
    dataSummary,
    sourceEndValue,
    sourceApy,
    sourceMaxDrawdown,
    positions,
    liquidity,
    coverage,
    defaults,
    modelAssumptions,
    sourceApyPct,
    coveragePct,
    minLiquidityPct,
    eclpBandWidthPct,
    riskSharePct,
    liqSharePct,
    observationDays,
    maintainCoverage,
    onSourceApyChange,
    onCoverageChange,
    onMinLiquidityChange,
    onEclpBandWidthChange,
    onRiskShareChange,
    onLiquidityShareChange,
    onObservationDaysChange,
    onMaintainCoverageChange,
  } = props;
  const [baseline] = useState(() => ({
    nearParPct: liquidity.referenceSellShareOfSenior * 100,
    atomicPct: liquidity.boundarySellShareOfSenior * 100,
    slpApyPct: (positions.find((position) => position.symbol === "SLP")?.apy ?? 0) * 100,
  }));
  const slp = positions.find((position) => position.symbol === "SLP");
  const marketPositions = positions.filter((position) => position.symbol !== "SLP");
  const retainedShare = Math.max(0, 100 - riskSharePct - liqSharePct);
  const protectionPct = coverage.coverageLossLimit * 100;
  const nearParPct = liquidity.referenceSellShareOfSenior * 100;
  const atomicPct = liquidity.boundarySellShareOfSenior * 100;
  const nearParShareOfAtomic = atomicPct > 0 ? Math.min(100, (nearParPct / atomicPct) * 100) : 0;
  const lowerBandPct = Math.max(0, 100 - eclpBandWidthPct);
  const stVisualShare = (100 / (100 + minLiquidityPct)) * 100;
  const slpVisualShare = 100 - stVisualShare;
  const changed =
    Math.abs(sourceApyPct - defaults.sourceApyPct) > 1e-9
    || Math.abs(coveragePct - defaults.coveragePct) > 1e-9
    || Math.abs(minLiquidityPct - defaults.minLiquidityPct) > 1e-9
    || Math.abs(eclpBandWidthPct - defaults.eclpBandWidthPct) > 1e-9
    || Math.abs(riskSharePct - defaults.riskSharePct) > 1e-9
    || Math.abs(liqSharePct - defaults.liqSharePct) > 1e-9
    || observationDays !== defaults.observationDays
    || maintainCoverage !== defaults.maintainCoverage;

  const reset = () => {
    onSourceApyChange(defaults.sourceApyPct);
    onCoverageChange(defaults.coveragePct);
    onMinLiquidityChange(defaults.minLiquidityPct);
    onEclpBandWidthChange(defaults.eclpBandWidthPct);
    onRiskShareChange(defaults.riskSharePct);
    onLiquidityShareChange(defaults.liqSharePct);
    onObservationDaysChange(defaults.observationDays);
    onMaintainCoverageChange(defaults.maintainCoverage);
  };

  return (
    <div className="flex flex-col" style={{ gap: 14, fontFamily: SANS }}>
      <section style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
        <div className="flex flex-col gap-3 border-b px-4 py-4 sm:px-6 lg:flex-row lg:items-end lg:justify-between" style={{ borderColor: C.border }}>
          <div>
            <div className="flex items-center gap-2"><Badge>Inputs</Badge><Badge tone="output">Live output</Badge></div>
            <h2 className="mt-2" style={{ color: C.text, fontSize: "clamp(24px,2.5vw,34px)", fontWeight: 550, letterSpacing: "-0.04em" }}>LP workbench</h2>
            <p className="mt-1.5" style={{ color: C.muted, fontSize: 13, lineHeight: 1.5 }}>Set the pool terms on the left. See the modeled LP result on the right.</p>
          </div>
          <div className="flex items-center gap-3">
            <p style={{ color: C.muted, fontSize: 13 }}><strong style={{ color: C.text }}>SLP (Senior Liquidity Provider)</strong> = the LP capital that buys Sr from sellers.</p>
            <button disabled={!changed} onClick={reset} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.rust, fontSize: 13, fontWeight: 650, minHeight: 36, opacity: changed ? 1 : 0.45, padding: "7px 11px", whiteSpace: "nowrap" }} type="button">Reset inputs</button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,.92fr)_minmax(390px,1.08fr)]">
          <div className="flex flex-col gap-5 p-4 sm:p-6 lg:border-r" style={{ borderColor: C.border }}>
            <div>
              <div className="flex items-center justify-between gap-3"><Eyebrow>1 · Capital supplied</Eyebrow><Badge>Editable</Badge></div>
              <div className="mt-3">
                <RangeControl description="Market-wide pool setting—not a minimum wallet size." display={`${minLiquidityPct.toFixed(0)} for every 100 Sr`} label="Pool capital" max={50} min={1} onChange={onMinLiquidityChange} step={1} tone={C.green} value={minLiquidityPct} />
              </div>
              <div aria-label={`For every 100 units of Sr, the market requires ${minLiquidityPct.toFixed(0)} units of SLP capital`} className="mt-3" role="img">
                <div className="flex h-10 overflow-hidden rounded-lg" style={{ border: `1px solid ${C.border}` }}>
                  <div className="flex items-center px-3" style={{ background: C.rustSoft, color: C.rust, width: `${stVisualShare}%` }}><span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap" }}>100 Sr</span></div>
                  <div className="flex items-center justify-end px-2" style={{ background: C.green, color: C.card, minWidth: 52, width: `${slpVisualShare}%` }}><span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap" }}>{minLiquidityPct.toFixed(0)} SLP</span></div>
                </div>
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 18 }}>
              <div className="flex items-center justify-between gap-3"><Eyebrow>2 · Price range</Eyebrow><Badge>Editable</Badge></div>
              <p className="mt-2" style={{ color: C.text, fontSize: 13.5, fontWeight: 650 }}>How tightly should liquidity sit below marked value?</p>
              <div className="mt-3 grid grid-cols-4 gap-1.5" role="group" aria-label="Price range presets">
                {[0.5, 1, 3, 10].map((band) => {
                  const active = eclpBandWidthPct === band;
                  return <button aria-pressed={active} key={band} onClick={() => onEclpBandWidthChange(band)} style={{ background: active ? C.green : C.page, border: `1px solid ${active ? C.green : C.border}`, borderRadius: 8, color: active ? C.card : C.text, fontFamily: MONO, fontSize: 11.5, fontWeight: 750, minHeight: 38 }} type="button">{formatBand(band)}%</button>;
                })}
              </div>
              <div aria-label={`The configured price range runs from 100 percent marked value to ${lowerBandPct.toFixed(1)} percent`} className="mt-3 grid grid-cols-[auto_1fr_auto] items-center gap-3" role="img">
                <span style={{ color: C.text, fontFamily: MONO, fontSize: 11.5, fontWeight: 750 }}>100%</span>
                <div style={{ position: "relative" }}>
                  <div style={{ background: C.greenSoft, border: `1px solid #C6DCCB`, borderRadius: 999, height: 12 }} />
                  <span aria-hidden style={{ color: C.green, left: "50%", position: "absolute", top: -8, transform: "translateX(-50%)" }}>↔</span>
                </div>
                <span style={{ color: C.green, fontFamily: MONO, fontSize: 11.5, fontWeight: 750 }}>{lowerBandPct.toFixed(1)}%</span>
              </div>
              <p className="mt-2" style={{ color: C.muted, fontSize: 11.5 }}>Tighter range = more liquidity near 100%. This is a configured band, not a guaranteed trade price.</p>
            </div>

            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 18 }}>
              <div className="flex items-center justify-between gap-3"><Eyebrow>3 · Your compensation</Eyebrow><Badge>Editable</Badge></div>
              <div className="mt-3">
                <RangeControl description="Your share of Sr yield is one input to SLP return—not the return itself." display={`${liqSharePct.toFixed(0)}% of Sr yield`} label="Your share of Sr yield" max={80} min={0} onChange={onLiquidityShareChange} step={1} tone={C.green} value={liqSharePct} />
              </div>
              <div aria-label={`Sr retains ${retainedShare.toFixed(0)} percent of source yield, Jr receives ${riskSharePct.toFixed(0)} percent, and SLP receives ${liqSharePct.toFixed(0)} percent`} className="mt-3" role="img">
                <div className="flex h-3 overflow-hidden rounded-full" style={{ background: C.page }}>
                  <div style={{ background: C.tan, width: `${retainedShare}%` }} />
                  <div style={{ background: C.rust, width: `${riskSharePct}%` }} />
                  <div style={{ background: C.green, width: `${liqSharePct}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1" style={{ color: C.muted, fontSize: 10 }}>
                  <span><i aria-hidden style={{ background: C.tan, borderRadius: 2, display: "inline-block", height: 7, marginRight: 5, width: 7 }} />Sr keeps {retainedShare.toFixed(0)}%</span>
                  <span><i aria-hidden style={{ background: C.rust, borderRadius: 2, display: "inline-block", height: 7, marginRight: 5, width: 7 }} />Jr gets {riskSharePct.toFixed(0)}%</span>
                  <span><i aria-hidden style={{ background: C.green, borderRadius: 2, display: "inline-block", height: 7, marginRight: 5, width: 7 }} />SLP gets {liqSharePct.toFixed(0)}%</span>
                </div>
              </div>
            </div>

            <details style={{ background: C.page, border: `1px solid ${C.border}`, borderRadius: 11, padding: "11px 13px" }}>
              <summary style={{ color: C.text, cursor: "pointer", fontSize: 13, fontWeight: 650 }}>Advanced market inputs</summary>
              <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
                <RangeControl description="First-loss capital protecting Sr; not a guarantee for SLP." display={`${coveragePct.toFixed(0)}%`} label="Jr first-loss capital" max={65} min={3} onChange={onCoverageChange} step={1} value={coveragePct} />
                <RangeControl description="Separate yield share paid to Jr for first-loss risk." display={`${riskSharePct.toFixed(0)}%`} label="Jr share of Sr yield" max={80} min={0} onChange={onRiskShareChange} step={1} tone={C.ink} value={riskSharePct} />
                <RangeControl description="Re-scales the selected source history." display={`${sourceApyPct.toFixed(1)}%`} label="Modeled source APY" max={30} min={0} onChange={onSourceApyChange} step={0.1} tone={C.muted} value={sourceApyPct} />
                <RangeControl description="Time allowed for source recovery before a covered Jr loss is finalized." display={`${observationDays} days`} label="Recovery window" max={194} min={7} onChange={onObservationDaysChange} step={1} value={observationDays} />
                <label className="flex items-start gap-3 sm:col-span-2" style={{ color: C.muted, fontSize: 13, lineHeight: 1.45 }}>
                  <input checked={maintainCoverage} onChange={(event) => onMaintainCoverageChange(event.target.checked)} style={{ accentColor: C.rust, marginTop: 3 }} type="checkbox" />
                  <span><strong style={{ color: C.text, display: "block", fontWeight: 650 }}>Restore Jr after finalized losses</strong>Fresh Jr capital rebuilds the configured first-loss buffer.</span>
                </label>
              </div>
            </details>
          </div>

          <div className="p-4 sm:p-6">
            <div className="lg:sticky lg:top-4">
              <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Badge tone="output">Output</Badge><Eyebrow>Your SLP result</Eyebrow></div>{changed && <span style={{ color: C.green, fontFamily: MONO, fontSize: 10, fontWeight: 750 }}>Updated live</span>}</div>
              <div className="mt-3 rounded-xl" style={{ background: C.ink, color: C.card, padding: 18 }}>
                <p style={{ color: "#B8B2A9", fontFamily: MONO, fontSize: 9, letterSpacing: "0.09em", textTransform: "uppercase" }}>What 100 SLP did in this test</p>
                <p className="mt-2" style={{ color: "#8FD0A5", fontFamily: MONO, fontSize: "clamp(28px,4vw,42px)", fontWeight: 800, letterSpacing: "-0.055em", lineHeight: 1.05 }}>{slp?.endValue ?? "—"}</p>
                <div className="mt-4 grid grid-cols-2 gap-3" style={{ borderTop: "1px solid #4A4640", paddingTop: 13 }}>
                  <div><p style={{ color: "#B8B2A9", fontSize: 10 }}>Annualized result</p><p className="mt-1" style={{ color: C.card, fontFamily: MONO, fontSize: 17, fontWeight: 750 }}>{slp ? formatReturn(slp.apy) : "—"}</p></div>
                  <div><p style={{ color: "#B8B2A9", fontSize: 10 }}>Peak-to-trough</p><p className="mt-1" style={{ color: (slp?.maxDrawdown ?? 0) > 0.0005 ? "#E8A89B" : C.card, fontFamily: MONO, fontSize: 17, fontWeight: 750 }}>{slp ? drawdownLabel(slp.maxDrawdown) : "—"}</p></div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p style={{ color: "#B8B2A9", fontSize: 11.5 }}>Modeled outcome—not a guaranteed or fixed return.</p><p style={{ color: "#D6D2CA", fontSize: 10 }}>{changed ? `${deltaLabel(((slp?.apy ?? 0) * 100) - baseline.slpApyPct)} annualized from start` : "Starting setup"}</p></div>
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between gap-3"><Eyebrow>One Sr sale through your pool</Eyebrow><Badge tone="context">Focused view</Badge></div>
                <div aria-label={`One trade can sell ${nearParPct.toFixed(1)} percent of Sr near marked value before continuing to the ${atomicPct.toFixed(1)} percent pool limit`} className="mt-4" role="img">
                  <div className="mb-2 flex items-center justify-between gap-3" style={{ color: C.muted, fontSize: 10 }}><span>Sr enters the pool</span><span>Stable value leaves → seller</span></div>
                  <div className="flex h-5 overflow-hidden rounded-full" style={{ border: `1px solid ${C.border}` }}>
                    <div style={{ background: C.green, width: `${nearParShareOfAtomic}%` }} />
                    <div style={{ background: C.rustSoft, borderLeft: `2px solid ${C.rust}`, width: `${100 - nearParShareOfAtomic}%` }} />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-4">
                    <div><p style={{ color: C.green, fontFamily: MONO, fontSize: 15, fontWeight: 800 }}>{nearParPct.toFixed(1)}% of Sr</p><p style={{ color: C.muted, fontSize: 10 }}>near marked value · {(liquidity.referenceQuote.slippage * 100).toFixed(1)}% avg slippage</p></div>
                    <div style={{ textAlign: "right" }}><p style={{ color: C.rust, fontFamily: MONO, fontSize: 15, fontWeight: 800 }}>{atomicPct.toFixed(1)}% of Sr</p><p style={{ color: C.muted, fontSize: 10 }}>one-trade pool limit · {(liquidity.boundaryQuote.slippage * 100).toFixed(1)}% avg slippage</p></div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-[auto_1fr_auto] items-center gap-2" style={{ background: C.greenSoft, border: "1px solid #C6DCCB", borderRadius: 10, padding: 11 }}>
                  <span aria-hidden style={{ color: C.green, fontSize: 20 }}>↺</span>
                  <p style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}><strong style={{ color: C.text }}>Then arbitrage may reset the pool.</strong> A later sale can start near marked value again.</p>
                  <span aria-hidden style={{ color: C.green, fontFamily: MONO, fontSize: 10 }}>NEXT TRADE</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "20px clamp(16px,2.5vw,28px)" }}>
        <Eyebrow>How SLP return is formed</Eyebrow>
        <h2 className="mt-2" style={{ color: C.text, fontSize: 23, fontWeight: 550, letterSpacing: "-0.03em" }}>Four return drivers flow into one modeled result.</h2>
        <div aria-label={`The modeled SLP return combines a ${liqSharePct.toFixed(0)} percent share of Sr yield, ${modelAssumptions.stableYieldPct.toFixed(1)} percent stable-side yield, ${modelAssumptions.swapFeeBps.toFixed(0)} basis point swap fees at ${modelAssumptions.poolTurnoverPerYear.toFixed(1)} times annual turnover, and pool trading outcomes`} className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_auto_.7fr_auto_.85fr] lg:items-center" role="img">
          <div className="grid grid-cols-2 gap-2">
            {[
              ["Sr pays SLP", `${liqSharePct.toFixed(0)}% of Sr yield`],
              ["Stable side earns", `${modelAssumptions.stableYieldPct.toFixed(1)}% modeled yield`],
              ["Swaps pay fees", `${modelAssumptions.swapFeeBps.toFixed(0)} bps per swap`],
              ["Pool turns over", `${modelAssumptions.poolTurnoverPerYear.toFixed(1)}× modeled / year`],
            ].map(([label, value]) => <div key={label} style={{ background: C.page, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}><p style={{ color: C.faint, fontSize: 10 }}>{label}</p><p className="mt-1" style={{ color: C.text, fontFamily: MONO, fontSize: 13, fontWeight: 750 }}>{value}</p></div>)}
          </div>
          <div aria-hidden className="hidden text-2xl lg:block" style={{ color: C.faint }}>→</div>
          <div style={{ background: C.greenSoft, border: "1px solid #C6DCCB", borderRadius: 999, padding: "22px 16px", textAlign: "center" }}><p style={{ color: C.green, fontFamily: MONO, fontSize: 13, fontWeight: 800 }}>SLP POOL</p><p className="mt-1" style={{ color: C.muted, fontSize: 10 }}>{modelAssumptions.reinvestLiquidityPremium ? "Premium reinvested" : "Premium paid out"}</p></div>
          <div aria-hidden className="hidden text-2xl lg:block" style={{ color: C.faint }}>→</div>
          <div style={{ background: C.ink, borderRadius: 12, color: C.card, padding: 16, textAlign: "center" }}><p style={{ color: "#B8B2A9", fontSize: 10 }}>Modeled avg / year</p><p className="mt-1" style={{ color: "#8FD0A5", fontFamily: MONO, fontSize: 27, fontWeight: 800 }}>{slp ? formatReturn(slp.apy) : "—"}</p></div>
        </div>
        <p className="mt-4" style={{ color: C.muted, fontSize: 11.5 }}>The accountant combines these inputs with actual pool trade prices. This diagram shows drivers, not a return equation.</p>
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-[.65fr_1.35fr] lg:items-center" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "20px clamp(16px,2.5vw,28px)" }}>
        <div>
          <Eyebrow>Separate source-risk waterfall</Eyebrow>
          <h2 className="mt-2" style={{ color: C.text, fontSize: 22, fontWeight: 550, letterSpacing: "-0.03em" }}>Jr absorbs source losses before Sr.</h2>
          <p className="mt-3" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.5 }}>This is Sr/Jr context. SLP separately faces pool-price and trading risk.</p>
        </div>
        <div>
          <div className="flex items-end justify-between gap-4"><div><p style={{ color: C.green, fontFamily: MONO, fontSize: 24, fontWeight: 800 }}>{protectionPct.toFixed(1)}%</p><p style={{ color: C.muted, fontSize: 11.5 }}>source loss before 100 Sr starts falling</p></div><Badge tone="context">Market context</Badge></div>
          <div aria-label={`Jr absorbs source losses through ${protectionPct.toFixed(1)} percent before Sr starts falling`} className="mt-4 overflow-hidden rounded-full" role="img" style={{ background: C.dangerSoft, height: 18 }}><div style={{ background: C.green, height: "100%", width: `${Math.min(100, (coverage.coverageLossLimit / coverage.displayMaxLoss) * 100)}%` }} /></div>
          <div className="mt-2 flex justify-between gap-3" style={{ color: C.faint, fontSize: 10 }}><span>Jr absorbs loss</span><span>Sr absorbs loss after the buffer</span></div>
        </div>
      </section>

      <details style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "15px clamp(16px,2.5vw,24px)" }}>
        <summary style={{ color: C.text, cursor: "pointer", fontSize: 13.5, fontWeight: 650 }}>See source, Sr, and Jr context</summary>
        <div className="mt-4 rounded-xl" style={{ background: C.page, border: `1px solid ${C.border}`, padding: 14 }}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><Eyebrow>Source baseline · {assetName}</Eyebrow><p className="mt-1" style={{ color: C.muted, fontSize: 13 }}>Untranched source—not an SLP result.</p></div><div className="flex flex-wrap gap-x-5 gap-y-1" style={{ fontFamily: MONO, fontSize: 13 }}><span>{sourceEndValue}</span><span>{formatReturn(sourceApy)} / year</span><span>{formatDrawdown(sourceMaxDrawdown)} worst drop</span></div></div>
          <p className="mt-2" style={{ color: C.muted, fontSize: 11.5 }}>{dataSummary}</p>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          {marketPositions.map((position) => <article key={position.symbol} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}><div className="flex items-center justify-between"><span style={{ color: position.color, fontFamily: MONO, fontWeight: 850 }}>{position.symbol}</span><span style={{ color: C.muted, fontSize: 10 }}>{position.name}</span></div><p className="mt-2" style={{ color: C.text, fontSize: 13.5, fontWeight: 650 }}>{position.job}</p><p className="mt-1" style={{ color: C.muted, fontSize: 11.5 }}>{position.paidFor}</p><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1" style={{ color: C.muted, fontSize: 10 }}><span>End <strong style={{ color: C.text, fontFamily: MONO }}>{position.endValue}</strong></span><span>Avg/year <strong style={{ color: C.text, fontFamily: MONO }}>{formatReturn(position.apy)}</strong></span><span>Worst drop <strong style={{ color: position.maxDrawdown > 0.0005 ? C.danger : C.text, fontFamily: MONO }}>{formatDrawdown(position.maxDrawdown)}</strong></span></div></article>)}
        </div>
      </details>

      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "17px clamp(16px,2.5vw,24px)" }}>
        <div><Eyebrow>Need the full model?</Eyebrow><p className="mt-1.5" style={{ color: C.text, fontSize: 15, fontWeight: 650 }}>Open the detailed simulator for hoverable curves and history.</p></div>
        <a href={`/day-sim?market=${encodeURIComponent(marketId)}`} style={{ background: C.rust, borderRadius: 9, color: C.card, fontSize: 13, fontWeight: 700, padding: "10px 13px", textDecoration: "none", whiteSpace: "nowrap" }}>Open detailed simulator →</a>
      </section>
    </div>
  );
}
