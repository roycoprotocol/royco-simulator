# Dawn Simulator: RDM → YDM V2 Update

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the hardcoded RDM curve in dawn-simulator with configurable AdaptiveCurveYDM_V2 math, proper fee model, and updated terminology — keeping the single-page simplicity.

**Architecture:** The simulator stays as a single `app/page.tsx` client component. We replace the fixed-slope RDM calculation (`0.25*U` / `7.75*(U-0.9)+0.225`) with the YDM V2 piecewise linear curve parameterized by Y_0, Y_T, Y_full. The spread capture bps fee model is replaced with the protocol's actual jtFee/stFee/ysFee structure. All "RDM" terminology becomes "YDM".

**Tech Stack:** Next.js 16, TypeScript, Tailwind CSS 4, Recharts 3 (all existing)

**Reference files:**
- Current simulator: `dawn-simulator/app/page.tsx` (1266 lines)
- Reference YDM implementation: `royco-risk/frontend/src/pages/YdmSimulator.js` (lines 562-598 for yield math)
- Protocol contracts: `royco-dawn/src/ydm/AdaptiveCurveYDM_V2.sol` (authoritative math)

---

## Key Formulas (from AdaptiveCurveYDM_V2.sol)

### YDM V2 Curve

```
Normalized Delta (Δ):
  If U < 0.9:  Δ = (U - 0.9) / 0.9    → range [-1, 0)
  If U >= 0.9: Δ = (U - 0.9) / 0.1    → range [0, 1]

Yield Share Y(U):
  If U < 0.9:  Y(U) = Y_T + Δ * discount    where discount = Y_T - Y_0
  If U >= 0.9: Y(U) = Y_T + Δ * premium     where premium = Y_full - Y_T

Boundary values:
  Y(0)   = Y_T - discount = Y_0
  Y(0.9) = Y_T
  Y(1.0) = Y_T + premium = Y_full
```

### Utilization

```
U = COV * (ST_RAW_NAV + JT_RAW_NAV * β) / JT_EFFECTIVE_NAV
```
(Same as current simulator — already correct)

### Fee Model

The current simulator uses `juniorSpreadCaptureBps` and `seniorSpreadCaptureBps`. The protocol actually uses three fees:

```
JT Net Yield = ownYield * (1 - jtFee) + riskPremium * (1 - ysFee)
ST Net Yield = stGrossYield * (1 - stFee)

Where:
  ownYield = r * JT_capital                    (JT's own deployment yield)
  riskPremium = Y(U) * r * (U/COV - 1) * JT_capital   (yield share from ST)
  stGrossYield = (1 - Y(U)) * r * ST_capital
```

### Presets Update

Current presets use only `targetCoverage` and `underlyingYield` overrides. New presets need to also include `Y_0`, `Y_T`, `Y_full`, and fee parameters matching deployed markets.

---

## Task 1: Add YDM V2 Curve Parameters to State & Types

**Files:**
- Modify: `dawn-simulator/app/page.tsx:8-30` (types and defaults)

**Step 1: Update SimulatorInputs type**

Replace the spread capture fields with YDM V2 curve params and fee fields:

```typescript
type SimulatorInputs = {
  targetCoverage: string;
  underlyingYield: string;
  seniorCapital: string;
  juniorCapital: string;
  juniorDeploymentOption: DeploymentOption;
  juniorCustomYield: string;
  beta: string;
  // NEW: YDM V2 curve parameters (as percentages, e.g. "10" = 10%)
  ydmY0: string;       // JT yield share at 0% utilization
  ydmYT: string;       // JT yield share at target (90%) utilization
  ydmYFull: string;    // JT yield share at 100% utilization
  // NEW: Fee model (as percentages, e.g. "20" = 20%)
  jtFee: string;       // Fee on JT's own yield
  stFee: string;       // Fee on ST yield
  ysFee: string;       // Fee on JT's risk premium (yield share)
};
```

**Step 2: Update DEFAULT_INPUTS**

```typescript
const DEFAULT_INPUTS: SimulatorInputs = {
  targetCoverage: '10',
  underlyingYield: '13',
  seniorCapital: '10,000,000',
  juniorCapital: '1,250,000.00',
  juniorDeploymentOption: 'underlying',
  juniorCustomYield: '13',
  beta: '100',
  ydmY0: '5',
  ydmYT: '10',
  ydmYFull: '50',
  jtFee: '0',
  stFee: '10',
  ysFee: '45',
};
```

