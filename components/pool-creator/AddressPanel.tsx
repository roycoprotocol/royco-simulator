"use client";

// The address-paste path: identify a contract, then pull its NAV history.
//
// Two deliberate UX choices:
//   - the probe result is stated in plain English ("This is an ERC-4626 vault")
//     before any numbers appear, so the user knows we found the right thing;
//   - the history pull shows a log of the actual work rather than a spinner.
//     Real progress reads as care, and each line quietly says we checked
//     something.

import { useCallback, useEffect, useRef, useState } from "react";
import * as T from "@/components/pool-creator/tokens";
import { Button, Callout, Hint, LabeledRow } from "@/components/pool-creator/primitives";
import { ChipGroup, Segmented, TextField } from "@/components/pool-creator/fields";
import type { PoolDraft } from "@/lib/pool-creator/draft";
import { suggestIdentity } from "@/lib/pool-creator/draft";
import type {
  ChainId,
  NavProbeResponse,
  NavSeriesResponse,
} from "@/lib/pool-creator/nav/types";
import { CHAIN_LABELS } from "@/lib/pool-creator/nav/types";

const EXPLORERS: Record<ChainId, string> = {
  ethereum: "https://etherscan.io/address/",
  arbitrum: "https://arbiscan.io/address/",
};

type ProbeOk = Extract<NavProbeResponse, { ok: true }>;
type SeriesOk = Extract<NavSeriesResponse, { ok: true }>;

/**
 * Only *async* outcomes live here. Whether the typed text looks like an
 * address, and whether a lookup is in flight, are derived at render time from
 * `address` — storing them would mean a setState inside the effect body, which
 * is a cascading render.
 *
 * Every settled phase carries the address it belongs to, so a result for a
 * previous address is never shown against the current one.
 */
type Phase =
  | { tag: "idle" }
  | { tag: "probed"; address: string; result: ProbeOk }
  | { tag: "pulling"; address: string; result: ProbeOk }
  | { tag: "loaded"; address: string; result: ProbeOk; series: SeriesOk }
  | { tag: "error"; address: string; code: string; message: string };

const RANGES: Array<{ value: number; label: string; caption: string }> = [
  { value: 182, label: "6 months", caption: "" },
  { value: 365, label: "1 year", caption: "" },
  { value: 730, label: "2 years", caption: "The most we read." },
];

const isAddressShape = (value: string) => /^0x[0-9a-fA-F]{40}$/.test(value.trim());

