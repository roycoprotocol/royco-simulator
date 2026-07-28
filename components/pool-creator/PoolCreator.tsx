"use client";

// The wizard orchestrator: draft state, step routing, and the two-column
// layout (work column + sticky live rail).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as T from "@/components/pool-creator/tokens";
import { SummaryRail } from "@/components/pool-creator/SummaryRail";
import { usePoolModel } from "@/components/pool-creator/usePoolModel";
import {
  Step1Strategy,
  Step2Protection,
  Step3Exits,
  Step4Returns,
  Step5Launch,
} from "@/components/pool-creator/steps";
import { DeployPanel } from "@/components/pool-creator/DeployPanel";
import { deriveManifest } from "@/lib/pool-creator/derive";
import { bundleText, downloadFile } from "@/lib/pool-creator/export";
import { PreviewChart } from "@/components/pool-creator/PreviewChart";
import {
  ACKNOWLEDGEMENT_IDS,
  createEmptyDraft,
  isSourceNamed,
  suggestIdentity,
  type PoolDraft,
  type StepId,
} from "@/lib/pool-creator/draft";
import {
  archetypeToGoals,
  ARCHETYPES,
  referenceToGoals,
  type ReferenceMarket,
} from "@/lib/pool-creator/presets";
import {
  clearDraft,
  loadDraft,
  permalinkFor,
  queryToDraft,
  saveDraft,
  timeAgo,
  type RestoredDraft,
} from "@/lib/pool-creator/permalink";
import { Button, Callout, Eyebrow, Topline } from "@/components/pool-creator/primitives";
import { HowDayWorks } from "@/components/pool-creator/HowDayWorks";
import { StartBar } from "@/components/pool-creator/StartBar";
import { TranchesDiagram } from "@/components/pool-creator/diagrams";

/**
 * Two modes, not six steps.
 *
 * A six-step funnel with a deploy button at the end reads as a commitment, and
 * someone who is only *considering* a tranche bounces off it. So simulating is
 * one open surface you can land on and play with, and launching is a separate,
 * deliberate act you opt into once the numbers look right.
 */
type Mode = "simulate" | "launch";

const SECTIONS: Array<{ id: string; label: string }> = [
  { id: "strategy", label: "Strategy" },
  { id: "protection", label: "Protection" },
  { id: "exits", label: "Exits" },
  { id: "returns", label: "Returns" },
];

function ModeSwitch({
  mode,
  canLaunch,
  onChange,
}: {
  mode: Mode;
  canLaunch: boolean;
  onChange: (mode: Mode) => void;
}) {
  const tab = (id: Mode, label: string, sub: string, enabled: boolean) => {
    const active = mode === id;
    return (
      <button
        key={id}
        type="button"
        role="tab"
        aria-selected={active}
        disabled={!enabled}
        onClick={() => onChange(id)}
        style={{
          border: 0,
          background: "transparent",
          padding: "10px 2px",
          cursor: enabled ? "pointer" : "not-allowed",
          textAlign: "left",
          boxShadow: active ? `inset 0 -2px 0 ${T.C.accent}` : "none",
          opacity: enabled ? 1 : 0.5,
        }}
      >
        <span
          style={{
            display: "block",
            fontSize: 12.5,
            fontWeight: 600,
            color: active ? T.C.text : T.C.muted,
          }}
        >
          {label}
        </span>
        <span style={{ display: "block", ...T.hint, marginTop: 1 }}>{sub}</span>
      </button>
    );
  };

  return (
    <div
      role="tablist"
      aria-label="Simulate or launch"
      style={{
        display: "grid",
        gridTemplateColumns: "auto auto",
        gap: 28,
        justifyContent: "start",
        marginBottom: 14,
        borderBottom: `1px solid ${T.C.border}`,
      }}
    >
      {tab("simulate", "Simulate", "Free to explore. Nothing is committed.", true)}
      {tab(
        "launch",
        "Launch",
        canLaunch ? "Name it, size it, deploy it." : "Simulate a pool first.",
        canLaunch,
      )}
    </div>
  );
}

