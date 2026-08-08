import assert from "node:assert/strict";

import { applySourceStress, hasObservedDrawdown } from "./series";
import type { DaySeriesPoint } from "./market";

let passed = 0;
const check = (label: string, run: () => void) => {
  run();
  passed += 1;
  console.log(`  ✓ ${label}`);
};

// A monotonically rising source, like the FalconX sample: no drawdown at all.
const rising: DaySeriesPoint[] = Array.from({ length: 21 }, (_, index) => ({
  date: new Date(Date.UTC(2025, 0, 1 + index * 15)).toISOString().slice(0, 10),
  price: 100 * (1 + index * 0.004),
}));

console.log("Day source-stress overlay");

check("a rising source has no drawdown to begin with", () => {
  assert.equal(hasObservedDrawdown(rising), false);
});

check("zero and negative depth leave the series identical", () => {
  assert.deepEqual(applySourceStress(rising, 0), rising);
  assert.deepEqual(applySourceStress(rising, -0.1), rising);
});

check("too-short series are returned untouched", () => {
  const short = rising.slice(0, 3);
  assert.deepEqual(applySourceStress(short, 0.3), short);
});

check("a shock introduces a drawdown the accountant can see", () => {
  assert.equal(hasObservedDrawdown(applySourceStress(rising, 0.2)), true);
});

check("dates are never altered, only prices", () => {
  const stressed = applySourceStress(rising, 0.25);
  assert.deepEqual(stressed.map((p) => p.date), rising.map((p) => p.date));
});

check("the trough is close to the requested depth below the unshocked path", () => {
  const depth = 0.3;
  const stressed = applySourceStress(rising, depth);
  const ratios = stressed.map((point, index) => point.price / rising[index].price);
  const deepest = Math.min(...ratios);
  assert.ok(
    Math.abs(deepest - (1 - depth)) < 1e-9,
    `deepest ratio ${deepest} should equal ${1 - depth}`,
  );
});

check("the shock is a round trip: first and last points are unshocked", () => {
  const stressed = applySourceStress(rising, 0.4);
  assert.equal(stressed[0].price, rising[0].price);
  assert.equal(stressed[stressed.length - 1].price, rising[rising.length - 1].price);
});

check("depth is capped so the source can never reach zero", () => {
  const stressed = applySourceStress(rising, 5);
  assert.ok(Math.min(...stressed.map((p) => p.price)) > 0);
});

check("deeper shocks always produce deeper troughs", () => {
  const troughOf = (depth: number) =>
    Math.min(...applySourceStress(rising, depth).map((point, index) => point.price / rising[index].price));
  assert.ok(troughOf(0.4) < troughOf(0.2));
  assert.ok(troughOf(0.2) < troughOf(0.05));
});

check("the recovery is monotonic out of the trough", () => {
  const stressed = applySourceStress(rising, 0.3);
  const ratios = stressed.map((point, index) => point.price / rising[index].price);
  const troughIndex = ratios.indexOf(Math.min(...ratios));
  for (let index = troughIndex + 1; index < ratios.length; index += 1) {
    assert.ok(
      ratios[index] >= ratios[index - 1] - 1e-12,
      `ratio should not fall after the trough at index ${index}`,
    );
  }
});

console.log(`\nResult: ${passed} passed, 0 failed`);
