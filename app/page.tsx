'use client';

import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot } from 'recharts';

export default function YieldSimulator() {
  const [targetCoverage, setTargetCoverage] = useState<string>('10');
  const [underlyingYield, setUnderlyingYield] = useState<string>('13');
  const [seniorCapital, setSeniorCapital] = useState<string>('10,000,000');
  const [juniorCapital, setJuniorCapital] = useState<string>('1,111,111.11');
  const [juniorDeploymentOption, setJuniorDeploymentOption] = useState<'underlying' | 'elsewhere'>('underlying');
  const [juniorCustomYield, setJuniorCustomYield] = useState<string>('13');

  const [showExplainer, setShowExplainer] = useState<boolean>(false);

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

  const results = useMemo<{
    isValid: boolean;
    utilization: number;
    rdmOutput: number;
    totalYield: number;
    combinedTotalYield: number;
    juniorYield: number;
    juniorOwnYield: number;
    juniorTotalYield: number;
    seniorYield: number;
    juniorYieldPercent: number;
    seniorYieldPercent: number;
    errorMessage?: string;
  } | null>(() => {
    const targetCoverageNum = parseNumber(targetCoverage) / 100;
    const underlyingYieldNum = parseNumber(underlyingYield) / 100;
    const seniorCapitalNum = parseNumber(seniorCapital);
    const juniorCapitalNum = parseNumber(juniorCapital);
    const juniorCustomYieldNum = parseNumber(juniorCustomYield) / 100;

    if (isNaN(targetCoverageNum) || isNaN(underlyingYieldNum) || isNaN(seniorCapitalNum) || isNaN(juniorCapitalNum)) {
      return null;
    }

    if (juniorDeploymentOption === 'elsewhere' && isNaN(juniorCustomYieldNum)) {
      return null;
    }

    if (seniorCapitalNum <= 0 || juniorCapitalNum <= 0) {
      return null;
    }

    const requiredJuniorCapital = seniorCapitalNum * targetCoverageNum;

    if (juniorCapitalNum < requiredJuniorCapital) {
      return {
        isValid: false,
        utilization: 0,
        rdmOutput: 0,
        totalYield: 0,
        combinedTotalYield: 0,
        juniorYield: 0,
        juniorOwnYield: 0,
        juniorTotalYield: 0,
        seniorYield: 0,
        juniorYieldPercent: 0,
        seniorYieldPercent: 0,
        errorMessage: `Junior capital ($${juniorCapitalNum.toLocaleString()}) is below target coverage requirement ($${requiredJuniorCapital.toLocaleString()}). Please increase junior capital or decrease target coverage.`
      };
    }

    const utilization = (seniorCapitalNum * targetCoverageNum) / juniorCapitalNum;

    let rdmOutput: number;
    if (utilization < 0.9) {
      rdmOutput = 0.25 * utilization;
    } else {
      rdmOutput = 7.75 * (utilization - 0.9) + 0.225;
    }

    // Total yield from senior capital deployment
    const totalYield = underlyingYieldNum * seniorCapitalNum;

    // Junior's share of senior's yield (via RDM)
    const juniorYield = rdmOutput * totalYield;

    // Senior's share of senior's yield
    const seniorYield = totalYield - juniorYield;

    // Junior's own yield from their capital deployment
    const juniorYieldRate = juniorDeploymentOption === 'underlying' ? underlyingYieldNum : juniorCustomYieldNum;
    const juniorOwnYield = juniorCapitalNum * juniorYieldRate;

    // Junior's total yield = RDM share + own deployment yield
    const juniorTotalYield = juniorYield + juniorOwnYield;
    const combinedTotalYield = totalYield + juniorOwnYield;

    const juniorYieldPercent = (juniorTotalYield / juniorCapitalNum) * 100;
    const seniorYieldPercent = (seniorYield / seniorCapitalNum) * 100;

    return {
      isValid: true,
      utilization,
      rdmOutput,
      totalYield,
      combinedTotalYield,
      juniorYield,
      juniorOwnYield,
      juniorTotalYield,
      seniorYield,
      juniorYieldPercent,
      seniorYieldPercent
    };
  }, [juniorCapital, juniorCustomYield, juniorDeploymentOption, seniorCapital, targetCoverage, underlyingYield]);

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

  const calculate90PercentUtilization = () => {
    const seniorCapitalNum = parseNumber(seniorCapital);
    const targetCoverageNum = parseNumber(targetCoverage) / 100;

    if (isNaN(seniorCapitalNum) || isNaN(targetCoverageNum) || seniorCapitalNum <= 0 || targetCoverageNum <= 0) {
      return;
    }

    const juniorCapitalFor90 = (seniorCapitalNum * targetCoverageNum) / 0.9;
    setJuniorCapital(formatNumberWithCommas(juniorCapitalFor90.toFixed(2)));
  };

  const calculateRdmAtUtilization = (utilization: number): number => {
    if (utilization < 0.9) {
      return 0.25 * utilization;
    } else {
      return 7.75 * (utilization - 0.9) + 0.225;
    }
  };

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

    for (let i = 0; i <= 1000; i++) {
      const utilization = i / 1000;
      const rdm = calculateRdmAtUtilization(utilization);
      const juniorYield = rdm * seniorYieldPool;
      const seniorYield = seniorYieldPool - juniorYield;
      const juniorTotalYield = juniorYield + juniorOwnYield;
      const juniorAPY = juniorCapitalNum > 0 ? (juniorTotalYield / juniorCapitalNum) * 100 : 0;
      const seniorAPY = seniorCapitalNum > 0 ? (seniorYield / seniorCapitalNum) * 100 : 0;

      data.push({
        utilization: utilization * 100,
        rdm: rdm * 100,
        juniorAPY,
        seniorAPY,
        juniorYield,
        juniorTotalYield,
        seniorYield
      });
    }
    return data;
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
            Calculate senior and junior tranche yields using the RDM model
          </p>
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
            <div className="mt-6 space-y-6 text-[#0a0a0a] border-t border-[#e5e5e0] pt-6">
              {/* What is Yield Tranching */}
              <div>
                <h4 className="text-base font-semibold mb-3 flex items-center gap-2">
                  <span className="bg-[#0a0a0a] text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">1</span>
                  What is Yield Tranching?
                </h4>
                <p className="text-sm text-[#666666] leading-relaxed ml-8">
                  Take one pool of capital earning yield. Split it into two tranches with different risk-return profiles. Senior gets downside protection. Junior gets higher returns.
                </p>
              </div>

              {/* The Two Tranches */}
              <div>
                <h4 className="text-base font-semibold mb-3 flex items-center gap-2">
                  <span className="bg-[#0a0a0a] text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">2</span>
                  The Two Tranches
                </h4>
                <div className="ml-8 space-y-4">
                  <div className="bg-[#f8f9fa] rounded-lg p-4 border border-[#e5e5e0]">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="bg-white border-2 border-[#0a0a0a] rounded px-3 py-1">
                        <span className="text-xs font-medium text-[#0a0a0a]">Senior</span>
                      </div>
                      <span className="text-sm font-semibold text-[#0a0a0a]">Protected Capital</span>
                    </div>
                    <p className="text-sm text-[#666666] leading-relaxed">
                      Gets paid first. Lower yield. Losses covered by junior capital.
                    </p>
                  </div>
                  <div className="bg-[#0a0a0a] rounded-lg p-4 border-2 border-[#0a0a0a]">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="bg-white rounded px-3 py-1">
                        <span className="text-xs font-medium text-[#0a0a0a]">Junior</span>
                      </div>
                      <span className="text-sm font-semibold text-white">First Loss Capital</span>
                    </div>
                    <p className="text-sm text-[#cccccc] leading-relaxed">
                      Takes losses first. Higher yield. Protects senior capital.
                    </p>
                  </div>
                </div>
              </div>

              {/* How It Works */}
              <div>
                <h4 className="text-base font-semibold mb-3 flex items-center gap-2">
                  <span className="bg-[#0a0a0a] text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">3</span>
                  How It Works
                </h4>
                <div className="ml-8 space-y-2 text-sm text-[#666666]">
                  <p>1. Deploy combined capital to earn yield</p>
                  <p>2. Set target coverage ratio (min junior capital as % of senior)</p>
                  <p>3. Calculate utilization: (Senior × Coverage) / Junior</p>
                  <p>4. RDM determines yield split based on utilization</p>
                  <p>5. Higher utilization = junior earns more of the total yield</p>
                </div>
              </div>

              {/* Key Terms */}
              <div>
                <h4 className="text-base font-semibold mb-3 flex items-center gap-2">
                  <span className="bg-[#0a0a0a] text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">4</span>
                  Key Terms
                </h4>
                <div className="ml-8 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-[#f8f9fa] rounded p-3 border border-[#e5e5e0]">
                    <p className="text-sm font-semibold text-[#0a0a0a] mb-1">Utilization</p>
                    <p className="text-xs text-[#666666]">How efficiently junior capital covers senior. Higher = junior earns more.</p>
                  </div>
                  <div className="bg-[#f8f9fa] rounded p-3 border border-[#e5e5e0]">
                    <p className="text-sm font-semibold text-[#0a0a0a] mb-1">RDM Output</p>
                    <p className="text-xs text-[#666666]">Percentage of total yield allocated to junior (not the yield itself).</p>
                  </div>
                  <div className="bg-[#f8f9fa] rounded p-3 border border-[#e5e5e0]">
                    <p className="text-sm font-semibold text-[#0a0a0a] mb-1">Target Coverage</p>
                    <p className="text-xs text-[#666666]">Minimum junior capital as % of senior. 10% = $1M junior per $10M senior.</p>
                  </div>
                  <div className="bg-[#f8f9fa] rounded p-3 border border-[#e5e5e0]">
                    <p className="text-sm font-semibold text-[#0a0a0a] mb-1">Underlying Yield</p>
                    <p className="text-xs text-[#666666]">Base APY before tranching (from staking, lending, etc.).</p>
                  </div>
                </div>
              </div>

              {/* Example with Visuals */}
              <div className="bg-white rounded-lg p-6 border-2 border-[#0a0a0a]">
                <h4 className="text-base font-semibold mb-4 text-[#0a0a0a]">
                  Example Walkthrough
                </h4>

                {/* Capital Input */}
                <div className="mb-6 pb-6 border-b border-[#e5e5e0]">
                  <p className="text-xs font-semibold text-[#666666] mb-3">Starting Capital</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white border-2 border-[#0a0a0a] rounded-lg p-4">
                      <div className="text-xs text-[#666666] mb-1">Senior Capital</div>
                      <div className="text-2xl font-semibold text-[#0a0a0a]">$10M</div>
                    </div>
                    <div className="bg-[#0a0a0a] rounded-lg p-4">
                      <div className="text-xs text-[#cccccc] mb-1">Junior Capital</div>
                      <div className="text-2xl font-semibold text-white">$1.11M</div>
                    </div>
                  </div>
                  <div className="mt-3 bg-[#f8f9fa] rounded p-3">
                    <p className="text-xs text-[#666666]">
                      <strong className="text-[#0a0a0a]">Setup:</strong> 10% target coverage. 13% underlying APY.
                    </p>
                  </div>
                </div>

                {/* Step 1: Utilization */}
                <div className="mb-6 pb-6 border-b border-[#e5e5e0]">
                  <p className="text-xs font-semibold text-[#666666] mb-3">1. Calculate Utilization</p>
                  <div className="bg-[#f8f9fa] rounded-lg p-4 border border-[#e5e5e0]">
                    <div className="font-mono text-sm text-[#0a0a0a] mb-2">
                      ($10M × 10%) / $1.11M = 90%
                    </div>
                    <p className="text-xs text-[#666666]">Junior is 90% utilized protecting senior</p>
                  </div>
                </div>

                {/* Step 2: Total Yield */}
                <div className="mb-6 pb-6 border-b border-[#e5e5e0]">
                  <p className="text-xs font-semibold text-[#666666] mb-3">2. Total Yield Earned</p>
                  <div className="bg-[#f8f9fa] rounded-lg p-4 border border-[#e5e5e0]">
                    <div className="text-2xl font-semibold text-[#0a0a0a] mb-1">$1,300,000 / year</div>
                    <p className="text-xs text-[#666666]">13% APY on $10M senior capital</p>
                  </div>
                </div>

                {/* Step 3: RDM Split - THE KEY PART */}
                <div className="mb-6 pb-6 border-b border-[#e5e5e0]">
                  <p className="text-xs font-semibold text-[#666666] mb-3">3. RDM Splits the $1.3M Yield</p>
                  <div className="bg-[#FFF9E6] rounded-lg p-4 border-2 border-[#FFC107] mb-4">
                    <p className="text-sm font-semibold text-[#0a0a0a] mb-2">⚠️ RDM Output is a PERCENTAGE</p>
                    <p className="text-xs text-[#666666]">At 90% utilization, RDM says: junior gets <strong className="text-[#0a0a0a]">22.5% of the total yield</strong>, senior gets the rest.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#0a0a0a] rounded-lg p-4">
                      <div className="text-xs text-[#cccccc] mb-2">Junior Gets</div>
                      <div className="text-xl font-semibold text-white mb-1">22.5%</div>
                      <div className="text-xs text-[#cccccc] mb-3">of the $1.3M =</div>
                      <div className="text-2xl font-semibold text-white">$292,500</div>
                    </div>
                    <div className="bg-white border-2 border-[#0a0a0a] rounded-lg p-4">
                      <div className="text-xs text-[#666666] mb-2">Senior Gets</div>
                      <div className="text-xl font-semibold text-[#0a0a0a] mb-1">77.5%</div>
                      <div className="text-xs text-[#666666] mb-3">of the $1.3M =</div>
                      <div className="text-2xl font-semibold text-[#0a0a0a]">$1,007,500</div>
                    </div>
                  </div>
                </div>

                {/* Step 4: Final APYs */}
                <div>
                  <p className="text-xs font-semibold text-[#666666] mb-3">4. Each Tranche&apos;s APY</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#0a0a0a] rounded-lg p-4">
                      <div className="text-xs text-[#cccccc] mb-1">Junior APY</div>
                      <div className="text-3xl font-semibold text-white">26.3%</div>
                      <div className="text-xs text-[#cccccc] mt-2">$292K ÷ $1.11M</div>
                    </div>
                    <div className="bg-white border-2 border-[#0a0a0a] rounded-lg p-4">
                      <div className="text-xs text-[#666666] mb-1">Senior APY</div>
                      <div className="text-3xl font-semibold text-[#0a0a0a]">10.08%</div>
                      <div className="text-xs text-[#666666] mt-2">$1.01M ÷ $10M</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input Parameters Card */}
        <div className="bg-white rounded-lg border border-[#e5e5e0] p-8 md:p-10 mb-8 shadow-sm">
          <h2 className="text-2xl font-semibold text-[#0a0a0a] mb-8">
            Input Parameters
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <label className="block text-sm font-medium text-[#0a0a0a] mb-3">
                Target Coverage (%)
              </label>
              <div className="space-y-3">
                <input
                  type="number"
                  value={targetCoverage}
                  onChange={(e) => setTargetCoverage(e.target.value)}
                  className="w-full px-4 py-3 rounded-md border border-[#e5e5e0] bg-white text-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent transition-all"
                  placeholder="10"
                  step="0.1"
                  min="0"
                  max="100"
                />
                <input
                  type="range"
                  value={targetCoverage}
                  onChange={(e) => setTargetCoverage(e.target.value)}
                  min="0"
                  max="100"
                  step="0.1"
                  className="w-full h-2 bg-[#e5e5e0] rounded-lg appearance-none cursor-pointer accent-[#0a0a0a]"
                />
              </div>
              <p className="mt-2 text-sm text-[#666666] leading-relaxed">
                <strong className="text-[#0a0a0a]">What it means:</strong> The minimum amount of junior capital needed to protect senior capital. For example, 10% means you need at least $1 of junior capital for every $10 of senior capital.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#0a0a0a] mb-3">
                Underlying Yield (%)
              </label>
              <div className="space-y-3">
                <input
                  type="number"
                  value={underlyingYield}
                  onChange={(e) => setUnderlyingYield(e.target.value)}
                  className="w-full px-4 py-3 rounded-md border border-[#e5e5e0] bg-white text-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent transition-all"
                  placeholder="13"
                  step="0.1"
                  min="0"
                  max="100"
                />
                <input
                  type="range"
                  value={underlyingYield}
                  onChange={(e) => setUnderlyingYield(e.target.value)}
                  min="0"
                  max="100"
                  step="0.1"
                  className="w-full h-2 bg-[#e5e5e0] rounded-lg appearance-none cursor-pointer accent-[#0a0a0a]"
                />
              </div>
              <p className="mt-2 text-sm text-[#666666] leading-relaxed">
                <strong className="text-[#0a0a0a]">What it means:</strong> The annual percentage yield earned by the combined capital before it&apos;s split between tranches. This comes from sources like staking, lending protocols, or liquidity provision.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#0a0a0a] mb-3">
                Senior Capital ($)
              </label>
              <input
                type="text"
                value={seniorCapital}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9.]/g, '');
                  setSeniorCapital(formatNumberWithCommas(value));
                }}
                className="w-full px-4 py-3 rounded-md border border-[#e5e5e0] bg-white text-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent transition-all"
                placeholder="10,000,000"
              />
              <p className="mt-2 text-sm text-[#666666] leading-relaxed">
                <strong className="text-[#0a0a0a]">What it means:</strong> The protected investment amount that receives priority in case of losses. Senior depositors get lower but more stable returns in exchange for downside protection.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#0a0a0a] mb-3">
                Junior Capital ($)
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={juniorCapital}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9.]/g, '');
                    setJuniorCapital(formatNumberWithCommas(value));
                  }}
                  className="w-full px-4 py-3 pr-16 rounded-md border border-[#e5e5e0] bg-white text-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent transition-all"
                  placeholder="1,111,111.11"
                />
                <button
                  onClick={calculate90PercentUtilization}
                  type="button"
                  className="absolute right-1.5 px-2.5 py-1.5 text-xs font-medium text-white bg-[#0a0a0a] rounded hover:bg-[#2a2a2a] focus:outline-none focus:ring-2 focus:ring-[#0a0a0a] transition-all group"
                >
                  90%
                  <span className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-64 p-3 text-xs font-normal text-white bg-[#0a0a0a] rounded-lg shadow-lg border border-[#333333] z-10 pointer-events-none">
                    <strong className="block mb-1">Set: 90% Utilization</strong>
                    Automatically calculates and sets the junior capital amount needed for exactly 90% utilization based on your current senior capital and target coverage.
                  </span>
                </button>
              </div>

              {/* Junior Deployment Options */}
              <div className="mt-4 space-y-3">
                <label className="block text-sm font-medium text-[#0a0a0a]">
                  Junior Capital Deployment
                </label>
                <div className="space-y-2">
                  <label className="flex items-start cursor-pointer">
                    <input
                      type="radio"
                      name="juniorDeployment"
                      value="underlying"
                      checked={juniorDeploymentOption === 'underlying'}
                      onChange={(e) => setJuniorDeploymentOption(e.target.value as 'underlying')}
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
                      onChange={(e) => setJuniorDeploymentOption(e.target.value as 'elsewhere')}
                      className="mt-0.5 h-4 w-4 text-[#0a0a0a] border-[#e5e5e0] focus:ring-[#0a0a0a]"
                    />
                    <span className="ml-2 text-sm">
                      <span className="font-medium text-[#0a0a0a]">Deploy elsewhere</span>
                      <span className="text-[#666666]"> (custom yield rate)</span>
                    </span>
                  </label>
                </div>

                {juniorDeploymentOption === 'elsewhere' && (
                  <div className="ml-6 mt-3">
                    <label className="block text-sm font-medium text-[#0a0a0a] mb-2">
                      Custom Yield Rate (%)
                    </label>
                    <input
                      type="number"
                      value={juniorCustomYield}
                      onChange={(e) => setJuniorCustomYield(e.target.value)}
                      className="w-full px-4 py-2 rounded-md border border-[#e5e5e0] bg-white text-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent transition-all"
                      placeholder="13"
                      step="0.1"
                      min="0"
                      max="100"
                    />
                  </div>
                )}
              </div>

              <p className="mt-3 text-sm text-[#666666] leading-relaxed">
                <strong className="text-[#0a0a0a]">What it means:</strong> The risk-taking capital that absorbs losses first to protect senior investors. Junior gets <strong className="text-[#0a0a0a]">100% of yield from their own capital</strong> plus their RDM-allocated share of senior&apos;s yield, resulting in higher total returns.
              </p>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {results && !results.isValid && (
          <div className="bg-[#fef2f2] border border-[#fca5a5] rounded-lg p-6 mb-8">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-[#dc2626]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-semibold text-[#dc2626] mb-1">
                  Coverage Requirement Not Met
                </h3>
                <p className="text-sm text-[#991b1b]">
                  {results.errorMessage}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {results && results.isValid && (
          <div className="space-y-8">
            {/* Model Calculations */}
            <div className="bg-white rounded-lg border border-[#e5e5e0] p-8 md:p-10 shadow-sm">
              <h2 className="text-2xl font-semibold text-[#0a0a0a] mb-8">
                Model Calculations
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="bg-[#f8f9fa] rounded-lg p-6 border border-[#e5e5e0]">
                  <p className="text-sm font-medium text-[#666666] mb-2">
                    Utilization
                  </p>
                  <p className="text-3xl font-semibold text-[#0a0a0a] mb-1">
                    {formatPercent(results.utilization * 100)}
                  </p>
                  <p className="text-xs text-[#666666] leading-relaxed mt-2">
                    How efficiently junior capital is being used to cover senior capital. Higher utilization = junior earns more.
                  </p>
                </div>

                <div className="bg-[#f8f9fa] rounded-lg p-6 border border-[#e5e5e0]">
                  <p className="text-sm font-medium text-[#666666] mb-2">
                    RDM Output (% of Yield)
                  </p>
                  <p className="text-3xl font-semibold text-[#0a0a0a] mb-1">
                    {formatPercent(results.rdmOutput * 100)}
                  </p>
                  <p className="text-sm font-medium text-[#0a0a0a] mt-2 mb-1">
                    = {formatCurrency(results.juniorYield)} to junior
                  </p>
                  <p className="text-xs text-[#666666] leading-relaxed">
                    This % determines how the {formatCurrency(results.totalYield)} total yield is split.
                  </p>
                </div>

                <div className="bg-[#f8f9fa] rounded-lg p-6 border border-[#e5e5e0]">
                  <p className="text-sm font-medium text-[#666666] mb-2">
                    Total Yield (from Senior)
                  </p>
                  <p className="text-3xl font-semibold text-[#0a0a0a] mb-1">
                    {formatCurrency(results.totalYield)}
                  </p>
                  <p className="text-xs text-[#666666] leading-relaxed mt-2">
                    Annual yield from senior capital deployment, split between tranches by RDM. Junior also earns separate yield on their own capital.
                  </p>
                </div>

                <div className="bg-[#f0f4ff] rounded-lg p-6 border border-[#cbd5ff]">
                  <p className="text-sm font-medium text-[#475569] mb-2">
                    Combined Annual Yield
                  </p>
                  <p className="text-3xl font-semibold text-[#0f172a] mb-1">
                    {formatCurrency(results.combinedTotalYield)}
                  </p>
                  <p className="text-xs text-[#475569] leading-relaxed mt-2">
                    Includes senior pool yield ({formatCurrency(results.totalYield)}) plus junior&apos;s own deployment yield ({formatCurrency(results.juniorOwnYield)}). RDM split still applies only to senior yield.
                  </p>
                </div>
              </div>

            </div>

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
                        {formatCurrency(parseNumber(seniorCapital) + results.seniorYield)}
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
                      {formatCurrency(results.seniorYield)}
                    </p>
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
                        {formatCurrency(parseNumber(juniorCapital) + results.juniorTotalYield)}
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
                      {formatCurrency(results.juniorTotalYield)}
                    </p>

                    {/* Yield Breakdown */}
                    <div className="bg-[#1a1a1a] rounded-lg p-4 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-[#999999]">From RDM Share:</span>
                        <span className="text-white font-medium">{formatCurrency(results.juniorYield)}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-[#999999]">From Own Capital:</span>
                        <span className="text-white font-medium">{formatCurrency(results.juniorOwnYield)}</span>
                      </div>
                      <div className="border-t border-[#333333] pt-2 mt-2 flex justify-between items-center text-xs">
                        <span className="text-[#cccccc] font-medium">Total:</span>
                        <span className="text-white font-semibold">{formatCurrency(results.juniorTotalYield)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* RDM Curve Visualization */}
            <div className="bg-white rounded-lg p-8 md:p-10 border border-[#e5e5e0] shadow-sm">
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-[#0a0a0a] mb-2">
                  RDM Curve Visualization
                </h2>
                <p className="text-sm text-[#666666]">
                  See how RDM output changes with utilization. Your current position is marked on the curve.
                </p>
              </div>

              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={generateChartData()}
                    margin={{ top: 30, right: 30, left: 120, bottom: 60 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e0" />
                    <XAxis
                      dataKey="utilization"
                      label={{ value: 'Utilization (%)', position: 'insideBottom', offset: -10, fill: '#0a0a0a' }}
                      domain={[0, 100]}
                      ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}
                      stroke="#666666"
                    />
                    <YAxis
                      label={{ value: 'RDM Output (% to Junior)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' }, fill: '#0a0a0a' }}
                      domain={[0, 100]}
                      ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}
                      stroke="#666666"
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white p-4 rounded-lg border-2 border-[#0a0a0a] shadow-lg">
                              <p className="text-sm font-semibold text-[#0a0a0a] mb-2">
                                At {data.utilization.toFixed(1)}% Utilization:
                              </p>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                <div>
                                  <p className="text-[#666666]">RDM Output:</p>
                                  <p className="font-semibold text-[#0a0a0a]">{data.rdm.toFixed(2)}%</p>
                                </div>
                                <div>
                                  <p className="text-[#666666]">Junior APY:</p>
                                  <p className="font-semibold text-[#0a0a0a]">{data.juniorAPY.toFixed(2)}%</p>
                                </div>
                                <div>
                                  <p className="text-[#666666]">Junior Yield (RDM):</p>
                                  <p className="font-semibold text-[#0a0a0a]">{formatCurrency(data.juniorYield)}</p>
                                </div>
                                <div>
                                  <p className="text-[#666666]">Junior Yield (Total):</p>
                                  <p className="font-semibold text-[#0a0a0a]">{formatCurrency(data.juniorTotalYield)}</p>
                                </div>
                                <div>
                                  <p className="text-[#666666]">Senior APY:</p>
                                  <p className="font-semibold text-[#0a0a0a]">{data.seniorAPY.toFixed(2)}%</p>
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
                      label={{
                        value: `Current: ${formatPercent(results.utilization * 100)}`,
                        position: 'top',
                        fill: '#0a0a0a',
                        fontSize: 12,
                        fontWeight: 600
                      }}
                    />
                    <ReferenceDot
                      x={results.utilization * 100}
                      y={results.rdmOutput * 100}
                      r={8}
                      fill="#0a0a0a"
                      stroke="#fff"
                      strokeWidth={3}
                    />
                    <Line
                      type="monotone"
                      dataKey="rdm"
                      stroke="#0a0a0a"
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 6, fill: '#666666' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-6 bg-[#f8f9fa] rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 bg-[#0a0a0a] rounded-full border-2 border-white"></div>
                  <p className="text-sm text-[#666666]">
                    <strong className="text-[#0a0a0a]">Your Position:</strong> {formatPercent(results.utilization * 100)} utilization = {formatPercent(results.rdmOutput * 100)} RDM output
                  </p>
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
              Royco Tranching Simulator • Understanding yield tranching through the RDM model
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
