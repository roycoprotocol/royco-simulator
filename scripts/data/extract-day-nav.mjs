#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const BLOCK_CACHE_DIR = path.join(process.env.TMPDIR ?? "/tmp", "royco-day-nav-block-cache");
const DEFAULT_END_DATE = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const BATCH_SIZE = 20;

const SELECTORS = {
  accountingToken: "0xda68cf8b",
  asset: "0x38d52e0f",
  convertToAssets: "0x07a2d13a",
  decimals: "0x313ce567",
  latestRoundData: "0xfeaf968c",
  shareToken: "0x6c9fa59e",
};

const CHAINS = {
  ethereum: {
    chainId: 1,
    rpcUrl: process.env.ETHEREUM_RPC_URL ?? "https://eth-mainnet.public.blastapi.io",
    blockscoutUrl: "https://eth.blockscout.com/api",
  },
  arbitrum: {
    chainId: 42161,
    rpcUrl: process.env.ARBITRUM_RPC_URL ?? "https://arbitrum-one.public.blastapi.io",
    blockscoutUrl: "https://arbitrum.blockscout.com/api",
  },
};

const REDSTONE_MANIFEST_COMMIT = "370c597bbaafb24ada3ac6bca31c92154cbf0d17";
const REDSTONE_MANIFEST_URL =
  `https://github.com/redstone-finance/redstone-oracles-monorepo/blob/${REDSTONE_MANIFEST_COMMIT}/packages/relayer-remote-config/main/relayer-manifests-multi-feed/ethereumMultiFeed.json`;

const ASSETS = {
  acred: {
    kind: "chainlink",
    chain: "ethereum",
    marketId: "acred",
    startDate: "2025-01-30",
    contract: "0xD6BcbbC87bFb6c8964dDc73DC3EaE6d08865d51C",
    expectedDecimals: 8,
    source: "RedStone ACRED_FUNDAMENTAL daily NAV feed",
    sourceUrl: REDSTONE_MANIFEST_URL,
  },
  susdai: {
    kind: "erc4626",
    chain: "arbitrum",
    marketId: "susdai",
    startDate: "2025-05-14",
    contract: "0x0B2b2B2076d95dda7817e785989fE353fe955ef9",
    expectedShareDecimals: 18,
    expectedAssetDecimals: 18,
    source: "Official sUSDai ERC-4626 convertToAssets rate",
    sourceUrl: "https://github.com/usdai-foundation/usdai-contracts/blob/main/src/StakedUSDai.sol",
  },
  "makina-dusd": {
    kind: "makina",
    chain: "ethereum",
    marketId: "makina-dusd",
    startDate: "2025-10-23",
    contract: "0x6b006870c83b1cd49e766ac9209f8d68763df721",
    expectedShareToken: "0x1e33e98af620f1d563fcd3cfd3c75ace841204ef",
    expectedAccountingToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    source: "Official Makina DUSD Machine convertToAssets rate in USDC",
    sourceUrl: "https://docs.makina.finance/strategies/deployments",
  },
  "makina-deth": {
    kind: "makina",
    chain: "ethereum",
    marketId: "makina-deth",
    startDate: "2025-10-23",
    contract: "0x0447d0ad7fd6a3409b48ecbb9ddb075c1e11d735",
    expectedShareToken: "0x871ab8e36cae9af35c6a3488b049965233deb7ed",
    expectedAccountingToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    source: "Official Makina DETH Machine convertToAssets rate in WETH",
    sourceUrl: "https://docs.makina.finance/strategies/deployments",
  },
  "makina-dbit": {
    kind: "makina",
    chain: "ethereum",
    marketId: "makina-dbit",
    startDate: "2025-10-23",
    contract: "0xfcbe132452b6caa32addd4768db8fa02af73d841",
    expectedShareToken: "0x972966bcc17f7d818de4f27dc146ef539c231bdf",
    expectedAccountingToken: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    source: "Official Makina DBIT Machine convertToAssets rate in WBTC",
    sourceUrl: "https://docs.makina.finance/strategies/deployments",
  },
  "makina-usdshfmk": {
    kind: "makina",
    chain: "ethereum",
    marketId: "makina-usdshfmk",
    startDate: "2026-01-22",
    contract: "0x733abb32544f4d3053a58ed747538c060f559108",
    expectedShareToken: "0xaC499adf00A54044b988a59B19016655C3494b06",
    expectedAccountingToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    source: "Official Makina usdSHFmk Machine convertToAssets rate in USDC",
    sourceUrl: "https://docs.makina.finance/strategies/deployments",
  },
};

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const chunks = (values, size) => {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
};

