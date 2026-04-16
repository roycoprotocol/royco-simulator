'use client';

import { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot } from 'recharts';

type DeploymentOption = 'underlying' | 'elsewhere';
type CapitalInputMode = 'senior-fixed' | 'junior-fixed';

type SimulatorInputs = {
  minCoverage: string;
  underlyingYield: string;
  seniorCapital: string;
  utilization: string;       // replaces juniorCapital — percentage string e.g. "90"
  capitalInputMode: CapitalInputMode;
  juniorDeploymentOption: DeploymentOption;
  juniorCustomYield: string;
  beta: string;
  ydmY0: string;
  ydmYT: string;
  ydmYFull: string;
  jtFee: string;
  stFee: string;
  ysFee: string;
};

// Two slider variants share a single `utilization` state (fraction; 1.0 = 100%).
//   Simple:  p = util,            p ∈ [0, 1] covering util ∈ [0, 1.0] only
//   Complex: p ∈ [0, 0.5]:        util = 2p             (linear in util, 0 → 1.0)
//            p ∈ [0.5, 1]:        util = 1 / (2(1 − p)) (linear in coverage: CR = cov·2(1−p))
// In the simple slider, util > 1 is not representable — thumb pins at 100%.
const TARGET_UTIL = 0.9;
const SNAP_UTIL_TOLERANCE = 0.04; // ±4% util window for snap

const simplePositionFromUtil = (util: number): number => {
  if (util <= 0) return 0;
  if (util >= 1) return 1;
  return util;
};
const simpleUtilFromPosition = (p: number): number => Math.max(0, Math.min(1, p));

const complexUtilFromPosition = (p: number): number => {
  if (p <= 0.5) return 2 * p;
  if (p >= 1) return Infinity;
  return 1 / (2 * (1 - p));
};
const complexPositionFromUtil = (util: number): number => {
  if (util <= 0) return 0;
  if (!Number.isFinite(util)) return 1;
  if (util <= 1) return util / 2;
  return 1 - 1 / (2 * util);
};

const deriveJunior = (
  seniorCapital: number,
  util: number,
  beta: number,
  coverage: number
): number | null => {
  const denom = util - beta * coverage;
  if (denom <= 0) return null;
  return (seniorCapital * coverage) / denom;
};

const deriveSenior = (
  juniorCapital: number,
  util: number,
  beta: number,
  coverage: number
): number | null => {
  if (coverage <= 0) return null;
  const factor = util / coverage - beta;
  if (factor <= 0) return null;
  return juniorCapital * factor;
};

const coverageRemainingFromUtil = (util: number, coverage: number): number => {
  if (util <= 0) return Infinity;
  return coverage / util;
};

const DEFAULT_INPUTS: SimulatorInputs = {
  minCoverage: '10',
  underlyingYield: '9',
  seniorCapital: '10,000,000',
  utilization: '90',
  capitalInputMode: 'senior-fixed',
  juniorDeploymentOption: 'underlying',
  juniorCustomYield: '13',
  beta: '100',
  ydmY0: '15',
  ydmYT: '15',
  ydmYFull: '40',
  jtFee: '0',
  stFee: '10',
  ysFee: '45',
};

type ExamplePreset = {
  id: string;
  name: string;
  description?: string;
  overrides: Partial<SimulatorInputs>;
};

const CUSTOM_PRESET_ID = 'custom';
const DEFAULT_SELECTED_EXAMPLE_ID = CUSTOM_PRESET_ID;

const EXAMPLE_PRESETS: ExamplePreset[] = [
  {
    id: CUSTOM_PRESET_ID,
    name: 'Custom',
    description: 'Tune coverage + yield',
    overrides: {}
  }
];

type SliderTick = {
  position: number;
  utilLabel: string;
  utilValue: number; // fraction; Infinity for the cap tick
  isTarget?: boolean;
};

const SIMPLE_SLIDER_TICKS: SliderTick[] = [
  { position: 0.00, utilLabel: '0%',    utilValue: 0 },
  { position: 0.25, utilLabel: '25%',   utilValue: 0.25 },
  { position: 0.50, utilLabel: '50%',   utilValue: 0.5 },
  { position: 0.75, utilLabel: '75%',   utilValue: 0.75 },
  { position: 0.90, utilLabel: '90%',   utilValue: 0.9, isTarget: true },
  { position: 1.00, utilLabel: '100%',  utilValue: 1.0 },
];

const COMPLEX_SLIDER_TICKS: SliderTick[] = [
  { position: 0.000, utilLabel: '0%',    utilValue: 0 },
  { position: 0.125, utilLabel: '25%',   utilValue: 0.25 },
  { position: 0.250, utilLabel: '50%',   utilValue: 0.5 },
  { position: 0.375, utilLabel: '75%',   utilValue: 0.75 },
  { position: 0.450, utilLabel: '90%',   utilValue: 0.9, isTarget: true },
  { position: 0.500, utilLabel: '100%',  utilValue: 1.0 },
  { position: 0.750, utilLabel: '200%',  utilValue: 2.0 },
  { position: 0.900, utilLabel: '500%',  utilValue: 5.0 },
  { position: 1.000, utilLabel: '∞',     utilValue: Infinity },
];

