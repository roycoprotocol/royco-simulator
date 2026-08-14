import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import DayV3Hero from "@/components/day-v3/DayV3Hero";

const hero = renderToStaticMarkup(<DayV3Hero />);

assert.match(hero, /Royco Day · Market simulator/);
assert.match(
  hero,
  /Design the yield split, protection, and immediate exit in one workflow/,
);
assert.match(
  hero,
  /Set how Senior yield is shared with Junior and SLP, choose the loss Senior should survive, and define the immediate exit/,
);
assert.match(hero, /inspect returns, capital requirements, and exit outcomes/);
// The headline is fluid but capped well below a display size: this sits above
// a dense input panel on a laptop, not on its own landing page.
assert.match(hero, /text-\[clamp\(20px,1\.9vw,26px\)\]/);
assert.match(hero, /lg:grid-cols-\[minmax\(0,1\.35fr\)_minmax\(390px,0\.65fr\)\]/);
assert.match(hero, /Underlying yield/);
assert.match(hero, /First-loss buffer/);
assert.match(hero, /Exit liquidity/);
assert.doesNotMatch(hero, /How the structure works/);
assert.doesNotMatch(hero, /Junior absorbs losses first/);
assert.doesNotMatch(hero, /One workflow/);
assert.doesNotMatch(hero, /Simple/);
assert.doesNotMatch(hero, /Advanced/);
assert.doesNotMatch(hero, /Simulation mode/);
assert.doesNotMatch(hero, /aria-pressed/);
assert.doesNotMatch(hero, /<button/);

console.log("Day V3 main-branch hero presentation: PASS");
