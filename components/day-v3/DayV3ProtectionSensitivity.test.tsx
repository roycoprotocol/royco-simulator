import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import DayV3ProtectionSensitivity from "@/components/day-v3/DayV3ProtectionSensitivity";
import { buildDayYieldDraftMarket } from "@/lib/day-simulator-template/explorer-market";

const market = buildDayYieldDraftMarket({ label: "Custom", sourceApy: 0.06 });
const markup = renderToStaticMarkup(
  <DayV3ProtectionSensitivity defaults={market.defaults} selectedDrawdownPct={15} />,
);

assert.match(markup, /Protection sensitivity/);
assert.match(markup, /7\.5%/);
assert.match(markup, /15\.0% · selected/);
assert.match(markup, /22\.5%/);
assert.match(markup, /30\.0%/);
assert.match(markup, /data-accountant-source="recommendDayV3Coverage"/);

console.log("Day V3 protection sensitivity: PASS");