export default function YieldSimulator() {
  const defaultSelectedExample = EXAMPLE_PRESETS.find((preset) => preset.id === DEFAULT_SELECTED_EXAMPLE_ID) ?? EXAMPLE_PRESETS[0];
  const defaultSelectedInputs =
    defaultSelectedExample && defaultSelectedExample.id !== CUSTOM_PRESET_ID
      ? { ...DEFAULT_INPUTS, ...defaultSelectedExample.overrides }
      : DEFAULT_INPUTS;

  const [minCoverage, setMinCoverage] = useState<string>(defaultSelectedInputs.minCoverage);
  const [underlyingYield, setUnderlyingYield] = useState<string>(defaultSelectedInputs.underlyingYield);
  const [seniorCapital, setSeniorCapital] = useState<string>(defaultSelectedInputs.seniorCapital);
  const [capitalInputMode, setCapitalInputMode] = useState<CapitalInputMode>(defaultSelectedInputs.capitalInputMode);
  const [utilization, setUtilization] = useState<number>(
    parseFloat(defaultSelectedInputs.utilization) / 100
  );
  const [juniorCapital, setJuniorCapital] = useState<string>(''); // seeded by derived effect below
  const [juniorDeploymentOption, setJuniorDeploymentOption] = useState<DeploymentOption>(defaultSelectedInputs.juniorDeploymentOption);
  const [juniorCustomYield, setJuniorCustomYield] = useState<string>(defaultSelectedInputs.juniorCustomYield);
  const [beta, setBeta] = useState<string>(defaultSelectedInputs.beta);
  const [ydmY0, setYdmY0] = useState<string>(defaultSelectedInputs.ydmY0);
  const [ydmYT, setYdmYT] = useState<string>(defaultSelectedInputs.ydmYT);
  const [ydmYFull, setYdmYFull] = useState<string>(defaultSelectedInputs.ydmYFull);
  const [jtFee, setJtFee] = useState<string>(defaultSelectedInputs.jtFee);
  const [stFee, setStFee] = useState<string>(defaultSelectedInputs.stFee);
  const [ysFee, setYsFee] = useState<string>(defaultSelectedInputs.ysFee);

  const [selectedExampleId, setSelectedExampleId] = useState<string>(defaultSelectedExample?.id ?? CUSTOM_PRESET_ID);

  const defaultAdaptYdm = parseFloat(defaultSelectedInputs.ydmYT) || 10;
  const [adaptYdm, setAdaptYdm] = useState<number>(defaultAdaptYdm); // effective Y_T as % (1-100)

  const [showExplainer, setShowExplainer] = useState<boolean>(false);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);


  const parseNumber = (value: string): number => {
    return parseFloat(value.replace(/,/g, ''));
  };

  const formatNumberWithCommas = (value: string): string => {
    const num = value.replace(/,/g, '');
    if (!num) return '';
    const parts = num.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  };

  // Both capitals are in the deps array; the effect writes only the non-canonical
  // side. When that write produces a string equal to the current state, React's
  // setState bailout prevents a re-render — and even when it differs, the next
  // effect run computes the same value from the same inputs, so no infinite loop.
  useEffect(() => {
    const util = utilization;
    const cov = parseNumber(minCoverage) / 100;
    const betaNum = parseNumber(beta) / 100;
    if (isNaN(cov) || isNaN(betaNum)) return;

    if (capitalInputMode === 'senior-fixed') {
      const sNum = parseNumber(seniorCapital);
      if (isNaN(sNum) || sNum <= 0) return;
      const j = deriveJunior(sNum, util, betaNum, cov);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setJuniorCapital(j !== null && Number.isFinite(j) ? formatNumberWithCommas(j.toFixed(2)) : '');
    } else {
      const jNum = parseNumber(juniorCapital);
      if (isNaN(jNum) || jNum <= 0) return;
      const s = deriveSenior(jNum, util, betaNum, cov);
      setSeniorCapital(s !== null && Number.isFinite(s) ? formatNumberWithCommas(s.toFixed(2)) : '');
    }
  }, [utilization, capitalInputMode, minCoverage, beta, seniorCapital, juniorCapital]);

  const selectedExample = useMemo(
    () => (selectedExampleId ? EXAMPLE_PRESETS.find((preset) => preset.id === selectedExampleId) ?? null : null),
    [selectedExampleId]
  );

  const isCustomSelected = selectedExampleId === CUSTOM_PRESET_ID;

  const selectedExampleInputs = useMemo(() => {
    if (!selectedExample || selectedExample.id === CUSTOM_PRESET_ID) return null;
    return { ...DEFAULT_INPUTS, ...selectedExample.overrides };
  }, [selectedExample]);

  const isSelectedExampleModified = useMemo(() => {
    if (!selectedExampleInputs) return false;

    const nearlyEqual = (a: number, b: number) => Math.abs(a - b) < 1e-9;
    const compareAsNumber = (a: string, b: string) => {
      const aNum = parseNumber(a);
      const bNum = parseNumber(b);
      if (Number.isNaN(aNum) || Number.isNaN(bNum)) return a.trim() === b.trim();
      return nearlyEqual(aNum, bNum);
    };

    const currentUtilization = (utilization * 100).toString();

    return !(
      compareAsNumber(minCoverage, selectedExampleInputs.minCoverage) &&
      compareAsNumber(underlyingYield, selectedExampleInputs.underlyingYield) &&
      compareAsNumber(seniorCapital, selectedExampleInputs.seniorCapital) &&
      compareAsNumber(currentUtilization, selectedExampleInputs.utilization) &&
      capitalInputMode === selectedExampleInputs.capitalInputMode &&
      juniorDeploymentOption === selectedExampleInputs.juniorDeploymentOption &&
      compareAsNumber(juniorCustomYield, selectedExampleInputs.juniorCustomYield) &&
      compareAsNumber(beta, selectedExampleInputs.beta) &&
      compareAsNumber(ydmY0, selectedExampleInputs.ydmY0) &&
      compareAsNumber(ydmYT, selectedExampleInputs.ydmYT) &&
      compareAsNumber(ydmYFull, selectedExampleInputs.ydmYFull) &&
      compareAsNumber(jtFee, selectedExampleInputs.jtFee) &&
      compareAsNumber(stFee, selectedExampleInputs.stFee) &&
      compareAsNumber(ysFee, selectedExampleInputs.ysFee)
    );
  }, [
    beta,
    capitalInputMode,
    jtFee,
    juniorCustomYield,
    juniorDeploymentOption,
    selectedExampleInputs,
    seniorCapital,
    stFee,
    minCoverage,
    underlyingYield,
    utilization,
    ydmY0,
    ydmYFull,
    ydmYT,
    ysFee
  ]);

  const isSelectedExampleCoverageRatesModified = useMemo(() => {
    if (!selectedExampleInputs) return false;

    const nearlyEqual = (a: number, b: number) => Math.abs(a - b) < 1e-9;
    const compareAsNumber = (a: string, b: string) => {
      const aNum = parseNumber(a);
      const bNum = parseNumber(b);
      if (Number.isNaN(aNum) || Number.isNaN(bNum)) return a.trim() === b.trim();
      return nearlyEqual(aNum, bNum);
    };

    return !(
      compareAsNumber(minCoverage, selectedExampleInputs.minCoverage) &&
      compareAsNumber(underlyingYield, selectedExampleInputs.underlyingYield)
    );
  }, [selectedExampleInputs, minCoverage, underlyingYield]);

  const applyExample = (exampleId: string) => {
    if (exampleId === CUSTOM_PRESET_ID) {
      setSelectedExampleId(CUSTOM_PRESET_ID);
      return;
    }

    const preset = EXAMPLE_PRESETS.find((p) => p.id === exampleId);
    if (!preset) return;

    const next = { ...DEFAULT_INPUTS, ...preset.overrides };
    setSelectedExampleId(preset.id);
    setMinCoverage(next.minCoverage);
    setUnderlyingYield(next.underlyingYield);
    setSeniorCapital(next.seniorCapital);
    setCapitalInputMode(next.capitalInputMode);
    setUtilization(parseFloat(next.utilization) / 100);
    setJuniorDeploymentOption(next.juniorDeploymentOption);
    setJuniorCustomYield(next.juniorCustomYield);
    setBeta(next.beta);
    setYdmY0(next.ydmY0);
    setYdmYT(next.ydmYT);
    setYdmYFull(next.ydmYFull);
    setJtFee(next.jtFee);
    setStFee(next.stFee);
    setYsFee(next.ysFee);
    setAdaptYdm(parseFloat(next.ydmYT) || defaultAdaptYdm);
  };


  const results = useMemo<{
    isValid: boolean;
    utilization: number;
    ydmOutput: number;
    totalYield: number;
    combinedTotalYield: number;
    juniorYield: number;
    juniorOwnYield: number;
    juniorTotalYield: number;
    juniorNetYield: number;
    seniorYield: number;
    seniorNetYield: number;
    juniorYieldPercent: number;
    seniorYieldPercent: number;
    totalFees: number;
    overUtilized: boolean;
    requiredCoverage: number;
    errorMessage?: string;
  } | null>(() => {
    const minCoverageNum = parseNumber(minCoverage) / 100;
    const underlyingYieldNum = parseNumber(underlyingYield) / 100;
    const seniorCapitalNum = parseNumber(seniorCapital);
    const juniorCapitalNum = parseNumber(juniorCapital);
    const juniorCustomYieldNum = parseNumber(juniorCustomYield) / 100;
    const betaNum = parseNumber(beta) / 100;

    if (
      isNaN(minCoverageNum) ||
      isNaN(underlyingYieldNum) ||
      isNaN(seniorCapitalNum) ||
      isNaN(juniorCapitalNum) ||
      isNaN(betaNum)
    ) {
      return null;
    }

    if (juniorDeploymentOption === 'elsewhere' && isNaN(juniorCustomYieldNum)) {
      return null;
    }

    if (seniorCapitalNum <= 0 || juniorCapitalNum <= 0) {
      return null;
    }

    const seniorRawNAV = seniorCapitalNum;
    const juniorRawNAV = juniorCapitalNum;
    const juniorEffectiveNAV = juniorCapitalNum; // assumption: no prior gains/losses applied
    const requiredCoverage = (seniorRawNAV + juniorRawNAV * betaNum) * minCoverageNum;
    const utilization = requiredCoverage / juniorEffectiveNAV;

    // Parse new params — apply adaptation offset (slopes fixed, all Y values shift equally)
    const baseY0 = parseNumber(ydmY0) / 100;
    const baseYT = parseNumber(ydmYT) / 100;
    const baseYFull = parseNumber(ydmYFull) / 100;
    const adaptedYT = adaptYdm / 100;
    const adaptDelta = adaptedYT - baseYT;
    const y0 = Math.max(0, Math.min(1, baseY0 + adaptDelta));
    const yT = adaptedYT;
    const yFull = Math.max(0, Math.min(1, baseYFull + adaptDelta));
    const jtFeeNum = parseNumber(jtFee) / 100;
    const stFeeNum = parseNumber(stFee) / 100;
    const ysFeeNum = parseNumber(ysFee) / 100;

    if (
      isNaN(y0) || isNaN(yT) || isNaN(yFull) ||
      isNaN(jtFeeNum) || isNaN(stFeeNum) || isNaN(ysFeeNum)
    ) {
      return null;
    }

    const discount = yT - y0;
    const premium = yFull - yT;

    // YDM V2 curve — piecewise linear; clamp util to [0, 1] so values above 100%
    // stabilize at yFull (senior keeps (1 − yFull) of the pool).
    const uClamped = Math.min(Math.max(utilization, 0), 1);
    let ydmOutput: number;
    if (uClamped < 0.9) {
      const normalizedDelta = (uClamped - 0.9) / 0.9;
      ydmOutput = yT + normalizedDelta * discount;
    } else {
      const normalizedDelta = (uClamped - 0.9) / 0.1;
      ydmOutput = yT + normalizedDelta * premium;
    }
    ydmOutput = Math.min(1, Math.max(0, ydmOutput));

    // Yields
    const totalYield = underlyingYieldNum * seniorCapitalNum;
    const juniorYield = ydmOutput * totalYield;
    const seniorYield = totalYield - juniorYield;

    const juniorYieldRate = juniorDeploymentOption === 'underlying' ? underlyingYieldNum : juniorCustomYieldNum;
    const juniorOwnYield = juniorCapitalNum * juniorYieldRate;

    // Fee model: jtFee on own yield, ysFee on risk premium, stFee on ST yield
    const juniorOwnYieldAfterFee = juniorOwnYield * (1 - jtFeeNum);
    const juniorRiskPremiumAfterFee = juniorYield * (1 - ysFeeNum);
    const juniorNetYield = juniorOwnYieldAfterFee + juniorRiskPremiumAfterFee;
    const seniorNetYield = seniorYield * (1 - stFeeNum);

    const juniorTotalYield = juniorOwnYield + juniorYield;
    const combinedTotalYield = juniorNetYield + seniorNetYield;
    const juniorYieldPercent = (juniorNetYield / juniorCapitalNum) * 100;
    const seniorYieldPercent = (seniorNetYield / seniorCapitalNum) * 100;
    const totalFees = (juniorOwnYield * jtFeeNum) + (juniorYield * ysFeeNum) + (seniorYield * stFeeNum);

    return {
      isValid: true,
      utilization,
      ydmOutput,
      totalYield,
      combinedTotalYield,
      juniorYield,
      juniorOwnYield,
      juniorTotalYield,
      juniorNetYield,
      seniorYield,
      seniorNetYield,
      juniorYieldPercent,
      seniorYieldPercent,
      totalFees,
      overUtilized: utilization > 1,
      requiredCoverage
    };
  }, [
    adaptYdm,
    beta,
    juniorCapital,
    juniorCustomYield,
    juniorDeploymentOption,
    seniorCapital,
    minCoverage,
    underlyingYield,
    ydmY0,
    ydmYT,
    ydmYFull,
    jtFee,
    stFee,
    ysFee
  ]);

  const chartMaxUtilization = Math.max(100, (results?.utilization ?? 1) * 100);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  const calculateYdmYieldShare = (utilization: number, y0Val?: number, yTVal?: number, yFullVal?: number): number => {
    const y0 = y0Val ?? parseNumber(ydmY0) / 100;
    const yT = yTVal ?? parseNumber(ydmYT) / 100;
    const yFull = yFullVal ?? parseNumber(ydmYFull) / 100;
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

  const chartData = useMemo(() => {
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
    // Apply adaptation offset (slopes fixed, all Y values shift equally)
    const baseY0 = parseNumber(ydmY0) / 100;
    const baseYT = parseNumber(ydmYT) / 100;
    const baseYFull = parseNumber(ydmYFull) / 100;
    const adaptDelta = adaptYdm / 100 - baseYT;
    const y0Num = Math.max(0, Math.min(1, baseY0 + adaptDelta));
    const yTNum = adaptYdm / 100;
    const yFullNum = Math.max(0, Math.min(1, baseYFull + adaptDelta));

    const covDec = parseNumber(minCoverage) / 100;
    const r = safeUnderlyingYield;

    for (let i = 0; i <= 1000; i++) {
      const utilization = i / 1000;
      const ys = calculateYdmYieldShare(utilization, y0Num, yTNum, yFullNum);

      // Leverage-based APY (from YdmSimulator reference):
      //   k = u / cov - 1  (ST:JT capital ratio implied by utilization)
      //   JT gross = r + ys * r * k  (own yield + risk premium)
      //   ST gross = (1 - ys) * r
      let juniorAPY: number;
      let seniorAPY: number;

      if (covDec <= 0) {
        juniorAPY = r * 100 * (1 - jtFeeNum);
        seniorAPY = 0;
      } else {
        const k = utilization / covDec - 1;
        const ownYield = r * 100;
        const riskPremium = ys * r * k * 100;
        juniorAPY = ownYield * (1 - jtFeeNum) + riskPremium * (1 - ysFeeNum);
        seniorAPY = (1 - ys) * r * 100 * (1 - stFeeNum);
      }

      data.push({
        utilization: utilization * 100,
        ydm: ys * 100,
        juniorAPY,
        seniorAPY,
      });
    }
    return data;
  }, [adaptYdm, minCoverage, underlyingYield, seniorCapital, juniorCapital, juniorCustomYield, juniorDeploymentOption, jtFee, stFee, ysFee, ydmY0, ydmYT, ydmYFull]);

  const renderUtilizationSlider = (variant: 'simple' | 'complex', idSuffix: string) => {
    const inputId = `utilization-slider-${idSuffix}`;
    const ticks = variant === 'simple' ? SIMPLE_SLIDER_TICKS : COMPLEX_SLIDER_TICKS;
    const sliderPosition = variant === 'simple'
      ? simplePositionFromUtil(utilization)
      : complexPositionFromUtil(utilization);
    const targetPosition = variant === 'simple'
      ? simplePositionFromUtil(TARGET_UTIL)
      : complexPositionFromUtil(TARGET_UTIL);
    const utilFromPos = variant === 'simple' ? simpleUtilFromPosition : complexUtilFromPosition;
    const trySnap = (pos: number) => {
      const u = utilFromPos(pos);
      if (Math.abs(u - TARGET_UTIL) <= SNAP_UTIL_TOLERANCE) setUtilization(TARGET_UTIL);
    };

    return (
      <div className={variant === 'complex' ? 'border-t border-[#e5e5e0] pt-5' : ''}>
        <div className="mb-3">
          <span className="text-[11px] uppercase tracking-wide text-[#666666]">Utilization</span>
          <p className="text-lg font-semibold text-[#0a0a0a] tabular-nums">
            {Number.isFinite(utilization) ? `${(utilization * 100).toFixed(1)}%` : '∞'}
          </p>
        </div>

        <label htmlFor={inputId} className="sr-only">Utilization</label>

        <div className="relative h-5">
          {ticks.map((t) => (
            <div
              key={`above-${t.position}`}
              className="absolute top-0 -translate-x-1/2 text-[10px] tabular-nums"
              style={{ left: `${t.position * 100}%` }}
            >
              {t.isTarget ? (
                <div
                  className="relative group cursor-pointer"
                  onClick={() => setUtilization(TARGET_UTIL)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setUtilization(TARGET_UTIL);
                    }
                  }}
                >
                  <div className="flex flex-col items-center">
                    <span className="text-[#16a34a] font-semibold hover:underline">{t.utilLabel}</span>
                  </div>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-72 p-3 text-xs font-normal text-white bg-[#0a0a0a] rounded-lg shadow-lg z-20 pointer-events-none">
                    <p className="font-semibold mb-1">Why 90% target?</p>
                    <p className="mb-2">The protocol operates around 90% utilization to keep both tranches liquid:</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li><strong>Buffer for Senior deposits</strong> — new senior capital can enter while not breaching minimum coverage.</li>
                      <li><strong>Buffer for Junior redemptions</strong> — junior can only exit if it does not breach minimum coverage.</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <span className="text-[#666666]">{t.utilLabel}</span>
              )}
            </div>
          ))}
        </div>

        <div className="relative px-0">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-8 border-l-2 border-dashed border-[#0a0a0a]/50"
            style={{ left: `${targetPosition * 100}%` }}
          />
          <input
            id={inputId}
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={sliderPosition}
            onChange={(e) => setUtilization(utilFromPos(parseFloat(e.target.value)))}
            onPointerUp={(e) => trySnap(parseFloat((e.target as HTMLInputElement).value))}
            onMouseUp={(e) => trySnap(parseFloat((e.target as HTMLInputElement).value))}
            onTouchEnd={(e) => trySnap(parseFloat((e.target as HTMLInputElement).value))}
            aria-valuetext={Number.isFinite(utilization) ? `${(utilization * 100).toFixed(1)}%` : '∞'}
            className={`w-full utilization-slider ${variant === 'complex' ? 'utilization-slider--complex' : ''}`}
          />
        </div>

        <div className="relative h-5 mt-1">
          {ticks.map((t) => {
            const cov = parseNumber(minCoverage) / 100;
            let crLabel: string;
            if (t.utilValue === 0) crLabel = '∞';
            else if (!Number.isFinite(t.utilValue)) crLabel = '0%';
            else {
              const crPct = (cov / t.utilValue) * 100;
              crLabel = crPct >= 20 ? `${crPct.toFixed(0)}%` : `${crPct.toFixed(1)}%`;
            }
            return (
              <div
                key={`below-${t.position}`}
                className="absolute top-0 -translate-x-1/2 text-[10px] text-[#666666] tabular-nums"
                style={{ left: `${t.position * 100}%` }}
              >
                {crLabel}
              </div>
            );
          })}
        </div>
        <div className="mt-1">
          <span className="text-[11px] uppercase tracking-wide text-[#666666]">Coverage</span>
          <p className="text-lg font-semibold text-[#0a0a0a] tabular-nums">
            {(() => {
              const u = utilization;
              const cov = parseNumber(minCoverage) / 100;
              if (u <= 0) return '∞';
              if (!Number.isFinite(u)) return '0%';
              return `${(coverageRemainingFromUtil(u, cov) * 100).toFixed(1)}%`;
            })()}
          </p>
        </div>
        {variant === 'complex' && utilization > 1 && (
          <div className="mt-3 rounded-md border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-xs text-[#854d0e]">
            Utilization above 100% implies a Junior drawdown has occurred. The protocol blocks new Senior deposits past 100%, so reaching this state requires Junior NAV losses.
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#FBFBF8] py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl md:text-6xl font-semibold text-[#0a0a0a] mb-4 tracking-tight">
            Royco Tranching Simulator
          </h1>
          <p className="text-lg text-[#666666] max-w-2xl mx-auto">
            Calculate senior and junior tranche yields using the YDM model
          </p>
        </div>

        {/* Section Label: Explainer */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-[11px] tracking-wide uppercase text-[#0a0a0a] bg-[#eef0f4] border border-[#e5e5e0] rounded-full px-3 py-1">
            Explainer
          </span>
          <span className="flex-1 h-px bg-gradient-to-r from-[#d6d6d0] via-[#e5e5e0] to-transparent" />
        </div>

        {/* Explainer Section */}
        <div className="bg-white rounded-lg border border-[#e5e5e0] p-6 mb-8 shadow-sm">
          <button
            onClick={() => setShowExplainer(!showExplainer)}
            className="w-full flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <div className="bg-[#0a0a0a] rounded-full p-2">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#0a0a0a]">
                  New to Yield Tranching?
                </h3>
                <p className="text-sm text-[#666666]">
                  Click to learn how it works
                </p>
              </div>
            </div>
            <svg className={`w-6 h-6 text-[#666666] transition-transform ${showExplainer ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showExplainer && (
            <div className="mt-6 text-[#0a0a0a] border-t border-[#e5e5e0] pt-6">
              <div className="bg-gradient-to-br from-[#fff7e8] via-[#f6fbff] to-[#eef4ff] border border-[#e7e2d8] rounded-xl p-6 md:p-8 shadow-sm space-y-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-[#0a0a0a] text-white text-xs font-semibold rounded-full px-3 py-1 tracking-wide">Key Takeaway</div>
                    <p className="text-sm text-[#444444]">Junior protects senior, and the model shows how much yield junior earns for doing so.</p>
                  </div>
                  <a
                    href="https://royco.gitbook.io/royco-dawn/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-[#0a0a0a] rounded-full px-4 py-2 shadow hover:opacity-90 transition"
                  >
                    <span>Open Royco Dawn Guide</span>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 7l-9 9m0-6V7h3" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17h10V7" />
                    </svg>
                  </a>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white rounded-lg border border-[#e5e5e0] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-bold tracking-wide text-[#0a0a0a] bg-[#f1f3f5] px-2 py-1 rounded">1</span>
                      <p className="text-sm font-semibold text-[#0a0a0a]">One pool, two slices</p>
                    </div>
                    <p className="text-sm text-[#555555] leading-relaxed">
                      Senior = paid first, lower risk. Junior = first-loss buffer, higher upside.
                    </p>
                  </div>

                  <div className="bg-white rounded-lg border border-[#e5e5e0] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-bold tracking-wide text-[#0a0a0a] bg-[#f1f3f5] px-2 py-1 rounded">2</span>
                      <p className="text-sm font-semibold text-[#0a0a0a]">Utilization drives split</p>
                    </div>
                    <p className="text-sm text-[#555555] leading-relaxed">
                      Utilization ≈ how hard junior is working to cover senior. Higher utilization → junior takes more of the yield pie. The YDM turns this into one % for junior; senior gets the rest.
                    </p>
                  </div>

                  <div className="bg-white rounded-lg border border-[#e5e5e0] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-bold tracking-wide text-[#0a0a0a] bg-[#f1f3f5] px-2 py-1 rounded">3</span>
                      <p className="text-sm font-semibold text-[#0a0a0a]">How to use this</p>
                    </div>
                    <p className="text-sm text-[#555555] leading-relaxed">
                      Enter senior & junior amounts, pick coverage, and let the simulator show each side&apos;s APY based on the YDM output.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-[#0a0a0a] text-white rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-[#c7c7c7]">Senior slice</p>
                      <p className="text-base font-semibold">Gets paid first</p>
                    </div>
                    <span className="text-sm bg-white text-[#0a0a0a] px-3 py-1 rounded-full border border-white/40">Lower risk</span>
                  </div>
                  <div className="bg-white rounded-lg border border-[#e5e5e0] p-4 flex items-center justify-between shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-[#666666]">Junior slice</p>
                      <p className="text-base font-semibold text-[#0a0a0a]">Takes first losses</p>
                    </div>
                    <span className="text-sm bg-[#0a0a0a] text-white px-3 py-1 rounded-full border border-[#0a0a0a]">Higher upside</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Section Label: Inputs */}
        <div className="flex items-center gap-3 mb-4 mt-10">
          <span className="text-[11px] tracking-wide uppercase text-[#0a0a0a] bg-[#eef0f4] border border-[#e5e5e0] rounded-full px-3 py-1">
            Simulator Inputs
          </span>
          <span className="flex-1 h-px bg-gradient-to-r from-[#d6d6d0] via-[#e5e5e0] to-transparent" />
        </div>

        {/* Input Parameters Card */}
        <div className="bg-white rounded-lg border border-[#e5e5e0] p-6 md:p-8 mb-8 shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-semibold text-[#0a0a0a]">
                Input Parameters
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-sm font-medium text-[#0a0a0a] bg-[#f4f4f0] border border-[#e5e5e0] rounded-md px-3 py-1.5 hover:bg-[#eaeae4] transition-colors"
            >
              {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Scenario (Left) */}
            <div className="rounded-lg border border-[#e5e5e0] p-5 bg-[#fafaf7] space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[#0a0a0a]">Starting Scenario</h3>
                  <p className="text-xs text-[#666666] mt-1">Pick a preset, then tweak inputs.</p>
                </div>
                {isCustomSelected ? (
                  <span className="text-xs font-medium rounded-full px-2.5 py-1 border bg-white border-[#e5e5e0] text-[#0a0a0a]">
                    Custom
                  </span>
                ) : (
                  <span
                    className={`text-xs font-medium rounded-full px-2.5 py-1 border ${
                      isSelectedExampleModified
                        ? 'bg-[#fff7e8] border-[#f1d9a8] text-[#8a5a00]'
                        : 'bg-[#eefcf3] border-[#c7f1d4] text-[#135e2b]'
                    }`}
                  >
                    {isSelectedExampleModified ? 'Modified' : 'Applied'}
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-[#0a0a0a]">Example Scenario</label>
                <select
                  value={selectedExampleId}
                  onChange={(e) => applyExample(e.target.value)}
                  className="w-full h-11 rounded-md border border-[#e5e5e0] bg-white px-3 text-sm text-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
                >
                  {EXAMPLE_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-[#e5e5e0] bg-white px-4 py-3 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
                  <label className="block text-[11px] font-semibold tracking-wide uppercase text-[#666666]">
                    Minimum Coverage
                  </label>
                  <p className="mt-1 text-xs text-[#666666]">Coverage at 100% utilization.</p>
                  <div className="mt-2 relative">
                    <input
                      type="number"
                      value={minCoverage}
                      onChange={(e) => {
                        setMinCoverage(e.target.value);
                      }}
                      className="w-full h-12 pr-10 pl-3 rounded-md border border-[#e5e5e0] bg-[#fafaf7] text-right text-lg font-semibold text-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent transition-all"
                      placeholder="10"
                      step="0.1"
                      min="0"
                      max="100"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-[#666666]">%</span>
                  </div>
                </div>

                <div className="rounded-lg border border-[#e5e5e0] bg-white px-4 py-3 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
                  <label className="block text-[11px] font-semibold tracking-wide uppercase text-[#666666]">
                    Underlying Yield
                  </label>
                  <p className="mt-1 text-xs text-[#666666]">APY of the shared opportunity.</p>
                  <div className="mt-2 relative">
                    <input
                      type="number"
                      value={underlyingYield}
                      onChange={(e) => {
                        setUnderlyingYield(e.target.value);
                      }}
                      className="w-full h-12 pr-10 pl-3 rounded-md border border-[#e5e5e0] bg-[#fafaf7] text-right text-lg font-semibold text-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent transition-all"
                      placeholder="13"
                      step="0.1"
                      min="0"
                      max="100"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-[#666666]">%</span>
                  </div>
                </div>
              </div>

              {!isCustomSelected && selectedExample && isSelectedExampleCoverageRatesModified && (
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => applyExample(selectedExample.id)}
                    className="text-xs font-medium text-[#0a0a0a] bg-white border border-[#e5e5e0] rounded-md px-2.5 py-1.5 hover:bg-[#f4f4f0] transition-colors"
                  >
                    Reset to preset
                  </button>
                </div>
              )}
            </div>

            {/* Capital (Right) */}
            <div className="lg:col-span-2 rounded-lg border border-[#e5e5e0] p-5 bg-[#fafaf7] space-y-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-[#0a0a0a]">Capital</h3>
                <div className="inline-flex rounded-md border border-[#e5e5e0] bg-white text-xs overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setCapitalInputMode('senior-fixed')}
                    className={`px-3 py-1.5 transition-colors ${
                      capitalInputMode === 'senior-fixed'
                        ? 'bg-[#0a0a0a] text-white'
                        : 'text-[#666666] hover:bg-[#f4f4f0]'
                    }`}
                  >
                    Senior fixed
                  </button>
                  <button
                    type="button"
                    onClick={() => setCapitalInputMode('junior-fixed')}
                    className={`px-3 py-1.5 transition-colors ${
                      capitalInputMode === 'junior-fixed'
                        ? 'bg-[#0a0a0a] text-white'
                        : 'text-[#666666] hover:bg-[#f4f4f0]'
                    }`}
                  >
                    Junior fixed
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                {/* Senior Capital */}
                <div className="grid grid-cols-1 md:grid-cols-[1fr_16rem] items-start gap-x-10 gap-y-3">
                  <div>
                    <label className="text-sm font-medium text-[#0a0a0a]">Senior Capital ($)</label>
                    <p className="text-xs text-[#666666] mt-2">Protected tranche principal.</p>
                  </div>
                  <div className="relative w-full md:w-64 md:justify-self-end">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-[#666666]">$</span>
                    {capitalInputMode === 'senior-fixed' ? (
                      <input
                        type="text"
                        value={seniorCapital}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^0-9.]/g, '');
                          setSeniorCapital(formatNumberWithCommas(value));
                        }}
                        className="w-full h-11 pr-3 pl-6 rounded-md border border-[#e5e5e0] bg-white text-right text-base text-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent transition-all"
                        placeholder="10,000,000"
                      />
                    ) : (
                      <div className="w-full h-11 pr-3 pl-6 rounded-md border border-[#e5e5e0] bg-[#f4f4f0] text-right text-base text-[#666666] flex items-center justify-end">
                        {seniorCapital || '—'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Junior Capital */}
                <div className="grid grid-cols-1 md:grid-cols-[1fr_16rem] items-start gap-x-10 gap-y-3">
                  <div>
                    <label className="text-sm font-medium text-[#0a0a0a]">Junior Capital ($)</label>
                    <p className="text-xs text-[#666666] mt-2">First-loss tranche principal.</p>
                  </div>
                  <div className="relative w-full md:w-64 md:justify-self-end">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-[#666666]">$</span>
                    {capitalInputMode === 'junior-fixed' ? (
                      <input
                        type="text"
                        value={juniorCapital}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^0-9.]/g, '');
                          setJuniorCapital(formatNumberWithCommas(value));
                        }}
                        className={`w-full h-11 pr-3 pl-6 rounded-md border ${
                          results?.overUtilized ? 'border-[#f59e0b] ring-1 ring-[#f59e0b]' : 'border-[#e5e5e0]'
                        } bg-white text-right text-base text-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent transition-all`}
                        placeholder="1,250,000.00"
                      />
                    ) : (
                      <div className={`w-full h-11 pr-3 pl-6 rounded-md border ${
                        results?.overUtilized ? 'border-[#f59e0b] ring-1 ring-[#f59e0b]' : 'border-[#e5e5e0]'
                      } bg-[#f4f4f0] text-right text-base text-[#666666] flex items-center justify-end`}>
                        {juniorCapital || '—'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Utilization Slider (shown in Advanced) */}
                {showAdvanced && renderUtilizationSlider('complex', 'capital')}
              </div>

              {showAdvanced && (
                <div className="pt-3 border-t border-[#e5e5e0]">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-[#0a0a0a]">Assumptions</p>
                  </div>

                  <div className="mt-3 space-y-3 bg-white border border-[#e5e5e0] rounded-md p-4">
                    <div>
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <label className="text-sm font-medium text-[#0a0a0a]">JT Drawdown Correlation (Beta %)</label>
                        <div className="relative w-24">
                          <input
                            type="number"
                            value={beta}
                            onChange={(e) => {
                              setBeta(e.target.value);
                            }}
                            className="w-full h-11 pr-8 pl-3 rounded-md border border-[#e5e5e0] bg-white text-right text-base text-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent transition-all"
                            placeholder="0"
                            step="0.1"
                            min="0"
                            max="100"
                          />
                          <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-sm text-[#666666]">%</span>
                        </div>
                      </div>
                      <p className="text-xs text-[#666666] mt-1">0% = uncorrelated; 100% = same drawdown path as senior.</p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-[#0a0a0a]">Junior deployment</p>
                      <label className="flex items-start cursor-pointer">
                        <input
                          type="radio"
                          name="juniorDeployment"
                          value="underlying"
                          checked={juniorDeploymentOption === 'underlying'}
                          onChange={(e) => {
                            setJuniorDeploymentOption(e.target.value as 'underlying');
                            setBeta('100');
                          }}
                          className="mt-0.5 h-4 w-4 text-[#0a0a0a] border-[#e5e5e0] focus:ring-[#0a0a0a]"
                        />
                        <span className="ml-2 text-sm">
                          <span className="font-medium text-[#0a0a0a]">Deploy with senior</span>
                          <span className="text-[#666666]"> (earns {underlyingYield}% underlying yield)</span>
                        </span>
                      </label>
                      <label className="flex items-start cursor-pointer">
                        <input
                          type="radio"
                          name="juniorDeployment"
                          value="elsewhere"
                          checked={juniorDeploymentOption === 'elsewhere'}
                          onChange={(e) => {
                            setJuniorDeploymentOption(e.target.value as 'elsewhere');
                            setBeta('0');
                          }}
                          className="mt-0.5 h-4 w-4 text-[#0a0a0a] border-[#e5e5e0] focus:ring-[#0a0a0a]"
                        />
                        <span className="ml-2 text-sm">
                          <span className="font-medium text-[#0a0a0a]">Deploy elsewhere</span>
                          <span className="text-[#666666]"> (custom yield rate)</span>
                        </span>
                      </label>
                    </div>

                    {juniorDeploymentOption === 'elsewhere' && (
                      <div>
                        <label className="block text-sm font-medium text-[#0a0a0a] mb-2">Custom Yield Rate (%)</label>
                        <div className="relative w-full">
                          <input
                            type="number"
                            value={juniorCustomYield}
                            onChange={(e) => {
                              setJuniorCustomYield(e.target.value);
                            }}
                            className="w-full h-11 pr-8 pl-3 rounded-md border border-[#e5e5e0] bg-white text-right text-base text-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent transition-all"
                            placeholder="13"
                            step="0.1"
                            min="0"
                            max="100"
                          />
                          <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-sm text-[#666666]">%</span>
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-[#666666]">
                      Junior keeps their own deployment yield plus their YDM share of senior yield.
                    </p>
                  </div>

                  {/* YDM Curve Parameters */}
                  <div className="bg-white rounded-lg border border-[#e5e5e0] p-6 shadow-sm">
                    <h3 className="text-sm font-semibold text-[#0a0a0a] mb-4 uppercase tracking-wide">
                      YDM Curve Parameters
                    </h3>
                    <p className="text-xs text-[#666666] mb-4">
                      Controls the piecewise linear yield share curve. Y_0 and Y_full set the endpoints; Y_T is the kink at 90% utilization.
                    </p>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs text-[#666666] mb-1">Y₀ (at 0% util)</label>
                        <div className="flex items-center">
                          <input type="text" value={ydmY0}
                            onChange={(e) => { setYdmY0(e.target.value); setAdaptYdm(parseNumber(ydmYT) || defaultAdaptYdm); if (!isCustomSelected) setSelectedExampleId(CUSTOM_PRESET_ID); }}
                            className="w-full border border-[#e5e5e0] rounded-lg px-3 py-2 text-sm" />
                          <span className="ml-1 text-sm text-[#666666]">%</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-[#666666] mb-1">Y_T (at 90% util)</label>
                        <div className="flex items-center">
                          <input type="text" value={ydmYT}
                            onChange={(e) => { setYdmYT(e.target.value); setAdaptYdm(parseFloat(e.target.value) || defaultAdaptYdm); if (!isCustomSelected) setSelectedExampleId(CUSTOM_PRESET_ID); }}
                            className="w-full border border-[#e5e5e0] rounded-lg px-3 py-2 text-sm" />
                          <span className="ml-1 text-sm text-[#666666]">%</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-[#666666] mb-1">Y_full (at 100% util)</label>
                        <div className="flex items-center">
                          <input type="text" value={ydmYFull}
                            onChange={(e) => { setYdmYFull(e.target.value); setAdaptYdm(parseNumber(ydmYT) || defaultAdaptYdm); if (!isCustomSelected) setSelectedExampleId(CUSTOM_PRESET_ID); }}
                            className="w-full border border-[#e5e5e0] rounded-lg px-3 py-2 text-sm" />
                          <span className="ml-1 text-sm text-[#666666]">%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Protocol Fees */}
                  <div className="bg-white rounded-lg border border-[#e5e5e0] p-6 shadow-sm">
                    <h3 className="text-sm font-semibold text-[#0a0a0a] mb-4 uppercase tracking-wide">
                      Protocol Fees
                    </h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs text-[#666666] mb-1">JT Performance Fee</label>
                        <div className="flex items-center">
                          <input type="text" value={jtFee}
                            onChange={(e) => { setJtFee(e.target.value); if (!isCustomSelected) setSelectedExampleId(CUSTOM_PRESET_ID); }}
                            className="w-full border border-[#e5e5e0] rounded-lg px-3 py-2 text-sm" />
                          <span className="ml-1 text-sm text-[#666666]">%</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-[#666666] mb-1">ST Performance Fee</label>
                        <div className="flex items-center">
                          <input type="text" value={stFee}
                            onChange={(e) => { setStFee(e.target.value); if (!isCustomSelected) setSelectedExampleId(CUSTOM_PRESET_ID); }}
                            className="w-full border border-[#e5e5e0] rounded-lg px-3 py-2 text-sm" />
                          <span className="ml-1 text-sm text-[#666666]">%</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-[#666666] mb-1">Yield Share Fee (risk premium)</label>
                        <div className="flex items-center">
                          <input type="text" value={ysFee}
                            onChange={(e) => { setYsFee(e.target.value); if (!isCustomSelected) setSelectedExampleId(CUSTOM_PRESET_ID); }}
                            className="w-full border border-[#e5e5e0] rounded-lg px-3 py-2 text-sm" />
                          <span className="ml-1 text-sm text-[#666666]">%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section Label: Outputs */}
        <div className="flex items-center gap-3 mb-4 mt-10">
          <span className="text-[11px] tracking-wide uppercase text-[#0a0a0a] bg-[#eef0f4] border border-[#e5e5e0] rounded-full px-3 py-1">
            Tranche Outputs
          </span>
          <span className="flex-1 h-px bg-gradient-to-r from-[#d6d6d0] via-[#e5e5e0] to-transparent" />
        </div>



        {/* Results */}
        {results && results.isValid && (
          <div className="space-y-8">
            {/* Tranche Results */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Senior Tranche */}
              <div className="bg-white rounded-lg border-2 border-[#0a0a0a] p-8 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-semibold text-[#0a0a0a]">
                    Senior Tranche
                  </h3>
                  <div className="bg-[#0a0a0a] rounded-full px-4 py-1.5">
                    <span className="text-xs font-medium text-white">
                      Protected
                    </span>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <p className="text-sm text-[#666666] mb-2">
                        Capital Deployed
                      </p>
                      <p className="text-xl font-semibold text-[#0a0a0a]">
                        {formatCurrency(parseNumber(seniorCapital))}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-[#666666] mb-2">
                        Total Value
                      </p>
                      <p className="text-xl font-semibold text-[#0a0a0a]">
                        {formatCurrency(parseNumber(seniorCapital) + results.seniorNetYield)}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-[#e5e5e0] pt-6">
                    <p className="text-sm text-[#666666] mb-2">
                      Annual Yield
                    </p>
                    <p className="text-4xl font-semibold text-[#0a0a0a] mb-2">
                      {formatPercent(results.seniorYieldPercent)}
                    </p>
                    <p className="text-lg text-[#666666]">
                      {formatCurrency(results.seniorNetYield)}
                    </p>

                    <div className="mt-4 bg-[#f8f9fa] rounded-lg p-4 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-[#666666]">Senior share (gross):</span>
                        <span className="text-[#0a0a0a] font-medium">{formatCurrency(results.seniorYield)}</span>
                      </div>
                      {results.totalFees > 0 && (
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-[#666666]">Protocol fees:</span>
                          <span className="text-[#0a0a0a] font-medium">-{formatCurrency(results.seniorYield - results.seniorNetYield)}</span>
                        </div>
                      )}
                      <div className="border-t border-[#e5e5e0] pt-2 mt-2 flex justify-between items-center text-xs">
                        <span className="text-[#0a0a0a] font-medium">Net total:</span>
                        <span className="text-[#0a0a0a] font-semibold">{formatCurrency(results.seniorNetYield)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Junior Tranche */}
              <div className="bg-[#0a0a0a] rounded-lg border-2 border-[#0a0a0a] p-8 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-semibold text-white">
                    Junior Tranche
                  </h3>
                  <div className="bg-white rounded-full px-4 py-1.5">
                    <span className="text-xs font-medium text-[#0a0a0a]">
                      First Loss
                    </span>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <p className="text-sm text-[#cccccc] mb-2">
                        Capital Deployed
                      </p>
                      <p className="text-xl font-semibold text-white">
                        {formatCurrency(parseNumber(juniorCapital))}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-[#cccccc] mb-2">
                        Total Value
                      </p>
                      <p className="text-xl font-semibold text-white">
                        {formatCurrency(parseNumber(juniorCapital) + results.juniorNetYield)}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-[#333333] pt-6">
                    <p className="text-sm text-[#cccccc] mb-2">
                      Annual Yield
                    </p>
                    <p className="text-4xl font-semibold text-white mb-2">
                      {formatPercent(results.juniorYieldPercent)}
                    </p>
                    <p className="text-lg text-[#cccccc] mb-3">
                      {formatCurrency(results.juniorNetYield)}
                    </p>

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
                  </div>
                </div>
              </div>
            </div>

            {/* Utilization Slider (duplicate under tranche outputs) */}
            <div className="bg-white rounded-lg border border-[#e5e5e0] p-6 md:p-8 shadow-sm">
              {renderUtilizationSlider('simple', 'outputs')}
            </div>

            {/* YDM Curve + Net APY */}
            <div className="bg-white rounded-lg p-8 md:p-10 border border-[#e5e5e0] shadow-sm">
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-2xl font-semibold text-[#0a0a0a]">
                    YDM Curve
                  </h2>
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-semibold uppercase tracking-wide text-[#666666]">Adapt YDM</label>
                    <input
                      type="range"
                      min={1}
                      max={100}
                      value={adaptYdm}
                      onChange={(e) => setAdaptYdm(Number(e.target.value))}
                      className="w-32 accent-[#0a0a0a]"
                    />
                    <span className="text-sm font-semibold text-[#0a0a0a] w-10 text-right">{adaptYdm}%</span>
                    <button
                      onClick={() => setAdaptYdm(parseNumber(ydmYT) || defaultAdaptYdm)}
                      className={`text-xs transition-colors ${adaptYdm !== (parseNumber(ydmYT) || defaultAdaptYdm) ? 'text-[#666666] hover:text-[#0a0a0a]' : 'invisible'}`}
                      title="Reset to default"
                    >
                      Reset
                    </button>
                  </div>
                </div>
                <p className="text-sm text-[#666666]">
                  See how YDM yield share and net APYs change with utilization.
                </p>
              </div>

              <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className={`rounded-lg border px-4 py-3 ${results.overUtilized ? 'border-[#f59e0b] bg-[#fff7ed]' : 'border-[#e5e5e0] bg-[#f8f9fa]'}`}>
                  <p className="text-xs text-[#666666]">Current Utilization</p>
                  <p className="text-lg font-semibold text-[#0a0a0a]">{formatPercent(results.utilization * 100)}</p>
                  {results.overUtilized ? (
                    <p className="text-xs text-[#b45309]">Deposits blocked until coverage is restored.</p>
                  ) : (
                    <p className="text-xs text-[#666666]">Within coverage bounds.</p>
                  )}
                </div>
                <div className="rounded-lg border border-[#e5e5e0] bg-[#f8f9fa] px-4 py-3">
                  <p className="text-xs text-[#666666]">JT Yield Share (YDM)</p>
                  <p className="text-lg font-semibold text-[#0a0a0a]">{formatPercent(results.ydmOutput * 100)}</p>
                  <p className="text-xs text-[#666666]">Junior share: {formatCurrency(results.juniorYield)}</p>
                </div>
                <div className="rounded-lg border border-[#e5e5e0] bg-[#f8f9fa] px-4 py-3">
                  <p className="text-xs text-[#666666]">Junior APY</p>
                  <p className="text-lg font-semibold text-[#0a0a0a]">{formatPercent(results.juniorYieldPercent)}</p>
                  <p className="text-xs text-[#666666]">
                    Includes own yield + YDM split.
                  </p>
                </div>
              </div>

              {/* YDM Yield Share chart */}
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 20, right: 30, left: 60, bottom: 5 }}
                    syncId="utilization-sync"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e0" />
                    <XAxis
                      dataKey="utilization"
                      domain={[0, chartMaxUtilization]}
                      ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}
                      stroke="#666666"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      hide
                    />
                    <YAxis
                      label={{ value: 'JT Yield Share (%)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' }, fill: '#0a0a0a', fontSize: 12 }}
                      domain={[0, 100]}
                      ticks={[0, 20, 40, 60, 80, 100]}
                      stroke="#666666"
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white p-3 rounded-lg border-2 border-[#0a0a0a] shadow-lg">
                              <p className="text-xs font-semibold text-[#0a0a0a] mb-1">
                                At {data.utilization.toFixed(1)}% Utilization
                              </p>
                              <div className="flex justify-between gap-4 text-sm">
                                <span className="text-[#666666]">YDM Yield Share:</span>
                                <span className="font-semibold text-[#0a0a0a]">{data.ydm.toFixed(2)}%</span>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <ReferenceLine
                      x={results.utilization * 100}
                      stroke="#0a0a0a"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                    />
                    <ReferenceDot
                      x={results.utilization * 100}
                      y={results.ydmOutput * 100}
                      r={7}
                      fill="#0a0a0a"
                      stroke="#fff"
                      strokeWidth={3}
                    />
                    <Line
                      type="monotone"
                      dataKey="ydm"
                      stroke="#0a0a0a"
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 5, fill: '#666666' }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Net APY chart — tightly coupled */}
              <div className="h-72 -mt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 10, right: 30, left: 60, bottom: 30 }}
                    syncId="utilization-sync"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e0" />
                    <XAxis
                      dataKey="utilization"
                      label={{ value: 'Utilization (%)', position: 'insideBottom', offset: -10, fill: '#0a0a0a', fontSize: 12 }}
                      domain={[0, chartMaxUtilization]}
                      ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}
                      stroke="#666666"
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      label={{ value: 'Net APY (%)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' }, fill: '#0a0a0a', fontSize: 12 }}
                      stroke="#666666"
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white p-3 rounded-lg border-2 border-[#0a0a0a] shadow-lg">
                              <p className="text-xs font-semibold text-[#0a0a0a] mb-1">
                                At {data.utilization.toFixed(1)}% Utilization
                              </p>
                              <div className="space-y-0.5 text-sm">
                                <div className="flex justify-between gap-4">
                                  <span className="text-[#666666]">Junior Net APY:</span>
                                  <span className="font-semibold text-[#16a34a]">{data.juniorAPY.toFixed(2)}%</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-[#666666]">Senior Net APY:</span>
                                  <span className="font-semibold text-[#C8873E]">{data.seniorAPY.toFixed(2)}%</span>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <ReferenceLine
                      x={results.utilization * 100}
                      stroke="#0a0a0a"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                    />
                    <ReferenceLine
                      y={parseNumber(underlyingYield)}
                      stroke="#999999"
                      strokeWidth={1}
                      strokeDasharray="4 4"
                      label={{
                        value: `r=${parseNumber(underlyingYield).toFixed(1)}%`,
                        position: 'right',
                        fill: '#999999',
                        fontSize: 10,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="juniorAPY"
                      name="Junior Net APY"
                      stroke="#16a34a"
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 5, fill: '#16a34a' }}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="seniorAPY"
                      name="Senior Net APY"
                      stroke="#C8873E"
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 5, fill: '#C8873E' }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-2 flex items-center justify-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-1 bg-[#0a0a0a] rounded"></div>
                  <span className="text-xs text-[#666666]">YDM Yield Share</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-1 bg-[#C8873E] rounded"></div>
                  <span className="text-xs text-[#666666]">Senior Net APY</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-1 bg-[#16a34a] rounded"></div>
                  <span className="text-xs text-[#666666]">Junior Net APY</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0 border-t border-dashed border-[#999999]" style={{ width: 16 }}></div>
                  <span className="text-xs text-[#666666]">Underlying Yield</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-16 py-8 border-t border-[#e5e5e0]">
          <div className="max-w-6xl mx-auto px-4 text-center">
            <p className="text-sm text-[#666666] mb-2">
              Built by <a href="https://www.royco.org" target="_blank" rel="noopener noreferrer" className="text-[#0a0a0a] font-medium hover:underline">Royco</a>
            </p>
            <p className="text-xs text-[#999999]">
              Royco Tranching Simulator • Understanding yield tranching through the YDM model
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
