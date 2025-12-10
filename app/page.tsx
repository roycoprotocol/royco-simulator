'use client';

import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot } from 'recharts';

export default function YieldSimulator() {
  const [targetCoverage, setTargetCoverage] = useState<string>('10');
  const [underlyingYield, setUnderlyingYield] = useState<string>('13');
  const [seniorCapital, setSeniorCapital] = useState<string>('10,000,000');
  const [juniorCapital, setJuniorCapital] = useState<string>('1,250,000.00');
  const [juniorDeploymentOption, setJuniorDeploymentOption] = useState<'underlying' | 'elsewhere'>('underlying');
  const [juniorCustomYield, setJuniorCustomYield] = useState<string>('13');
  const [beta, setBeta] = useState<string>('100');

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
    overUtilized: boolean;
    requiredCoverage: number;
    errorMessage?: string;
  } | null>(() => {
    const targetCoverageNum = parseNumber(targetCoverage) / 100;
    const underlyingYieldNum = parseNumber(underlyingYield) / 100;
    const seniorCapitalNum = parseNumber(seniorCapital);
    const juniorCapitalNum = parseNumber(juniorCapital);
    const juniorCustomYieldNum = parseNumber(juniorCustomYield) / 100;
    const betaNum = parseNumber(beta) / 100;

    if (
      isNaN(targetCoverageNum) ||
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
    const requiredCoverage = (seniorRawNAV + juniorRawNAV * betaNum) * targetCoverageNum;
    const utilization = requiredCoverage / juniorEffectiveNAV;

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
      seniorYieldPercent,
      overUtilized: utilization > 1,
      requiredCoverage
    };
  }, [beta, juniorCapital, juniorCustomYield, juniorDeploymentOption, seniorCapital, targetCoverage, underlyingYield]);

  const chartMaxUtilization = Math.max(100, (results?.utilization ?? 1) * 100);

  const seniorCapitalNumInfo = parseNumber(seniorCapital);
  const targetCoverageNumInfo = parseNumber(targetCoverage) / 100;
  const betaNumInfo = parseNumber(beta) / 100;
  const desiredUtilizationInfo = 0.9;
  const betaCoverageInfo = targetCoverageNumInfo * betaNumInfo;
  const denom90 = desiredUtilizationInfo - betaCoverageInfo;
  const denom100 = 1 - betaCoverageInfo;
  const juniorFor90Info = denom90 > 0 ? (seniorCapitalNumInfo * targetCoverageNumInfo) / denom90 : undefined;
  const juniorMinToStayCovered = denom100 > 0 ? (seniorCapitalNumInfo * targetCoverageNumInfo) / denom100 : undefined;

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
    const betaNum = parseNumber(beta) / 100;

    if (
      isNaN(seniorCapitalNum) ||
      isNaN(targetCoverageNum) ||
      isNaN(betaNum) ||
      seniorCapitalNum <= 0 ||
      targetCoverageNum <= 0
    ) {
      return;
    }

    const targetUtilization = 0.9;
    const betaCoverage = betaNum * targetCoverageNum;
    const denominator = targetUtilization - betaCoverage;

    if (denominator <= 0) {
      return;
    }

    const juniorCapitalFor90 = (seniorCapitalNum * targetCoverageNum) / denominator;
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
                      Utilization ≈ how hard junior is working to cover senior. Higher utilization → junior takes more of the yield pie. The RDM turns this into one % for junior; senior gets the rest.
                    </p>
                  </div>

                  <div className="bg-white rounded-lg border border-[#e5e5e0] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-bold tracking-wide text-[#0a0a0a] bg-[#f1f3f5] px-2 py-1 rounded">3</span>
                      <p className="text-sm font-semibold text-[#0a0a0a]">How to use this</p>
                    </div>
                    <p className="text-sm text-[#555555] leading-relaxed">
                      Enter senior & junior amounts, pick coverage, and let the simulator show each side&apos;s APY based on the RDM output.
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-lg border border-[#e5e5e0] p-5 bg-[#fafaf7] space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#0a0a0a]">Coverage & Rates</h3>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <label className="text-sm font-medium text-[#0a0a0a]">Target Coverage (%)</label>
                    <div className="relative w-24">
                      <input
                        type="number"
                          value={targetCoverage}
                          onChange={(e) => {
                            setTargetCoverage(e.target.value);
                          }}
                        className="w-full h-11 pr-8 pl-3 rounded-md border border-[#e5e5e0] bg-white text-right text-base text-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent transition-all"
                        placeholder="10"
                        step="0.1"
                        min="0"
                        max="100"
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-sm text-[#666666]">%</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    value={targetCoverage}
                    onChange={(e) => {
                      setTargetCoverage(e.target.value);
                    }}
                    min="0"
                    max="100"
                    step="0.1"
                    className="w-full h-2 bg-[#e9e9e3] rounded-full appearance-none cursor-pointer accent-[#0a0a0a]"
                  />
                  <p className="text-xs text-[#666666] mt-1">Junior buffer vs senior exposure.</p>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <label className="text-sm font-medium text-[#0a0a0a]">Underlying Yield (%)</label>
                    <div className="relative w-24">
                      <input
                        type="number"
                        value={underlyingYield}
                        onChange={(e) => {
                          setUnderlyingYield(e.target.value);
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
                  <input
                    type="range"
                    value={underlyingYield}
                    onChange={(e) => {
                      setUnderlyingYield(e.target.value);
                    }}
                    min="0"
                    max="100"
                    step="0.1"
                    className="w-full h-2 bg-[#e9e9e3] rounded-full appearance-none cursor-pointer accent-[#0a0a0a]"
                  />
                  <p className="text-xs text-[#666666] mt-1">APY of the shared opportunity.</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-[#e5e5e0] p-5 bg-[#fafaf7] space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#0a0a0a]">Capital</h3>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <label className="text-sm font-medium text-[#0a0a0a]">Senior Capital ($)</label>
                      <div className="relative w-64">
                        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-[#666666]">$</span>
                        <input
                          type="text"
                        value= {seniorCapital}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^0-9.]/g, '');
                          setSeniorCapital(formatNumberWithCommas(value));
                        }}
                          className="w-full h-11 pr-3 pl-6 rounded-md border border-[#e5e5e0] bg-white text-right text-base text-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent transition-all"
                          placeholder="10,000,000"
                        />
                      </div>
                  </div>
                  <p className="text-xs text-[#666666]">Protected tranche principal.</p>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <label className="text-sm font-medium text-[#0a0a0a]">Junior Capital ($)</label>
                    <div className="relative w-64">
                      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-[#666666]">$</span>
                      <input
                        type="text"
                        value={juniorCapital}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^0-9.]/g, '');
                          setJuniorCapital(formatNumberWithCommas(value));
                        }}
                        className={`w-full h-11 pr-16 pl-6 rounded-md border ${results?.overUtilized ? 'border-[#f59e0b] ring-1 ring-[#f59e0b]' : 'border-[#e5e5e0]'} bg-white text-right text-base text-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent transition-all`}
                        placeholder="1,250,000.00"
                      />
                      <div className="absolute inset-y-0 right-1 flex items-center">
                        <div className="relative">
                          <button
                            onClick={calculate90PercentUtilization}
                            type="button"
                            className="h-9 px-3 text-xs font-medium text-white bg-[#0a0a0a] rounded-md hover:bg-[#2a2a2a] focus:outline-none focus:ring-2 focus:ring-[#0a0a0a] transition-all group"
                          >
                            90%
                          </button>
                          <span className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-64 p-3 text-xs font-normal text-white bg-[#0a0a0a] rounded-lg shadow-lg border border-[#333333] z-10 pointer-events-none">
                            <strong className="block mb-1">Set: 90% Utilization</strong>
                            Automatically sets junior capital for exactly 90% utilization using your senior capital, target coverage, and beta.
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-[#666666]">First-loss tranche principal.</p>
                  {juniorFor90Info && juniorMinToStayCovered && (
                    <div className="mt-2 text-xs text-[#666666] flex items-center gap-2">
                      <div className="relative group">
                        <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-[#0a0a0a] text-white text-[10px] font-semibold cursor-default">?</span>
                        <div className="absolute left-0 mt-2 w-72 p-3 rounded-md border border-[#e5e5e0] bg-white shadow-lg text-xs text-[#666666] opacity-0 group-hover:opacity-100 transition-opacity z-10">
                          <p className="text-[#0a0a0a] font-semibold mb-1">Why {formatCurrency(parseNumber(juniorCapital))}?</p>
                          <p>With {targetCoverage}% coverage and beta {formatPercent(betaNumInfo * 100)}, 90% utilization needs about {formatCurrency(juniorFor90Info)} of junior.</p>
                          <p className="mt-1">The minimum to stay at or below 100% utilization is {formatCurrency(juniorMinToStayCovered)}.</p>
                        </div>
                      </div>
                      <span className="text-[#666666]">Hover to see why this amount is above simple coverage.</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-[#e5e5e0]">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center justify-between w-full text-sm font-medium text-[#0a0a0a]"
                >
                  <span>Advanced assumptions</span>
                  <svg className={`w-5 h-5 text-[#666666] transition-transform ${showAdvanced ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showAdvanced && (
                  <div className="mt-3 space-y-3 bg-[#fafaf7] border border-[#e5e5e0] rounded-md p-4">
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
                    <input
                      type="range"
                      value={beta}
                      onChange={(e) => {
                        setBeta(e.target.value);
                      }}
                      min="0"
                      max="100"
                      step="0.1"
                      className="w-full h-2 bg-[#e5e5e0] rounded-lg appearance-none cursor-pointer accent-[#0a0a0a]"
                    />
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
                        <label className="block text-sm font-medium text-[#0a0a0a] mb-2">
                          Custom Yield Rate (%)
                        </label>
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
                      Junior keeps 100% of their own deployment yield plus their RDM share of senior yield.
                    </p>
                  </div>
                )}
              </div>
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

        {/* Tranche Outputs */}
        {results && results.isValid && (
          <div className="bg-white rounded-lg border border-[#e5e5e0] p-6 md:p-8 mb-8 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className={`rounded-lg border px-4 py-3 ${results.overUtilized ? 'border-[#f59e0b] bg-[#fff7ed]' : 'border-[#e5e5e0] bg-[#f8f9fa]'}`}>
                <p className="text-xs text-[#666666]">Utilization</p>
                <p className="text-lg font-semibold text-[#0a0a0a]">{formatPercent(results.utilization * 100)}</p>
                {results.overUtilized ? (
                  <p className="text-xs text-[#b45309]">Senior deposits blocked</p>
                ) : (
                  <p className="text-xs text-[#666666]">Within coverage bounds.</p>
                )}
              </div>
              <div className="rounded-lg border border-[#e5e5e0] px-4 py-3 bg-[#f8f9fa] space-y-1">
                <p className="text-xs text-[#666666]">RDM Output</p>
                <p className="text-lg font-semibold text-[#0a0a0a]">{formatPercent(results.rdmOutput * 100)}</p>
                <p className="text-xs text-[#666666]">Junior: {formatCurrency(results.juniorYield)}</p>
              </div>
              <div className="rounded-lg border border-[#e5e5e0] px-4 py-3 bg-[#f8f9fa] space-y-1">
                <p className="text-xs text-[#666666]">Total Yield (Senior)</p>
                <p className="text-lg font-semibold text-[#0a0a0a]">{formatCurrency(results.totalYield)}</p>
                <p className="text-xs text-[#666666]">Combined: {formatCurrency(results.combinedTotalYield)}</p>
              </div>
              <div className="rounded-lg border border-[#e5e5e0] px-4 py-3 bg-[#f8f9fa] space-y-1">
                <p className="text-xs text-[#666666]">Req. JT Eff. NAV</p>
                <p className="text-lg font-semibold text-[#0a0a0a]">{formatCurrency(results.requiredCoverage)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Overutilization Banner */}
        {results && results.isValid && results.overUtilized && (
          <div className="bg-[#fff4e5] border-2 border-[#f59e0b] rounded-lg p-6 mb-8 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-[#b45309]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#b45309] mb-1">
                  Utilization Above 100% — New Senior Deposits Blocked
                </h3>
                <p className="text-sm text-[#92400e]">
                  Required junior effective NAV (with beta-adjusted coverage): {formatCurrency(results.requiredCoverage)}. Current junior effective NAV: {formatCurrency(parseNumber(juniorCapital))}. Add junior capital, lower coverage, reduce beta, or withdraw senior capital to reopen deposits.
                </p>
              </div>
            </div>
          </div>
        )}

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
                  <p className="text-xs text-[#666666]">RDM Output to Junior</p>
                  <p className="text-lg font-semibold text-[#0a0a0a]">{formatPercent(results.rdmOutput * 100)}</p>
                  <p className="text-xs text-[#666666]">Junior share: {formatCurrency(results.juniorYield)}</p>
                </div>
                <div className="rounded-lg border border-[#e5e5e0] bg-[#f8f9fa] px-4 py-3">
                  <p className="text-xs text-[#666666]">Junior APY</p>
                  <p className="text-lg font-semibold text-[#0a0a0a]">{formatPercent(results.juniorYieldPercent)}</p>
                  <p className="text-xs text-[#666666]">Includes own yield + RDM split.</p>
                </div>
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
                      domain={[0, chartMaxUtilization]}
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
