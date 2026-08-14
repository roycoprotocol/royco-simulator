import assert from "node:assert/strict";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  default as DayV3Group,
  nextDayV3AccordionOpenId,
} from "@/components/day-v3/DayV3Group";

assert.equal(
  nextDayV3AccordionOpenId(null, "source"),
  "source",
  "a closed accordion opens the requested section",
);

const headerProps: ComponentProps<typeof DayV3Group> = {
  children: createElement("p", null, "Inputs"),
  collapsible: true,
  docs: "coverage",
  docsLabel: "How Junior protects Senior",
  index: 2,
  status: { label: "Example", tone: "review" },
  subtitle: "Choose a loss",
  title: "Senior protection",
};
const headerMarkup = renderToStaticMarkup(
  createElement(DayV3Group, headerProps),
);
assert.match(headerMarkup, /Section status: Example/);
// The header carries the choice and nothing else. Jump links to the model
// sections lived here and were pure noise beside every heading.
assert.doesNotMatch(headerMarkup, /See loss impact|See impact|day-v3-risk-models/);
// Reference material reads as a footer, after the controls it explains.
const docsIndex = headerMarkup.indexOf("How Junior protects Senior");
assert.ok(
  docsIndex > headerMarkup.indexOf(">Inputs<"),
  "the docs link must follow the section body, not precede it",
);
assert.equal(
  nextDayV3AccordionOpenId("source", "protection"),
  "protection",
  "opening a different section replaces the currently open section",
);
assert.equal(
  nextDayV3AccordionOpenId("protection", "protection"),
  null,
  "clicking the open section closes it",
);

console.log("Day V3 input accordion: PASS");
