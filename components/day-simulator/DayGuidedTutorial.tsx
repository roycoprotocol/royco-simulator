"use client";

import type { DayExplainerMetrics } from "@/lib/day-simulator-template/explainer";

const C = {
  card: "#FFFFFF",
  page: "#F4F3EF",
  border: "#DEDDD7",
  text: "#1D1C19",
  muted: "#68665F",
  faint: "#969188",
  rust: "#A65B20",
  rustSoft: "#F4E9DF",
  green: "#3F7D5A",
  greenSoft: "#E7F0E9",
  senior: "#8B6B4B",
  junior: "#25231F",
} as const;

const MONO = '"SFMono-Regular", Consolas, monospace';
const SANS = "var(--font-inter), Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const STEPS = [
  { short: "Positions", title: "Meet the three positions" },
  { short: "Coverage", title: "When does ST lose money?" },
  { short: "Liquidity", title: "See how the ST pool works" },
  { short: "Impact", title: "Connect each definition to an outcome" },
] as const;

export type DayGuidedTutorialProps = {
  assetName: string;
  coveragePct: number;
  minLiquidityPct: number;
  eclpBandWidthPct: number;
  coverage: DayExplainerMetrics["coverage"];
  liquidity: DayExplainerMetrics["liquidity"];
  step: number;
  onCoverageChange: (value: number) => void;
  onMinLiquidityChange: (value: number) => void;
  onEclpBandWidthChange: (value: number) => void;
  onExit: () => void;
  onReset: () => void;
  onShowInSimulator: () => void;
  onStepChange: (value: number) => void;
};

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ color: C.faint, fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" }}>
      {children}
    </p>
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
  tone,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  description: string;
  tone: string;
  onChange: (value: number) => void;
}) {
  return (
    <label style={{ display: "block" }}>
      <span className="flex items-baseline justify-between gap-4">
        <span style={{ color: C.text, fontSize: 13, fontWeight: 650 }}>{label}</span>
        <span style={{ color: tone, fontFamily: MONO, fontSize: 13, fontWeight: 750 }}>{display}</span>
      </span>
      <input
        aria-label={label}
        className="mt-2.5 w-full"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        style={{ accentColor: tone }}
        type="range"
        value={value}
      />
      <span className="mt-1.5 block" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
        {description}
      </span>
    </label>
  );
}

function OutcomeCard({
  eyebrow,
  value,
  label,
  explanation,
  tone = C.green,
}: {
  eyebrow: string;
  value: string;
  label: string;
  explanation: string;
  tone?: string;
}) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <p className="mt-3" style={{ color: tone, fontFamily: MONO, fontSize: "clamp(24px,3vw,34px)", fontWeight: 700, letterSpacing: "-0.05em", lineHeight: 1 }}>
        {value}
      </p>
      <p className="mt-2" style={{ color: C.text, fontSize: 12.5, fontWeight: 600 }}>{label}</p>
      <p className="mt-3" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.5 }}>{explanation}</p>
    </div>
  );
}

function Relationship({
  input,
  mechanism,
  outcome,
  tone,
}: {
  input: string;
  mechanism: string;
  outcome: string;
  tone: string;
}) {
  return (
    <div className="grid grid-cols-1 items-stretch md:grid-cols-[1fr_28px_1fr_28px_1.15fr]" style={{ gap: 8 }}>
      <div style={{ background: C.page, borderLeft: `3px solid ${tone}`, borderRadius: 8, padding: 12 }}>
        <Eyebrow>Assumption</Eyebrow>
        <p className="mt-2" style={{ color: C.text, fontSize: 12.5, fontWeight: 650 }}>{input}</p>
      </div>
      <div className="hidden items-center justify-center md:flex" aria-hidden="true" style={{ color: C.faint, fontFamily: MONO }}>→</div>
      <div style={{ background: C.page, borderRadius: 8, padding: 12 }}>
        <Eyebrow>Mechanism</Eyebrow>
        <p className="mt-2" style={{ color: C.text, fontSize: 12.5, fontWeight: 650 }}>{mechanism}</p>
      </div>
      <div className="hidden items-center justify-center md:flex" aria-hidden="true" style={{ color: C.faint, fontFamily: MONO }}>→</div>
      <div style={{ background: C.greenSoft, borderRadius: 8, padding: 12 }}>
        <Eyebrow>Modeled consequence</Eyebrow>
        <p className="mt-2" style={{ color: C.green, fontSize: 12.5, fontWeight: 700 }}>{outcome}</p>
      </div>
    </div>
  );
}