**Step 3: Update EXAMPLE_PRESETS**

```typescript
const EXAMPLE_PRESETS: ExamplePreset[] = [
  {
    id: 'snusd',
    name: 'snUSD',
    description: 'Stablecoin with 10% coverage',
    overrides: {
      targetCoverage: '10', underlyingYield: '10.4',
      ydmY0: '6', ydmYT: '6', ydmYFull: '40',
      jtFee: '20', stFee: '10', ysFee: '0',
    }
  },
  {
    id: 'savusd',
    name: 'savUSD',
    description: 'Stablecoin with 20% coverage',
    overrides: {
      targetCoverage: '20', underlyingYield: '7.9',
      ydmY0: '10', ydmYT: '10', ydmYFull: '50',
      jtFee: '20', stFee: '10', ysFee: '0',
    }
  },
  {
    id: 'new-market',
    name: 'New Market (V2 Fees)',
    description: 'V2 fee model with yield-share fee',
    overrides: {
      targetCoverage: '10', underlyingYield: '5',
      ydmY0: '5', ydmYT: '5', ydmYFull: '40',
      jtFee: '0', stFee: '10', ysFee: '45',
    }
  },
  {
    id: CUSTOM_PRESET_ID,
    name: 'Custom',
    description: 'Full control over all parameters',
    overrides: {}
  }
];
```

**Step 4: Update useState declarations**

Replace the two spread capture state variables and the `roycoSpreadEnabled` toggle with the new fields:

```typescript
// Remove these:
// const [juniorSpreadCaptureBps, setJuniorSpreadCaptureBps] = useState<string>(...);
// const [seniorSpreadCaptureBps, setSeniorSpreadCaptureBps] = useState<string>(...);
// const [roycoSpreadEnabled, setRoycoSpreadEnabled] = useState<boolean>(false);

// Add these:
const [ydmY0, setYdmY0] = useState<string>(defaultSelectedInputs.ydmY0);
const [ydmYT, setYdmYT] = useState<string>(defaultSelectedInputs.ydmYT);
const [ydmYFull, setYdmYFull] = useState<string>(defaultSelectedInputs.ydmYFull);
const [jtFee, setJtFee] = useState<string>(defaultSelectedInputs.jtFee);
const [stFee, setStFee] = useState<string>(defaultSelectedInputs.stFee);
const [ysFee, setYsFee] = useState<string>(defaultSelectedInputs.ysFee);
```

**Step 5: Update applyExample function**

Add the new fields to the state application:

```typescript
setYdmY0(next.ydmY0);
setYdmYT(next.ydmYT);
setYdmYFull(next.ydmYFull);
setJtFee(next.jtFee);
setStFee(next.stFee);
setYsFee(next.ysFee);
```

And remove the old spread capture lines.

**Step 6: Update isSelectedExampleModified**

Replace the spread capture comparisons with the new field comparisons (`ydmY0`, `ydmYT`, `ydmYFull`, `jtFee`, `stFee`, `ysFee`). Update the dependency array accordingly.

**Step 7: Commit**

```bash
git add app/page.tsx
git commit -m "feat: replace RDM spread capture params with YDM V2 curve + fee model types"
```

---

## Task 2: Replace RDM Curve Math with YDM V2

**Files:**
- Modify: `dawn-simulator/app/page.tsx:197-316` (results useMemo)
- Modify: `dawn-simulator/app/page.tsx:370-418` (calculateRdmAtUtilization + generateChartData)

**Step 1: Replace calculateRdmAtUtilization with calculateYdmYieldShare**

Delete `calculateRdmAtUtilization` (lines 370-379) and replace with:

```typescript
const calculateYdmYieldShare = (utilization: number): number => {
  const y0 = parseNumber(ydmY0) / 100;
  const yT = parseNumber(ydmYT) / 100;
  const yFull = parseNumber(ydmYFull) / 100;
  const discount = yT - y0;
  const premium = yFull - yT;

  const u = Math.min(Math.max(utilization, 0), 1);
  let normalizedDelta: number;
  let yieldShare: number;

  if (u < 0.9) {
    normalizedDelta = (u - 0.9) / 0.9;
    yieldShare = yT + normalizedDelta * discount;
  } else {
    normalizedDelta = (u - 0.9) / 0.1;
    yieldShare = yT + normalizedDelta * premium;
  }

  return Math.min(1, Math.max(0, yieldShare));
};
```

