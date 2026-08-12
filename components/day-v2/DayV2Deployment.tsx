"use client";

import { memo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import DayV2Button, {
  dayV2ButtonVariants,
} from "@/components/day-v2/DayV2Button";
import DayV2Disclosure from "@/components/day-v2/DayV2Disclosure";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import DayV2DocsLink from "@/components/day-v2/DayV2DocsLink";
import { pct } from "@/components/day-v2/format";
import {
  buildDayConfigExport,
  dayDeploymentCompatibility,
  dayConfigExportFilename,
} from "@/lib/day-simulator-template/config-export";
import type { DayIssuerPresetId } from "@/lib/day-simulator-template/issuer-presets";
import type { DaySimulatorDefaults } from "@/lib/day-simulator-template/market";

const DEPLOY_URL = "https://royco.org/deploy-market/";

type Terms = {
  coveragePct: number;
  minLiquidityPct: number;
  eclpBandWidthPct: number;
  riskSharePct: number;
  liqSharePct: number;
  riskY0Pct: number;
  riskY100Pct: number;
  liqY0Pct: number;
  liqY100Pct: number;
  observationDays: number;
  sourceApyPct: number;
  maintainCoverage: boolean;
  y100SharePct: number;
  presetId: DayIssuerPresetId | null;
  poolConcentration: number;
};

type Modeled = {
  seniorApy: number;
  juniorApy: number;
  liquidityApy: number;
  coverageLossLimit: number;
  referenceSellShareOfSenior: number;
  boundarySellShareOfSenior: number;
};

const displayNumber = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);

function Row({
  label,
  note,
  value,
}: {
  label: string;
  note?: string;
  value: string;
}) {
  return (
    <div className="flex min-h-10 items-start justify-between gap-4 border-b border-[var(--border-subtle)] py-2 last:border-b-0">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[11.5px] font-medium text-[var(--secondary)]">
          {label}
        </span>
        {note ? (
          <span className="text-[10px] leading-snug text-[var(--tertiary)]">
            {note}
          </span>
        ) : null}
      </span>
      <span className="shrink-0 text-right font-mono text-[12px] font-semibold tabular-nums">
        {value}
      </span>
    </div>
  );
}

/**
 * A deployment handoff, not a second deployment form. The simulator exports
 * every value it actually modeled and names the smaller set of live-chain
 * choices that still belong in the deploy flow. This prevents the issuer from
 * entering the same field twice while also preventing a modeling-only
 * assumption from masquerading as an on-chain parameter.
 */
