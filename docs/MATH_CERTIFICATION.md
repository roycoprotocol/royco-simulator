# Math certification boundary

All market simulators call the same BigInt/WAD implementation in `lib/try/engine.ts` through `lib/try/backtest.ts`. Market files provide data and parameters; they do not provide accounting formulas.

`npm run sim:certify -- <market-id>` validates the market inputs and runs the checked-in TRY and HYBond Solidity golden-vector parity suites. HYBond currently proves 698/698 sampled outputs over its full daily path; TRY proves the core vector inventory.

This certifies accountant arithmetic given the supplied raw NAV path. It does not certify that the source data is economically appropriate, that parameter choices are safe in the future, or that the optional Junior-replenishment assumption will occur in a live market. Those remain separately disclosed product and data decisions.
