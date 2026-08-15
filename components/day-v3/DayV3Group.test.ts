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

const groupProps: ComponentProps<typeof DayV3Group> = {
  children: createElement("p", null, "Inputs"),
  collapsible: true,
  docs: "coverage",
  docsLabel: "How Junior protects Senior",
  index: 2,
  status: { label: "Example", tone: "review" },
  subtitle: "Choose a loss",
  title: "Senior protection",
};
const groupMarkup = renderToStaticMarkup(
  createElement(DayV3Group, groupProps),
);
assert.match(groupMarkup, /Section status: Example/);
assert.doesNotMatch(groupMarkup, /See .*impact/i);
// Reference material reads as a footer, after the controls it explains. Above
// them it took a whole row before the reader had reached anything to look up.
assert.ok(
  groupMarkup.indexOf("How Junior protects Senior") >
    groupMarkup.indexOf(">Inputs<"),
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