function formatBand(value: number): string {
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export default function DayGuidedTutorial({
  assetName,
  coveragePct,
  minLiquidityPct,
  eclpBandWidthPct,
  coverage,
  liquidity,
  step,
  onCoverageChange,
  onMinLiquidityChange,
  onEclpBandWidthChange,
  onExit,
  onReset,
  onShowInSimulator,
  onStepChange,
}: DayGuidedTutorialProps) {
  const current = STEPS[step];
  const coverageLimit = coverage.coverageLossLimit * 100;
  const nearParShare = liquidity.referenceSellShareOfSenior * 100;
  const nearParSlippage = liquidity.referenceQuote.slippage * 100;
  const boundaryShare = liquidity.boundarySellShareOfSenior * 100;
  const boundarySlippage = liquidity.boundaryQuote.slippage * 100;
  const poolFloor = Math.max(0, 1 - eclpBandWidthPct / 100);

  const goNext = () => onStepChange(Math.min(STEPS.length - 1, step + 1));
  const goBack = () => onStepChange(Math.max(0, step - 1));

  return (
    <section
      aria-label="Royco Day tutorial"
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        boxShadow: "none",
        overflow: "hidden",
      }}
    >
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: 16 }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Eyebrow>Tutorial · Step {step + 1} of {STEPS.length}</Eyebrow>
            <h2 className="mt-2" style={{ color: C.text, fontFamily: SANS, fontSize: "clamp(21px,2.4vw,28px)", fontWeight: 550, letterSpacing: "-0.035em", lineHeight: 1.08 }}>
              {current.title}
            </h2>
            <p className="mt-2" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
              Follow the lessons or use the full simulator below at any time.
            </p>
          </div>
          <button
            onClick={onExit}
            style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, fontSize: 11.5, fontWeight: 600, minHeight: 34, padding: "7px 11px" }}
            type="button"
          >
            Close tutorial
          </button>
        </div>

        <div aria-label="Tutorial progress" className="mt-4 grid grid-cols-2 sm:grid-cols-4" role="tablist" style={{ gap: 6 }}>
          {STEPS.map((item, index) => {
            const active = index === step;
            const complete = index < step;
            return (
              <button
                aria-selected={active}
                key={item.short}
                onClick={() => onStepChange(index)}
                role="tab"
                style={{
                  alignItems: "center",
                  background: active ? C.rustSoft : complete ? C.greenSoft : C.page,
                  border: `1px solid ${active ? C.rust : complete ? C.green : C.border}`,
                  borderRadius: 8,
                  color: active ? C.rust : complete ? C.green : C.muted,
                  display: "flex",
                  fontFamily: MONO,
                  fontSize: 9.5,
                  fontWeight: 750,
                  gap: 7,
                  minHeight: 36,
                  padding: "7px 9px",
                  textAlign: "left",
                  textTransform: "uppercase",
                }}
                type="button"
              >
                <span aria-hidden>{complete ? "✓" : index + 1}</span>
                {item.short}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {step === 0 && (
          <div>
            <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.5, maxWidth: 760 }}>
              Royco Day splits the same yield source into three positions. Each position performs a different job and receives a different share of the modeled economics.
            </p>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3" style={{ gap: 8 }}>
              {[
                {
                  symbol: "ST",
                  name: "Senior Tranche",
                  job: "Prioritizes first-loss protection and access to secondary liquidity.",
                  relationship: "Keeps source yield after paying JT and SLP premiums.",
                  color: C.senior,
                },
                {
                  symbol: "JT",
                  name: "Junior Tranche",
                  job: "Takes first loss before ST and provides the protection buffer.",
                  relationship: "Earns a risk premium for putting its capital first in the loss waterfall.",
                  color: C.junior,
                },
                {
                  symbol: "SLP",
                  name: "Senior Liquidity Provider",
                  job: "Supplies the pool used for secondary ST sales.",
                  relationship: "Earns a liquidity premium and modeled pool economics for that role.",
                  color: C.green,
                },
              ].map((position) => (
                <div key={position.symbol} style={{ background: C.page, border: `1px solid ${position.color}`, borderRadius: 10, padding: 14 }}>
                  <p style={{ color: position.color, fontFamily: MONO, fontSize: 22, fontWeight: 800 }}>{position.symbol}</p>
                  <p className="mt-1" style={{ color: C.text, fontSize: 13, fontWeight: 700 }}>{position.name}</p>
                  <p className="mt-3" style={{ color: C.text, fontSize: 12, lineHeight: 1.45 }}>{position.job}</p>
                  <p className="mt-3" style={{ borderTop: `1px solid ${C.border}`, color: C.muted, fontSize: 11.5, lineHeight: 1.45, paddingTop: 10 }}>{position.relationship}</p>
                </div>
              ))}
            </div>
            <div className="mt-3" style={{ background: C.rustSoft, borderLeft: `3px solid ${C.rust}`, borderRadius: 8, color: C.muted, fontSize: 11.5, lineHeight: 1.5, padding: "10px 12px" }}>
              <strong style={{ color: C.text }}>One source, three jobs.</strong>{" "}
              ST pays part of its yield to JT for first-loss protection and to SLP for pool liquidity.
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(280px,.82fr)]" style={{ gap: 10 }}>
            <div style={{ background: C.page, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
              <Eyebrow>Definition → try it</Eyebrow>
              <h3 className="mt-2" style={{ color: C.text, fontSize: 18, fontWeight: 650 }}>Set ST&apos;s first-loss protection</h3>
              <p className="mt-2" style={{ color: C.muted, fontSize: 12, lineHeight: 1.5 }}>
                JT Coverage is the minimum protection setting the accountant uses to determine how much first-loss JT capital supports ST.
              </p>
              <div className="mt-4" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
                <RangeControl
                  description="Move the requirement and watch the accountant-derived ST loss threshold change."
                  display={`${coveragePct.toFixed(0)}%`}
                  label="JT Coverage"
                  max={25}
                  min={3}
                  onChange={onCoverageChange}
                  step={1}
                  tone={C.junior}
                  value={coveragePct}
                />
              </div>
              <p className="mt-3" style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.5 }}>
                JT Coverage is a buffer setting—not ST&apos;s loss limit. The model&apos;s 90% utilization target makes the displayed loss threshold slightly higher.
              </p>
            </div>
            <OutcomeCard
              eyebrow="ST loss threshold"
              explanation="JT absorbs source losses first. Once the available JT buffer is used, further source loss reduces ST. Coverage is a buffer, not a guarantee."
              label="of modeled source loss before ST falls below $100"
              tone={C.green}
              value={`${coverageLimit.toFixed(1)}% source loss`}
            />
          </div>
        )}

        {step === 2 && (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(300px,.95fr)]" style={{ gap: 10 }}>
            <div className="flex flex-col" style={{ gap: 8 }}>
              <div style={{ background: C.page, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
                <Eyebrow>Definition → try it</Eyebrow>
                <h3 className="mt-2" style={{ color: C.text, fontSize: 18, fontWeight: 650 }}>What is SLP Liquidity?</h3>
                <p className="mt-2" style={{ color: C.muted, fontSize: 12, lineHeight: 1.5 }}>
                  SLP Liquidity is the minimum SLP capital required relative to ST. It supplies the pool used for secondary ST sales.
                </p>
                <div className="mt-4">
                  <RangeControl
                    description="Move the requirement and watch the modeled sale capacity update."
                    display={`${minLiquidityPct.toFixed(0)}%`}
                    label="SLP Liquidity"
                    max={30}
                    min={5}
                    onChange={onMinLiquidityChange}
                    step={1}
                    tone={C.green}
                    value={minLiquidityPct}
                  />
                </div>
              </div>
              <div style={{ background: C.page, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
                <h3 style={{ color: C.text, fontSize: 18, fontWeight: 650 }}>What is the Pool Band?</h3>
                <p className="mt-2" style={{ color: C.muted, fontSize: 12, lineHeight: 1.5 }}>
                  The Pool Band sets how far the modeled pool price can move below $1. It changes where liquidity is concentrated and the tradeoff between sale size and price impact.
                </p>
                <div className="mt-4">
                  <RangeControl
                    description={`The current ${formatBand(eclpBandWidthPct)}% band models a downside range from $${poolFloor.toFixed(3)} to $1.`}
                    display={`${formatBand(eclpBandWidthPct)}%`}
                    label="Pool Band"
                    max={20}
                    min={0.25}
                    onChange={onEclpBandWidthChange}
                    step={0.25}
                    tone={C.green}
                    value={eclpBandWidthPct}
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-col" style={{ gap: 8 }}>
              <OutcomeCard
                eyebrow="Selling close to $1"
                explanation={`Price impact means the model's average sale price is about ${nearParSlippage.toFixed(1)}% below ST's $1 reference value. Actual sales may differ.`}
                label={`can be sold at once with about ${nearParSlippage.toFixed(1)}% average price impact`}
                value={`${nearParShare.toFixed(1)}% of ST`}
              />
              <OutcomeCard
                eyebrow="Largest one-time sale"
                explanation="At this size, the sale reaches the pool's current limit. Selling more would require multiple sales or waiting for liquidity to return."
                label={`can be sold in one transaction, with about ${boundarySlippage.toFixed(1)}% average price impact`}
                tone={C.senior}
                value={`${boundaryShare.toFixed(1)}% of ST`}
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.5, maxWidth: 760 }}>
              The definitions are useful because they map directly to observable simulator outputs. These outcomes use the current {assetName} sample and assumptions.
            </p>
            <div className="mt-4 flex flex-col" style={{ gap: 8 }}>
              <Relationship
                input={`JT Coverage · ${coveragePct.toFixed(0)}%`}
                mechanism="JT capital enters the loss waterfall before ST"
                outcome={`ST begins declining after about ${coverageLimit.toFixed(1)}% modeled source loss`}
                tone={C.junior}
              />
              <Relationship
                input={`SLP Liquidity · ${minLiquidityPct.toFixed(0)}%`}
                mechanism="SLP capital supplies the pool used for ST sales"
                outcome={`${nearParShare.toFixed(1)}% of ST can sell at once with about ${nearParSlippage.toFixed(1)}% average price impact`}
                tone={C.green}
              />
              <Relationship
                input={`Pool Band · ${formatBand(eclpBandWidthPct)}%`}
                mechanism={`The pool price can move between $${poolFloor.toFixed(3)} and $1`}
                outcome={`${boundaryShare.toFixed(1)}% of ST is the largest modeled one-time sale`}
                tone={C.green}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={onExit}
                style={{ background: C.rust, border: `1px solid ${C.rust}`, borderRadius: 8, color: C.card, fontSize: 12, fontWeight: 700, minHeight: 40, padding: "9px 14px" }}
                type="button"
              >
                Continue without tutorial
              </button>
              <button
                onClick={() => {
                  onReset();
                  onStepChange(0);
                }}
                style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, fontSize: 12, fontWeight: 650, minHeight: 40, padding: "9px 14px" }}
                type="button"
              >
                Restart tutorial
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3" style={{ background: C.page, borderTop: `1px solid ${C.border}`, padding: 12 }}>
        <button
          disabled={step === 0}
          onClick={goBack}
          style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, fontSize: 11.5, fontWeight: 650, minHeight: 36, opacity: step === 0 ? 0.4 : 1, padding: "8px 12px" }}
          type="button"
        >
          Back
        </button>
        <button
          onClick={onShowInSimulator}
          style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.rust, fontSize: 11.5, fontWeight: 700, minHeight: 36, padding: "8px 12px" }}
          type="button"
        >
          {step === 0 ? "Show positions below" : step === 1 ? "Adjust coverage below" : step === 2 ? "Adjust liquidity below" : "Show live outcomes below"}
        </button>
        {step < STEPS.length - 1 ? (
          <button
            onClick={goNext}
            style={{ background: C.rust, border: `1px solid ${C.rust}`, borderRadius: 8, color: C.card, fontSize: 11.5, fontWeight: 700, minHeight: 36, padding: "8px 12px" }}
            type="button"
          >
            Next: {STEPS[step + 1].short}
          </button>
        ) : (
          <button
            onClick={onExit}
            style={{ background: C.rust, border: `1px solid ${C.rust}`, borderRadius: 8, color: C.card, fontSize: 11.5, fontWeight: 700, minHeight: 36, padding: "8px 12px" }}
            type="button"
          >
            Finish
          </button>
        )}
      </div>
    </section>
  );
}
