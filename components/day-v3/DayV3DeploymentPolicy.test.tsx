import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import DayV3DeploymentPolicy from "@/components/day-v3/DayV3DeploymentPolicy";

const noop = () => {};
const markup = renderToStaticMarkup(
  <DayV3DeploymentPolicy
    depositDelaySeconds={300}
    depositExpirySeconds={1_814_400}
    gateByOracleUpdate
    maxReinvestmentSlippageBps={50}
    onDepositDelaySeconds={noop}
    onDepositExpirySeconds={noop}
    onGateByOracleUpdate={noop}
    onMaxReinvestmentSlippageBps={noop}
    onWithdrawalExpirySeconds={noop}
    recoveryDays={14}
    withdrawalDelayDays={1}
    withdrawalExpirySeconds="no-expiry"
  />,
);

assert.match(markup, /One schedule applies to all three positions/);
assert.match(markup, /Senior, Junior, and Senior LP/);
assert.match(markup, /NAV cadence above remains a modeling fact/);
assert.match(markup, /Addresses, seed amounts/);
assert.match(markup, /0\.50%/);
assert.match(markup, /Require a post-request oracle update before execution\?/);
assert.match(
  markup,
  /settlement delay must pass,[\s\S]*oracle must publish a timestamp after the request was queued/,
);
assert.match(markup, /EntryPoint does not compare the old and new price values/);
assert.match(
  markup,
  /whether a timestamp advances without a price move depends on the selected oracle recipe/,
);
assert.match(
  markup,
  /Gate off uses the settlement delay without that extra freshness check/,
);
assert.match(
  markup,
  /Zero permits immediate execution\.[\s\S]*price-update gate can still hold the request\./,
);
assert.match(markup, /selected Balancer V3 deployment template enforces/);
assert.match(markup, /recovery-only planning floor/);
assert.match(markup, /may require a longer window/);

console.log("Day V3 deployment policy UI: PASS");