**Step 2: Update the results useMemo**

Replace the RDM calculation block (lines 252-258) and yield computation (lines 260-283) with:

```typescript
// YDM V2 curve
const y0 = parseNumber(ydmY0) / 100;
const yT = parseNumber(ydmYT) / 100;
const yFull = parseNumber(ydmYFull) / 100;
const jtFeeNum = parseNumber(jtFee) / 100;
const stFeeNum = parseNumber(stFee) / 100;
const ysFeeNum = parseNumber(ysFee) / 100;

const discount = yT - y0;
const premium = yFull - yT;

let ydmOutput: number;
if (utilization >= 1) {
  // Over-utilized: JT takes all senior yield
  ydmOutput = 1;
} else {
  const u = Math.min(utilization, 1);
  if (u < 0.9) {
    const normalizedDelta = (u - 0.9) / 0.9;
    ydmOutput = yT + normalizedDelta * discount;
  } else {
    const normalizedDelta = (u - 0.9) / 0.1;
    ydmOutput = yT + normalizedDelta * premium;
  }
  ydmOutput = Math.min(1, Math.max(0, ydmOutput));
}

// Total yield from senior capital deployment
const totalYield = underlyingYieldNum * seniorCapitalNum;

// Junior's share of senior's yield (via YDM)
const juniorYield = utilization >= 1 ? totalYield : ydmOutput * totalYield;

// Senior's share
const seniorYield = utilization >= 1 ? 0 : totalYield - juniorYield;

// Junior's own yield from their capital deployment
const juniorYieldRate = juniorDeploymentOption === 'underlying' ? underlyingYieldNum : juniorCustomYieldNum;
const juniorOwnYield = juniorCapitalNum * juniorYieldRate;

// Fee model: jtFee on own yield, ysFee on risk premium, stFee on ST yield
const juniorOwnYieldAfterFee = juniorOwnYield * (1 - jtFeeNum);
const juniorRiskPremiumAfterFee = juniorYield * (1 - ysFeeNum);
const juniorNetYield = juniorOwnYieldAfterFee + juniorRiskPremiumAfterFee;
const seniorNetYield = seniorYield * (1 - stFeeNum);

const juniorTotalYield = juniorOwnYield + juniorYield; // gross
const combinedTotalYield = juniorNetYield + seniorNetYield;

const juniorYieldPercent = (juniorNetYield / juniorCapitalNum) * 100;
const seniorYieldPercent = (seniorNetYield / seniorCapitalNum) * 100;
const totalFees = (juniorOwnYield * jtFeeNum) + (juniorYield * ysFeeNum) + (seniorYield * stFeeNum);
```

Update the return object:
- Rename `rdmOutput` → `ydmOutput`
- Replace `totalRoycoSpreadCapture` with `totalFees`
- Remove `juniorSpreadCaptureAmount` / `seniorSpreadCaptureAmount`
- Add `ydmOutput` to the return

Update the dependency array: remove `juniorSpreadCaptureBps`, `seniorSpreadCaptureBps`, `roycoSpreadEnabled`; add `ydmY0`, `ydmYT`, `ydmYFull`, `jtFee`, `stFee`, `ysFee`.

**Step 3: Update generateChartData**

Replace the RDM curve call with YDM V2:

