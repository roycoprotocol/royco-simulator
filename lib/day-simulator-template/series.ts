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
