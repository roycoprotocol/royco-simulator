"use client";

// Input controls for the pool creator. Range inputs use `accentColor` and the
// label/value row from the Tenbin `.ctl` pattern.

import type { CSSProperties, ReactNode } from "react";
import { useId } from "react";
import * as T from "@/components/pool-creator/tokens";
import { Hint } from "@/components/pool-creator/primitives";

// ---------------------------------------------------------------------------

/**
 * A range control whose bounds come from the caller — in this wizard they are
 * derived from the engine's reachable band, so an impossible ask is not
 * representable rather than merely rejected.
 */
export function Slider({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
  hint,
  accent = T.C.seniorLine,
  disabled = false,
  footer,
}: {
  label: ReactNode;
  value: number;
  display: ReactNode;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  hint?: ReactNode;
  accent?: string;
  disabled?: boolean;
  footer?: ReactNode;
}) {
  const id = useId();
  return (
    <div style={{ opacity: disabled ? 0.5 : 1 }}>
      <label htmlFor={id} style={T.ctlLabel}>
        <span>{label}</span>
        <b style={T.ctlValue}>{display}</b>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: accent, minHeight: 18 }}
      />
      {hint ? <Hint>{hint}</Hint> : null}
      {footer}
    </div>
  );
}

// ---------------------------------------------------------------------------

const inputStyle: CSSProperties = {
  border: `1px solid ${T.C.border}`,
  background: T.C.cardBg,
  padding: "8px 10px",
  fontSize: 12.5,
  color: T.C.text,
  borderRadius: 0,
  width: "100%",
  fontFamily: "inherit",
};

const monoInputStyle: CSSProperties = {
  ...inputStyle,
  fontFamily: T.MONO,
  fontVariantNumeric: "tabular-nums",
};

export function TextField({
  value,
  onChange,
  placeholder,
  mono = false,
  width,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
  width?: number | string;
  ariaLabel?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...(mono ? monoInputStyle : inputStyle), ...(width ? { width } : null) }}
    />
  );
}

/** A number input that shows and accepts percent, but stores a fraction. */
export function PercentField({
  value,
  onChange,
  step = 0.1,
  min = 0,
  max = 100,
  ariaLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  ariaLabel?: string;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <input
        type="number"
        value={Number((value * 100).toFixed(4))}
        aria-label={ariaLabel}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next)) onChange(next / 100);
        }}
        style={{ ...monoInputStyle, width: 92, textAlign: "right" }}
      />
      <span style={{ color: T.C.muted, fontSize: 12 }}>%</span>
    </span>
  );
}

export function MoneyField({
  value,
  onChange,
  ariaLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  ariaLabel?: string;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ color: T.C.muted, fontSize: 12 }}>$</span>
      <input
        type="number"
        value={value}
        aria-label={ariaLabel}
        min={0}
        step={100_000}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next) && next >= 0) onChange(next);
        }}
        style={{ ...monoInputStyle, width: 150, textAlign: "right" }}
      />
    </span>
  );
}

// ---------------------------------------------------------------------------

export type ChoiceOption<V> = {
  value: V;
  label: string;
  /** The plain-English "good for…" line, Uniswap price-strategy style. */
  caption?: string;
};

/** A row of choice chips. Use when the semantics are clearer as named options. */
export function ChipGroup<V extends string | number>({
  options,
  value,
  onChange,
  columns,
}: {
  options: ReadonlyArray<ChoiceOption<V>>;
  value: V;
  onChange: (value: V) => void;
  columns?: number;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))`,
        gap: 8,
      }}
    >
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          style={T.chip(option.value === value)}
        >
          {option.label}
          {option.caption ? <small style={T.chipSub}>{option.caption}</small> : null}
        </button>
      ))}
    </div>
  );
}

/** A compact segmented control, for 2–4 mutually exclusive modes. */
export function Segmented<V extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: ReadonlyArray<{ value: V; label: string }>;
  value: V;
  onChange: (value: V) => void;
  ariaLabel?: string;
}) {
  return (
    <div style={T.seg} role="tablist" aria-label={ariaLabel}>
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          onClick={() => onChange(option.value)}
          style={T.segButton(option.value === value, index === 0)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
}) {
  return (
    <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 2, accentColor: T.C.accent }}
      />
      <span style={{ fontSize: 12, lineHeight: 1.4, color: T.C.text }}>{label}</span>
    </label>
  );
}

/**
 * A confirmation checkbox. Deliberately heavier than `Toggle`: these carry the
 * consequences the user is accepting, stated in their own numbers.
 */
export function Acknowledgement({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        cursor: "pointer",
        border: `1px solid ${checked ? T.tint.olive(0.32) : T.C.border}`,
        background: checked ? T.tint.olive(0.05) : T.tint.panel(0.7),
        padding: "10px 11px",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 2, accentColor: T.C.olive }}
      />
      <span style={{ fontSize: 11.5, lineHeight: 1.45, color: T.C.text }}>{children}</span>
    </label>
  );
}
