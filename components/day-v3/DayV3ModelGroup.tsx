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
  id,
  index,
  preview,
  title,
}: {
  children: React.ReactNode;
  id: string;
  index: number;
  preview: React.ReactNode;
  title: string;
}) {
  const accordion = useContext(ModelAccordionContext);
  const [localOpen, setLocalOpen] = useState(false);
  const open = accordion ? accordion.openId === id : localOpen;
  const contentId = `${id}-content`;
  const toggle = () => {
    if (accordion) {
      accordion.toggle(id);
    } else setLocalOpen((current) => !current);
  };

  return (
    <section
      className="flex scroll-mt-6 flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-2.5 shadow-[0_4px_18px_-16px_rgba(23,25,31,0.55)]"
      data-model-group={id}
    >
      <button
        aria-controls={contentId}
        aria-expanded={open}
        className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-lg text-left outline-none transition-colors hover:bg-[var(--foundation)] focus-visible:ring-2 focus-visible:ring-[var(--foreground)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)]"
        onClick={toggle}
        type="button"
      >
        <span
          aria-hidden="true"
          className="flex size-7 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--foundation)] font-mono text-[10px] font-bold text-[var(--secondary)]"
        >
          {index}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[13.5px] font-semibold leading-tight">
            {title}
          </span>
          <span className="text-[11px] leading-snug text-[var(--secondary)]">
            {preview}
          </span>
        </span>
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
      <div
        className="mt-3 flex flex-col gap-4 border-t border-[var(--border-subtle)] pt-4"
        hidden={!open}
        id={contentId}
      >
        {children}
      </div>
    </section>
  );
}