const rpcBatch = async (chainName, requests) => {
  const { rpcUrl } = CHAINS[chainName];
  const responses = [];
  const requestChunks = chunks(requests, BATCH_SIZE);
  for (let chunkIndex = 0; chunkIndex < requestChunks.length; chunkIndex += 1) {
    const requestChunk = requestChunks[chunkIndex];
    let lastError;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        const response = await fetch(rpcUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(requestChunk),
        });
        if (!response.ok) {
          const retryAfter = Number(response.headers.get("retry-after") ?? 0);
          const error = new Error(`${response.status} ${response.statusText}`);
          error.retryAfterMilliseconds = retryAfter > 0 ? retryAfter * 1000 : undefined;
          throw error;
        }
        const body = await response.json();
        if (!Array.isArray(body)) throw new Error(`RPC batch returned non-array response: ${JSON.stringify(body)}`);
        responses.push(...body);
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        if (attempt < 5) await sleep(error.retryAfterMilliseconds ?? 2_000 * attempt);
      }
    }
    if (lastError) throw lastError;
    if (chunkIndex < requestChunks.length - 1) await sleep(1_000);
  }
  return responses;
};

let requestId = 0;
const rpc = async (chainName, method, params) => {
  const id = ++requestId;
  const [response] = await rpcBatch(chainName, [{ jsonrpc: "2.0", id, method, params }]);
  if (response.error) throw new Error(`${chainName} ${method}: ${response.error.message}`);
  return response.result;
};

const hexBlock = (blockNumber) => `0x${blockNumber.toString(16)}`;
const decodeUint = (hex) => BigInt(hex);
const decodeWord = (hex, index) => BigInt(`0x${hex.slice(2 + index * 64, 2 + (index + 1) * 64)}`);
const decodeAddress = (hex) => `0x${hex.slice(-40)}`;
const normalizeAddress = (address) => address.toLowerCase();
const encodeUintCall = (selector, value) => `${selector}${value.toString(16).padStart(64, "0")}`;
const toDecimal = (value, decimals) => Number(value) / 10 ** decimals;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const enumerateDates = (startDate, endDate) => {
  const dates = [];
  for (
    let timestamp = Date.parse(`${startDate}T00:00:00Z`);
    timestamp <= Date.parse(`${endDate}T00:00:00Z`);
    timestamp += 86_400_000
  ) {
    dates.push(new Date(timestamp).toISOString().slice(0, 10));
  }
  return dates;
};

const dayEndTimestamp = (date) => {
  const end = Math.floor(Date.parse(`${date}T23:59:59Z`) / 1000);
  return Math.min(end, Math.floor(Date.now() / 1000));
};

const blockAtOrBeforeTimestamp = async (chainName, timestamp) => {
  const url = new URL(CHAINS[chainName].blockscoutUrl);
  url.searchParams.set("module", "block");
  url.searchParams.set("action", "getblocknobytime");
  url.searchParams.set("timestamp", String(timestamp));
  url.searchParams.set("closest", "before");
  let lastError;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const body = await response.json();
      const blockNumber = Number(body?.result?.blockNumber ?? body?.result);
      if (!Number.isSafeInteger(blockNumber) || blockNumber <= 0) throw new Error(`Unexpected Blockscout response: ${JSON.stringify(body)}`);
      return blockNumber;
    } catch (error) {
      lastError = error;
      if (attempt < 6) await sleep(1_000 * attempt);
    }
  }
  throw lastError;
};

