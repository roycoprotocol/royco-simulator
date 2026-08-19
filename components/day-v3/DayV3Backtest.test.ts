import assert from "node:assert/strict";

import {
  buildDayV3BacktestWindows,
  formatDayV3MonthlyReturn,
} from "@/components/day-v3/DayV3Backtest";

assert.equal(formatDayV3MonthlyReturn(0.01234), "+1.23%");
assert.equal(formatDayV3MonthlyReturn(-0.01234), "-1.23%");
assert.equal(formatDayV3MonthlyReturn(Number.POSITIVE_INFINITY), "N/A");
assert.equal(formatDayV3MonthlyReturn(Number.NEGATIVE_INFINITY), "N/A");
assert.equal(formatDayV3MonthlyReturn(Number.NaN), "N/A");

const windows = buildDayV3BacktestWindows(
  [
    { date: "2022-12-30" },
    { date: "2023-01-03" },
    { date: "2023-06-30" },
    { date: "2024-01-02" },
    { date: "2024-12-31" },
    { date: "2025-01-02" },
  ],
  {
    id: "2023-2024",
    label: "2023–2024",
    from: "2023-01-01",
    to: "2024-12-31",
  },
);
assert.deepEqual(windows[0], {
  id: "2023-2024",
  label: "2023–2024",
  from: 1,
  to: 5,
});
assert.equal(windows[1].id, "full");

console.log("Day V3 non-finite monthly return presentation: PASS");
