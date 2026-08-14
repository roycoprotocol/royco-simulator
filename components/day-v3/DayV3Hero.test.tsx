import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import DayV3Hero from "@/components/day-v3/DayV3Hero";

const ignore = () => undefined;
const simulate = renderToStaticMarkup(
  <DayV3Hero mode="simulate" onModeChange={ignore} />,
);

assert.match(simulate, /Royco Day · Market simulator/);
assert.match(
  simulate,
  /Design liquidity and drawdown protection around one yield source/,
);
assert.match(simulate, /text-\[clamp\(27px,2\.8vw,39px\)\]/);
assert.match(simulate, /Underlying yield/);
assert.match(simulate, /First-loss buffer/);
assert.match(simulate, /Exit liquidity/);
assert.match(simulate, /Junior absorbs losses first/);
assert.match(simulate, /SLP supports exits/);
assert.match(simulate, /Senior retains payment priority/);
assert.match(simulate, /V3 derives the Junior and SLP requirements/);
assert.match(simulate, /per \$100 Senior/);
assert.match(simulate, /Explore how the protocol works/);
assert.match(simulate, /aria-label="Simulation mode"/);
assert.match(simulate, /aria-pressed="true"[^>]*>Simulate/);
assert.match(simulate, /aria-pressed="false"[^>]*>Deploy/);

const deploy = renderToStaticMarkup(
  <DayV3Hero mode="deploy" onModeChange={ignore} />,
);
assert.match(deploy, /Finalize a market design/);
assert.match(deploy, /aria-pressed="false"[^>]*>Simulate/);
assert.match(deploy, /aria-pressed="true"[^>]*>Deploy/);

console.log("Day V3 main-branch hero presentation: PASS");
