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

const impactProps: ComponentProps<typeof DayV3Group> = {
  children: createElement("p", null, "Inputs"),
  collapsible: true,
  impactHref: "#day-v3-risk-models",
  impactLabel: "See loss impact",
  index: 2,
  status: { label: "Example", tone: "review" },
  subtitle: "Choose a loss",
  title: "Senior protection",
};
const impactMarkup = renderToStaticMarkup(
  createElement(DayV3Group, impactProps),
);
assert.match(impactMarkup, /Section status: Example/);
assert.match(impactMarkup, /href="#day-v3-risk-models"/);
assert.match(impactMarkup, /See loss impact/);
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
