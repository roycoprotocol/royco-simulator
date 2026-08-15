"use client";

import { Badge } from "@/components/ui/badge";

export type DayV3OutcomeSnapshot = {
  sourceApyPct: number | null;
  protectedDrawdownPct: number | null;
  coveragePct: number | null;
  juniorPer100: number | null;
  immediateExitSharePct: number | null;
  minimumProceedsPer100: number | null;
  slpPer100: number | null;
  proceeds: number | null;
  seniorApyPct: number | null;
  juniorApyPct: number | null;
  slpApyPct: number | null;
  basis:
    | "live"
    | "illustrative"
    | "direct"
    | "checking"
    | "unavailable"
    | "blocked"
    | "incomplete";
  message: string;
};

const money = (value: number | null, digits = 1) =>
  value === null ? "—" : `$${value.toFixed(digits)}`;
const percent = (value: number | null, digits = 1) =>
  value === null ? "—" : `${value.toFixed(digits)}%`;

/** Compact terms footer for the scenario-return cards. The return cards remain
 * the answer; this row supplies the capital and settings that produced them. */
export default function DayV3DesignOutcome({
  current,
}: {
  current: DayV3OutcomeSnapshot;
}) {
  const terms = [
    {
      label: "Protection",
      value:
        current.coveragePct === 0
          ? "Off"
          : `${percent(current.protectedDrawdownPct)} drawdown`,
      note:
        current.coveragePct === 0
          ? "No Junior funded"
          : `${percent(current.coveragePct)} minimum coverage · ${money(current.juniorPer100)} Junior`,
    },
    {
      label: "Immediate exit",
      value:
        current.immediateExitSharePct === 0
          ? "Off"
          : `${money(current.immediateExitSharePct)} at once`,
      note:
        current.immediateExitSharePct === 0
          ? "No SLP funded"
          : `${money(current.slpPer100)} SLP required`,
    },
    {
      label: "Exit proceeds",
      value: money(current.proceeds),
      note:
        current.immediateExitSharePct === 0
          ? "No immediate sale modeled"
          : "Received for the selected sale",
    },
    {
      label: "Payout floor",
      value: money(current.minimumProceedsPer100, 0),
      note:
        current.minimumProceedsPer100 === null
          ? "Choose the exit terms"
          : "Minimum received per $100 Senior",
    },
  ];

  return (
    <div
      className="border-t border-[var(--border-subtle)] bg-[var(--foundation)]"
      data-day-v3-section="design-outcome"
    >
      <div className="grid grid-cols-2 gap-x-5 gap-y-3 px-5 py-3 lg:grid-cols-4">
        {terms.map((item) => (
          <div className="min-w-0" key={item.label}>
            <span className="text-[8.5px] font-semibold uppercase tracking-[0.1em] text-[var(--tertiary)]">
              {item.label}
            </span>
            <strong className="mt-0.5 block font-mono text-[15px] leading-tight tabular-nums">
              {item.value}
            </strong>
            <span className="mt-0.5 block text-[9.5px] leading-snug text-[var(--tertiary)]">
              {item.note}
            </span>
          </div>
        ))}
      </div>

      {current.basis === "blocked" ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--theme-gold)_10%,transparent)] px-5 py-2.5">
          <Badge tone="caution">Needs changes</Badge>
          <strong className="mr-1 text-[10.5px]">Try</strong>
          <a
            className="text-[10.5px] font-semibold underline underline-offset-4"
            href="#day-v3-exit-inputs"
          >
            reducing exit size
          </a>
          <span aria-hidden="true" className="text-[var(--tertiary)]">
            ·
          </span>
          <a
            className="text-[10.5px] font-semibold underline underline-offset-4"
            href="#day-v3-exit-inputs"
          >
            lowering the payout floor
          </a>
          <span aria-hidden="true" className="text-[var(--tertiary)]">
            ·
          </span>
          <a
            className="text-[10.5px] font-semibold underline underline-offset-4"
            href="#day-v3-source-inputs"
          >
            shortening conversion time or lowering the external spread assumption
          </a>
        </div>
      ) : null}
    </div>
  );
}
