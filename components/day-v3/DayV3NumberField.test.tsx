import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import DayV3NumberField, {
  dayV3NumberFieldId,
  parseDayV3NumberDraft,
} from "@/components/day-v3/DayV3NumberField";

assert.deepEqual(
  parseDayV3NumberDraft({ raw: "", min: 0, max: 100 }),
  { status: "empty", value: null, error: null },
);
assert.deepEqual(
  parseDayV3NumberDraft({ raw: "14.5", min: 0, max: 95 }),
  { status: "valid", value: 14.5, error: null },
);
assert.equal(
  parseDayV3NumberDraft({ raw: "96", min: 0, max: 95 }).status,
  "invalid",
);
assert.equal(
  dayV3NumberFieldId("A stable field", 0, 100, "%"),
  dayV3NumberFieldId("A stable field", 0, 100, "%"),
);
assert.notEqual(
  dayV3NumberFieldId("A stable field", 0, 100, "%"),
  dayV3NumberFieldId("A different field", 0, 100, "%"),
);
assert.equal(
  parseDayV3NumberDraft({
    raw: "7.5",
    min: 0,
    max: 194,
    wholeNumber: true,
  }).error,
  "Enter a whole number of days.",
);

const markup = renderToStaticMarkup(
  <DayV3NumberField
    label="What one-time drop should Senior survive?"
    max={95}
    min={0}
    note="The model derives Minimum Coverage."
    onChange={() => undefined}
    placeholder="Choose a drawdown"
    prefix="$"
    presets={[
      { label: "10%", value: 10 },
      { label: "15%", value: 15 },
    ]}
    step={0.5}
    suffix="%"
    value={15}
  />,
);
assert.match(markup, /What one-time drop should Senior survive/);
assert.match(markup, /Your answer/);
assert.match(markup, /aria-pressed="true"/);
assert.match(markup, /The model derives Minimum Coverage/);
assert.match(markup, />\$</);

const missingMarkup = renderToStaticMarkup(
  <DayV3NumberField
    label="Required amount"
    max={100}
    min={0}
    note="Required for this design."
    onChange={() => undefined}
    placeholder="Enter amount"
    required
    suffix="$"
    value={null}
  />,
);
assert.match(missingMarkup, /aria-required="true"/);
assert.match(missingMarkup, /required=""/);
assert.match(missingMarkup, /aria-label="Required"/);
assert.match(missingMarkup, />Missing</);

console.log("Day V3 stable numeric field: PASS");
