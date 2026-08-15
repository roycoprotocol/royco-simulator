import assert from "node:assert/strict";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import DayV3DeploymentTarget, {
  resolveDayV3DeploymentTarget,
} from "@/components/day-v3/DayV3DeploymentTarget";

const selected = { chainId: 1, templateId: "balancer-v3-eclp" };

assert.deepEqual(
  resolveDayV3DeploymentTarget("1:balancer-v3-eclp", [], selected),
  selected,
  "a selected target remains selectable while live inventory is unavailable",
);
assert.equal(
  resolveDayV3DeploymentTarget("", [], selected),
  null,
  "the empty option clears the target",
);

const markup = renderToStaticMarkup(
  <DayV3DeploymentTarget
    message="Live deployment targets could not be loaded."
    onTarget={() => undefined}
    selected={selected}
    targets={[]}
  />,
);

assert.match(markup, /aria-label="Chain and market template"/);
assert.match(markup, /<select(?![^>]*disabled)/);
assert.match(markup, /Live target list unavailable/);
assert.match(markup, /1:balancer-v3-eclp · validation pending/);
assert.doesNotMatch(markup, /1:balancer-v3-eclp · unavailable/);

const missingMarkup = renderToStaticMarkup(
  <DayV3DeploymentTarget
    message="Choose a live target."
    onTarget={() => undefined}
    selected={null}
    targets={[]}
  />,
);
assert.match(missingMarkup, /aria-required="true"/);
assert.match(missingMarkup, />Missing</);

console.log("Day V3 deployment-target selector: PASS");
