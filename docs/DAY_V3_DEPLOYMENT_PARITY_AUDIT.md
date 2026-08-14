# Day V3 deployment parity audit

Audited 2026-08-13 against:

- the current `royco-rwa-frontend` deployment flow;
- `royco-day` commit `9764c9e20c8e8af7df1358f228c4be83b78be97f`;
- the canonical E-CLP implementation and differential vectors used by Royco Deploy.

This audit distinguishes issuer design decisions from deployment plumbing. V3
owns relative market design and exports it per $100 Senior. Royco Deploy owns
chain-specific identities, addresses, absolute seed amounts, permissions, and
the final transaction.

## V3-owned deployment configuration

| Configuration | V3 behavior | Deployment mapping |
| --- | --- | --- |
| Senior protection | Optional; exact shared accountant derives Minimum Coverage | `minCoverageWAD`, fixed-term duration, grace, Protected Exit fields |
| Immediate Senior exit | Optional; canonical RWA solver derives pool design and Minimum Liquidity | E-CLP params, pool funding ratio, `minLiquidityWAD` |
| Yield-share curves | Exact Static Curve anchors and caps for active JT/SLP; Fixed 0 for a disabled side | registered YDM type, address, initialization WADs, maximum share WAD |
| Redemption timing | Issuer supplies the in-kind settlement delay and restock conversion facts | EntryPoint redemption delay and exit-promise economics |
| Request schedule | Deposit delay, deposit expiry, withdrawal expiry, and price-update gate | EntryPoint tranche configs |
| Reinvestment protection | Issuer supplies the maximum value SLP reinvestment may give up | `maxReinvestmentSlippageWAD` |

The handoff is versioned, normalized to $100 Senior, and includes chain,
template, block, resolution time, exact registered YDM instances, live fee
provenance, exact E-CLP parameters, and field origins. Illustrative starter
values cannot become deployment-approved merely by surviving a URL reload.

## Fail-closed handoff behavior

- No fallback swap fee, E-CLP, protocol fee, or YDM is exported.
- Enabled JT and SLP sides require registered `STATIC_CURVE` instances.
- Disabled sides require registered `FIXED` instances with zero share and cap.
- JT and SLP registry instances must be distinct, matching the template.
- The exact curves, caps, pool terms, and live policy are fingerprinted.
- Royco Deploy revalidates immediately before simulation and immediately before
  every wallet broadcast. Policy drift or service unavailability clears prior
  acknowledgements and blocks deployment.
- Finite EntryPoint expiries are rechecked against the selected oracle's wait
  bound, fixed-term duration, and the Deploy execution pad. Explicit no-expiry
  remains valid.

## Intentionally downstream in Royco Deploy

These fields do not improve a relative V3 market simulation and remain open in
the transaction flow:

- market/tranche/pool names, symbols, descriptions, artwork, and tags;
- collateral and exit-token addresses, yield-bearing declaration, and rate
  provider;
- oracle type, pricing recipe, source addresses, staleness, valuation unit, and
  dust tolerance;
- blacklist mode, administrator, and initial screened accounts;
- absolute genesis seed, token approvals, deployer, salts, market id, and
  predicted addresses;
- backend listing and post-transaction registration.

Changing the chain, template, collateral, exit asset, rate provider, oracle, or
operational facts invalidates dependent V3 recommendations during revalidation.

Exit-asset APY and annual swap volume remain explicit off-chain forecasting
assumptions, not contract parameters. V3 currently models both as zero and says
so in its return breakdown rather than inventing forecasts.

## Contract capabilities versus Royco Deploy product policy

These are deliberate differences and must not be described as Solidity
requirements:

1. The contract stores independent Senior, Junior, and SLP EntryPoint configs.
   Royco Deploy currently applies one issuer-approved schedule to all three.
2. The contract permits collateral plus quote genesis funding and exposes
   `minLPTAssetsOut`. Royco Deploy currently uses quote-only genesis and a zero
   minimum-out value as an owner/product policy.
3. The contract permits zero active premium caps and dynamically caps an actual
   Protected Exit bonus. Royco Deploy requires positive active caps and limits
   the advertised bonus to the trigger so the quoted rate is payable at
   activation.
4. The current Deploy defaults for request gating and expiry construction are
   product defaults. The contract only enforces field ranges and the 24-hour
   minimum redemption delay.
5. The template forwards E-CLP parameters to Balancer rather than proving the
   off-chain derivation. Royco Deploy therefore performs stricter canonical
   E-CLP and quote validation before deployment.
6. The pool swap-fee interval is a contract rule and is inclusive:
   `0.01–10,000 bps`. Dawn and Royco Deploy now use those exact endpoints.

Minimum Coverage, Minimum Liquidity, yield caps, fixed-term settings, oracle
configuration, and reinvestment slippage can also be changed later by authorized
on-chain administration. The V3 handoff describes initial deployment terms; it
does not imply that every parameter is forever immutable.

## Validation evidence

- Dawn full regression suite: pass.
- Royco Day parity: 78/78 pinned Solidity vectors pass at commit
  `9764c9e20c8e8af7df1358f228c4be83b78be97f`.
- Dawn lint, TypeScript, and production build: pass.
- RWA TypeScript and production build: pass.
- RWA runnable tests: 474 pass, 3 skip.
- The RWA source-reference copy lint requires sibling `royco-day` and backend
  source trees at fixed paths; those trees are absent from the frontend-only
  checkout, so that environment-only check was not claimable as passing.
- Day publication certification passes, including data integrity, calibration
  guardrails, locked copy, the design contract, the full regression suite,
  lint, TypeScript, and the production build.
