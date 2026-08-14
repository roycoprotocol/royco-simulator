"use client";

import { useState, type ReactNode } from "react";

import { DAY_V3_CONTROL_FOCUS } from "@/components/day-v3/DayV3Button";
import { cn } from "@/lib/utils";

/** Shared disclosure geometry for card-sized and inline supporting details. */
export default function DayV3Disclosure({
  children,
  className,
  contentClassName,
  defaultOpen = false,
  description,
  summary,
  variant = "card",
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  defaultOpen?: boolean;
  description?: ReactNode;
  summary: ReactNode;
  variant?: "card" | "inline";
}) {
  const card = variant === "card";
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className={cn(
        "group",
        card
          ? "rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3"
          : "w-fit",
        className,
      )}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      open={open}
    >
      <summary
        className={cn(
          "cursor-pointer list-none [&::-webkit-details-marker]:hidden",
          DAY_V3_CONTROL_FOCUS,
          card
            ? "-mx-1 flex min-h-11 items-center justify-between gap-4 rounded-lg px-1 text-[12px] font-semibold"
            : "inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--card)] px-3 text-[10.5px] font-semibold text-[var(--secondary)] transition-colors hover:border-[var(--secondary)] hover:text-[var(--foreground)]",
        )}
      >
        <span className={cn(card && "flex min-w-0 flex-col gap-0.5")}>
          <span>{summary}</span>
          {description ? (
            <span className="text-[10.5px] font-normal text-[var(--tertiary)]">
              {description}
            </span>
          ) : null}
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "flex shrink-0 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--foundation)] text-[var(--tertiary)] transition-transform group-open:rotate-180",
            card ? "size-7" : "size-5",
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
      </summary>
      <div
        className={cn(
          card ? "mt-3 border-t border-[var(--border-subtle)] pt-3" : "mt-1.5",
          contentClassName,
        )}
      >
        {children}
      </div>
    </details>
  );
}