/** Jump-nav inside Simulate. Order without gating: scrolling is the sequence. */
function SectionNav() {
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        flexWrap: "wrap",
        marginBottom: 12,
        fontSize: 10.5,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
      }}
    >
      {SECTIONS.map((section, index) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          style={{ color: T.C.muted, textDecoration: "none", fontWeight: 600 }}
        >
          <span style={{ fontFamily: T.MONO, color: T.C.accent }}>{index + 1}</span> {section.label}
        </a>
      ))}
    </div>
  );
}

export default function PoolCreator({
  initialQuery = {},
}: {
  initialQuery?: Record<string, string | undefined>;
}) {
  // A permalink wins over a stored draft: arriving via someone's link should
  // show their pool, not whatever was left in this browser.
  const fromLink = useMemo(() => queryToDraft(initialQuery), [initialQuery]);

  const [draft, setDraft] = useState<PoolDraft>(() => fromLink?.draft ?? createEmptyDraft());
  const [restorable, setRestorable] = useState<RestoredDraft | null>(null);
  const [copied, setCopied] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Offer a stored draft rather than silently replacing what is on screen —
  // clobbering someone's work without asking is worse than losing it.
  //
  // The read is deferred rather than run in the effect body: localStorage is an
  // external store the server knows nothing about, so reading it during render
  // or synchronously in an effect means either a hydration mismatch or a
  // cascading render.
  useEffect(() => {
    if (fromLink) return;
    const timer = setTimeout(() => {
      const stored = loadDraft();
      if (stored && stored.draft.source) setRestorable(stored);
    }, 0);
    return () => clearTimeout(timer);
  }, [fromLink]);

  // Autosave, debounced so a slider drag does not hammer localStorage.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveDraft(draft), 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [draft]);

  const update = useCallback((mutate: (draft: PoolDraft) => PoolDraft) => {
    setDraft((current) => mutate(current));
    // Once you have started working, an offer to restore something older is
    // stale — and worse, it invites you to throw away what you just did.
    setRestorable(null);
  }, []);

  // Derived rather than stored: `step` already round-trips through permalinks
  // and persistence, so deriving the mode from it keeps one source of truth.
  const mode: Mode = draft.step >= 5 ? "launch" : "simulate";

  const model = usePoolModel(draft);

  const setMode = useCallback((next: Mode) => {
    setDraft((d) => ({ ...d, step: next === "launch" ? 5 : 1 }));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const goToStep = useCallback((step: StepId) => {
    setDraft((d) => ({ ...d, step }));
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    // No `?step=` in the URL yet: the draft itself isn't persisted, so a
    // restored step would land on step 3 showing default numbers rather than
    // the user's. Deep links arrive with the permalink codec, not before it.
  }, []);

  const pickPreset = useCallback(
    (id: string) => {
      const archetype = ARCHETYPES.find((a) => a.id === id);
      if (!archetype) return;
      setRestorable(null);
      setDraft((d) => {
        const sourceApy = d.source?.kind === "described" ? d.source.expectedApy : model.sourceApy;
        return {
          ...d,
          presetId: id,
          goals: archetypeToGoals(archetype, sourceApy, d.goals.initialSeniorSize),
        };
      });
    },
    [model.sourceApy],
  );

  const pickMarket = useCallback((market: ReferenceMarket) => {
    setRestorable(null);
    setDraft((d) => ({
      ...d,
      presetId: `ref:${market.id}`,
      // A modelled path at the market's own published yield, so the numbers are
      // live immediately. It is labelled as modelled everywhere it matters.
      source: {
        kind: "described",
        label: market.name,
        expectedApy: market.sourceApy,
        risk: market.coverage > 0.12 ? "credit" : market.coverage > 0.06 ? "choppy" : "mild",
        anchorDate: "2026-07-01",
      },
      identity: d.identityTouched ? d.identity : suggestIdentity(market.name),
      goals: referenceToGoals(market, d.goals.initialSeniorSize),
    }));
  }, []);

  // What blocks the user from moving on, stated specifically.
  const blocker = useMemo<string | null>(() => {
    if (mode === "simulate") {
      // Exploring is never blocked. The only thing launching needs from this
      // mode is a strategy that exists and has a name.
      if (!model.hasSource) {
        return draft.source?.kind === "series"
          ? "Add at least two observations before launching."
          : "Describe your strategy before launching.";
      }
      if (!isSourceNamed(draft.source)) return "Name your strategy before launching.";
      return null;
    }
    if (draft.step === 6) return "Connect a wallet, or download the configuration, on the left.";
    if (draft.step === 5) {
      const missing = ACKNOWLEDGEMENT_IDS.filter((id) => !draft.acknowledged[id]);
      if (missing.length > 0) {
        return `Confirm all three statements to continue (${missing.length} left).`;
      }
      if (!draft.identity.marketName.trim()) return "Give your pool a name to continue.";
      return null;
    }
    return null;
  }, [mode, draft, model.hasSource]);

  const onContinue = useCallback(() => {
    if (mode === "simulate") {
      setMode("launch");
      return;
    }
    if (draft.step < 6) goToStep((draft.step + 1) as StepId);
  }, [mode, draft.step, goToStep, setMode]);

  const exportBundle = useCallback(() => {
    const { manifest, series } = deriveManifest(draft, model.base, model.solved, model.series);
    downloadFile(`${manifest.id}-bundle.txt`, bundleText(manifest, series), "text/plain");
  }, [draft, model.base, model.solved, model.series]);

  const copyLink = useCallback(() => {
    const url = permalinkFor(draft);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(url);
    }
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `?${url.split("?")[1] ?? ""}`);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [draft]);

  const startOver = useCallback(() => {
    clearDraft();
    setDraft(createEmptyDraft());
    setRestorable(null);
    if (typeof window !== "undefined") window.history.replaceState(null, "", "/create");
  }, []);

  const stepProps = { draft, model, update };

  return (
    <div>
      <Topline>Royco Day · create a pool</Topline>
      <h1 style={T.h1}>See what a Day pool would do for your strategy.</h1>
      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <p style={T.sub}>
          Split the yield you already produce into a protected tranche and a leveraged one. Try it
          with a live market or your own numbers — nothing commits you to anything until you decide
          to launch.
        </p>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <Button onClick={() => setDrawerOpen(true)}>How Day works</Button>
          <Button onClick={copyLink}>{copied ? "Link copied" : "Copy link"}</Button>
        </div>
      </div>

      {restorable ? (
        <div style={{ marginBottom: 12 }}>
          <Callout
            action={
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button
                  primary
                  onClick={() => {
                    setDraft(restorable.draft);
                                  setRestorable(null);
                  }}
                >
                  Pick up where I left off
                </Button>
                <Button onClick={startOver}>Start fresh</Button>
              </div>
            }
          >
            <b>You have an unfinished pool.</b> Last edited {timeAgo(restorable.savedAt)}
            {restorable.draft.identity.marketName ? ` — ${restorable.draft.identity.marketName}` : ""}.
          </Callout>
        </div>
      ) : null}

      {fromLink?.needsReimport ? (
        <div style={{ marginBottom: 12 }}>
          <Callout tone="warn">
            <b>This link carries the settings, not the data.</b> A price history is too large to put
            in a URL, so the numbers below are modelled at the same shape. Re-import{" "}
            {fromLink.reimportHint?.label || "the strategy"} in step 1 to see its real backtest.
          </Callout>
        </div>
      ) : null}

      {/*
        On step 1 the diagram sits in a card with the flow explained beside it,
        so it reads as content rather than floating in the margin. From step 2
        it collapses to a strip and the explanation goes away — by then the user
        has the mental model and only needs the anchor.
      */}
      <div style={{ marginBottom: 12 }}>
        {draft.step === 1 ? (
          <div
            style={{
              ...T.card,
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(220px, 280px)",
              gap: 20,
              alignItems: "center",
            }}
            className="pool-creator-hero"
          >
            <TranchesDiagram highlight="senior" />
            <div>
              <Eyebrow>What you&rsquo;re building</Eyebrow>
              <div style={{ fontSize: 12.5, lineHeight: 1.45, color: T.C.muted }}>
                Your strategy keeps doing exactly what it does. Day splits the return it produces:
                Senior gives up some yield for protection, Junior takes the first losses and is paid
                for it, and the exit pool gives Senior a way out on any day.
              </div>
            </div>
          </div>
        ) : (
          <TranchesDiagram
            collapsed
            // Steps 4-6 concern the whole pool, not one side of it.
            highlight={
              draft.step === 2 ? "junior" : draft.step === 3 ? "liquidity" : "all"
            }
          />
        )}
      </div>

      <ModeSwitch mode={mode} canLaunch={model.hasSource} onChange={setMode} />

      <div
        style={{
          display: "grid",
          // The rail keeps its place well down into laptop widths — it carries
          // the live APYs, and pushing it below the fold loses the whole hook.
          gridTemplateColumns: "minmax(0, 1fr) minmax(290px, 350px)",
          gap: 16,
          alignItems: "start",
        }}
        className="pool-creator-grid"
      >
        <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
          {mode === "simulate" ? (
            <>
              <StartBar draft={draft} onPickArchetype={pickPreset} onPickMarket={pickMarket} />
              <SectionNav />
              {/*
                All four sections at once, in order but never gated. Someone
                exploring can jump straight to returns without answering
                anything first; scrolling supplies the sequence that step
                gating used to enforce.
              */}
              <div id="strategy" style={{ scrollMarginTop: 16 }}>
                <Step1Strategy {...stepProps} />
              </div>
              <div id="protection" style={{ scrollMarginTop: 16 }}>
                <Step2Protection {...stepProps} />
              </div>
              <div id="exits" style={{ scrollMarginTop: 16 }}>
                <Step3Exits {...stepProps} />
              </div>
              <div id="returns" style={{ scrollMarginTop: 16 }}>
                <Step4Returns {...stepProps} />
              </div>
              <PreviewChart model={model} />
            </>
          ) : null}

          {mode === "launch" && draft.step === 5 ? <Step5Launch {...stepProps} /> : null}
          {mode === "launch" && draft.step === 6 ? (
            <DeployPanel draft={draft} model={model} onExport={exportBundle} />
          ) : null}

          {mode === "launch" ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => (draft.step === 6 ? goToStep(5) : setMode("simulate"))}
                style={T.button}
              >
                ← {draft.step === 6 ? "Back to review" : "Back to the simulator"}
              </button>
            </div>
          ) : null}
        </div>

        <SummaryRail
          draft={draft}
          model={model}
          onJumpToStep={goToStep}
          onContinue={onContinue}
          continueLabel={
            mode === "simulate"
              ? "Launch this pool →"
              : draft.step === 6
                ? "Deploy in the panel"
                : "Deploy my pool →"
          }
          // On the last step the action lives in the panel itself.
          continueDisabled={draft.step === 6 || Boolean(blocker)}
          mode={mode}
          blocker={blocker}
        />
      </div>

      <HowDayWorks open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <style>{`
        @media (max-width: 859px) {
          .pool-creator-grid { grid-template-columns: minmax(0, 1fr) !important; }
        }
        @media (max-width: 720px) {
          .pool-creator-hero { grid-template-columns: minmax(0, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}
