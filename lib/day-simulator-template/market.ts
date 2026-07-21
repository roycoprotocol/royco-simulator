import type { YDMConfig } from "@/lib/day/engine/types";

export type DaySimulatorDefaults = {
  sourceApy: number;
  coverage: number;
  minLiquidity: number;
  liquidationUtilization: number;
  observationDays: number;
  exitBufferPct: number;
  linkJuniorToFirstLoss: boolean;
  maintainCoverage: boolean;
  riskYDM: YDMConfig;
  liqYDM: YDMConfig;
  selfLiquidationBonus: number;
  stProtocolFee: number;
  jtProtocolFee: number;
  jtYieldShareProtocolFee: number;
  ltYieldShareProtocolFee: number;
  stableYield: number;
  swapFeeBps: number;
  poolTurnoverPerYear: number;
  eclpBandWidth: number;
  reinvestLiquidityPremium: boolean;
  initialST: number;
  initialJT: number;
  initialLT: number;
};

export type DayMarketIdentity = {
  marketName: string;
  displayAssetName: string;
  underlyingAsset: string;
  seniorName: string;
  seniorSymbol: string;
  juniorName: string;
  juniorSymbol: string;
};

export type DayMarketCopy = {
  eyebrow: string;
  title: string;
  description: string;
  disclosure: string;
};

export type DayForwardScenarioId = "expected" | "good" | "normal" | "bad";

export type DayForwardScenario = {
  id: DayForwardScenarioId;
  label: string;
  description: string;
  paymentDelayDays: number;
  terminalRecovery:
    | { kind: "full" }
    | { kind: "amount"; amount: number };
};

export type DayForwardTestCustomization = {
  termDays: number;
  grossInterestRate: number;
  defaultScenario: DayForwardScenarioId;
  scenarios: DayForwardScenario[];
  omitInitialZeroReturnPeriod?: boolean;
  tailRiskDisclosure?: string;
};

export type DayReverseMarketCustomization = {
  strategyCap: number;
  seniorCap: number;
  juniorCap: number;
  issuerName: string;
  juniorFunding: "issuer-funded";
  juniorDeposits: "closed";
  seniorSupportLabel: string;
  seniorSupportAmount: number;
};

export const DAY_PRESENTATION_SECTION_IDS = [
  "senior-summary",
  "roles",
  "market-inputs",
  "liquidity-and-coverage",
  "observation-period",
  "backtest",
  "junior-funding",
  "disclosure",
] as const;

export const DAY_COPY_OVERRIDE_IDS = ["heroTitle", "heroDescription"] as const;

export type DayPresentationSectionId = (typeof DAY_PRESENTATION_SECTION_IDS)[number];