const yesterday = (): string => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const daysBefore = (iso: string, days: number): string =>
  new Date(Date.parse(`${iso}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

export function AddressPanel({
  draft,
  update,
}: {
  draft: PoolDraft;
  update: (mutate: (draft: PoolDraft) => PoolDraft) => void;
}) {
  const [chain, setChain] = useState<ChainId>("ethereum");
  const [address, setAddress] = useState("");
  const [rangeDays, setRangeDays] = useState(365);
  const [phase, setPhase] = useState<Phase>({ tag: "idle" });
  const requestSeq = useRef(0);

  const trimmed = address.trim();
  const validShape = isAddressShape(trimmed);
  const key = validShape ? `${chain}:${trimmed.toLowerCase()}` : "";
  const settledKey = phase.tag === "idle" ? "" : phase.address;
  const probing = validShape && settledKey !== key;

  // Debounced probe. All state changes happen inside the timeout / promise
  // callbacks, never synchronously in the effect body. A response for a
  // superseded address is dropped by sequence number.
  useEffect(() => {
    if (!validShape) return;
    const seq = ++requestSeq.current;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/create/nav?mode=probe&chain=${chain}&address=${trimmed}`);
        const body = (await response.json()) as NavProbeResponse;
        if (seq !== requestSeq.current) return;
        setPhase(
          body.ok
            ? { tag: "probed", address: key, result: body }
            : { tag: "error", address: key, code: body.code, message: body.message },
        );
      } catch {
        if (seq !== requestSeq.current) return;
        setPhase({
          tag: "error",
          address: key,
          code: "UPSTREAM_ERROR",
          message: "We couldn't reach the network. Check your connection and try again.",
        });
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [trimmed, chain, validShape, key]);

  const pullHistory = useCallback(async () => {
    if (phase.tag !== "probed" && phase.tag !== "loaded") return;
    const probeResult = phase.result;
    const end = yesterday();
    const start = daysBefore(end, rangeDays);
    const seq = ++requestSeq.current;

    setPhase({ tag: "pulling", address: phase.address, result: probeResult });

    try {
      const response = await fetch(
        `/create/nav?mode=series&chain=${chain}&address=${probeResult.address}&start=${start}&end=${end}&cadence=weekly`,
      );
      const body = (await response.json()) as NavSeriesResponse;
      if (seq !== requestSeq.current) return;
      if (!body.ok) {
        setPhase({ tag: "error", address: phase.address, code: body.code, message: body.message });
        return;
      }

      const label = probeResult.probe.kind === "unknown" ? "Strategy" : probeResult.probe.symbol || probeResult.probe.name || "Strategy";
      update((d) => ({
        ...d,
        source: {
          kind: "series",
          series: body.series,
          origin: {
            kind: "onchain",
            label,
            provider: "",
            sourceUrl: `${EXPLORERS[chain]}${body.address}`,
            priceType: "nav",
            cadence: body.cadence === "daily" ? "daily" : "weekly",
            feesIncluded: null,
          },
        },
        identity: d.identityTouched ? d.identity : suggestIdentity(label),
      }));
      setPhase({ tag: "loaded", address: phase.address, result: probeResult, series: body });
    } catch {
      if (seq !== requestSeq.current) return;
      setPhase({
        tag: "error",
        address: phase.address,
        code: "UPSTREAM_ERROR",
        message: "The history pull failed partway. Try again.",
      });
    }
  }, [phase, chain, rangeDays, update]);

  return (
    <div style={{ marginTop: 14 }}>
      <LabeledRow
        label="Where does the yield come from?"
        explanation="Paste the address of your yield-bearing vault, machine or price feed. We read it on-chain — nothing is sent anywhere else."
        control={
          <Segmented
            ariaLabel="Chain"
            value={chain}
            options={[
              { value: "ethereum" as ChainId, label: "Ethereum" },
              { value: "arbitrum" as ChainId, label: "Arbitrum" },
            ]}
            onChange={setChain}
          />
        }
      >
        <div style={{ marginTop: 8 }}>
          <TextField
            ariaLabel="Contract address"
            mono
            value={address}
            placeholder="0x0000000000000000000000000000000000000000"
            onChange={setAddress}
          />
        </div>
      </LabeledRow>

      {trimmed.length > 0 && !validShape ? (
        <Hint>That should be 0x followed by 40 hex characters.</Hint>
      ) : null}

      {probing ? <div style={{ ...T.hint, marginTop: 10 }}>Checking that address…</div> : null}

      {!probing && phase.tag === "error" ? (
        <div style={{ marginTop: 10 }}>
          <Callout tone="danger">
            {phase.message}
            {phase.code === "NOT_A_VAULT" || phase.code === "BAD_ADDRESS" ? (
              <div style={{ marginTop: 6, color: T.C.muted }}>
                If your strategy has no on-chain price feed, describe it instead — the tab above.
              </div>
            ) : null}
          </Callout>
        </div>
      ) : null}

      {!probing && (phase.tag === "probed" || phase.tag === "pulling" || phase.tag === "loaded") ? (
        <div style={{ marginTop: 12 }}>
          <Callout tone={phase.result.readable ? "note" : "warn"}>{phase.result.summary}</Callout>

          {phase.result.readable ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ ...T.miniMetricLabel, marginBottom: 6 }}>HOW FAR BACK?</div>
              <ChipGroup
                columns={3}
                value={rangeDays}
                onChange={setRangeDays}
                options={RANGES.map((r) => ({ value: r.value, label: r.label, caption: r.caption }))}
              />
              <div style={{ marginTop: 10 }}>
                <Button primary onClick={pullHistory} disabled={phase.tag === "pulling"}>
                  {phase.tag === "pulling" ? "Reading history…" : "Read its history →"}
                </Button>
              </div>
              <Hint>
                Weekly readings, taken at each day&rsquo;s closing block. A couple of thousand
                on-chain reads take a few seconds.
              </Hint>
            </div>
          ) : null}
        </div>
      ) : null}

      {!probing && phase.tag === "pulling" ? (
        <div style={{ marginTop: 12, fontFamily: T.MONO, fontSize: 11, color: T.C.muted }}>
          <div>✓ Found {phase.result.probe.kind === "unknown" ? "the contract" : phase.result.probe.symbol || "the contract"} on {CHAIN_LABELS[chain]}</div>
          <div>⋯ Resolving closing blocks and reading values…</div>
        </div>
      ) : null}

      {!probing && phase.tag === "loaded" ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontFamily: T.MONO, fontSize: 11, color: T.C.muted }}>
            <div>✓ Read {phase.series.series.length} {phase.series.cadence} observations</div>
            <div>
              ✓ {phase.series.firstDate} → {phase.series.lastDate} · blocks{" "}
              {phase.series.blockRange[0].toLocaleString()}–{phase.series.blockRange[1].toLocaleString()}
            </div>
            <div>✓ Checked for gaps and duplicate dates</div>
          </div>

          {phase.series.warning ? (
            <div style={{ marginTop: 10 }}>
              <Callout tone="warn">{phase.series.warning}</Callout>
            </div>
          ) : null}

          <ProvenanceQuestions draft={draft} update={update} sourceUrl={`${EXPLORERS[chain]}${phase.series.address}`} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * The two things a machine cannot know. Fee treatment is asked because the docs
 * forbid guessing it — a wrong answer here poisons the yield shown to
 * depositors — and the publisher is asked so investors can verify the numbers.
 */
function ProvenanceQuestions({
  draft,
  update,
  sourceUrl,
}: {
  draft: PoolDraft;
  update: (mutate: (draft: PoolDraft) => PoolDraft) => void;
  sourceUrl: string;
}) {
  const origin = draft.source?.kind === "series" ? draft.source.origin : null;
  if (!origin) return null;

  const setOrigin = (patch: Partial<typeof origin>) =>
    update((d) =>
      d.source?.kind === "series"
        ? { ...d, source: { ...d.source, origin: { ...d.source.origin, ...patch } } }
        : d,
    );

  return (
    <div style={{ marginTop: 4 }}>
      <LabeledRow
        label="Is this price net of your fees?"
        explanation="If fees aren't already taken out, the yield we show depositors would be too high."
        control={
          <ChipGroup
            columns={2}
            value={origin.feesIncluded === null ? "" : origin.feesIncluded ? "yes" : "no"}
            onChange={(v) => setOrigin({ feesIncluded: v === "yes" })}
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
          />
        }
      />
      <LabeledRow
        label="Who publishes this?"
        explanation="Named on your pool page so depositors can check the numbers themselves."
        control={
          <TextField
            ariaLabel="Data provider"
            value={origin.provider}
            placeholder="e.g. USD.AI"
            onChange={(provider) => setOrigin({ provider })}
            width={200}
          />
        }
      />
      <Hint>
        Source recorded as{" "}
        <a href={sourceUrl} target="_blank" rel="noreferrer" style={{ color: T.C.accent }}>
          {sourceUrl.replace(/^https:\/\//, "")}
        </a>
        .
      </Hint>
    </div>
  );
}
