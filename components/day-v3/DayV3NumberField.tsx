"use client";

import { useState } from "react";

import DayV3Button from "@/components/day-v3/DayV3Button";
import DayV3Origin, {
  type DayV3VisibleOrigin,
} from "@/components/day-v3/DayV3Origin";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type DayV3NumberPreset = {
  label: string;
  value: number;
};

export type DayV3NumberDraft =
  | { status: "empty"; value: null; error: null }
  | { status: "valid"; value: number; error: null }
  | { status: "invalid"; value: null; error: string };

export function parseDayV3NumberDraft({
  max,
  min,
  raw,
  wholeNumber = false,
}: {
  max: number;
  min: number;
  raw: string;
  wholeNumber?: boolean;
}): DayV3NumberDraft {
  if (raw.trim() === "") return { status: "empty", value: null, error: null };
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return { status: "invalid", value: null, error: "Enter a number." };
  }
  if (value < min || value > max) {
    return {
      status: "invalid",
      value: null,
      error: `Enter a value from ${min} to ${max}.`,
    };
  }
  if (wholeNumber && !Number.isInteger(value)) {
    return {
      status: "invalid",
      value: null,
      error: "Enter a whole number of days.",
    };
  }
  return { status: "valid", value, error: null };
}

const shown = (value: number | null) => (value === null ? "" : String(value));

export function dayV3NumberFieldId(
  label: string,
  min: number,
  max: number,
  suffix: string,
) {
  const seed = `${label}\u0000${min}\u0000${max}\u0000${suffix}`;
  let hash = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `day-v3-number-${(hash >>> 0).toString(36)}`;
}

/**
 * A numeric control that never deletes a reader's draft while they type.
 * Valid drafts update the model immediately. Invalid drafts stay visible with
 * a local error, so the last valid accountant run remains on screen.
 */
type DayV3NumberFieldProps = {
  className?: string;
  label: string;
  max: number;
  min: number;
  note: string;
  onChange: (value: number | null) => void;
  origin?: DayV3VisibleOrigin;
  placeholder: string;
  prefix?: string;
  presets?: DayV3NumberPreset[];
  required?: boolean;
  step?: number;
  suffix: string;
  value: number | null;
  wholeNumber?: boolean;
};

