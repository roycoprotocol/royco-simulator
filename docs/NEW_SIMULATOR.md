# Create a new simulator

This process is designed for someone who does not edit code.

## What you provide

Give Codex either a public webpage URL containing a historical date/price table or a CSV file with two columns:

```csv
date,price
2024-01-02,1.0000
2024-01-03,1.0012
2024-01-04,0.9987
```

For websites, the importer recognizes HTML tables with a `Date` column and a `NAV`, `Price`, `Close`, `Value`, or index column. It also accepts direct CSV/JSON URLs and public Google Sheets links. JavaScript-only, login-protected, CAPTCHA-protected, and PDF pages need a site-specific extraction step.

Dates may be newest-first or oldest-first; the importer sorts them oldest-first. Prices must be positive. Also provide the market name, underlying asset, data source, whether the series is NAV/price/total return, whether fees are included, and any copy that genuinely must differ for the asset.

## Four commands

```bash
npm run sim:new -- market-id incoming/prices.csv
npm run sim:new -- market-id "https://example.com/historical-prices"
npm run sim:verify -- market-id
npm run sim:preview -- market-id
npm run sim:certify -- market-id
```

1. `sim:new` imports the CSV or public website, creates the market configuration, records the source URL, and adds the route.
2. Edit only `lib/markets/market-id/market.json` to replace placeholders and set asset-specific names, provenance, defaults, and presets.
3. `sim:verify` checks the data, rejects unresolved provenance/copy placeholders, checks preset direction and live engine outputs, and verifies the shared design files against the approved template fingerprint.
4. `sim:preview` starts the local website at `http://localhost:3000/market-id-sim`.
5. `sim:certify` reruns verification and the repository’s wei-exact accountant parity suite.

## Required PASS report

Do not publish unless the command output includes:

```text
runtime PASS
data integrity PASS
copy contract PASS
design boundary PASS
shared accountant parity PASS
certification PASS
```

Then run the normal repository test, lint, and build commands.

## What must stay identical

The shared component owns fonts, colors, borders, spacing, headings, controls, charts, section order, and standard descriptions. New markets cannot override these. The verification command rejects any change to the approved shared design fingerprint. Only the asset name, hero description, provenance, tranche names, legend label, integration placeholders, data, and calibrated parameters belong in the market configuration.

## If verification fails

Do not ask an agent to bypass a check. Correct the data or market configuration. A failure in shared accounting or shared design files is a template-level issue and requires a full audit.
