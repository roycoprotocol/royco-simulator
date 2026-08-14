"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import DayV3DocsLink from "@/components/day-v3/DayV3DocsLink";
import { Badge } from "@/components/ui/badge";
import type { DayDocsKey } from "@/lib/day-simulator-template/docs-links";
import { cn } from "@/lib/utils";

export type DayV3GroupStatus = {
  label: string;
  tone: "complete" | "incomplete" | "checking" | "review" | "blocked";
  /** Only actual unanswered issuer inputs belong here. */
  missing?: string[];
};

type DayV3GroupAccordionValue = {
  openId: string | null;
  open: (id: string, options?: { focus?: boolean }) => void;
  toggle: (id: string) => void;
};

const DayV3GroupAccordionContext =
  createContext<DayV3GroupAccordionValue | null>(null);

export function nextDayV3AccordionOpenId(
  current: string | null,
  requested: string,
) {
  return current === requested ? null : requested;
}

export function DayV3GroupAccordion({
  children,
  defaultOpenId = null,
  guidedTarget,
}: {
  children: React.ReactNode;
  defaultOpenId?: string | null;
  guidedTarget?: {
    id: string;
    label: string;
    detail?: string;
  } | null;
}) {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId);
  const open = useCallback((id: string, options?: { focus?: boolean }) => {
    setOpenId(id);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const section = document.getElementById(id);
        section?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
          block: "start",
        });
        if (options?.focus) {
          section
            ?.querySelector<HTMLButtonElement>("button[aria-controls]")
            ?.focus({ preventScroll: true });
        }
      });
    });
  }, []);
  const value = useMemo<DayV3GroupAccordionValue>(
    () => ({
      openId,
      open,
      toggle: (id) =>
        setOpenId((current) => nextDayV3AccordionOpenId(current, id)),
    }),
    [open, openId],
  );

  return (
    <DayV3GroupAccordionContext.Provider value={value}>
      {guidedTarget ? (
        <div className="flex flex-col gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <span className="block text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--tertiary)]">
              Next step
            </span>
            <strong className="mt-0.5 block text-[12.5px] font-semibold leading-tight">
              {guidedTarget.label}
            </strong>
            {guidedTarget.detail ? (
              <span className="mt-1 block text-[10.5px] leading-snug text-[var(--tertiary)]">
                {guidedTarget.detail}
              </span>
            ) : null}
          </div>
          <button
            className="inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-[var(--foreground)] px-4 py-2 text-[12px] font-semibold text-[var(--background)] transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)]"
            onClick={() => open(guidedTarget.id, { focus: true })}
            type="button"
          >
            Continue setup
          </button>
        </div>
      ) : null}
      {children}
    </DayV3GroupAccordionContext.Provider>
  );
}

/**
 * One numbered region of the input panel.
 *
 * The panel used to be five stacked bands separated by hairlines, each headed by
 * the same small-caps label in the same weight, one of them titled "And the rest
 * of the market's parameters" — a heading defined by what it is not. At 1,484px
 * on the deploy tab there was no way to tell how many regions there were, which
 * one you were in, or why two of them had appeared.
 *
 * So: number them. A reader can count five things and hold five things, and the
 * number plus a one-line subtitle answers "what kind of decision is this" before
 * any control is read. `deployOnly` marks the two that the deploy tab adds, which
 * is the honest answer to "why is this suddenly here".
 */
