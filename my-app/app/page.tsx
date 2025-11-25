'use client';

import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot } from 'recharts';

export default function YieldSimulator() {
  const [targetCoverage, setTargetCoverage] = useState<string>('10');
  const [underlyingYield, setUnderlyingYield] = useState<string>('13');
  const [seniorCapital, setSeniorCapital] = useState<string>('10,000,000');
  const [juniorCapital, setJuniorCapital] = useState<string>('1,111,111.11');

  const [showRdmGraph, setShowRdmGraph] = useState<boolean>(false);
  const [showExplainer, setShowExplainer] = useState<boolean>(false);

  const [results, setResults] = useState<{
    isValid: boolean;
    utilization: number;
    rdmOutput: number;
    totalYield: number;
    juniorYield: number;
    seniorYield: number;
    juniorYieldPercent: number;
    seniorYieldPercent: number;
    errorMessage?: string;
  } | null>(null);

  useEffect(() => {
    calculateYields();
  }, [targetCoverage, underlyingYield, seniorCapital, juniorCapital]);

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

  const calculateYields = () => {
    const targetCoverageNum = parseNumber(targetCoverage) / 100;
    const underlyingYieldNum = parseNumber(underlyingYield) / 100;
    const seniorCapitalNum = parseNumber(seniorCapital);
    const juniorCapitalNum = parseNumber(juniorCapital);

    if (isNaN(targetCoverageNum) || isNaN(underlyingYieldNum) || isNaN(seniorCapitalNum) || isNaN(juniorCapitalNum)) {
      setResults(null);
      return;
    }

    if (seniorCapitalNum <= 0 || juniorCapitalNum <= 0) {
      setResults(null);
      return;
    }

    const requiredJuniorCapital = seniorCapitalNum * targetCoverageNum;

    if (juniorCapitalNum < requiredJuniorCapital) {
      setResults({
        isValid: false,
        utilization: 0,
        rdmOutput: 0,
        totalYield: 0,
        juniorYield: 0,
        seniorYield: 0,
        juniorYieldPercent: 0,
        seniorYieldPercent: 0,
        errorMessage: `Junior capital ($${juniorCapitalNum.toLocaleString()}) is below target coverage requirement ($${requiredJuniorCapital.toLocaleString()}). Please increase junior capital or decrease target coverage.`
      });
      return;
    }

    const utilization = (seniorCapitalNum * targetCoverageNum) / juniorCapitalNum;

    let rdmOutput: number;
    if (utilization < 0.9) {
      rdmOutput = 0.25 * utilization;
    } else {
      rdmOutput = 7.75 * (utilization - 0.9) + 0.225;
    }

    const totalYield = underlyingYieldNum * seniorCapitalNum;
    const juniorYield = rdmOutput * totalYield;
    const seniorYield = totalYield - juniorYield;

    const juniorYieldPercent = (juniorYield / juniorCapitalNum) * 100;
    const seniorYieldPercent = (seniorYield / seniorCapitalNum) * 100;

    setResults({
      isValid: true,
      utilization,
      rdmOutput,
      totalYield,
      juniorYield,
      seniorYield,
      juniorYieldPercent,
      seniorYieldPercent
    });
  };

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

    for (let i = 0; i <= 100; i++) {
      const utilization = i / 100;
      const rdm = calculateRdmAtUtilization(utilization);
      const juniorYield = rdm * (results?.totalYield || 0);
      const seniorYield = (results?.totalYield || 0) - juniorYield;
      const juniorAPY = juniorCapitalNum > 0 ? (juniorYield / juniorCapitalNum) * 100 : 0;
      const seniorAPY = seniorCapitalNum > 0 ? (seniorYield / seniorCapitalNum) * 100 : 0;

      data.push({
        utilization: utilization * 100,
        rdm: rdm * 100,
        juniorAPY,
        seniorAPY,
        juniorYield,
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
                  Yield tranching splits a single investment opportunity into two parts with different risk and return profiles. Think of it like slicing a cake into two layers - each layer has different characteristics but they work together as one system.
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
                      Senior capital is <strong>protected first</strong> if anything goes wrong. In exchange for this safety, it receives a <strong>lower but more stable yield</strong>. Perfect for risk-averse investors who prioritize capital preservation.
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
                      Junior capital takes <strong>losses first</strong> to protect the senior tranche. As compensation for this risk, it receives a <strong>higher yield</strong>. Ideal for investors seeking greater returns and comfortable with higher risk.
                    </p>
                  </div>
                </div>
              </div>

              {/* How It Works */}
              <div>
                <h4 className="text-base font-semibold mb-3 flex items-center gap-2">
                  <span className="bg-[#0a0a0a] text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">3</span>
                  How the Math Works
                </h4>
                <div className="ml-8 space-y-3">
                  <p className="text-sm text-[#666666] leading-relaxed">
                    When you invest in yield tranching, here's what happens:
                  </p>
                  <ol className="text-sm text-[#666666] space-y-2 list-decimal list-inside">
                    <li><strong className="text-[#0a0a0a]">Combined capital</strong> is deployed to earn yield from an underlying source (like a lending protocol or staking)</li>
                    <li><strong className="text-[#0a0a0a]">Target Coverage</strong> determines the minimum ratio of junior to senior capital required for safety</li>
                    <li><strong className="text-[#0a0a0a]">The RDM (Risk Distribution Model)</strong> calculates what percentage of the total yield goes to each tranche</li>
                    <li><strong className="text-[#0a0a0a]">Higher utilization</strong> (more senior capital per junior dollar) means junior earns a bigger share</li>
                  </ol>
                </div>
              </div>

              {/* Key Terms */}
              <div>
                <h4 className="text-base font-semibold mb-3 flex items-center gap-2">
                  <span className="bg-[#0a0a0a] text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">4</span>
                  Key Terms to Understand
                </h4>
                <div className="ml-8 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-[#f8f9fa] rounded p-3 border border-[#e5e5e0]">
                    <p className="text-sm font-semibold text-[#0a0a0a] mb-1">Utilization</p>
                    <p className="text-xs text-[#666666]">How much junior capital is being "used" to protect senior capital. Higher = junior earns more.</p>
                  </div>
                  <div className="bg-[#f8f9fa] rounded p-3 border border-[#e5e5e0]">
                    <p className="text-sm font-semibold text-[#0a0a0a] mb-1">RDM Output</p>
                    <p className="text-xs text-[#666666]">The percentage of total yield allocated to junior. Calculated based on utilization.</p>
                  </div>
                  <div className="bg-[#f8f9fa] rounded p-3 border border-[#e5e5e0]">
                    <p className="text-sm font-semibold text-[#0a0a0a] mb-1">Target Coverage</p>
                    <p className="text-xs text-[#666666]">Minimum junior capital required as % of senior (e.g., 10% = $1M junior for every $10M senior).</p>
                  </div>
                  <div className="bg-[#f8f9fa] rounded p-3 border border-[#e5e5e0]">
                    <p className="text-sm font-semibold text-[#0a0a0a] mb-1">Underlying Yield</p>
                    <p className="text-xs text-[#666666]">The base APY earned before splitting between tranches (from staking, lending, etc.).</p>
                  </div>
                </div>
              </div>

              {/* Example */}
              <div className="bg-[#f8f9fa] rounded-lg p-4 border border-[#e5e5e0]">
                <h4 className="text-base font-semibold mb-3 text-[#0a0a0a]">
                  💡 Simple Example
                </h4>
                <p className="text-sm text-[#666666] leading-relaxed">
                  You have $10M earning 13% APY ($1.3M per year). With 10% target coverage, you need at least $1M in junior capital. At 90% utilization, the RDM says junior gets 22.5% of the yield ($292.5K) while senior gets the remaining 77.5% ($1.0075M). This means junior earns <strong className="text-[#0a0a0a]">29.25% APY</strong> on their $1M, while senior earns <strong className="text-[#0a0a0a]">10.08% APY</strong> on their $10M - but with downside protection.
                </p>
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
                <strong className="text-[#0a0a0a]">What it means:</strong> The annual percentage yield earned by the combined capital before it's split between tranches. This comes from sources like staking, lending protocols, or liquidity provision.
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
              <input
                type="text"
                value={juniorCapital}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9.]/g, '');
                  setJuniorCapital(formatNumberWithCommas(value));
                }}
                className="w-full px-4 py-3 rounded-md border border-[#e5e5e0] bg-white text-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent transition-all"
                placeholder="1,111,111.11"
              />
              <p className="mt-2 text-sm text-[#666666] leading-relaxed">
                <strong className="text-[#0a0a0a]">What it means:</strong> The risk-taking capital that absorbs losses first to protect senior investors. Junior depositors receive higher returns as compensation for taking on more risk.
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-[#666666]">
                      RDM Output
                    </p>
                    <button
                      onClick={() => setShowRdmGraph(!showRdmGraph)}
                      className="text-[#0a0a0a] hover:text-[#666666] transition-colors"
                      title="Toggle RDM curve visualization"
                    >
                      <svg className={`w-5 h-5 transition-transform ${showRdmGraph ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-3xl font-semibold text-[#0a0a0a] mb-1">
                    {formatPercent(results.rdmOutput * 100)}
                  </p>
                  <p className="text-xs text-[#666666] leading-relaxed mt-2">
                    Percentage of total yield allocated to junior tranche. The remaining goes to senior.
                  </p>
                </div>

                <div className="bg-[#f8f9fa] rounded-lg p-6 border border-[#e5e5e0]">
                  <p className="text-sm font-medium text-[#666666] mb-2">
                    Total Yield
                  </p>
                  <p className="text-3xl font-semibold text-[#0a0a0a] mb-1">
                    {formatCurrency(results.totalYield)}
                  </p>
                  <p className="text-xs text-[#666666] leading-relaxed mt-2">
                    Combined annual yield earned before splitting between tranches.
                  </p>
                </div>
              </div>

              {/* RDM Graph */}
              {showRdmGraph && (
                <div className="mt-8 bg-white rounded-lg p-8 border-2 border-[#0a0a0a]">
                  <h3 className="text-xl font-semibold text-[#0a0a0a] mb-6">
                    RDM Curve Visualization
                  </h3>

                  <div className="h-96">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={generateChartData()}
                        margin={{ top: 30, right: 30, left: 60, bottom: 60 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e0" />
                        <XAxis
                          dataKey="utilization"
                          label={{ value: 'Utilization (%)', position: 'insideBottom', offset: -10, fill: '#0a0a0a' }}
                          domain={[0, 100]}
                          stroke="#666666"
                        />
                        <YAxis
                          label={{ value: 'RDM Output (% to Junior)', angle: -90, position: 'center', offset: 10, fill: '#0a0a0a' }}
                          domain={[0, 100]}
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
                                      <p className="text-[#666666]">Junior Yield:</p>
                                      <p className="font-semibold text-[#0a0a0a]">{formatCurrency(data.juniorYield)}</p>
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
                          x={90}
                          stroke="#0a0a0a"
                          strokeDasharray="3 3"
                          label={{ value: 'Kink (90%)', position: 'top', fill: '#0a0a0a' }}
                        />
                        <ReferenceDot
                          x={results.utilization * 100}
                          y={results.rdmOutput * 100}
                          r={8}
                          fill="#0a0a0a"
                          stroke="#fff"
                          strokeWidth={2}
                          label={{ value: 'Current', position: 'top', fill: '#0a0a0a', fontWeight: 'bold' }}
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
                </div>
              )}
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
                        {formatCurrency(parseNumber(juniorCapital) + results.juniorYield)}
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
                    <p className="text-lg text-[#cccccc]">
                      {formatCurrency(results.juniorYield)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Explanation */}
            <div className="bg-[#f8f9fa] rounded-lg p-8 border border-[#e5e5e0]">
              <h3 className="text-lg font-semibold text-[#0a0a0a] mb-4">
                📊 Understanding Your Results
              </h3>
              <div className="text-sm text-[#666666] space-y-4 leading-relaxed">
                <div>
                  <p className="font-semibold text-[#0a0a0a] mb-2">Step 1: Calculate Utilization</p>
                  <p className="bg-white rounded p-3 border border-[#e5e5e0] font-mono text-xs">
                    Utilization = (Senior Capital × Target Coverage) / Junior Capital
                  </p>
                  <p className="mt-2">
                    Result: <strong className="text-[#0a0a0a]">{formatPercent(results.utilization * 100)}</strong> - This measures how much junior capital is backing each dollar of senior capital.
                  </p>
                </div>

                <div>
                  <p className="font-semibold text-[#0a0a0a] mb-2">Step 2: Apply the RDM Formula</p>
                  {results.utilization < 0.9 ? (
                    <>
                      <p className="bg-white rounded p-3 border border-[#e5e5e0] font-mono text-xs">
                        RDM = 0.25 × Utilization (because utilization &lt; 90%)
                      </p>
                      <p className="mt-2">
                        Result: <strong className="text-[#0a0a0a]">0.25 × {results.utilization.toFixed(4)} = {formatPercent(results.rdmOutput * 100)}</strong>
                      </p>
                      <p className="mt-2 text-xs">
                        💡 Below 90% utilization, junior's share grows linearly. There's plenty of junior capital to absorb risk.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="bg-white rounded p-3 border border-[#e5e5e0] font-mono text-xs">
                        RDM = 7.75 × (Utilization - 0.90) + 0.225 (because utilization ≥ 90%)
                      </p>
                      <p className="mt-2">
                        Result: <strong className="text-[#0a0a0a]">7.75 × ({results.utilization.toFixed(4)} - 0.90) + 0.225 = {formatPercent(results.rdmOutput * 100)}</strong>
                      </p>
                      <p className="mt-2 text-xs">
                        💡 Above 90% utilization (the "kink"), junior's share grows rapidly. Junior capital is working very hard to protect senior.
                      </p>
                    </>
                  )}
                </div>

                <div>
                  <p className="font-semibold text-[#0a0a0a] mb-2">Step 3: Split the Yield</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white rounded p-3 border border-[#e5e5e0]">
                      <p className="text-xs text-[#666666] mb-1">Junior Gets</p>
                      <p className="text-lg font-semibold text-[#0a0a0a]">{formatPercent(results.rdmOutput * 100)}</p>
                      <p className="text-xs text-[#666666] mt-1">{formatCurrency(results.juniorYield)} total</p>
                    </div>
                    <div className="bg-white rounded p-3 border border-[#e5e5e0]">
                      <p className="text-xs text-[#666666] mb-1">Senior Gets</p>
                      <p className="text-lg font-semibold text-[#0a0a0a]">{formatPercent((1 - results.rdmOutput) * 100)}</p>
                      <p className="text-xs text-[#666666] mt-1">{formatCurrency(results.seniorYield)} total</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
