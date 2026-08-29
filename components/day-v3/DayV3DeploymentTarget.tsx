"use client";

import DayV3Origin from "@/components/day-v3/DayV3Origin";
import { Badge } from "@/components/ui/badge";
import type { DayV3PoolDesignTarget } from "@/lib/day-v3/pool-design";

type SelectedTarget = { chainId: number; templateId: string };

const targetKey = (target: SelectedTarget) =>
  `${target.chainId}:${target.templateId}`;

export function resolveDayV3DeploymentTarget(
  value: string,
  targets: DayV3PoolDesignTarget[],
  selected: SelectedTarget | null,
): SelectedTarget | null {
  const liveTarget = targets.find((target) => targetKey(target) === value);
  if (liveTarget) {
    return {
      chainId: liveTarget.chainId,
      templateId: liveTarget.templateId,
    };
  }
  return selected && targetKey(selected) === value ? selected : null;
}

export default function DayV3DeploymentTarget({
  message,
  onTarget,
  selected,
  targets,
}: {
  message: string;
  onTarget: (value: { chainId: number; templateId: string } | null) => void;
  selected: { chainId: number; templateId: string } | null;
  targets: DayV3PoolDesignTarget[];
}) {
  return (
    <section
      className="flex flex-col gap-2 border-t border-[var(--border-subtle)] pt-3"
      id="day-v3-deployment-target"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <strong className="text-[12px] font-semibold">
          {selected === null ? (
            <span className="mr-1 text-[var(--red-emphasis)]">*</span>
          ) : null}
          Where will this market deploy?
        </strong>
        <span className="flex items-center gap-2">
          {selected === null ? (
            <Badge
              className="border-[color-mix(in_srgb,var(--theme-red)_40%,transparent)] bg-[color-mix(in_srgb,var(--theme-red)_8%,transparent)] text-[var(--red-emphasis)]"
              tone="caution"
            >
              Missing
            </Badge>
          ) : null}
          <DayV3Origin origin="live-template" />
        </span>
      </div>
      <label className="flex min-w-0 flex-col gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3">
        <span className="text-[12.5px] font-semibold leading-snug">
          Chain and market template
        </span>
        <select
          aria-describedby="day-v3-deployment-target-message"
          aria-invalid={selected === null}
          className="min-h-11 w-full cursor-pointer rounded-lg border border-[var(--border-subtle)] bg-[var(--foundation)] px-3 text-[12px] font-semibold outline-none transition-colors focus:border-[var(--foreground)]"
          aria-label="Chain and market template"
          aria-required="true"
          disabled={targets.length === 0 && selected === null}
          onChange={(event) => {
            onTarget(
              resolveDayV3DeploymentTarget(
                event.target.value,
                targets,
                selected,
              ),
            );
          }}
          required
          value={selected ? targetKey(selected) : ""}
        >
          <option disabled={targets.length === 0} value="">
            {targets.length === 0
              ? "Live target list unavailable"
              : "Choose a live target"}
          </option>
          {selected &&
          !targets.some(
            (target) =>
              target.chainId === selected.chainId &&
              target.templateId === selected.templateId,
          ) ? (
            <option value={targetKey(selected)}>
              {selected.chainId}:{selected.templateId} · validation pending
            </option>
          ) : null}
          {targets.map((target) => (
            <option
              key={`${target.chainId}:${target.templateId}`}
              value={`${target.chainId}:${target.templateId}`}
            >
              {target.chainName} · {target.templateName}
            </option>
          ))}
        </select>
        <span
          className="text-[10.5px] leading-relaxed text-[var(--tertiary)]"
          id="day-v3-deployment-target-message"
        >
          {message} Selecting a target resolves the canonical market-pool fee
          and validates the pool design. No fallback fee is used.
        </span>
      </label>
    </section>
  );
}