export type DayMarketCustomization = {
  explicitlyAuthorized: boolean;
  authorizationNote: string;
  hiddenSections: DayPresentationSectionId[];
  copyOverrides: {
    heroTitle?: string;
    heroDescription?: string;
  };
  vaultTabs?: {
    group: string;
    label: string;
  };
  backtestDisplay?: {
    returnUnit: "USD" | "ETH" | "BTC";
    footnote?: string;
  };
  forwardTest?: DayForwardTestCustomization;
  reverseMarket?: DayReverseMarketCustomization;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function validateDayMarketCustomization(
  customization: DayMarketCustomization | undefined,
): string[] {
  if (!customization || typeof customization !== "object") {
    return ["customization must be explicit in the market manifest"];
  }

  const issues: string[] = [];
  const allowedCustomizationFields = new Set([
    "explicitlyAuthorized",
    "authorizationNote",
    "hiddenSections",
    "copyOverrides",
    "vaultTabs",
    "backtestDisplay",
    "forwardTest",
    "reverseMarket",
  ]);
  for (const key of Object.keys(customization)) {
    if (!allowedCustomizationFields.has(key)) issues.push(`unsupported customization field: ${key}`);
  }
  const allowedSections = new Set<string>(DAY_PRESENTATION_SECTION_IDS);
  const allowedCopy = new Set<string>(DAY_COPY_OVERRIDE_IDS);
  const hiddenSections = Array.isArray(customization.hiddenSections)
    ? customization.hiddenSections
    : [];
  const copyOverrides = customization.copyOverrides
    && typeof customization.copyOverrides === "object"
    && !Array.isArray(customization.copyOverrides)
    ? customization.copyOverrides
    : {};
  const vaultTabs = customization.vaultTabs;
  const backtestDisplay = customization.backtestDisplay;
  const forwardTest = customization.forwardTest;
  const reverseMarket = customization.reverseMarket;

  if (!Array.isArray(customization.hiddenSections)) {
    issues.push("customization.hiddenSections must be an array");
  }
  if (!customization.copyOverrides || typeof customization.copyOverrides !== "object" || Array.isArray(customization.copyOverrides)) {
    issues.push("customization.copyOverrides must be an object");
  }
  const duplicateSections = hiddenSections.filter((section, index) =>
    hiddenSections.indexOf(section) !== index);
  if (duplicateSections.length) {
    issues.push("customization.hiddenSections must not contain duplicates");
  }
  for (const section of hiddenSections) {
    if (!allowedSections.has(section)) {
      issues.push(`unsupported hidden section: ${String(section)}`);
    }
  }
  for (const [key, value] of Object.entries(copyOverrides)) {
    if (!allowedCopy.has(key)) issues.push(`unsupported copy override: ${key}`);
    if (typeof value !== "string" || !value.trim()) {
      issues.push(`customization.copyOverrides.${key} must be non-empty text`);
    }
  }

  if (vaultTabs !== undefined) {
    if (!vaultTabs || typeof vaultTabs !== "object" || Array.isArray(vaultTabs)) {
      issues.push("customization.vaultTabs must be an object");
    } else {
      const allowedVaultTabFields = new Set(["group", "label"]);
      for (const key of Object.keys(vaultTabs)) {
        if (!allowedVaultTabFields.has(key)) {
          issues.push(`unsupported customization.vaultTabs field: ${key}`);
        }
      }
      if (typeof vaultTabs.group !== "string" || !vaultTabs.group.trim()) {
        issues.push("customization.vaultTabs.group must be non-empty text");
      }
      if (typeof vaultTabs.label !== "string" || !vaultTabs.label.trim()) {
        issues.push("customization.vaultTabs.label must be non-empty text");
      }
    }
  }

  if (backtestDisplay !== undefined) {
    if (!backtestDisplay || typeof backtestDisplay !== "object" || Array.isArray(backtestDisplay)) {
      issues.push("customization.backtestDisplay must be an object");
    } else {
      const allowedBacktestDisplayFields = new Set(["returnUnit", "footnote"]);
      for (const key of Object.keys(backtestDisplay)) {
        if (!allowedBacktestDisplayFields.has(key)) {
          issues.push(`unsupported customization.backtestDisplay field: ${key}`);
        }
      }
      if (!["USD", "ETH", "BTC"].includes(backtestDisplay.returnUnit)) {
        issues.push("customization.backtestDisplay.returnUnit must be USD, ETH, or BTC");
      }
      if (backtestDisplay.footnote !== undefined) {
        if (typeof backtestDisplay.footnote !== "string" || !backtestDisplay.footnote.trim()) {
          issues.push("customization.backtestDisplay.footnote must be non-empty text");
        } else {
          const sentenceCount = backtestDisplay.footnote
            .split(/[.!?](?:\s|$)/)
            .filter((sentence) => sentence.trim()).length;
          if (sentenceCount > 2) {
            issues.push("customization.backtestDisplay.footnote must be no more than two sentences");
          }
        }
      }
    }
  }

  if (forwardTest !== undefined) {
    if (!isRecord(forwardTest)) {
      issues.push("customization.forwardTest must be an object");
    } else {
      const allowedForwardFields = new Set([
        "termDays",
        "grossInterestRate",
        "defaultScenario",
        "scenarios",
        "omitInitialZeroReturnPeriod",
        "tailRiskDisclosure",
      ]);
      for (const key of Object.keys(forwardTest)) {
        if (!allowedForwardFields.has(key)) {
          issues.push(`unsupported customization.forwardTest field: ${key}`);
        }
      }
      if (!Number.isInteger(forwardTest.termDays) || Number(forwardTest.termDays) < 1 || Number(forwardTest.termDays) > 365) {
        issues.push("customization.forwardTest.termDays must be an integer between 1 and 365");
      }
      if (!Number.isFinite(forwardTest.grossInterestRate) || Number(forwardTest.grossInterestRate) <= -1) {
        issues.push("customization.forwardTest.grossInterestRate must be a finite decimal greater than -1");
      }
      const allowedScenarioIds = ["expected", "good", "normal", "bad"];
      if (!allowedScenarioIds.includes(String(forwardTest.defaultScenario))) {
        issues.push("customization.forwardTest.defaultScenario must be expected, good, normal, or bad");
      }
      const scenarios = Array.isArray(forwardTest.scenarios) ? forwardTest.scenarios : [];
      if (!Array.isArray(forwardTest.scenarios)) {
        issues.push("customization.forwardTest.scenarios must be an array");
      }
      const scenarioIds = scenarios.map((scenario) => isRecord(scenario) ? scenario.id : undefined);
      const configuredIds = [...new Set(scenarioIds)].sort().join(",");
      const hasExpectedBadOutcomes = scenarioIds.length === 2 && configuredIds === "bad,expected";
      const hasGoodNormalBadOutcomes = scenarioIds.length === 3 && configuredIds === "bad,good,normal";
      if (!hasExpectedBadOutcomes && !hasGoodNormalBadOutcomes) {
        issues.push("customization.forwardTest.scenarios must contain either expected and bad, or good, normal, and bad");
      }
      for (const [index, scenario] of scenarios.entries()) {
        if (!isRecord(scenario)) {
          issues.push(`customization.forwardTest.scenarios[${index}] must be an object`);
          continue;
        }
        const allowedScenarioFields = new Set([
          "id",
          "label",
          "description",
          "paymentDelayDays",
          "terminalRecovery",
        ]);
        for (const key of Object.keys(scenario)) {
          if (!allowedScenarioFields.has(key)) {
            issues.push(`unsupported customization.forwardTest.scenarios[${index}] field: ${key}`);
          }
        }
        if (!allowedScenarioIds.includes(String(scenario.id))) {
          issues.push(`customization.forwardTest.scenarios[${index}].id must be expected, good, normal, or bad`);
        }
        for (const field of ["label", "description"] as const) {
          if (typeof scenario[field] !== "string" || !scenario[field].trim()) {
            issues.push(`customization.forwardTest.scenarios[${index}].${field} must be non-empty text`);
          }
        }
        if (
          !Number.isInteger(scenario.paymentDelayDays)
          || Number(scenario.paymentDelayDays) < 0
          || Number(scenario.paymentDelayDays) > 365
        ) {
          issues.push(`customization.forwardTest.scenarios[${index}].paymentDelayDays must be an integer between 0 and 365`);
        }
        if (!isRecord(scenario.terminalRecovery)) {
          issues.push(`customization.forwardTest.scenarios[${index}].terminalRecovery must be an object`);
        } else {
          const recoveryFields = new Set(["kind", "amount"]);
          for (const key of Object.keys(scenario.terminalRecovery)) {
            if (!recoveryFields.has(key)) {
              issues.push(`unsupported customization.forwardTest.scenarios[${index}].terminalRecovery field: ${key}`);
            }
          }
          if (!['full', 'amount'].includes(String(scenario.terminalRecovery.kind))) {
            issues.push(`customization.forwardTest.scenarios[${index}].terminalRecovery.kind must be full or amount`);
          }
          if (
            scenario.terminalRecovery.kind === "amount"
            && !(Number.isFinite(scenario.terminalRecovery.amount) && Number(scenario.terminalRecovery.amount) > 0)
          ) {
            issues.push(`customization.forwardTest.scenarios[${index}].terminalRecovery.amount must be positive`);
          }
          if (scenario.terminalRecovery.kind === "full" && "amount" in scenario.terminalRecovery) {
            issues.push(`customization.forwardTest.scenarios[${index}].terminalRecovery.amount is only supported for amount recovery`);
          }
        }
      }
      if (!scenarioIds.includes(forwardTest.defaultScenario)) {
        issues.push("customization.forwardTest.defaultScenario must identify a configured scenario");
      }
      if (
        forwardTest.omitInitialZeroReturnPeriod !== undefined
        && typeof forwardTest.omitInitialZeroReturnPeriod !== "boolean"
      ) {
        issues.push("customization.forwardTest.omitInitialZeroReturnPeriod must be boolean");
      }
      if (forwardTest.tailRiskDisclosure !== undefined) {
        if (typeof forwardTest.tailRiskDisclosure !== "string" || !forwardTest.tailRiskDisclosure.trim()) {
          issues.push("customization.forwardTest.tailRiskDisclosure must be non-empty text");
        }
      }
    }
  }

  if (reverseMarket !== undefined) {
    if (!isRecord(reverseMarket)) {
      issues.push("customization.reverseMarket must be an object");
    } else {
      const allowedReverseFields = new Set([
        "strategyCap",
        "seniorCap",
        "juniorCap",
        "issuerName",
        "juniorFunding",
        "juniorDeposits",
        "seniorSupportLabel",
        "seniorSupportAmount",
      ]);
      for (const key of Object.keys(reverseMarket)) {
        if (!allowedReverseFields.has(key)) {
          issues.push(`unsupported customization.reverseMarket field: ${key}`);
        }
      }
      for (const field of ["strategyCap", "seniorCap", "juniorCap", "seniorSupportAmount"] as const) {
        if (!(Number.isFinite(reverseMarket[field]) && Number(reverseMarket[field]) > 0)) {
          issues.push(`customization.reverseMarket.${field} must be positive`);
        }
      }
      if (
        Number.isFinite(reverseMarket.strategyCap)
        && Number.isFinite(reverseMarket.seniorCap)
        && Number.isFinite(reverseMarket.juniorCap)
        && Math.abs(Number(reverseMarket.strategyCap) - Number(reverseMarket.seniorCap) - Number(reverseMarket.juniorCap)) > 1e-6
      ) {
        issues.push("customization.reverseMarket.strategyCap must equal seniorCap plus juniorCap");
      }
      if (
        Number.isFinite(reverseMarket.seniorSupportAmount)
        && Number.isFinite(reverseMarket.seniorCap)
        && Number(reverseMarket.seniorSupportAmount) > Number(reverseMarket.seniorCap)
      ) {
        issues.push("customization.reverseMarket.seniorSupportAmount may not exceed seniorCap");
      }
      for (const field of ["issuerName", "seniorSupportLabel"] as const) {
        if (typeof reverseMarket[field] !== "string" || !reverseMarket[field].trim()) {
          issues.push(`customization.reverseMarket.${field} must be non-empty text`);
        }
      }
      if (reverseMarket.juniorFunding !== "issuer-funded") {
        issues.push("customization.reverseMarket.juniorFunding must be issuer-funded");
      }
      if (reverseMarket.juniorDeposits !== "closed") {
        issues.push("customization.reverseMarket.juniorDeposits must be closed");
      }
    }
  }

  if (forwardTest && !reverseMarket) {
    issues.push("customization.forwardTest requires customization.reverseMarket capacity inputs");
  }

  const hasDeviation = hiddenSections.length > 0
    || Object.keys(copyOverrides).length > 0
    || vaultTabs !== undefined
    || backtestDisplay !== undefined
    || forwardTest !== undefined
    || reverseMarket !== undefined;
  if (hasDeviation && customization.explicitlyAuthorized !== true) {
    issues.push("market-specific presentation changes require explicit authorization");
  }
  if (hasDeviation && (
    typeof customization.authorizationNote !== "string"
    || customization.authorizationNote.trim().length < 10
  )) {
    issues.push("authorized presentation changes require a specific authorization note");
  }
  if (!hasDeviation && customization.explicitlyAuthorized === true) {
    issues.push("explicit authorization is set but no market-specific presentation change is configured");
  }
  if (typeof customization.explicitlyAuthorized !== "boolean") {
    issues.push("customization.explicitlyAuthorized must be boolean");
  }

  return issues;
}

export function describeDayMarketCustomizations(
  customization: DayMarketCustomization,
): string[] {
  return [
    ...customization.hiddenSections.map((section) => `hide section: ${section}`),
    ...Object.keys(customization.copyOverrides).map((key) => `replace copy: ${key}`),
    ...(customization.vaultTabs
      ? [`vault tab: ${customization.vaultTabs.label} in ${customization.vaultTabs.group}`]
      : []),
    ...(customization.backtestDisplay
      ? [
        `backtest return unit: ${customization.backtestDisplay.returnUnit}`,
        ...(customization.backtestDisplay.footnote ? ["backtest footnote"] : []),
      ]
      : []),
    ...(customization.forwardTest
      ? [
        `finite forward test: ${customization.forwardTest.termDays} days with ${customization.forwardTest.scenarios.map((scenario) => scenario.id).join("/")} scenarios`,
        ...(customization.forwardTest.omitInitialZeroReturnPeriod
          ? ["omit initial zero-return period from forward chart and monthly table"]
          : []),
      ]
      : []),
    ...(customization.reverseMarket
      ? [
        `reverse market: ${customization.reverseMarket.issuerName}-funded Junior capped at ${customization.reverseMarket.juniorCap}`,
        `Senior cap: ${customization.reverseMarket.seniorCap}`,
      ]
      : []),
  ];
}

export function isDaySectionVisible(
  customization: DayMarketCustomization,
  section: DayPresentationSectionId,
): boolean {
  return !customization.hiddenSections.includes(section);
}

export type DayMarketManifest = {
  id: string;
  route: string;
  identity: DayMarketIdentity;
  defaults: DaySimulatorDefaults;
  targets: {
    seniorApyMin: number;
    seniorApyMax: number;
    juniorApyMin: number;
    juniorApyMax: number;
    liquidityApyMin?: number;
    liquidityApyMax?: number;
  };
  certification: {
    intakeConfirmed: boolean;
  };
  customization: DayMarketCustomization;
  provenance: {
    source: string;
    sourceUrl: string;
    sourceProvider: string;
    seriesPath?: string;
    dataMode: "historical-series" | "historical-series-with-published-apy" | "published-apy-forward";
    dataCadence: "daily" | "monthly" | "irregular" | "none";
    priceType: "nav" | "price" | "total-return-index" | "published-apy" | "unknown";
    feesIncluded: boolean | "unknown";
    observationCount: number;
    firstDate: string;
    lastDate: string;
    publishedApy?: number;
    retrievedAt?: string;
    supportingSources?: Array<{
      label: string;
      url: string;
    }>;
  };
};

export type DaySeriesPoint = { date: string; price: number };

export type DayMarket = DayMarketManifest & {
  copy: DayMarketCopy;
  series: DaySeriesPoint[];
};

const percentage = (value: number): string => {
  const percent = value * 100;
  return Number.isInteger(percent) ? String(percent) : percent.toFixed(1);
};

const publishedPercentage = (value: number): string =>
  String(Number((value * 100).toFixed(2)));

const priceTypeLabel = (priceType: DayMarketManifest["provenance"]["priceType"]): string => {
  if (priceType === "nav") return "NAV";
  if (priceType === "total-return-index") return "total-return";
  if (priceType === "price") return "price";
  if (priceType === "published-apy") return "published APY";
  return "price/NAV";
};

export function buildDayMarketCopy(manifest: DayMarketManifest): DayMarketCopy {
  const feeTreatment = manifest.provenance.feesIncluded === true
    ? "fee-inclusive"
    : manifest.provenance.feesIncluded === false
      ? "fee-exclusive"
      : "fee-treatment-unknown";
  const forwardTest = manifest.customization.forwardTest;
  const disclosure = manifest.provenance.dataMode === "published-apy-forward"
    ? forwardTest
      ? `The forward test models a finite ${forwardTest.termDays}-day facility using the published ${publishedPercentage(manifest.provenance.publishedApy ?? manifest.defaults.sourceApy)}% ${feeTreatment} APY and ${(forwardTest.grossInterestRate * 100).toFixed(2)}% gross interest rate supplied by ${manifest.provenance.sourceProvider}; no historical performance series is supplied. Scenario outputs are user-approved mechanism simulations, not historical backtests or forecasts.`
      : `The forward test uses the published ${publishedPercentage(manifest.provenance.publishedApy ?? manifest.defaults.sourceApy)}% APY supplied by ${manifest.provenance.sourceProvider}; no historical performance series is supplied. Simulator outputs are forward mechanism simulations, not historical backtests, forecasts, or an announced product.`
    : manifest.provenance.dataMode === "historical-series-with-published-apy"
      ? `The chart preserves the path of ${manifest.provenance.observationCount} ${feeTreatment} ${manifest.provenance.dataCadence} ${priceTypeLabel(manifest.provenance.priceType)} observations supplied by ${manifest.provenance.sourceProvider}, with its trend calibrated to the published ${publishedPercentage(manifest.provenance.publishedApy ?? manifest.defaults.sourceApy)}% APY input. Simulator outputs are mechanism simulations, not historical backtests, forecasts, or an announced product.`
      : `The source APY is derived from ${manifest.provenance.observationCount} ${feeTreatment} ${manifest.provenance.dataCadence} ${priceTypeLabel(manifest.provenance.priceType)} observations supplied by ${manifest.provenance.sourceProvider}. Simulator outputs are mechanism simulations, not historical backtests, forecasts, or an announced product.`;
  return {
    eyebrow: `ROYCO DAY · ${manifest.identity.marketName.toUpperCase()} MARKET`,
    title: `${manifest.identity.marketName} Day Simulator`,
    description: `Explore a hypothetical three-tranche Royco Day market over ${manifest.identity.underlyingAsset}. Senior receives first-loss coverage from Junior, while a ${percentage(manifest.defaults.minLiquidity)}% minimum liquidity requirement supports secondary-market exits.`,
    disclosure,
  };
}

export function dayMarketFromManifest(
  manifest: DayMarketManifest,
  series: DaySeriesPoint[],
): DayMarket {
  return {
    ...manifest,
    copy: buildDayMarketCopy(manifest),
    series,
  };
}
