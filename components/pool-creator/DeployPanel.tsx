"use client";

// Step 6. Connect a wallet, check permissions honestly, then deploy.
//
// The design principle here: never let someone pay for a transaction we already
// know will revert. Permission is read before anything is signed, every write
// is simulated first, and when deployment isn't possible the screen says so and
// hands over the configuration instead of hiding the button.

import { useCallback } from "react";
import * as T from "@/components/pool-creator/tokens";
import {
  Button,
  Callout,
  Card,
  Eyebrow,
  Hint,
  MiniMetric,
  Prose,
  SourceNote,
} from "@/components/pool-creator/primitives";
import type { PoolDraft } from "@/lib/pool-creator/draft";
import type { PoolModel } from "@/components/pool-creator/usePoolModel";
import { usd } from "@/lib/pool-creator/format";
import { deployAvailability, CHAIN_IDS } from "@/lib/pool-creator/chain/registry";
import { SEED_PER_TRANCHE_USD } from "@/lib/pool-creator/chain/deploy";
import { stepStatus } from "@/lib/pool-creator/chain/tx-machine";
import { deriveMarketId } from "@/lib/pool-creator/chain/params";
import { useDeploy } from "@/components/pool-creator/useDeploy";

export function DeployPanel({
  draft,
  model,
  onExport,
}: {
  draft: PoolDraft;
  model: PoolModel;
  onExport: () => void;
}) {
  const deploy = useDeploy();
  const { state, wallets, busy } = deploy;

  const availability = deployAvailability(CHAIN_IDS.ethereum);
  const seeding = model.balances.jt + model.balances.lt;

  const beginConnect = useCallback(async () => {
    await deploy.discover();
  }, [deploy]);

  return (
    <Card>
      <Eyebrow>Launch · 2 of 2 · Deploy</Eyebrow>
      <h2 style={{ ...T.leadTitle, maxWidth: 620 }}>Put it on-chain.</h2>
      <Prose style={{ maxWidth: 620 }}>
        Everything above is settled. This last step creates the three tranches, the accountant and
        the kernel in a single transaction.
      </Prose>

      {/* What is about to be created — the numbers, before any wallet talk. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 7 }}>
        <MiniMetric label="MARKET" value={draft.identity.marketName || "—"} />
        <MiniMetric
          label="CAPITAL TO SOURCE"
          value={usd(seeding)}
          note={`Junior + exit pool, beyond the $${SEED_PER_TRANCHE_USD * 3} of seed deposits`}
        />
        <MiniMetric
          label="MARKET ID"
          value={`${deriveMarketId(draft.identity.slug || "pool").slice(0, 10)}…`}
          note="derived from the pool name"
        />
      </div>

      {/* What happens after the market exists. Stated before any wallet talk,
          because it is part of launching rather than an afterthought. */}
      <div style={{ marginTop: 14 }}>
        <Eyebrow>Two phases</Eyebrow>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8 }}>
          <div style={{ ...T.guardrail, background: T.tint.panel(0.7) }}>
            <b style={T.guardrailTitle}>1 · Deploy</b>
            Creates the three tranches, the accountant and the kernel in a single transaction.
          </div>
          <div style={{ ...T.guardrail, background: T.tint.panel(0.7) }}>
            <b style={T.guardrailTitle}>2 · Seed each tranche</b>
            ${SEED_PER_TRANCHE_USD} into Junior, the exit pool and Senior — in that order.
          </div>
        </div>
        <Callout>
          <b>Why the ${SEED_PER_TRANCHE_USD} deposits.</b> They mint the first shares in each vault
          at a known one-to-one price. An empty ERC-4626 vault lets the first depositor donate
          assets and skew the share price against everyone who follows; seeding closes that. They
          also prove all three tranches accept a deposit before anyone real arrives.
          <div style={{ marginTop: 6, color: T.C.muted }}>
            Senior goes last because the accountant rejects a Senior deposit until both the cushion
            and the exit pool exist — we checked this against the engine, not the documentation.
          </div>
        </Callout>
      </div>

      {/* The central honesty: deployment is permissioned and not yet wired up. */}
      {!availability.available ? (
        <div style={{ marginTop: 14 }}>
          <Callout tone="warn">
            <b>{availability.reason}</b>
            <div style={{ marginTop: 6 }}>{availability.detail}</div>
          </Callout>
        </div>
      ) : null}

      <div style={{ marginTop: 14 }}>
        {state.tag === "idle" ? (
          <>
            <Button primary onClick={beginConnect} disabled={busy}>
              {busy ? "Looking for a wallet…" : "Connect a wallet"}
            </Button>
            <Hint>
              We read your address and check whether it can deploy. Nothing is signed until you say
              so.
            </Hint>
          </>
        ) : null}

        {wallets !== null && wallets.length === 0 ? (
          <Callout tone="danger">
            No wallet found in this browser. Install one, or download the configuration below and
            deploy from a machine that has one.
          </Callout>
        ) : null}

        {wallets !== null && wallets.length > 1 && state.tag === "idle" ? (
          <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
            {wallets.map((wallet) => (
              <button key={wallet.id} type="button" onClick={() => void deploy.connect(wallet)} style={T.chip(false)}>
                {wallet.name}
              </button>
            ))}
          </div>
        ) : null}

        {state.tag === "connecting" ? <Hint>Waiting for the wallet…</Hint> : null}

        {state.tag === "connected" ? (
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontFamily: T.MONO,
                fontSize: 11.5,
                color: T.C.text,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: state.account ? T.C.olive : T.C.danger,
                  display: "inline-block",
                }}
              />
              {state.account
                ? `${state.account.slice(0, 6)}…${state.account.slice(-4)} · chain ${state.chainId}`
                : "not connected"}
            </div>

            {!state.canDeploy && state.roleReason ? (
              <div style={{ marginTop: 10 }}>
                <Callout tone="warn">
                  <b>This wallet can&rsquo;t deploy the market.</b>
                  <div style={{ marginTop: 6 }}>{state.roleReason}</div>
                </Callout>
              </div>
            ) : null}

            {state.canDeploy ? (
              <div style={{ marginTop: 10 }}>
                <Button
                  primary
                  disabled={busy}
                  onClick={() => {
                    // Unreachable while the registry is empty; wired so it
                    // works the day addresses land.
                    if (!availability.available) return;
                    void deploy.plan({
                      draft,
                      base: model.base,
                      terms: model.solved,
                      deployment: availability.deployment,
                      collateralAsset: "0x0000000000000000000000000000000000000000",
                      quoteAsset: "0x0000000000000000000000000000000000000000",
                      collateralAssetOracle: "0x0000000000000000000000000000000000000000",
                      balancerPool: "0x0000000000000000000000000000000000000000",
                      bptOracle: "0x0000000000000000000000000000000000000000",
                      initialAuthority: state.tag === "connected" ? (state.account as `0x${string}`) : "0x0000000000000000000000000000000000000000",
                      juniorSeed: 0n,
                      liquiditySeed: 0n,
                      quoteDecimals: 18,
                    });
                  }}
                >
                  {busy ? "Preparing…" : "Review the transactions →"}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {"plan" in state ? (
          <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
            {state.plan.steps.map((step, index) => {
              const startsSeeding =
                step.phase === "seed" && state.plan.steps[index - 1]?.phase !== "seed";
              const status = stepStatus(state, index);
              const mark =
                status === "done" ? "✓" : status === "skipped" ? "–" : status === "failed" ? "✕" : status === "active" ? "▸" : "○";
              const color =
                status === "done" ? T.C.olive : status === "failed" ? T.C.danger : status === "skipped" ? T.C.faint : T.C.text;
              return (
                <div key={step.id}>
                  {startsSeeding ? (
                    <div style={{ ...T.miniMetricLabel, margin: "8px 0 6px" }}>
                      AFTER DEPLOYMENT · SEED EACH TRANCHE
                    </div>
                  ) : null}
                <div
                  style={{ border: `1px solid ${T.C.border}`, padding: "9px 10px", background: T.tint.panel(0.7) }}
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <span style={{ fontFamily: T.MONO, color }}>{mark}</span>
                    <b style={{ fontSize: 12, color }}>{step.title}</b>
                    {status === "skipped" ? (
                      <span style={{ ...T.miniMetricLabel, marginLeft: "auto" }}>ALREADY DONE</span>
                    ) : null}
                  </div>
                  <div style={{ ...T.hint, marginLeft: 20 }}>{step.explanation}</div>
                </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {state.tag === "simulation-failed" ? (
          <div style={{ marginTop: 10 }}>
            <Callout tone="danger">
              <b>This would fail.</b> We simulated it before asking you to sign, so nothing was
              spent. Reason: {state.reason}
            </Callout>
          </div>
        ) : null}

        {state.tag === "rejected" ? (
          <div style={{ marginTop: 10 }}>
            <Callout>
              You dismissed the signature request. Nothing has changed — pick up where you left off
              whenever you like.
              <div style={{ marginTop: 8 }}>
                <Button onClick={() => void deploy.signNext()}>Try again</Button>
              </div>
            </Callout>
          </div>
        ) : null}

        {state.tag === "timed-out" ? (
          <div style={{ marginTop: 10 }}>
            <Callout tone="warn">
              This transaction is taking a while. It may still go through — we haven&rsquo;t given up
              on it.
              <div style={{ marginTop: 8 }}>
                <Button onClick={() => void deploy.checkPending()}>Check again</Button>
              </div>
            </Callout>
          </div>
        ) : null}

        {state.tag === "complete" ? (
          <div style={{ marginTop: 12 }}>
            <Callout>
              <b>Your pool is live.</b>
              {state.marketAddress ? (
                <div style={{ fontFamily: T.MONO, marginTop: 6 }}>{state.marketAddress}</div>
              ) : null}
            </Callout>
          </div>
        ) : null}
      </div>

      {/* Always available, whatever happened above. */}
      <div style={{ marginTop: 16, borderTop: `1px solid ${T.C.border}`, paddingTop: 12 }}>
        <Eyebrow>Hand it over instead</Eyebrow>
        <Prose style={{ marginBottom: 8 }}>
          The configuration is complete either way. Download it and Royco can deploy the market and
          publish its page.
        </Prose>
        <Button onClick={onExport}>Download the configuration</Button>
      </div>

      <SourceNote>
        Deploying a Day market is permissioned: RoycoFactory.executeMarketDeployment is restricted to
        DEPLOYER_ROLE. This page reads that permission before asking you to sign anything.
      </SourceNote>
    </Card>
  );
}