const blockTimestamps = async (chainName, blockNumbers) => {
  const uniqueBlocks = [...new Set(blockNumbers)];
  const requests = uniqueBlocks.map((blockNumber) => ({
    jsonrpc: "2.0",
    id: ++requestId,
    method: "eth_getBlockByNumber",
    params: [hexBlock(blockNumber), false],
    blockNumber,
  }));
  const blockById = new Map(requests.map(({ id, blockNumber }) => [id, blockNumber]));
  const responses = await rpcBatch(chainName, requests.map(({ jsonrpc, id, method, params }) => ({ jsonrpc, id, method, params })));
  const result = new Map();
  for (const response of responses) {
    if (response.error || !response.result) throw new Error(`${chainName} block lookup failed: ${response.error?.message ?? "missing block"}`);
    result.set(blockById.get(response.id), Number(decodeUint(response.result.timestamp)));
  }
  return result;
};

const blocksAtOrBefore = async (chainName, dates) => {
  await mkdir(BLOCK_CACHE_DIR, { recursive: true });
  const cachePath = path.join(BLOCK_CACHE_DIR, `${chainName}-${dates[0]}-${dates.at(-1)}.json`);
  try {
    const cachedRows = JSON.parse(await readFile(cachePath, "utf8"));
    if (Array.isArray(cachedRows) && cachedRows.length === dates.length && cachedRows.every(([date]) => dates.includes(date))) {
      process.stdout.write(`Using cached ${chainName} daily closing blocks.\n`);
      return new Map(cachedRows);
    }
  } catch {
    // A missing or stale cache is rebuilt below.
  }

  const targets = dates.map((date) => ({ date, targetTimestamp: dayEndTimestamp(date) }));
  const firstTarget = targets[0].targetTimestamp;
  const lastTarget = targets.at(-1).targetTimestamp;
  const firstBlock = await blockAtOrBeforeTimestamp(chainName, firstTarget);
  await sleep(1_500);
  const lastBlock = await blockAtOrBeforeTimestamp(chainName, lastTarget);
  const anchorTimestamps = await blockTimestamps(chainName, [firstBlock, lastBlock]);
  const firstBlockTimestamp = anchorTimestamps.get(firstBlock);
  const lastBlockTimestamp = anchorTimestamps.get(lastBlock);
  const secondsPerBlock = (lastBlockTimestamp - firstBlockTimestamp) / (lastBlock - firstBlock);
  const states = targets.map(({ date, targetTimestamp }) => ({
    date,
    targetTimestamp,
    blockNumber: Math.max(firstBlock, Math.min(lastBlock,
      Math.round(firstBlock + (targetTimestamp - firstBlockTimestamp) / secondsPerBlock))),
    resolved: false,
  }));

  for (let iteration = 0; iteration < 12 && states.some((state) => !state.resolved); iteration += 1) {
    const unresolved = states.filter((state) => !state.resolved);
    const timestamps = await blockTimestamps(chainName, unresolved.flatMap((state) => [state.blockNumber, state.blockNumber + 1]));
    for (const state of unresolved) {
      const currentTimestamp = timestamps.get(state.blockNumber);
      const nextTimestamp = timestamps.get(state.blockNumber + 1);
      if (currentTimestamp <= state.targetTimestamp && nextTimestamp > state.targetTimestamp) {
        state.resolved = true;
        continue;
      }
      if (currentTimestamp > state.targetTimestamp) {
        state.blockNumber -= Math.max(1, Math.ceil((currentTimestamp - state.targetTimestamp) / secondsPerBlock));
      } else {
        state.blockNumber += Math.max(1, Math.floor((state.targetTimestamp - nextTimestamp) / secondsPerBlock) + 1);
      }
      state.blockNumber = Math.max(firstBlock, Math.min(lastBlock, state.blockNumber));
    }
  }
  const unresolved = states.filter((state) => !state.resolved);
  for (const state of unresolved) {
    state.blockNumber = await blockAtOrBeforeTimestamp(chainName, state.targetTimestamp);
    state.resolved = true;
    await sleep(1_500);
  }
  const rows = states.map(({ date, targetTimestamp, blockNumber }) => [date, { blockNumber, targetTimestamp }]);
  await writeFile(cachePath, `${JSON.stringify(rows)}\n`);
  return new Map(rows);
};

