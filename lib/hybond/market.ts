import {
  HYBOND_DEFAULT_PARAMS,
  HYBOND_NAV_SERIES,
  PRESETS,
} from './scenarios';
import type { SimulatorMarket } from '@/lib/simulator-template/market';

export const HYBOND_MARKET: SimulatorMarket = {
  id: 'hybond',
  route: '/hybond-sim',
  dataCadence: 'daily',
  defaultParams: HYBOND_DEFAULT_PARAMS,
  presets: PRESETS,
  series: HYBOND_NAV_SERIES,
  copy: {
    marketEyebrow: 'ROYCO · srHYBond MARKET',
    title: 'HYBond Sim',
    hero:
      "A hypothetical Royco Senior/Junior market over the BNY Global Short-Dated High Yield Bond Fund. Senior is protected by Junior's first-loss buffer; Junior earns yield for taking that risk.",
    loadedMarket:
      'srHYBond (BNY Global Short-Dated High Yield Bond Fund, real daily NAV)',
    strategyLegend: 'Underlying (fund NAV)',
    seniorTrancheName: 'Royco-ST HYBOND Senior',
    seniorTrancheSymbol: 'ST-HYBOND',
    juniorTrancheName: 'Royco-JT HYBOND Junior',
    juniorTrancheSymbol: 'JT-HYBOND',
    integrationLabel: 'HYBOND',
    footerParagraphs: [
      "The underlying is the real daily NAV history of the BNY Global Short-Dated High Yield Bond Fund, 2,394 business days from November 2016 to July 2026, which reconciles with Insight's published composite June-to-June returns. So the drawdown dates, observation periods, and Junior loss lock-ins shown here are driven by real history, including the COVID selloff of February to March 2020 (a 17.45% fund drawdown) and the 2022 rate and high-yield selloff, both events the mechanism actually sees.",
      "It is still a counterfactual, not a track record. HYBOND the token launched on 1 April 2026 and has no multi-year history of its own, so applying a multi-year backtest to it is illustrative. No Royco market over HYBOND has been announced, so this is an illustration of the mechanism, not a product. HYBOND's own management fee and the fund's charges would reduce these returns.",
      'Backtest math is the Royco Day accountant, proven wei-exact against the contract on this real daily series (698 sampled vectors over the 2,394-day path, all transitions covered). Parameters illustrative, pending accountant sign-off (OPEN-QUESTIONS).',
    ],
  },
  certification: {
    label: 'Accountant parity certified',
    detail:
      'Backtest math is the Royco Day accountant, proven wei-exact against the contract on this real daily series (698 sampled vectors over the 2,394-day path, all transitions covered).',
  },
};
