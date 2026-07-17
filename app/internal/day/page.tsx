"use client";
import { useState } from "react";
import { C } from "./theme";
import Simulator from "./Simulator";
import Comparison from "./Comparison";
import CapitalEfficiency from "./CapitalEfficiency";

type Tab = "sim" | "compare" | "capital";

export default function DayPage() {
  const [tab, setTab] = useState<Tab>("sim");
  return (
    <div className="min-h-screen bg-[#FBFBF8] py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-center gap-3 mb-3">
          <span className="text-[11px] tracking-wide uppercase text-[#0a0a0a] bg-[#eef0f4] border border-[#e5e5e0] rounded-full px-3 py-1">Internal · Day</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-semibold text-[#0a0a0a] mb-3 tracking-tight text-center">Royco Day Simulator</h1>
        <p className="text-lg text-[#666666] max-w-2xl mx-auto text-center mb-8">LP tranche dynamics across market scenarios</p>

        {/* tab nav */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex rounded-md border border-[#e5e5e0] bg-white text-sm overflow-hidden">
            {([["sim", "Simulator"], ["compare", "Dusk vs Day"], ["capital", "Capital efficiency"]] as [Tab, string][]).map(([k, l]) => {
              const on = tab === k;
              return (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={
                    on
                      ? "px-4 py-2 bg-[#0a0a0a] text-white transition-colors"
                      : "px-4 py-2 text-[#666666] hover:bg-[#f4f4f0] transition-colors"
                  }
                >
                  {l}
                </button>
              );
            })}
          </div>
        </div>

        <main>
          {tab === "sim" ? <Simulator /> : tab === "compare" ? <Comparison /> : <CapitalEfficiency />}
        </main>
        <footer style={{ color: C.dim, borderTop: `1px solid ${C.line}` }} className="mt-8 pt-4 text-[10.5px] font-mono">
        Engine mirrors Royco Dawn (RoycoAccountant / RoycoKernel) + the Royco Day LP tranche spec. NAV conservation enforced every step. See AUDIT.md for the line-by-line mapping.
        </footer>
      </div>
    </div>
  );
}