export default function DayV3Group({
  action,
  children,
  collapsible = false,
  defaultOpen = true,
  deployOnly,
  docs,
  docsLabel,
  id,
  index,
  status,
  subtitle,
  summary,
  title,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  deployOnly?: boolean;
  /** The docs section for this group's subject, if the docs have one. */
  docs?: DayDocsKey;
  docsLabel?: string;
  id?: string;
  index: number;
  status?: DayV3GroupStatus;
  subtitle: string;
  summary?: React.ReactNode;
  title: string;
}) {
  const generatedId = `day-v3-group-${index}-${title
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
  const groupId = id ?? generatedId;
  const contentId = `${groupId}-content`;
  const accordion = useContext(DayV3GroupAccordionContext);
  const groupRef = useRef<HTMLElement>(null);
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const open = accordion ? accordion.openId === groupId : localOpen;
  const toggleOpen = () => {
    if (accordion) {
      if (!open) {
        accordion.open(groupId);
      } else {
        accordion.toggle(groupId);
      }
      return;
    }
    setLocalOpen((current) => !current);
  };

  const missingCount = status?.missing?.length ?? 0;
  const heading = (
    <>
      <span
        aria-hidden="true"
        className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--foreground)] font-mono text-[10px] font-bold leading-none text-[var(--background)]"
      >
        {index}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="grid min-w-0 grid-cols-1 items-baseline gap-x-3 gap-y-1 sm:grid-cols-[180px_minmax(0,1fr)_auto]">
          <span className="text-[13px] font-semibold leading-tight">
            {status?.tone === "incomplete" && status.missing?.length ? (
              <span
                aria-hidden="true"
                className="mr-1 text-[var(--red-emphasis)]"
              >
                *
              </span>
            ) : null}
            {title}
          </span>
          <span className="text-[11px] font-normal leading-tight text-[var(--tertiary)]">
            {subtitle}
          </span>
          {deployOnly ? (
            <span className="rounded-full border border-[var(--border-subtle)] px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--tertiary)]">
              deploy only
            </span>
          ) : null}
        </span>
        {summary ? (
          <span className="text-[10.5px] font-normal leading-snug text-[var(--secondary)]">
            {summary}
          </span>
        ) : null}
      </span>
      {status ? (
        <Badge
          aria-label={`Section status: ${status.label}`}
          data-section-status={status.tone}
          tone={
            status.tone === "complete"
              ? "liquidity"
              : status.tone === "incomplete"
                ? "caution"
                : "neutral"
          }
          className={
            status.tone === "incomplete" && status.missing?.length
              ? "border-[color-mix(in_srgb,var(--theme-red)_40%,transparent)] bg-[color-mix(in_srgb,var(--theme-red)_8%,transparent)] text-[var(--red-emphasis)]"
              : undefined
          }
        >
          {status.label}
        </Badge>
      ) : null}
    </>
  );

  return (
    <section
      ref={groupRef}
      className={cn(
        "flex scroll-mt-6 flex-col",
        collapsible
          ? "rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3 shadow-[0_4px_18px_-16px_rgba(23,25,31,0.55)]"
          : "gap-3 border-t border-[var(--border-subtle)] pt-4 first:border-t-0 first:pt-0",
      )}
      data-collapsible={collapsible || undefined}
      data-section-complete={status?.tone === "complete" || undefined}
      id={id}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2.5 sm:flex sm:flex-wrap sm:items-center">
        {collapsible ? (
          <button
            aria-controls={contentId}
            aria-expanded={open}
            className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-start gap-2.5 rounded-lg text-left outline-none transition-colors hover:bg-[var(--foundation)] focus-visible:ring-2 focus-visible:ring-[var(--foreground)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)] sm:min-w-[220px] sm:items-center"
            onClick={toggleOpen}
            type="button"
          >
            {heading}
            <span
              aria-hidden="true"
              className={cn(
                "mr-1 flex size-7 shrink-0 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--foundation)] text-[var(--tertiary)] transition-transform",
                open && "rotate-180",
              )}
            >
              <svg className="size-3" fill="none" viewBox="0 0 16 16">
                <path
                  d="m4 6 4 4 4-4"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                />
              </svg>
            </span>
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            {heading}
          </div>
        )}
      </div>
      {status?.tone === "incomplete" && missingCount > 0 && open ? (
        <p
          aria-live="polite"
          className="mt-2 rounded-lg border border-[color-mix(in_srgb,var(--theme-red)_24%,var(--border-subtle))] bg-[color-mix(in_srgb,var(--theme-red)_5%,transparent)] px-3 py-2 text-[10.5px] font-medium leading-snug text-[var(--red-emphasis)]"
        >
          Missing {missingCount === 1 ? "answer" : `${missingCount} answers`}: {status.missing?.join(", ")}
        </p>
      ) : null}
      <div
        className={cn(
          "flex flex-col gap-3",
          collapsible && "mt-3 border-t border-[var(--border-subtle)] pt-4",
        )}
        hidden={collapsible && !open}
        id={contentId}
      >
        {action || docs ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {docs ? (
              <DayV3DocsLink label={docsLabel ?? title} topic={docs} />
            ) : (
              <span />
            )}
            {action}
          </div>
        ) : null}
        {children}
      </div>
    </section>
  );
}
