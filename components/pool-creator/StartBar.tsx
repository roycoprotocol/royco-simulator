"use client";

// The front door.
//
// Someone who is only *considering* a tranche should see real numbers within
// one click and without typing anything. So the starting points are visible
// chips rather than a form: three shapes, and five markets that actually exist.
//
// Copying a live market is the strongest of these — those numbers are real and
// certified, so "show me what Apollo's looks like" costs one click and answers
// the question the visitor actually came with.

import * as T from "@/components/pool-creator/tokens";
import { Card, Eyebrow, Prose } from "@/components/pool-creator/primitives";
import { ARCHETYPES, REFERENCE_MARKETS, type ReferenceMarket } from "@/lib/pool-creator/presets";
import { pct } from "@/lib/pool-creator/format";
import type { PoolDraft } from "@/lib/pool-creator/draft";

export function StartBar({
  draft,
  onPickArchetype,
  onPickMarket,
}: {
  draft: PoolDraft;
  onPickArchetype: (id: string) => void;
  onPickMarket: (market: ReferenceMarket) => void;
}) {
  return (
    <Card>
      <Eyebrow>Start anywhere</Eyebrow>
      <h2 style={{ ...T.cardTitle }}>Pick a shape, or copy a pool that already exists.</h2>
      <Prose style={{ marginBottom: 10 }}>
        Nothing here commits you to anything. Every number stays editable, and the panel on the right
        updates as you go.
      </Prose>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8 }}>
        {ARCHETYPES.map((archetype) => (
          <button
            key={archetype.id}
            type="button"
            onClick={() => onPickArchetype(archetype.id)}
            style={{ ...T.chip(draft.presetId === archetype.id), padding: "11px 12px" }}
          >
            {archetype.label}
            <small style={T.chipSub}>{archetype.caption}</small>
            <small style={{ ...T.chipSub, marginTop: 6, fontFamily: T.MONO, color: T.C.accent }}>
              {pct(archetype.goals.protectedDrawdown)} cushion ·{" "}
              {archetype.goals.recoveryDays === 0 ? "no freeze" : `${archetype.goals.recoveryDays}d window`}
            </small>
          </button>
        ))}
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{ ...T.miniMetricLabel, marginBottom: 6 }}>OR COPY A LIVE MARKET</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {REFERENCE_MARKETS.map((market) => (
            <button
              key={market.id}
              type="button"
              onClick={() => onPickMarket(market)}
              style={{
                ...T.chip(draft.presetId === `ref:${market.id}`),
                padding: "8px 10px",
                textTransform: "none",
                letterSpacing: 0,
                fontSize: 11.5,
              }}
              title={`${pct(market.coverage)} coverage · ${market.observationDays}d window`}
            >
              {market.name}
              <small style={{ ...T.chipSub, fontFamily: T.MONO, marginTop: 3 }}>
                {pct(market.sourceApy, 1)} base · Senior {pct(market.seniorApyMin, 1)}–
                {pct(market.seniorApyMax, 1)}
              </small>
            </button>
          ))}
        </div>
        <div style={{ ...T.hint, marginTop: 6 }}>
          Real terms from markets running today. Copying one loads its shape so you can see how it
          behaves, then change whatever you like.
        </div>
      </div>
    </Card>
  );
}