```typescript
const generateChartData = () => {
  const data = [];
  const seniorCapitalNum = parseNumber(seniorCapital);
  const juniorCapitalNum = parseNumber(juniorCapital);
  const underlyingYieldNum = parseNumber(underlyingYield) / 100;
  const safeUnderlyingYield = isNaN(underlyingYieldNum) ? 0 : underlyingYieldNum;
  const juniorCustomYieldNum = parseNumber(juniorCustomYield) / 100;
  const juniorYieldRate = juniorDeploymentOption === 'underlying' ? safeUnderlyingYield : (isNaN(juniorCustomYieldNum) ? 0 : juniorCustomYieldNum);
  const seniorYieldPool = safeUnderlyingYield * seniorCapitalNum;
  const juniorOwnYield = juniorYieldRate * juniorCapitalNum;
  const jtFeeNum = parseNumber(jtFee) / 100;
  const stFeeNum = parseNumber(stFee) / 100;
  const ysFeeNum = parseNumber(ysFee) / 100;

  for (let i = 0; i <= 1000; i++) {
    const utilization = i / 1000;
    const ydm = calculateYdmYieldShare(utilization);
    const juniorYield = utilization >= 1 ? seniorYieldPool : ydm * seniorYieldPool;
    const seniorYield = utilization >= 1 ? 0 : seniorYieldPool - juniorYield;

    const juniorOwnAfterFee = juniorOwnYield * (1 - jtFeeNum);
    const juniorRiskPremiumAfterFee = juniorYield * (1 - ysFeeNum);
    const juniorNetYield = juniorOwnAfterFee + juniorRiskPremiumAfterFee;
    const seniorNetYield = seniorYield * (1 - stFeeNum);

    const juniorAPY = juniorCapitalNum > 0 ? (juniorNetYield / juniorCapitalNum) * 100 : 0;
    const seniorAPY = seniorCapitalNum > 0 ? (seniorNetYield / seniorCapitalNum) * 100 : 0;

    data.push({
      utilization: utilization * 100,
      ydm: ydm * 100,
      juniorAPY,
      seniorAPY,
      juniorYield,
      juniorTotalYield: juniorNetYield,
      seniorYield
    });
  }
  return data;
};
```

**Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: replace hardcoded RDM curve with configurable YDM V2 math and fee model"
```

---

## Task 3: Update Input UI — Replace Spread Capture with YDM + Fee Controls

**Files:**
- Modify: `dawn-simulator/app/page.tsx` — the input form section (search for "Spread" and "Advanced" to find the relevant JSX)

**Step 1: Remove old spread capture UI**

Delete the `roycoSpreadEnabled` toggle, `juniorSpreadCaptureBps` input, and `seniorSpreadCaptureBps` input from the JSX.

**Step 2: Add YDM curve parameter inputs**

In the "Advanced" section (or a new collapsible section titled "YDM Curve Parameters"), add three inputs:

```tsx
{/* YDM Curve Parameters */}
<div className="bg-white rounded-lg border border-[#e5e5e0] p-6 shadow-sm">
  <h3 className="text-sm font-semibold text-[#0a0a0a] mb-4 uppercase tracking-wide">
    YDM Curve Parameters
  </h3>
  <p className="text-xs text-[#666666] mb-4">
    Controls the piecewise linear yield share curve. Y_0 and Y_full set the endpoints; Y_T is the kink at 90% utilization.
  </p>
  <div className="grid grid-cols-3 gap-4">
    {/* Y_0 input */}
    <div>
      <label className="block text-xs text-[#666666] mb-1">Y_0 (at 0% util)</label>
      <div className="flex items-center">
        <input type="text" value={ydmY0}
          onChange={(e) => { setYdmY0(e.target.value); if (!isCustomSelected) setSelectedExampleId(CUSTOM_PRESET_ID); }}
          className="w-full border border-[#e5e5e0] rounded-lg px-3 py-2 text-sm" />
        <span className="ml-1 text-sm text-[#666666]">%</span>
      </div>
    </div>
    {/* Y_T input */}
    <div>
      <label className="block text-xs text-[#666666] mb-1">Y_T (at 90% util)</label>
      <div className="flex items-center">
        <input type="text" value={ydmYT}
          onChange={(e) => { setYdmYT(e.target.value); if (!isCustomSelected) setSelectedExampleId(CUSTOM_PRESET_ID); }}
          className="w-full border border-[#e5e5e0] rounded-lg px-3 py-2 text-sm" />
        <span className="ml-1 text-sm text-[#666666]">%</span>
      </div>
    </div>
    {/* Y_full input */}
    <div>
      <label className="block text-xs text-[#666666] mb-1">Y_full (at 100% util)</label>
      <div className="flex items-center">
        <input type="text" value={ydmYFull}
          onChange={(e) => { setYdmYFull(e.target.value); if (!isCustomSelected) setSelectedExampleId(CUSTOM_PRESET_ID); }}
          className="w-full border border-[#e5e5e0] rounded-lg px-3 py-2 text-sm" />
        <span className="ml-1 text-sm text-[#666666]">%</span>
      </div>
    </div>
  </div>
