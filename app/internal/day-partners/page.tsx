import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Royco Day Partner Simulators",
  description: "Directory of Royco Day partner market simulators.",
};

const PARTNERS = [
  {
    name: "Pareto FalconX",
    asset: "FalconX",
    href: "/falconx",
  },
  {
    name: "Makina",
    asset: "DUSD · DETH · usdSHFmk · DBIT",
    href: "/makina",
  },
  {
    name: "DualMint",
    asset: "Staked Boring Index Vault",
    href: "/dualmint",
  },
  {
    name: "Blockhouse",
    asset: "Bedrock Strategies",
    href: "/blockhouse",
  },
  {
    name: "USDai",
    asset: "sUSDai",
    href: "/susdai",
  },
  {
    name: "Re",
    asset: "reUSDe",
    href: "/reusde",
  },
  {
    name: "Muga",
    asset: "Muga Glasgow Cosmic",
    href: "/muga",
  },
  {
    name: "Apollo Diversified Credit",
    asset: "ACRED",
    href: "/internal/acred",
  },
  {
    name: "InfiniFi",
    asset: "liUSD-13w",
    href: "/infinifi",
  },
] as const;

export default function DayPartnersPage() {
  return (
    <div className="min-h-screen bg-[#0f1115] text-[#e5e7eb]">
      <header className="border-b border-[#1f242c] bg-[#0a0c10] px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-[#173b32] bg-[#0c211c] px-2.5 py-1 text-[10px] uppercase tracking-widest text-[#5BC8AF]">
              Internal
            </span>
            <span className="text-sm font-medium text-[#e5e7eb]">
              Royco Day
            </span>
          </div>
          <Link
            href="/internal"
            className="text-xs text-[#6b7280] transition-colors hover:text-[#e5e7eb]"
          >
            ← Internal tools
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-16">
        <div className="mb-12">
          <h1 className="mb-2 text-3xl font-semibold tracking-tight text-[#e5e7eb]">
            Day Partner Simulators
          </h1>
          <p className="text-sm text-[#6b7280]">
            Select a partner market to open its simulator.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PARTNERS.map((partner) => (
            <Link
              key={partner.href}
              href={partner.href}
              className="group block rounded-lg border border-[#1f242c] bg-[#0a0c10] p-6 transition-colors hover:border-[#5BC8AF]"
            >
              <div className="mb-3 flex items-start justify-between">
                <span className="text-[10px] uppercase tracking-widest text-[#5BC8AF]">
                  Day
                </span>
                <span className="text-sm text-[#5BC8AF] opacity-0 transition-opacity group-hover:opacity-100">
                  →
                </span>
              </div>
              <h2 className="mb-1 text-base font-medium text-[#e5e7eb]">
                {partner.name}
              </h2>
              <p className="text-xs text-[#6b7280]">{partner.asset}</p>
              <p className="mt-4 font-mono text-[10px] text-[#4b5563]">
                {partner.href}
              </p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
