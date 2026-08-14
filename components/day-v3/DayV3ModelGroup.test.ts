import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import DayV3ModelGroup, {
  nextDayV3ModelOpenId,
} from "@/components/day-v3/DayV3ModelGroup";

assert.equal(nextDayV3ModelOpenId(null, "capital"), "capital");
assert.equal(
  nextDayV3ModelOpenId("capital", "risk"),
  "risk",
  "opening one model group closes the previous group",
);
assert.equal(nextDayV3ModelOpenId("risk", "risk"), null);

const closedGroup = renderToStaticMarkup(
  createElement(
    DayV3ModelGroup,
    {
      id: "capital",
      index: 1,
      preview: "Capital preview remains visible",
      title: "Capital stack",
    },
    createElement("span", null, "Expensive chart content"),
  ),
);

assert.match(closedGroup, /aria-expanded="false"/);
assert.match(closedGroup, /id="capital"/);
assert.match(closedGroup, /id="capital-content"/);
assert.match(closedGroup, /Capital preview remains visible/);
assert.doesNotMatch(
  closedGroup,
  /Expensive chart content/,
  "closed model details should not mount",
);
assert.doesNotMatch(closedGroup, /hidden=""/);

console.log("Day V3 model accordion: PASS");
