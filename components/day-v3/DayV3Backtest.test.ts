import assert from "node:assert/strict";

import { formatDayV3MonthlyReturn } from "@/components/day-v3/DayV3Backtest";

assert.equal(formatDayV3MonthlyReturn(0.01234), "+1.23%");
assert.equal(formatDayV3MonthlyReturn(-0.01234), "-1.23%");
assert.equal(formatDayV3MonthlyReturn(Number.POSITIVE_INFINITY), "N/A");
assert.equal(formatDayV3MonthlyReturn(Number.NEGATIVE_INFINITY), "N/A");
assert.equal(formatDayV3MonthlyReturn(Number.NaN), "N/A");

console.log("Day V3 non-finite monthly return presentation: PASS");
