"use client";

import DayV2DocsLink from "@/components/day-v2/DayV2DocsLink";
import type { DayDocsKey } from "@/lib/day-simulator-template/docs-links";

/**
 * One numbered region of the input panel.
 *
 * The panel used to be five stacked bands separated by hairlines, each headed by
 * the same small-caps label in the same weight, one of them titled "And the rest
 * of the market's parameters" — a heading defined by what it is not. At 1,484px
 * on the deploy tab there was no way to tell how many regions there were, which
 * one you were in, or why two of them had appeared.
 *
 * So: number them. A reader can count four things and hold four things, and the
 * number plus a one-line subtitle answers "what kind of decision is this" before
 * any control is read. `deployOnly` marks the two that the deploy tab adds, which
 * is the honest answer to "why is this suddenly here".
 */
export default function DayV2Group({
  children,
  deployOnly,
  docs,
  docsLabel,
  index,
  subtitle,
  title,
}: {
  children: React.ReactNode;
  deployOnly?: boolean;
  /** The docs section for this group's subject, if the docs have one. */
  docs?: DayDocsKey;
  docsLabel?: string;
  index: number;
  subtitle: string;
  title: string;
}) {
  return (
    <section className="flex flex-col gap-3 border-t border-[var(--border-subtle)] pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--foreground)] font-mono text-[10px] font-bold leading-none text-[var(--background)]"
        >
          {index}
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1">
          <h3 className="text-[13px] font-semibold leading-tight">{title}</h3>
          <p className="text-[11px] leading-tight text-[var(--tertiary)]">
            {subtitle}
          </p>
          {deployOnly ? (
            <span className="rounded-full border border-[var(--border-subtle)] px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--tertiary)]">
              deploy only
            </span>
          ) : null}
        </div>
        {docs ? (
          <DayV2DocsLink label={docsLabel ?? title} topic={docs} />
        ) : null}
      </div>
      {children}
    </section>
  );
}
