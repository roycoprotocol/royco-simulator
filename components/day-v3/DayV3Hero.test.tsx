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
assert.match(hero, /text-\[clamp\(25px,2\.5vw,35px\)\]/);
assert.match(hero, /lg:grid-cols-\[minmax\(0,1\.35fr\)_minmax\(390px,0\.65fr\)\]/);
assert.match(hero, /Underlying yield/);
assert.match(hero, /First-loss buffer/);
assert.match(hero, /Exit liquidity/);
assert.match(hero, /Junior absorbs losses first/);
assert.match(hero, /SLP supports exits/);
assert.match(hero, /Senior retains payment priority/);
assert.match(hero, /One workflow/);
assert.match(hero, />Yield split</);
assert.match(hero, />Protection</);
assert.match(hero, />Immediate exit</);
assert.match(hero, />Outcomes</);
assert.doesNotMatch(hero, /Simple/);
assert.doesNotMatch(hero, /Advanced/);
assert.doesNotMatch(hero, /Simulation mode/);
assert.doesNotMatch(hero, /aria-pressed/);
assert.doesNotMatch(hero, /<button/);

console.log("Day V3 main-branch hero presentation: PASS");