const batchCalls = async (chainName, contract, callData, dateBlocks) => {
  const requests = [...dateBlocks].map(([date, { blockNumber }]) => ({
    jsonrpc: "2.0",
    id: ++requestId,
    method: "eth_call",
    params: [{ to: contract, data: callData }, hexBlock(blockNumber)],
    date,
    blockNumber,
  }));
  const metadataById = new Map(requests.map(({ id, date, blockNumber }) => [id, { date, blockNumber }]));
  const responses = await rpcBatch(chainName, requests.map(({ jsonrpc, id, method, params }) => ({ jsonrpc, id, method, params })));
  return responses.map((response) => ({ ...metadataById.get(response.id), result: response.result, error: response.error }));
};

const latestCall = (chainName, contract, data) => rpc(chainName, "eth_call", [{ to: contract, data }, "latest"]);

const assertEqual = (actual, expected, label) => {
  if (normalizeAddress(actual) !== normalizeAddress(expected)) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
};

const resolveProbe = async (asset) => {
  if (asset.kind === "chainlink") {
    const decimals = Number(decodeUint(await latestCall(asset.chain, asset.contract, SELECTORS.decimals)));
    if (decimals !== asset.expectedDecimals) throw new Error(`${asset.marketId}: expected ${asset.expectedDecimals} decimals, received ${decimals}`);
    return { callData: SELECTORS.latestRoundData, outputDecimals: decimals, verification: { decimals } };
  }

  if (asset.kind === "erc4626") {
    const shareDecimals = Number(decodeUint(await latestCall(asset.chain, asset.contract, SELECTORS.decimals)));
    const baseAsset = decodeAddress(await latestCall(asset.chain, asset.contract, SELECTORS.asset));
    const assetDecimals = Number(decodeUint(await latestCall(asset.chain, baseAsset, SELECTORS.decimals)));
    if (shareDecimals !== asset.expectedShareDecimals || assetDecimals !== asset.expectedAssetDecimals) {
      throw new Error(`${asset.marketId}: unexpected share/base decimals ${shareDecimals}/${assetDecimals}`);
    }
    const probeShares = 10n ** BigInt(18 + shareDecimals - assetDecimals);
    return {
      callData: encodeUintCall(SELECTORS.convertToAssets, probeShares),
      outputDecimals: 18,
      verification: { shareToken: asset.contract, shareDecimals, baseAsset, assetDecimals, probeShares: probeShares.toString() },
    };
  }

  const shareToken = decodeAddress(await latestCall(asset.chain, asset.contract, SELECTORS.shareToken));
  const accountingToken = decodeAddress(await latestCall(asset.chain, asset.contract, SELECTORS.accountingToken));
  assertEqual(shareToken, asset.expectedShareToken, `${asset.marketId} share token`);
  assertEqual(accountingToken, asset.expectedAccountingToken, `${asset.marketId} accounting token`);
  const shareDecimals = Number(decodeUint(await latestCall(asset.chain, shareToken, SELECTORS.decimals)));
  const accountingDecimals = Number(decodeUint(await latestCall(asset.chain, accountingToken, SELECTORS.decimals)));
  const probeShares = 10n ** BigInt(18 + shareDecimals - accountingDecimals);
  return {
    callData: encodeUintCall(SELECTORS.convertToAssets, probeShares),
    outputDecimals: 18,
    verification: { shareToken, shareDecimals, accountingToken, accountingDecimals, probeShares: probeShares.toString() },
  };
};

