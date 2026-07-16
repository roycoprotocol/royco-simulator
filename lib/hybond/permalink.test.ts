// =============================================================================
// Permalink codec invariant tests.
//
// Run: npx tsx lib/hybond/permalink.test.ts
//
// The contract is a fixed point: state -> query -> state must return the SAME
// state. The bug these pin is a silent one — the writer emitted only the
// mechanism params, so a shared link's deposits and first-loss link reset to the
// defaults on the recipient's screen and the page rendered a different market
// with no error anywhere.
// =============================================================================

import {
  HYBOND_DEFAULT_PARAMS,
  HYBOND_NAV_SERIES,
  PRESETS,
  juniorFromFirstLossPct,
  type HybondParams,
} from "./scenarios";
import { queryFromState, stateFromQuery } from "./permalink";
import type { IndexRange } from "./timeframe";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗ ${name}\x1b[0m ${detail}`);
  }
}

const readQuery = (qs: string) => stateFromQuery(new URLSearchParams(qs));
const fullRange: IndexRange = { a: 0, b: HYBOND_NAV_SERIES.length - 1 };

/** state -> query -> state must be a fixed point. */
function roundTrip(
  label: string,
  params: HybondParams,
  maintain: boolean,
  range: IndexRange = fullRange,
) {
  const qs = queryFromState(params, maintain, range);
  const back = readQuery(qs);
  const same =
    JSON.stringify(params) === JSON.stringify(back.params) &&
    back.maintain === maintain &&
    JSON.stringify(back.range) === JSON.stringify(range);
  check(
    `${label}  ?${qs}`,
    same,
    `\n      sent: ${JSON.stringify(params)} maintain=${maintain} range=${JSON.stringify(range)}\n      got : ${JSON.stringify(back.params)} maintain=${back.maintain} range=${JSON.stringify(back.range)}`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n1. Every expressible state round-trips");
{
  roundTrip("default", { ...HYBOND_DEFAULT_PARAMS }, true);
  for (const p of PRESETS) roundTrip(`preset ${p.id}`, { ...p.params }, true);

  roundTrip(
    "custom LINKED",
    {
      ...HYBOND_DEFAULT_PARAMS,
      depositST: 3000,
      minCoveragePct: 42,
      depositJT: juniorFromFirstLossPct(3000, 42),
      observationDays: 90,
      seniorShareToJuniorPct: 65,
      exitBufferPct: 12.5,
      linkJuniorToFirstLoss: true,
    },
    true,
  );

  // The audit's repro: this exact config used to come back as ST=1000/JT=500/link=true.
  roundTrip(
    "custom UNLINKED (ST=3000, JT=1200, link off)",
    { ...HYBOND_DEFAULT_PARAMS, depositST: 3000, depositJT: 1200, linkJuniorToFirstLoss: false },
    true,
  );

  // The audit's worst case: Junior 173.72 -> 148.67 when this failed to round-trip.
  roundTrip(
    "custom UNLINKED worst case (JT=50, cov=8, ys=20, maintain off)",
    {
      ...HYBOND_DEFAULT_PARAMS,
      depositST: 1000,
      depositJT: 50,
      minCoveragePct: 8,
      seniorShareToJuniorPct: 20,
      observationDays: 7,
      linkJuniorToFirstLoss: false,
    },
    false,
  );

  roundTrip("maintain=false", { ...HYBOND_DEFAULT_PARAMS }, false);
  roundTrip("selected backtest window", { ...HYBOND_DEFAULT_PARAMS }, true, { a: 24, b: 48 });
}

// ---------------------------------------------------------------------------
console.log("\n2. Funding state is actually carried (regression on the reported bug)");
{
  const custom: HybondParams = {
    ...HYBOND_DEFAULT_PARAMS,
    depositST: 3000,
    depositJT: 1200,
    linkJuniorToFirstLoss: false,
  };
  const qs = queryFromState(custom, true);
  const back = readQuery(qs).params;
  check("Senior deposit survives the link", back.depositST === 3000, `got ${back.depositST}`);
  check("Junior deposit survives the link", back.depositJT === 1200, `got ${back.depositJT}`);
  check("the first-loss link state survives", back.linkJuniorToFirstLoss === false);
  check("st is present in the query", qs.includes("st=3000"), qs);
  check("jt is present when unlinked", qs.includes("jt=1200"), qs);
}

// ---------------------------------------------------------------------------
console.log("\n3. Junior is derived, never asserted, while the link is on");
{
  const linked: HybondParams = {
    ...HYBOND_DEFAULT_PARAMS,
    depositST: 2000,
    minCoveragePct: 45,
    depositJT: juniorFromFirstLossPct(2000, 45),
    linkJuniorToFirstLoss: true,
  };
  const qs = queryFromState(linked, true);
  check("jt is NOT emitted while linked (it is derived, and could contradict coverage)", !qs.includes("jt="), qs);

  // A hand-planted jt must lose to the derivation rather than desynchronise Junior
  // from the first-loss % the same URL asks for.
  const hostile = readQuery(`${qs}&jt=9999`).params;
  check(
    "a hand-planted jt is ignored while linked; Junior is re-derived",
    hostile.depositJT === juniorFromFirstLossPct(2000, 45),
    `got ${hostile.depositJT}`,
  );
  check("the derived Junior matches the first-loss relation", Math.abs(hostile.depositJT - 2000 * 45 / (90 - 45)) < 1e-9);
}

// ---------------------------------------------------------------------------
console.log("\n4. Hand-edited URLs clamp to what the controls can express");
{
  const cases: [string, (p: HybondParams) => boolean, string][] = [
    ["preset=custom&link=0&st=999999&jt=999999", (p) => p.depositST === 10000 && p.depositJT === 10000, "clamps to the max"],
    ["preset=custom&link=0&st=-5&jt=-5", (p) => p.depositST === 100 && p.depositJT === 50, "clamps to the min"],
    ["preset=custom&link=0&st=abc&jt=abc", (p) => p.depositST === 1000 && p.depositJT === 300, "non-numeric falls back to the nearest manual-control step"],
    ["preset=custom&link=0&st=1250&jt=1275", (p) => p.depositST === 1300 && p.depositJT === 1300, "snaps to the control step"],
    ["preset=custom&link=0&st=1000&jt=0", (p) => p.depositJT === 50, "a $0 Junior (which the engine rejects) is clamped out"],
    ["preset=custom&coverage=9999", (p) => p.minCoveragePct === 65, "coverage clamps"],
    ["preset=custom&obs=9999", (p) => p.observationDays === 194, "observation clamps to the uint24 ceiling"],
    ["preset=custom&exitBuffer=1e9", (p) => p.exitBufferPct === 99.91, "exit buffer clamps"],
  ];
  for (const [qs, pred, label] of cases) {
    const p = readQuery(qs).params;
    check(`${label}  ?${qs}`, pred(p), `got ST=${p.depositST} JT=${p.depositJT} cov=${p.minCoveragePct} obs=${p.observationDays} buf=${p.exitBufferPct}`);
  }

  // No URL may produce a config the engine would reject or the sliders could not show.
  let violations = 0;
  for (const st of [-100, 0, 50, 100, 1234, 10000, 1e9]) {
    for (const jt of [-100, 0, 25, 50, 1234, 10000, 1e9]) {
      for (const link of ["0", "1"]) {
        const p = readQuery(`preset=custom&link=${link}&st=${st}&jt=${jt}`).params;
        if (!(p.depositST >= 100 && p.depositST <= 10000)) violations++;
        if (link === "1") {
          const derivedJT = juniorFromFirstLossPct(p.depositST, p.minCoveragePct);
          if (!(Number.isFinite(p.depositJT) && p.depositJT > 0 && Math.abs(p.depositJT - derivedJT) < 1e-9)) violations++;
        } else if (!(Number.isFinite(p.depositJT) && p.depositJT >= 50 && p.depositJT <= 10000 && p.depositJT % 50 === 0)) {
          violations++;
        }
      }
    }
  }
  check("no hostile st/jt combination escapes the control ranges", violations === 0, `${violations} violations`);
}

// ---------------------------------------------------------------------------
console.log("\n5. An empty query is the default state");
{
  const s = readQuery("");
  check("empty query yields the defaults", JSON.stringify(s.params) === JSON.stringify(HYBOND_DEFAULT_PARAMS));
  check("maintain defaults on", s.maintain === true);
  check("empty query yields the full backtest window", JSON.stringify(s.range) === JSON.stringify(fullRange));
}

// ---------------------------------------------------------------------------
console.log("\n6. Backtest-window dates survive shared links");
{
  const selected: IndexRange = { a: 24, b: 48 };
  const qs = queryFromState(HYBOND_DEFAULT_PARAMS, true, selected);
  const back = readQuery(qs);
  check(
    "the selected start date is present",
    qs.includes(`from=${HYBOND_NAV_SERIES[selected.a].date}`),
    qs,
  );
  check(
    "the selected end date is present",
    qs.includes(`to=${HYBOND_NAV_SERIES[selected.b].date}`),
    qs,
  );
  check(
    "the selected date range decodes to the same indices",
    JSON.stringify(back.range) === JSON.stringify(selected),
    `got ${JSON.stringify(back.range)}`,
  );

  const unknown = readQuery("from=1900-01&to=2999-12");
  check(
    "unknown dates safely fall back to the full window",
    JSON.stringify(unknown.range) === JSON.stringify(fullRange),
    `got ${JSON.stringify(unknown.range)}`,
  );
}

// ---------------------------------------------------------------------------
console.log(`\n\x1b[1mResult: ${passed} passed, ${failed} failed\x1b[0m\n`);
if (failed > 0) process.exit(1);