function StableDayV3NumberField({
  className,
  label,
  max,
  min,
  note,
  onChange,
  origin = "your-answer",
  placeholder,
  prefix,
  presets = [],
  required = false,
  step = 1,
  suffix,
  value,
  wholeNumber = false,
}: DayV3NumberFieldProps) {
  const id = dayV3NumberFieldId(label, min, max, suffix);
  const errorId = `${id}-error`;
  const labelId = `${id}-label`;
  const noteId = `${id}-note`;
  const unitId = `${id}-unit`;
  const [editor, setEditor] = useState({
    draft: shown(value),
    editing: false,
    sourceValue: value,
  });
  if (!editor.editing && !Object.is(editor.sourceValue, value)) {
    setEditor({ draft: shown(value), editing: false, sourceValue: value });
  }
  const parsed = parseDayV3NumberDraft({
    max,
    min,
    raw: editor.draft,
    wholeNumber,
  });
  const missing = required && value === null && parsed.status !== "invalid";

  const choose = (next: number) => {
    setEditor({ draft: shown(next), editing: false, sourceValue: next });
    onChange(next);
  };

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-xl border bg-[var(--card)] px-3 py-3 transition-[border-color,box-shadow]",
        parsed.status === "invalid" || missing
          ? "border-[color-mix(in_srgb,var(--theme-brown)_60%,var(--border-subtle))]"
          : "border-[var(--border-subtle)] hover:border-[var(--secondary)] focus-within:border-[var(--foreground)] focus-within:shadow-[0_2px_10px_-4px_rgba(23,25,31,0.24)]",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-2">
        <span className="flex items-start justify-between gap-3">
          <label
            className="cursor-pointer text-[12px] font-semibold leading-snug"
            htmlFor={id}
            id={labelId}
          >
            {required ? (
              <span
                aria-hidden="true"
                className="mr-1 text-[var(--red-emphasis)]"
              >
                *
              </span>
            ) : null}
            {label}
          </label>
          <span className="flex shrink-0 items-center gap-2">
            {missing ? (
              <Badge
                className="border-[color-mix(in_srgb,var(--theme-red)_40%,transparent)] bg-[color-mix(in_srgb,var(--theme-red)_8%,transparent)] text-[var(--red-emphasis)]"
                tone="caution"
              >
                Missing
              </Badge>
            ) : null}
            <DayV3Origin origin={origin} />
          </span>
        </span>
        <span className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--foundation)] px-2 py-2 focus-within:border-[var(--foreground)]">
          {prefix ? (
            <span
              aria-hidden="true"
              className="shrink-0 font-mono text-[17px] font-bold leading-none text-[var(--secondary)]"
            >
              {prefix}
            </span>
          ) : null}
          <input
            aria-describedby={`${unitId} ${noteId}${parsed.error ? ` ${errorId}` : ""}`}
            aria-invalid={parsed.status === "invalid"}
            aria-labelledby={labelId}
            aria-required={required}
            className="min-w-0 flex-1 bg-transparent font-mono text-[17px] font-bold leading-none tabular-nums outline-none placeholder:font-sans placeholder:text-[12px] placeholder:font-normal placeholder:text-[var(--tertiary)]"
            id={id}
            inputMode={wholeNumber ? "numeric" : "decimal"}
            max={max}
            min={min}
            onBlur={() => {
              if (parsed.status === "empty") {
                setEditor({ draft: "", editing: false, sourceValue: null });
                onChange(null);
                return;
              }
              if (parsed.status === "valid") {
                setEditor({
                  draft: shown(parsed.value),
                  editing: false,
                  sourceValue: parsed.value,
                });
                onChange(parsed.value);
                return;
              }
              setEditor((current) => ({
                ...current,
                editing: false,
                sourceValue: value,
              }));
            }}
            onChange={(event) => {
              const raw = event.target.value;
              setEditor((current) => ({
                ...current,
                draft: raw,
                editing: true,
              }));
              const next = parseDayV3NumberDraft({
                max,
                min,
                raw,
                wholeNumber,
              });
              if (next.status === "valid") onChange(next.value);
            }}
            onFocus={() =>
              setEditor((current) => ({ ...current, editing: true }))
            }
            placeholder={placeholder}
            step={step}
            type="number"
            required={required}
            value={editor.draft}
          />
          <span
            aria-hidden="true"
            className="shrink-0 text-[10.5px] font-semibold text-[var(--tertiary)]"
          >
            {suffix}
          </span>
          <span className="sr-only" id={unitId}>
            {[prefix, suffix].filter(Boolean).join(" ")}
          </span>
        </span>
      </div>

      {presets.length > 0 ? (
        <div aria-label={`${label} common choices`} className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <DayV3Button
              aria-pressed={parsed.status === "valid" && parsed.value === preset.value}
              key={`${preset.label}-${preset.value}`}
              className={
                parsed.status === "valid" && parsed.value === preset.value
                  ? undefined
                  : "border-[var(--border-subtle)] bg-[var(--foundation)]"
              }
              onClick={() => choose(preset.value)}
              size="chip"
              variant={
                parsed.status === "valid" && parsed.value === preset.value
                  ? "primary"
                  : "quiet"
              }
            >
              {preset.label}
            </DayV3Button>
          ))}
        </div>
      ) : null}

      {parsed.error ? (
        <span
          className="text-[10.5px] font-medium leading-relaxed text-[var(--theme-brown)]"
          id={errorId}
          role="alert"
        >
          {parsed.error} The previous valid model remains visible.
        </span>
      ) : null}
      <span
        className="text-[10px] leading-snug text-[var(--tertiary)]"
        id={noteId}
      >
        {note}
      </span>
    </div>
  );
}

export default function DayV3NumberField(props: DayV3NumberFieldProps) {
  return <StableDayV3NumberField {...props} />;
}