const extractAsset = async (assetKey, asset, dateBlocks) => {
  const probe = await resolveProbe(asset);
  const rows = await batchCalls(asset.chain, asset.contract, probe.callData, dateBlocks);
  const observations = [];
  for (const row of rows) {
    if (row.error || !row.result || row.result === "0x") continue;
    try {
      if (asset.kind === "chainlink") {
        const answer = decodeWord(row.result, 1);
        const updatedAt = Number(decodeWord(row.result, 3));
        if (answer <= 0n || updatedAt === 0) continue;
        observations.push({
          date: row.date,
          blockNumber: row.blockNumber,
          rawValue: answer.toString(),
          oracleUpdatedAt: new Date(updatedAt * 1000).toISOString(),
          price: toDecimal(answer, probe.outputDecimals),
        });
      } else {
        const answer = decodeUint(row.result);
        if (answer <= 0n) continue;
        observations.push({
          date: row.date,
          blockNumber: row.blockNumber,
          rawValue: answer.toString(),
          price: toDecimal(answer, probe.outputDecimals),
        });
      }
    } catch {
      // Calls before deployment or initialization can return non-standard data; omit them.
    }
  }
  if (observations.length === 0) throw new Error(`${assetKey}: no historical observations returned`);
  return { probe, observations };
};

const parseArguments = () => {
  const args = process.argv.slice(2);
  const options = { assets: Object.keys(ASSETS), endDate: DEFAULT_END_DATE, write: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--write") options.write = true;
    else if (arg === "--assets") options.assets = args[++index].split(",").map((value) => value.trim());
    else if (arg === "--end") options.endDate = args[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  for (const asset of options.assets) if (!ASSETS[asset]) throw new Error(`Unknown asset: ${asset}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.endDate)) throw new Error("--end must be YYYY-MM-DD");
  return options;
};

const main = async () => {
  const options = parseArguments();
  const datesByChain = new Map();
  for (const assetKey of options.assets) {
    const asset = ASSETS[assetKey];
    const dates = enumerateDates(asset.startDate, options.endDate);
    const existing = datesByChain.get(asset.chain) ?? new Set();
    for (const date of dates) existing.add(date);
    datesByChain.set(asset.chain, existing);
  }

  const blocksByChain = new Map();
  for (const [chainName, dates] of datesByChain) {
    process.stdout.write(`Resolving ${dates.size} ${chainName} daily closing blocks...\n`);
    blocksByChain.set(chainName, await blocksAtOrBefore(chainName, [...dates].sort()));
  }

  const results = {};
  for (const assetKey of options.assets) {
    const asset = ASSETS[assetKey];
    const selectedBlocks = new Map([...blocksByChain.get(asset.chain)].filter(([date]) => date >= asset.startDate));
    process.stdout.write(`Extracting ${assetKey} from ${asset.contract}...\n`);
    results[assetKey] = await extractAsset(assetKey, asset, selectedBlocks);
  }

  const reportDir = path.join(ROOT, "data", "day-nav-provenance");
  if (options.write) await mkdir(reportDir, { recursive: true });
  for (const assetKey of options.assets) {
    const asset = ASSETS[assetKey];
    const { probe, observations } = results[assetKey];
    const series = observations.map(({ date, price }) => ({ date, price }));
    const seriesJson = `${JSON.stringify(series, null, 2)}\n`;
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      source: asset.source,
      sourceUrl: asset.sourceUrl,
      chain: asset.chain,
      chainId: CHAINS[asset.chain].chainId,
      contract: asset.contract,
      rpcMethod: asset.kind === "chainlink" ? "latestRoundData() at daily closing blocks" : "convertToAssets(probeShares) at daily closing blocks",
      verification: probe.verification,
      observationCount: series.length,
      firstDate: series[0].date,
      lastDate: series.at(-1).date,
      seriesSha256: sha256(seriesJson),
      observations,
    };
    process.stdout.write(`${assetKey}: ${series.length} observations, ${series[0].date} to ${series.at(-1).date}, sha256 ${report.seriesSha256}\n`);
    if (options.write) {
      await writeFile(path.join(ROOT, "lib", "day-markets", asset.marketId, "series.json"), seriesJson);
      await writeFile(path.join(reportDir, `${assetKey}.json`), `${JSON.stringify(report, null, 2)}\n`);
    }
  }
};

await main();
