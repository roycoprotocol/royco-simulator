"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import {
  DAY_V3_CONTROL_FOCUS,
  DAY_V3_CONTROL_MOTION,
} from "@/components/day-v3/DayV3Button";
import type { DayMarket } from "@/lib/day-simulator-template/market";
import { cn } from "@/lib/utils";

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

const sourceName = (market: DayMarket) => market.identity.marketName.trim();

const assetName = (market: DayMarket) =>
  market.identity.displayAssetName.trim();

const hasDistinctAssetName = (market: DayMarket) =>
  sourceName(market).toLocaleLowerCase() !==
  assetName(market).toLocaleLowerCase();

const historyLabel = (market: DayMarket) => {
  const observations = market.series.length;
  return observations >= 3
    ? `${observations.toLocaleString("en-US")} observations`
    : "Yield only";
};

const searchableLabel = (market: DayMarket) =>
  `${sourceName(market)} ${assetName(market)}`.toLocaleLowerCase();

/**
 * The registered-source picker.
 *
 * A native select left the open state entirely to the operating system, so it
 * could show only one undifferentiated line per source. This listbox keeps the
 * market name, asset, yield and history visible while someone compares options,
 * without bringing a menu dependency into the simulator.
 */
export default function DayV3MarketSelect({
  markets,
  onChange,
  value,
}: {
  markets: readonly DayMarket[];
  onChange: (marketId: string) => void;
  value: string;
}) {
  const selectedIndex = Math.max(
    0,
    markets.findIndex((market) => market.id === value),
  );
  const selectedMarket = markets[selectedIndex];
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const typeaheadRef = useRef("");
  const typeaheadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listboxId = useId();

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    const frame = requestAnimationFrame(() => listRef.current?.focus());

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", closeOnOutsidePress);
    };
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  useEffect(
    () => () => {
      if (typeaheadTimerRef.current) clearTimeout(typeaheadTimerRef.current);
    },
    [],
  );

  if (!selectedMarket) return null;

  const restoreTriggerFocus = () =>
    requestAnimationFrame(() => triggerRef.current?.focus());

  const choose = (index: number) => {
    const market = markets[index];
    if (!market) return;
    onChange(market.id);
    setOpen(false);
    restoreTriggerFocus();
  };

  const moveActive = (nextIndex: number) => {
    const count = markets.length;
    setActiveIndex(((nextIndex % count) + count) % count);
  };

  const handleListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(activeIndex + 1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(activeIndex - 1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(markets.length - 1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(activeIndex);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      restoreTriggerFocus();
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (
      event.key.length !== 1 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }

    typeaheadRef.current += event.key.toLocaleLowerCase();
    if (typeaheadTimerRef.current) clearTimeout(typeaheadTimerRef.current);
    typeaheadTimerRef.current = setTimeout(() => {
      typeaheadRef.current = "";
    }, 700);
    const match = markets.findIndex((market) =>
      searchableLabel(market).startsWith(typeaheadRef.current),
    );
    if (match >= 0) setActiveIndex(match);
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "group flex min-h-[76px] w-full cursor-pointer items-center justify-between gap-4 rounded-xl border bg-[var(--card)] px-4 py-3 text-left hover:border-[var(--secondary)]",
          DAY_V3_CONTROL_MOTION,
          DAY_V3_CONTROL_FOCUS,
          open
            ? "border-[var(--foreground)] bg-[var(--background)] shadow-[0_8px_22px_-14px_rgba(23,25,31,0.55)]"
            : "border-[var(--border-subtle)]",
        )}
        onClick={() => {
          if (!open) setActiveIndex(selectedIndex);
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          setActiveIndex(
            event.key === "ArrowUp" ? markets.length - 1 : selectedIndex,
          );
          setOpen(true);
        }}
        ref={triggerRef}
        type="button"
      >
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[var(--tertiary)]">
            Listed yield source
          </span>
          <span className="truncate text-[15px] font-semibold leading-tight">
            {sourceName(selectedMarket)}
          </span>
          <span className="truncate text-[10.5px] leading-snug text-[var(--tertiary)]">
            {hasDistinctAssetName(selectedMarket)
              ? `${assetName(selectedMarket)} · `
              : ""}
            {historyLabel(selectedMarket)}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span className="flex flex-col items-end gap-0.5">
            <span className="font-mono text-[15px] font-bold leading-none tabular-nums">
              {percent(selectedMarket.defaults.sourceApy)}
            </span>
            <span className="text-[9px] uppercase tracking-[0.1em] text-[var(--tertiary)]">
              net APY
            </span>
          </span>
          <svg
            aria-hidden="true"
            className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 16 16"
          >
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

      {open ? (
        <div className="absolute inset-x-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--background)] shadow-[0_18px_45px_-18px_rgba(23,25,31,0.55)]">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[var(--tertiary)]">
              Choose a source
            </span>
            <span className="font-mono text-[10px] tabular-nums text-[var(--tertiary)]">
              {markets.length} listed
            </span>
          </div>
          <div
            aria-activedescendant={`${listboxId}-option-${activeIndex}`}
            aria-label="Listed yield sources"
            className={cn(
              "max-h-[330px] overflow-y-auto rounded-lg p-1.5 focus:outline-none",
              DAY_V3_CONTROL_FOCUS,
            )}
            id={listboxId}
            onKeyDown={handleListKeyDown}
            ref={listRef}
            role="listbox"
            tabIndex={-1}
          >
            {markets.map((market, index) => {
              const selected = market.id === selectedMarket.id;
              const active = index === activeIndex;
              return (
                <button
                  aria-selected={selected}
                  className={cn(
                    "grid min-h-14 w-full cursor-pointer grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors focus:outline-none",
                    selected
                      ? "bg-[#fff1bd]"
                      : "hover:bg-[var(--foundation)]",
                    active &&
                      (selected
                        ? "ring-1 ring-inset ring-[var(--foreground)]"
                        : "bg-[var(--foundation)] ring-1 ring-inset ring-[var(--foreground)]"),
                  )}
                  id={`${listboxId}-option-${index}`}
                  key={market.id}
                  onClick={() => choose(index)}
                  onMouseEnter={() => setActiveIndex(index)}
                  ref={(node) => {
                    optionRefs.current[index] = node;
                  }}
                  role="option"
                  tabIndex={-1}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className={`flex size-5 items-center justify-center rounded-full border ${
                      selected
                        ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]"
                        : "border-[var(--border-subtle)] bg-[var(--card)] text-transparent"
                    }`}
                  >
                    <svg fill="none" viewBox="0 0 16 16" className="size-3">
                      <path
                        d="m3.5 8.2 2.7 2.7 6.3-6.1"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.8"
                      />
                    </svg>
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[12.5px] font-semibold leading-tight">
                      {sourceName(market)}
                    </span>
                    <span className="truncate text-[10px] leading-snug text-[var(--tertiary)]">
                      {hasDistinctAssetName(market)
                        ? `${assetName(market)} · `
                        : ""}
                      {historyLabel(market)}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-0.5 pl-2">
                    <span className="font-mono text-[12px] font-bold leading-none tabular-nums">
                      {percent(market.defaults.sourceApy)}
                    </span>
                    <span className="text-[8.5px] uppercase tracking-[0.08em] text-[var(--tertiary)]">
                      net APY
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="border-t border-[var(--border-subtle)] px-4 py-2 text-[9.5px] text-[var(--tertiary)]">
            Use arrow keys to compare. Enter selects.
          </p>
        </div>
      ) : null}
    </div>
  );
}
