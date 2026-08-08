import type { DaySeriesPoint } from "./market";

const DAY_MS = 86_400_000;

export function annualizedSeriesApy(series: DaySeriesPoint[]): number {
  if (series.length < 2) return 0;
  const first = series[0];
  const last = series[series.length - 1];
  const elapsedDays = (Date.parse(last.date) - Date.parse(first.date)) / DAY_MS;
  return elapsedDays > 0 && first.price > 0 && last.price > 0
    ? Math.pow(last.price / first.price, 365 / elapsedDays) - 1
    : 0;
}

export function hasObservedDrawdown(series: DaySeriesPoint[]): boolean {
  return series.some((point, index) => index > 0 && point.price < series[index - 1].price);
}

// A hypothetical drawdown-and-recovery shock laid over an already-calibrated
// source path, so the coverage waterfall, Observation Period, and Sr loss marks
// can be exercised on sample data that never actually declines. This only
// reshapes the source input the accountant reads; it performs no accounting.
//
// The envelope descends from the onset to the trough, holds one step at the
// trough, then recovers to the unshocked path, leaving the start and end of the
// window untouched so the shock reads as a round trip rather than a level shift.
export function applySourceStress(
  series: DaySeriesPoint[],
  stressDepth: number,
  { onset = 0.25, trough = 0.5, recovered = 0.8 } = {},
): DaySeriesPoint[] {
  if (series.length < 4 || !(stressDepth > 0)) return series;
  const depth = Math.min(stressDepth, 0.95);
  const lastIndex = series.length - 1;
  const onsetIndex = Math.round(lastIndex * onset);
  const troughIndex = Math.max(onsetIndex + 1, Math.round(lastIndex * trough));
  const recoveredIndex = Math.max(troughIndex + 1, Math.round(lastIndex * recovered));
  return series.map((point, index) => {
    let shock = 0;
    if (index > onsetIndex && index <= troughIndex) {
      shock = depth * ((index - onsetIndex) / (troughIndex - onsetIndex));
    } else if (index > troughIndex && index < recoveredIndex) {
      shock = depth * (1 - (index - troughIndex) / (recoveredIndex - troughIndex));
    }
    return shock > 0 ? { ...point, price: point.price * (1 - shock) } : point;
  });
}

export function calibrateSeriesApy(
  series: DaySeriesPoint[],
  targetApy: number,
): DaySeriesPoint[] {
  if (series.length < 2 || targetApy <= -1) return series;
  const first = series[0];
  const last = series[series.length - 1];
  const firstTime = Date.parse(first.date);
  const lastTime = Date.parse(last.date);
  const elapsedMs = lastTime - firstTime;
  if (!(first.price > 0 && last.price > 0 && elapsedMs > 0)) return series;

  const sourceLogGrowth = Math.log(last.price / first.price);
  const elapsedYears = elapsedMs / (365 * DAY_MS);
  const targetLogGrowth = Math.log1p(targetApy) * elapsedYears;
  return series.map((point) => {
    const progress = Math.max(0, Math.min(1, (Date.parse(point.date) - firstTime) / elapsedMs));
    const sourceLogPath = Math.log(point.price / first.price);
    const pathResidual = sourceLogPath - sourceLogGrowth * progress;
    return {
      ...point,
      price: first.price * Math.exp(pathResidual + targetLogGrowth * progress),
    };
  });
}