function DayV2Deployment({
  defaults,
  market,
  modeled,
  terms,
}: {
  defaults: DaySimulatorDefaults;
  market: {
    id: string;
    name: string;
    asset: string;
    variant: string;
    hasHistoricalSeries: boolean;
  };
  modeled: Modeled;
  terms: Terms;
}) {
  const [copied, setCopied] = useState(false);
  const maximumDiscountBps = terms.eclpBandWidthPct * 100;
  const discountFitsFlow =
    maximumDiscountBps >= 50 && maximumDiscountBps <= 500;
  const riskCap = Math.max(
    terms.riskY0Pct,
    terms.riskSharePct,
    terms.riskY100Pct,
  );
  const liquidityCap = Math.max(
    terms.liqY0Pct,
    terms.liqSharePct,
    terms.liqY100Pct,
  );
  const coverageEnabled = terms.coveragePct > 0;
  const protectedExitRemainingCoveragePct = coverageEnabled
    ? (defaults.exitBufferPct / 100) * terms.coveragePct
    : 0;
  const selfLiquidationBonusPct = coverageEnabled
    ? defaults.selfLiquidationBonus * 100
    : 0;
  const { issues: compatibilityIssues, modeledTermsCompatible } =
    dayDeploymentCompatibility({
      coveragePct: terms.coveragePct,
      eclpBandWidthPct: terms.eclpBandWidthPct,
      liqSharePct: terms.liqSharePct,
      liqY0Pct: terms.liqY0Pct,
      liqY100Pct: terms.liqY100Pct,
      minLiquidityPct: terms.minLiquidityPct,
      protectedExitRemainingCoveragePct,
      riskSharePct: terms.riskSharePct,
      riskY0Pct: terms.riskY0Pct,
      riskY100Pct: terms.riskY100Pct,
      selfLiquidationBonusPct,
    });

  const payload = (exportedAt: string) =>
    buildDayConfigExport({
      exportedAt,
      market: {
        id: market.id,
        name: market.name,
        asset: market.asset,
        variant: market.variant,
      },
      presetId: terms.presetId,
      terms: {
        coveragePct: terms.coveragePct,
        minLiquidityPct: terms.minLiquidityPct,
        eclpBandWidthPct: terms.eclpBandWidthPct,
        riskSharePct: terms.riskSharePct,
        liqSharePct: terms.liqSharePct,
        riskY0Pct: terms.riskY0Pct,
        riskY100Pct: terms.riskY100Pct,
        liqY0Pct: terms.liqY0Pct,
        liqY100Pct: terms.liqY100Pct,
        observationDays: terms.observationDays,
        sourceApyPct: terms.sourceApyPct,
        maintainCoverage: terms.maintainCoverage,
        y100SharePct: terms.y100SharePct,
        exitBufferPct: defaults.exitBufferPct,
        selfLiquidationBonusPct: defaults.selfLiquidationBonus * 100,
        poolConcentration: terms.poolConcentration,
      },
      scenario: {
        hasHistoricalSeries: market.hasHistoricalSeries,
        sourceStressPct: 0,
      },
      modeled,
    });

  const download = () => {
    const exportedAt = new Date().toISOString();
    const blob = new Blob([JSON.stringify(payload(exportedAt), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = dayConfigExportFilename(market.name, exportedAt);
    link.click();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(
      JSON.stringify(payload(new Date().toISOString()), null, 2),
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Card data-day-v2-section="deployment-brief" weight="primary">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Deployment brief</CardTitle>
          <Badge tone={modeledTermsCompatible ? "liquidity" : "caution"}>
            {modeledTermsCompatible
              ? "Modeled Terms Compatible"
              : "Review Highlighted Terms"}
          </Badge>
        </div>
        <CardDescription>
          A copyable handoff of the terms set here. Chain-specific choices stay
          in the deployment flow.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-4 py-3">
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em]">
                Market economics
              </h3>
              <span className="flex items-baseline gap-2">
                <DayV2DocsLink label="Minimum Coverage" topic="coverage" />
                <DayV2DocsLink label="Minimum Liquidity" topic="liquidity" />
              </span>
            </div>
            <Row
              label="Net source yield"
              note="Modeling only"
              value={pct(terms.sourceApyPct / 100)}
            />
            <Row
              label="Minimum coverage"
              value={pct(terms.coveragePct / 100)}
            />
            <Row
              label="Minimum liquidity"
              value={pct(terms.minLiquidityPct / 100)}
            />
            <Row
              label="Observation period"
              note="Loss-recovery window; exported in seconds"
              value={`${terms.observationDays} days`}
            />
          </section>

          <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-4 py-3">
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em]">
                Yield distribution
              </h3>
              <DayV2DocsLink label="Yield Split" topic="yieldSplit" />
            </div>
            <Row label="Curve type" note="Both sides" value="Static" />
            <Row label="Target utilization" value="90%" />
            <Row
              label="Jr shares · Y0 / YT / Y100"
              value={`${displayNumber(terms.riskY0Pct)} / ${displayNumber(terms.riskSharePct)} / ${displayNumber(terms.riskY100Pct)}%`}
            />
            <Row
              label="Jr cap"
              note="Highest point on its curve"
              value={`${displayNumber(riskCap)}%`}
            />
            <Row
              label="SLP shares · Y0 / YT / Y100"
              value={`${displayNumber(terms.liqY0Pct)} / ${displayNumber(terms.liqSharePct)} / ${displayNumber(terms.liqY100Pct)}%`}
            />
            <Row
              label="SLP cap"
              note="Highest point on its curve"
              value={`${displayNumber(liquidityCap)}%`}
            />
          </section>

          <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--foundation)] px-4 py-3">
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em]">
                Liquidity venue
              </h3>
              <DayV2DocsLink label="Liquidity Requirements" topic="liquidity" />
            </div>
            <Row label="Peg composition" value="90% exit / 10% Sr" />
            <Row
              label="Maximum discount"
              note={
                discountFitsFlow ? "Modeled directly" : "Must be 50–500 bps"
              }
              value={`${displayNumber(maximumDiscountBps)} bps`}
            />
            <Row
              label="Maximum premium"
              note="Derived for the 90/10 peg"
              value="Derived"
            />
            <Row
              label="Modeled depth"
              note="Deployment defaults to λ300"
              value={`λ${displayNumber(terms.poolConcentration)}`}
            />
            <Row
              label="Swap fee assumption"
              note="Read from the deployed template"
              value={`${defaults.swapFeeBps} bps`}
            />
            <Row
              label="Exit-asset yield"
              note="Modeling only"
              value={pct(defaults.stableYield)}
            />
          </section>
        </div>

        {!modeledTermsCompatible ? (
          <p
            className="rounded-lg border border-[color-mix(in_srgb,var(--theme-red)_35%,transparent)] bg-[color-mix(in_srgb,var(--theme-red)_8%,transparent)] px-3.5 py-2.5 text-[11.5px] leading-relaxed text-[var(--red-emphasis)]"
            role="alert"
          >
            <strong className="font-semibold">
              Resolve before deployment:
            </strong>{" "}
            {compatibilityIssues.join(" ")}
          </p>
        ) : null}

        <DayV2Disclosure
          className="bg-transparent"
          description="Chain and wallet choices this simulator cannot infer"
          summary="Still set in deployment"
        >
          <ul className="grid list-disc gap-x-8 gap-y-1.5 px-5 text-[11.5px] leading-relaxed text-[var(--secondary)] md:grid-cols-2">
            <li>Chain, asset contract, metadata, and listing details</li>
            <li>Collateral oracle and exit asset or rate provider</li>
            <li>Observation grace period</li>
            <li>Pool depth, reinvestment slippage, and genesis seed</li>
            <li>
              Settlement expiries after the oracle staleness bound is known
            </li>
          </ul>
          <p className="mt-3 text-[10.5px] leading-relaxed text-[var(--tertiary)]">
            Defaults: price-update gating, 5-minute deposits, 24-hour
            withdrawals, and expiries set to the longer of oracle staleness or
            observation plus seven days. Modeling-only fields are excluded.
          </p>
        </DayV2Disclosure>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-4">
          <span className="mr-auto max-w-[64ch] text-[10.5px] leading-snug text-[var(--tertiary)]">
            Deployment opens separately. Keep this brief for reference.
          </span>
          <DayV2Button
            onClick={() => void copy()}
            size="md"
            variant="secondary"
          >
            {copied ? "Copied" : "Copy JSON"}
          </DayV2Button>
          <DayV2Button onClick={download} size="md" variant="secondary">
            Download JSON
          </DayV2Button>
          <a
            className={dayV2ButtonVariants({ size: "md", variant: "primary" })}
            href={DEPLOY_URL}
            rel="noreferrer"
            target="_blank"
          >
            Continue to deployment
            <span aria-hidden="true">↗</span>
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

export default memo(DayV2Deployment);
