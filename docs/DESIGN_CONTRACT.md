# Design and copy contract

Every generated market renders `components/simulator/MarketSimulator.tsx` inside `SimulatorPageShell.tsx`. No market-local CSS or React component is permitted.

The standard Overview, Customize, Review, and Deploy headings and descriptions are stored in `lib/simulator-template/locked-copy.ts`. The verification command confirms the shared component uses those locked values.

Asset-specific text is limited to the fields in `market.json`: hero, market labels, tranche names, underlying legend, provenance, integration label, and footer disclosure. If a wording or spacing change should apply to every simulator, change the shared template and visually review HYBond plus the example fixture.
