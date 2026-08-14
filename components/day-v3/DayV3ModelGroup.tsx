"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";

import { cn } from "@/lib/utils";

type ModelAccordionValue = {
  openId: string | null;
  toggle: (id: string) => void;
};

const ModelAccordionContext = createContext<ModelAccordionValue | null>(null);

export function nextDayV3ModelOpenId(
  current: string | null,
  requested: string,
) {
  return current === requested ? null : requested;
}

export function DayV3ModelAccordion({
  children,
}: {
  children: React.ReactNode;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const value = useMemo<ModelAccordionValue>(
    () => ({
      openId,
      toggle: (id) => setOpenId((current) => nextDayV3ModelOpenId(current, id)),
    }),
    [openId],
  );

  return (
    <ModelAccordionContext.Provider value={value}>
      {children}
    </ModelAccordionContext.Provider>
  );
}

/**
 * A result section with its useful answer kept in the collapsed row. Model
 * sections share one accordion so opening detail never turns the page back
 * into a wall of charts and tables.
 */
export default function DayV3ModelGroup({
  children,
  disabledReason,
  id,
  index,
  preview,
  title,
}: {
  children?: React.ReactNode;
  /**
   * Set when the tranche this section models is switched off. There is nothing
   * to draw, so the section is greyed, cannot be opened, and says why in place
   * of its preview rather than rendering charts of a market that has no Junior
   * or no SLP in it.
   */
  disabledReason?: string | null;
  id: string;
  index: number;
  preview: React.ReactNode;
  title: string;
}) {
  const accordion = useContext(ModelAccordionContext);
  const [localOpen, setLocalOpen] = useState(false);
  const disabled = Boolean(disabledReason);
  const open = disabled ? false : accordion ? accordion.openId === id : localOpen;
  const contentId = `${id}-content`;
  const toggle = () => {
    if (disabled) return;
    if (accordion) {
      accordion.toggle(id);
    } else setLocalOpen((current) => !current);
  };

  const heading = (
    <>
      <span
        aria-hidden="true"
        className="flex size-7 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--foundation)] font-mono text-[10px] font-bold text-[var(--secondary)]"
      >
        {index}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span
          aria-level={3}
          className="text-[13.5px] font-semibold leading-tight"
          role="heading"
        >
          {title}
        </span>
        <span className="text-[11px] leading-snug text-[var(--secondary)]">
          {disabled ? disabledReason : preview}
        </span>
      </span>
    </>
  );

  return (
    <section
      className={cn(
        "flex scroll-mt-6 flex-col rounded-xl border border-[var(--border-subtle)] px-4 py-3",
        disabled
          ? "bg-[var(--background)] opacity-55"
          : "bg-[var(--card)] shadow-[0_4px_18px_-16px_rgba(23,25,31,0.55)]",
      )}
      data-model-group={id}
      data-model-disabled={disabled || undefined}
      id={id}
    >
      {disabled ? (
        // Not a disabled button but no button at all: an inert control that
        // still looks pressable is a worse answer than a section that plainly
        // has nothing behind it.
        <div className="flex min-h-11 w-full items-center gap-3">
          {heading}
          <span className="mr-1 shrink-0 rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--tertiary)]">
            off
          </span>
        </div>
      ) : (
        <button
          aria-controls={contentId}
          aria-expanded={open}
          className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg text-left outline-none transition-colors hover:bg-[var(--foundation)] focus-visible:ring-2 focus-visible:ring-[var(--foreground)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)]"
          onClick={toggle}
          type="button"
        >
          {heading}
          <span
            aria-hidden="true"
            className={cn(
              "mr-1 flex size-8 shrink-0 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--foundation)] text-[var(--tertiary)] transition-transform",
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
      )}
      <div id={contentId}>
        {open ? (
          <div className="mt-3 flex flex-col gap-3 border-t border-[var(--border-subtle)] pt-3">
            {children}
          </div>
        ) : null}
      </div>
    </section>
  );
}
