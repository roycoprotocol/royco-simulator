export const DAY_LOCKED_COPY = {
  eyebrow: "Royco Day",
  title: "Royco Day Simulator",
  description:
    "See how one yield source can support three positions: Senior Tranche (Sr), Junior Tranche (Jr), and Senior Liquidity Provider (SLP).",
  customizeDescription:
    "Adjust the six displayed inputs below; all other accountant terms come from the market configuration.",
  liquidityBenefit:
    "Sr does not always have to wait for primary redemption. It can sell to the SLP pool at the current market price, although larger sales may receive a worse price.",
  coverageBenefit:
    "Jr takes source losses first. Sr starts losing money only after the Jr buffer is used up.",
  reviewTitle:
    "See how the source history flows through Day.",
  reviewDescription:
    "Follow the source history across the strategy base asset, Sr, Jr, and SLP. Observation Period bands show when a covered drawdown can still recover before the Jr loss is finalized.",
  disclosure:
    "Scenario outputs are mechanism simulations, not historical backtests or forecasts.",
} as const;