</div>
```

**Step 3: Add fee model inputs**

Below the YDM curve section (inside the same Advanced collapsible, or a separate "Fees" section):

```tsx
{/* Fee Model */}
<div className="bg-white rounded-lg border border-[#e5e5e0] p-6 shadow-sm">
  <h3 className="text-sm font-semibold text-[#0a0a0a] mb-4 uppercase tracking-wide">
    Protocol Fees
  </h3>
  <div className="grid grid-cols-3 gap-4">
    <div>
      <label className="block text-xs text-[#666666] mb-1">JT Fee (own yield)</label>
      <div className="flex items-center">
        <input type="text" value={jtFee}
          onChange={(e) => { setJtFee(e.target.value); if (!isCustomSelected) setSelectedExampleId(CUSTOM_PRESET_ID); }}
          className="w-full border border-[#e5e5e0] rounded-lg px-3 py-2 text-sm" />
        <span className="ml-1 text-sm text-[#666666]">%</span>
      </div>
    </div>
    <div>
      <label className="block text-xs text-[#666666] mb-1">ST Fee</label>
      <div className="flex items-center">
        <input type="text" value={stFee}
          onChange={(e) => { setStFee(e.target.value); if (!isCustomSelected) setSelectedExampleId(CUSTOM_PRESET_ID); }}
          className="w-full border border-[#e5e5e0] rounded-lg px-3 py-2 text-sm" />
        <span className="ml-1 text-sm text-[#666666]">%</span>
      </div>
    </div>
    <div>
      <label className="block text-xs text-[#666666] mb-1">YS Fee (risk premium)</label>
      <div className="flex items-center">
        <input type="text" value={ysFee}
          onChange={(e) => { setYsFee(e.target.value); if (!isCustomSelected) setSelectedExampleId(CUSTOM_PRESET_ID); }}
          className="w-full border border-[#e5e5e0] rounded-lg px-3 py-2 text-sm" />
        <span className="ml-1 text-sm text-[#666666]">%</span>
      </div>
    </div>
  </div>
</div>
```

**Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add YDM curve parameter and fee model inputs, remove spread capture UI"
```

---

## Task 4: Update Output Display & Chart — RDM → YDM Terminology

**Files:**
- Modify: `dawn-simulator/app/page.tsx` — all JSX output sections

**Step 1: Rename all RDM references in JSX text**

Search and replace in the JSX (not variable names — those were handled in Task 2):

| Old text | New text |
|----------|----------|
| `RDM` (in headings/labels) | `YDM` |
| `RDM Output` | `YDM Yield Share` |
| `RDM output` | `YDM yield share` |
| `RDM Curve Visualization` | `YDM Curve` |
| `RDM model` | `YDM model` |
| `From RDM Share` | `From YDM Share` |
| `RDM Output to Junior` | `JT Yield Share (YDM)` |

**Step 2: Update the chart**

In the LineChart and axis labels:
- Change `dataKey="rdm"` to `dataKey="ydm"`
- Change Y-axis label from `'RDM Output (% to Junior)'` to `'JT Yield Share (%)'`
- Update tooltip references from `data.rdm` to `data.ydm` and label from `RDM Output` to `YDM Yield Share`

**Step 3: Update the header**

```tsx
<h1 className="text-5xl md:text-6xl font-semibold text-[#0a0a0a] mb-4 tracking-tight">
  Royco Tranching Simulator
</h1>
<p className="text-lg text-[#666666] max-w-2xl mx-auto">
  Calculate senior and junior tranche yields using the YDM model
</p>
```

**Step 4: Update yield breakdown in results cards**

Replace the Royco spread section with a fee breakdown:

```tsx
{/* Yield Breakdown */}
<div className="bg-[#1a1a1a] rounded-lg p-4 space-y-2">
  <div className="flex justify-between items-center text-xs">
    <span className="text-[#999999]">From YDM Share:</span>
    <span className="text-white font-medium">{formatCurrency(results.juniorYield)}</span>
  </div>
  <div className="flex justify-between items-center text-xs">
    <span className="text-[#999999]">From Own Capital:</span>
    <span className="text-white font-medium">{formatCurrency(results.juniorOwnYield)}</span>
  </div>
  {results.totalFees > 0 && (
    <div className="flex justify-between items-center text-xs">
      <span className="text-[#999999]">Protocol fees:</span>
      <span className="text-white font-medium">-{formatCurrency(results.juniorTotalYield - results.juniorNetYield)}</span>
    </div>
  )}
  <div className="border-t border-[#333333] pt-2 mt-2 flex justify-between items-center text-xs">
    <span className="text-[#cccccc] font-medium">Net total:</span>
    <span className="text-white font-semibold">{formatCurrency(results.juniorNetYield)}</span>
  </div>
</div>
```

