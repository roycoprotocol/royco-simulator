"use client";

// Tier 3 of the education layer: the slide-over.
//
// Everything a curious operator wants at 11pm and nothing they need at 2pm.
// Never auto-opens, never blocks, and nothing in the wizard depends on having
// read it — Tiers 0–2 (the one-line explanations, the reactive diagrams and the
// ⓘ reveals) carry everything required to answer the questions.

import { useEffect } from "react";
import * as T from "@/components/pool-creator/tokens";
import { Eyebrow, Prose } from "@/components/pool-creator/primitives";
import { REFERENCE_MARKETS } from "@/lib/pool-creator/presets";
import { pct } from "@/lib/pool-creator/format";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ borderTop: `1px solid ${T.C.border}`, paddingTop: 12, marginTop: 12 }}>
      <h3 style={{ ...T.cardTitle, fontSize: 16, marginBottom: 6 }}>{title}</h3>
      {children}
    </section>
  );
}

const Term = ({ word, children }: { word: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: 8 }}>
    <b style={{ fontSize: 12, color: T.C.text }}>{word}</b>
    <div style={{ ...T.hint, marginTop: 2 }}>{children}</div>
  </div>
);

export function HowDayWorks({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Escape closes it, and the body stops scrolling behind it.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="How Day works"
      style={{ position: "fixed", inset: 0, zIndex: 60 }}
    >
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(23,21,17,0.28)" }}
      />
      <aside
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(480px, 100%)",
          background: T.C.pageBg,
          borderLeft: `1px solid ${T.C.border}`,
          overflowY: "auto",
          padding: "18px 20px 40px",
          boxShadow: "-20px 0 60px rgba(60,45,28,0.12)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Eyebrow>How Day works</Eyebrow>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ ...T.disclosureToggle, width: 26, height: 26, fontSize: 15 }}
          >
            ✕
          </button>
        </div>

        <h2 style={{ ...T.leadTitle, marginTop: 4 }}>One strategy, split three ways.</h2>
        <Prose>
          A Day pool doesn&rsquo;t change what your strategy does. It changes who gets what when the
          strategy has a good year, and who takes the hit when it has a bad one.
        </Prose>

        <Section title="The three sides">
          <Term word="Senior — the protected side">
            Gives up part of its yield in exchange for not feeling the first losses. This is who a
            conservative depositor wants to be.
          </Term>
          <Term word="Junior — the first-loss side">
            Sits underneath Senior and absorbs losses before Senior feels anything. It is paid a
            risk premium out of Senior&rsquo;s yield for holding that position, and because it is a
            much smaller pot of money, that premium lands as a much larger return.
          </Term>
          <Term word="The exit pool — the way out">
            Funds a small pool that Senior holders can sell into on any day, at a price that depends
            on how much they sell at once. It earns trading fees, a treasury rate on its stable leg,
            and a liquidity premium, again out of Senior&rsquo;s yield.
          </Term>
        </Section>

        <Section title="What happens when the strategy falls">
          <Prose style={{ marginBottom: 8 }}>
            Junior absorbs it first. While the cushion holds, Senior&rsquo;s balance does not move at
            all. Past the cushion, Junior is wiped out and Senior starts taking the excess — which is
            exactly the edge you are choosing in step 2.
          </Prose>
          <Prose style={{ marginBottom: 0 }}>
            When Junior covers a loss the pool enters a <b>recovery window</b>. Senior can&rsquo;t
            redeem directly and Junior can&rsquo;t deposit, but selling into the exit pool stays open
            the whole time. If the strategy climbs back, Junior is made whole and normal operation
            resumes. If the window expires first, Junior&rsquo;s claim on that loss is written off
            permanently — Junior eats it, and Senior keeps the protection it was promised.
          </Prose>
        </Section>

        <Section title="Where the yield goes">
          <Prose style={{ marginBottom: 0 }}>
            Senior&rsquo;s yield is split by two curves — one paying Junior, one paying the exit pool
            — that shift with how heavily each side is being used. The wizard solves those curves
            from the returns you ask for, so you never have to set them directly. Royco also takes a
            protocol fee on Senior&rsquo;s kept yield and on the risk premium; both are visible in
            step 4&rsquo;s Advanced section.
          </Prose>
        </Section>

        <Section title="What the live book looks like">
          <div style={{ display: "grid", gap: 6 }}>
            {REFERENCE_MARKETS.map((m) => (
              <div
                key={m.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0,1fr) auto",
                  gap: 10,
                  fontSize: 11.5,
                  borderBottom: `1px dotted ${T.C.border}`,
                  paddingBottom: 5,
                }}
              >
                <span style={{ color: T.C.text }}>{m.name}</span>
                <span style={{ ...T.num, color: T.C.muted, fontSize: 10.5 }}>
                  {pct(m.coverage)} cushion · Senior {pct(m.seniorApyMin, 1)}–{pct(m.seniorApyMax, 1)}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="The words you&rsquo;ll see elsewhere">
          <Term word="Observation period">
            What the contracts call the recovery window.
          </Term>
          <Term word="Coverage">
            The size of the Junior cushion, as a fraction of Senior. The wizard asks how deep a fall
            you want absorbed and works backwards to it.
          </Term>
          <Term word="Utilization">
            How much of the cushion, or of the exit pool, is currently in use. The yield curves are
            keyed to it.
          </Term>
          <Term word="YDM">
            Yield distribution mechanism — the curve deciding what share of Senior&rsquo;s yield goes
            to Junior or the exit pool at a given utilization.
          </Term>
          <Term word="E-CLP">
            The Gyroscope pool type the exit pool uses: roughly 10% Senior shares against 90%
            short-term treasuries.
          </Term>
        </Section>

        <Section title="Read more">
          <div style={{ display: "grid", gap: 6, fontSize: 12 }}>
            <a href="https://docs.royco.org" target="_blank" rel="noreferrer" style={{ color: T.C.accent }}>
              Royco documentation ↗
            </a>
            <a
              href="https://github.com/roycoprotocol/royco-day"
              target="_blank"
              rel="noreferrer"
              style={{ color: T.C.accent }}
            >
              The Day contracts ↗
            </a>
          </div>
        </Section>

        <div style={{ ...T.sourceNote, marginTop: 16 }}>
          Simulator outputs are mechanism simulations, not historical backtests, forecasts, or an
          announced product.
        </div>
      </aside>
    </div>
  );
}
