import type { DaySeriesPoint } from "./market";

export type ParsedCadence = "daily" | "monthly";

export function normalizeDate(value: unknown): string | null;

export function parseSourceText(
  text: string,
  options?: {
    contentType?: string;
    label?: string;
  },
): DaySeriesPoint[];

export function inferCadence(series: DaySeriesPoint[]): ParsedCadence;
