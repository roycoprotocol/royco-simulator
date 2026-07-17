// Canonical simulator copy. Market definitions cannot override these strings.
export const LOCKED_COPY = {
  overviewEyebrow: 'Overview',
  overviewDescription: 'Current outputs based on the loaded market data and selected terms.',
  customizeEyebrow: 'Customize terms',
  customizeTitle: 'Adjust the current market terms.',
  customizeDescription:
    'The loaded strategy path is already set. These five controls change the market terms.',
  reviewEyebrow: 'Review history',
  reviewTitle: 'Chart, metrics, and mechanics.',
  reviewDescription:
    'Use this to sanity-check observation periods, erased claims, and protocol mechanics.',
  deployEyebrow: 'Deploy handoff',
  deployTitle: 'Copy final market-design parameters.',
  deployDescription:
    'This is the finalized parameter handoff, not the full integration package.',
} as const;
