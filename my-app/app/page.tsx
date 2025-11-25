'use client';

import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot } from 'recharts';

export default function YieldSimulator() {
  const [targetCoverage, setTargetCoverage] = useState<string>('25');
  const [underlyingYield, setUnderlyingYield] = useState<string>('10');
  const [seniorCapital, setSeniorCapital] = useState<string>('400,000');
  const [juniorCapital, setJuniorCapital] = useState<string>('100,000');

  const [showRdmGraph, setShowRdmGraph] = useState<boolean>(false);

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
            Yield Tranching Simulator
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Calculate senior and junior tranche yields using the RDM model
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 mb-6">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-6">
            Input Parameters
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Target Coverage (%)
              </label>
              <input
                type="number"
                value={targetCoverage}
                onChange={(e) => setTargetCoverage(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="25"
                step="0.1"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Minimum junior capital as % of senior capital
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Underlying Yield (%)
              </label>
              <input
                type="number"
                value={underlyingYield}
                onChange={(e) => setUnderlyingYield(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="10"
                step="0.1"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Annual yield from underlying source
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Senior Capital ($)
              </label>
              <input
                type="text"
                value={seniorCapital}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9.]/g, '');
                  setSeniorCapital(formatNumberWithCommas(value));
                }}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="400,000"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Amount deployed in senior tranche
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Junior Capital ($)
              </label>
              <input
                type="text"
                value={juniorCapital}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9.]/g, '');
                  setJuniorCapital(formatNumberWithCommas(value));
                }}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="100,000"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Amount providing first-loss coverage
              </p>
            </div>
          </div>
        </div>

        {results && !results.isValid && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6 mb-6">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800 dark:text-red-300">
                  Coverage Requirement Not Met
                </h3>
                <p className="mt-2 text-sm text-red-700 dark:text-red-400">
                  {results.errorMessage}
                </p>
              </div>
            </div>
          </div>
        )}

        {results && results.isValid && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8">
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-6">
                Model Calculations
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
                  <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-1">
                    Utilization
                  </p>
                  <p className="text-2xl font-bold text-blue-900 dark:text-blue-300">
                    {formatPercent(results.utilization * 100)}
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-500 mt-1">
                    Junior / Senior
                  </p>
                </div>

                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-purple-600 dark:text-purple-400">
                      RDM Output
                    </p>
                    <button
                      onClick={() => setShowRdmGraph(!showRdmGraph)}
                      className="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-200 transition-colors"
                    >
                      <svg className={`w-5 h-5 transition-transform ${showRdmGraph ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-2xl font-bold text-purple-900 dark:text-purple-300">
                    {formatPercent(results.rdmOutput * 100)}
                  </p>
                  <p className="text-xs text-purple-600 dark:text-purple-500 mt-1">
                    Yield to Junior
                  </p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-4">
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Total Yield
                  </p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-300">
                    {formatCurrency(results.totalYield)}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-500 mt-1">
                    From underlying source
                  </p>
                </div>
              </div>

              {showRdmGraph && (
                <div className="mt-6 bg-white dark:bg-slate-800 rounded-xl p-6 border-2 border-purple-200 dark:border-purple-800">
                  <h3 className="text-lg font-semibold text-purple-900 dark:text-purple-300 mb-4">
                    RDM Curve Visualization
                  </h3>

                  <div className="h-96">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={generateChartData()}
                        margin={{ top: 30, right: 30, left: 60, bottom: 60 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis
                          dataKey="utilization"
                          label={{ value: 'Utilization (%)', position: 'insideBottom', offset: -10 }}
                          domain={[0, 100]}
                        />
                        <YAxis
                          label={{ value: 'RDM Output (% to Junior)', angle: -90, position: 'center', offset: 10 }}
                          domain={[0, 100]}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border-2 border-blue-500 dark:border-blue-400 shadow-lg">
                                  <p className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">
                                    At {data.utilization.toFixed(1)}% Utilization:
                                  </p>
                                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                    <div>
                                      <p className="text-slate-600 dark:text-slate-400">RDM Output:</p>
                                      <p className="font-bold text-purple-900 dark:text-purple-300">{data.rdm.toFixed(2)}%</p>
                                    </div>
                                    <div>
                                      <p className="text-slate-600 dark:text-slate-400">Junior APY:</p>
                                      <p className="font-bold text-orange-900 dark:text-orange-300">{data.juniorAPY.toFixed(2)}%</p>
                                    </div>
                                    <div>
                                      <p className="text-slate-600 dark:text-slate-400">Junior Yield:</p>
                                      <p className="font-bold text-orange-900 dark:text-orange-300">{formatCurrency(data.juniorYield)}</p>
                                    </div>
                                    <div>
                                      <p className="text-slate-600 dark:text-slate-400">Senior APY:</p>
                                      <p className="font-bold text-green-900 dark:text-green-300">{data.seniorAPY.toFixed(2)}%</p>
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
                          stroke="#9333ea"
                          strokeDasharray="3 3"
                          label={{ value: 'Kink (90%)', position: 'top', fill: '#9333ea' }}
                        />
                        <ReferenceDot
                          x={results.utilization * 100}
                          y={results.rdmOutput * 100}
                          r={8}
                          fill="#f97316"
                          stroke="#fff"
                          strokeWidth={2}
                          label={{ value: 'Current', position: 'top', fill: '#f97316', fontWeight: 'bold' }}
                        />
                        <Line
                          type="monotone"
                          dataKey="rdm"
                          stroke="#9333ea"
                          strokeWidth={3}
                          dot={false}
                          activeDot={{ r: 6, fill: '#3b82f6' }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-2xl shadow-xl p-8 border-2 border-green-200 dark:border-green-800">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold text-green-900 dark:text-green-300">
                    Senior Tranche
                  </h3>
                  <div className="bg-green-200 dark:bg-green-800 rounded-full px-3 py-1">
                    <span className="text-xs font-medium text-green-900 dark:text-green-200">
                      Protected
                    </span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-green-700 dark:text-green-400 mb-1">
                        Capital Deployed
                      </p>
                      <p className="text-xl font-bold text-green-900 dark:text-green-300">
                        {formatCurrency(parseNumber(seniorCapital))}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-green-700 dark:text-green-400 mb-1">
                        Total Value
                      </p>
                      <p className="text-xl font-bold text-green-900 dark:text-green-300">
                        {formatCurrency(parseNumber(seniorCapital) + results.seniorYield)}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-green-200 dark:border-green-800 pt-4">
                    <p className="text-sm text-green-700 dark:text-green-400 mb-1">
                      Annual Yield
                    </p>
                    <p className="text-3xl font-bold text-green-900 dark:text-green-300">
                      {formatPercent(results.seniorYieldPercent)}
                    </p>
                    <p className="text-lg text-green-700 dark:text-green-400 mt-2">
                      {formatCurrency(results.seniorYield)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 rounded-2xl shadow-xl p-8 border-2 border-orange-200 dark:border-orange-800">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold text-orange-900 dark:text-orange-300">
                    Junior Tranche
                  </h3>
                  <div className="bg-orange-200 dark:bg-orange-800 rounded-full px-3 py-1">
                    <span className="text-xs font-medium text-orange-900 dark:text-orange-200">
                      First Loss
                    </span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-orange-700 dark:text-orange-400 mb-1">
                        Capital Deployed
                      </p>
                      <p className="text-xl font-bold text-orange-900 dark:text-orange-300">
                        {formatCurrency(parseNumber(juniorCapital))}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-orange-700 dark:text-orange-400 mb-1">
                        Total Value
                      </p>
                      <p className="text-xl font-bold text-orange-900 dark:text-orange-300">
                        {formatCurrency(parseNumber(juniorCapital) + results.juniorYield)}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-orange-200 dark:border-orange-800 pt-4">
                    <p className="text-sm text-orange-700 dark:text-orange-400 mb-1">
                      Annual Yield
                    </p>
                    <p className="text-3xl font-bold text-orange-900 dark:text-orange-300">
                      {formatPercent(results.juniorYieldPercent)}
                    </p>
                    <p className="text-lg text-orange-700 dark:text-orange-400 mt-2">
                      {formatCurrency(results.juniorYield)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                How the RDM Works
              </h3>
              <div className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
                <p>
                  <strong>Utilization = {formatPercent(results.utilization * 100)}</strong> ((Senior Capital × Target Coverage) / Junior Capital)
                </p>
                {results.utilization < 0.9 ? (
                  <p>
                    Since utilization is below 90%: <strong>RDM = 0.25 × {results.utilization.toFixed(4)} = {formatPercent(results.rdmOutput * 100)}</strong>
                  </p>
                ) : (
                  <p>
                    Since utilization is above 90%: <strong>RDM = 7.75 × ({results.utilization.toFixed(4)} - 0.90) + 0.225 = {formatPercent(results.rdmOutput * 100)}</strong>
                  </p>
                )}
                <p>
                  Junior tranche receives <strong>{formatPercent(results.rdmOutput * 100)}</strong> of total yield, Senior receives the remaining <strong>{formatPercent((1 - results.rdmOutput) * 100)}</strong>
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