**Step 5: Remove old Royco Spread footer section**

Delete the `{roycoSpreadEnabled && (...)}` section near the bottom (lines ~1232-1250).

**Step 6: Update footer**

```tsx
<p className="text-xs text-[#999999]">
  Royco Tranching Simulator &bull; Understanding yield tranching through the YDM model
</p>
```

**Step 7: Commit**

```bash
git add app/page.tsx
git commit -m "feat: update all RDM terminology to YDM, update chart and yield breakdown"
```

---

## Task 5: Update Explainer Content

**Files:**
- Modify: `dawn-simulator/app/page.tsx` — the explainer accordion section (lines ~467-530)

**Step 1: Update explainer text**

Update the three-step explainer cards and any references to "RDM" in the educational content:

- Card 1 ("One pool, two slices"): Keep as-is (it's about tranching, not the curve)
- Card 2: If it mentions RDM, rename to YDM
- Card 3: If it mentions the curve mechanics, update to describe the YDM V2 piecewise curve with Y_0/Y_T/Y_full
- Key Takeaway: Update to mention "YDM" instead of "the model"

**Step 2: Commit**

```bash
git add app/page.tsx
git commit -m "docs: update explainer content from RDM to YDM terminology"
```

---

## Task 6: Update Utility Helpers & Clean Up Dead Code

**Files:**
- Modify: `dawn-simulator/app/page.tsx`

**Step 1: Update calculate90PercentUtilization**

This function (lines 343-368) sets junior capital to achieve 90% utilization. The math is correct (it's about utilization, not the curve), but verify the variable references still work after the state changes.

**Step 2: Clean up parseBpsRate**

Delete the `parseBpsRate` helper function (lines 104-108) — it's no longer used since we removed spread capture bps.

**Step 3: Remove any remaining references to old variables**

Search for: `juniorSpreadCaptureBps`, `seniorSpreadCaptureBps`, `roycoSpreadEnabled`, `parseBpsRate`, `rdmOutput`, `totalRoycoSpreadCapture`, `juniorSpreadCaptureAmount`, `seniorSpreadCaptureAmount`

Ensure none remain in either logic or JSX.

**Step 4: Update the results type definition**

In the `useMemo<{...}>` type annotation (lines ~197-216), update the field names:
- Remove: `rdmOutput`, `juniorSpreadCaptureAmount`, `seniorSpreadCaptureAmount`, `totalRoycoSpreadCapture`
- Add: `ydmOutput`, `totalFees`

**Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "chore: remove dead spread capture code, clean up type definitions"
```

---

## Task 7: Smoke Test & Visual Verification

**Step 1: Run the dev server**

```bash
cd dawn-simulator && npm run dev
```

Expected: No TypeScript errors, server starts on localhost:3000

**Step 2: Visual checks**

Open http://localhost:3000 and verify:

1. **Default view**: snUSD preset loads, chart shows piecewise linear curve with kink at 90%
2. **Preset switching**: All presets load correctly, inputs update, chart redraws
3. **Custom mode**: Changing Y_0/Y_T/Y_full updates the curve shape in real-time
4. **Fee model**: Changing jtFee/stFee/ysFee affects net yields but not the curve shape
5. **90% util button**: Still correctly calculates junior capital
6. **No "RDM" text**: Search the page for "RDM" — should find zero instances
7. **Edge cases**: Y_0=0, Y_full=100%, utilization > 100%

**Step 3: Run the build**

```bash
cd dawn-simulator && npm run build
```

Expected: Build succeeds with no errors

**Step 4: Commit any fixes**

```bash
git add app/page.tsx
git commit -m "fix: address issues found during smoke test"
```

---

## Summary of Changes

| What | Before | After |
|------|--------|-------|
| Curve model | Hardcoded slopes (0.25 / 7.75) | Configurable YDM V2 (Y_0, Y_T, Y_full) |
| Fee model | Spread capture bps (junior + senior) | jtFee, stFee, ysFee |
| Terminology | RDM | YDM |
| Presets | MF1, Morpho Gauntlet, HLP | snUSD, savUSD, New Market (V2 fees) |
| Curve formula | `0.25*U` / `7.75*(U-0.9)+0.225` | `Y_T + Δ*discount` / `Y_T + Δ*premium` |
| Files changed | `app/page.tsx` only | `app/page.tsx` only |
