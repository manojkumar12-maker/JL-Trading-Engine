import { fetchJson } from "../crypto/http.js";
import { acquire, ProviderState } from "../crypto/limiter.js";

const goplusState = new ProviderState({
  id: "goplus",
  name: "GoPlus",
  maxPerWindow: 30,
  windowMs: 60_000,
});
const rugcheckState = new ProviderState({
  id: "rugcheck",
  name: "RugCheck",
  maxPerWindow: 30,
  windowMs: 60_000,
});
const dexState = new ProviderState({
  id: "dexscreener",
  name: "DexScreener",
  maxPerWindow: 60,
  windowMs: 60_000,
});
const honeypotState = new ProviderState({
  id: "honeypot",
  name: "Honeypot.is",
  maxPerWindow: 30,
  windowMs: 60_000,
});

export const EVM_CHAIN_IDS = {
  ethereum: 1,
  bsc: 56,
  polygon: 137,
  arbitrum: 42161,
  optimism: 10,
  base: 8453,
  avalanche: 43114,
};

export function normalizeChain(value) {
  const v = String(value || "").toLowerCase();
  const aliases = {
    eth: "ethereum",
    mainnet: "ethereum",
    binance: "bsc",
    "binance-smart-chain": "bsc",
    matic: "polygon",
    "arbitrum-one": "arbitrum",
    avax: "avalanche",
    sol: "solana",
  };
  return aliases[v] || v;
}

export async function fetchDex(address, chain = "") {
  await acquire(dexState);
  const data = await fetchJson(
    `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(address)}`,
    { timeoutMs: 12_000 }
  );

  const allPairs = (data.pairs || []).filter(Boolean);
  if (!allPairs.length) return { pairs: 0, best: null };

  const wanted = normalizeChain(chain);
  const filtered = wanted
    ? allPairs.filter((p) => normalizeChain(p.chainId) === wanted)
    : allPairs;
  const pairs = filtered.length ? filtered : allPairs;

  const best = pairs
    .slice()
    .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];

  return {
    pairs: pairs.length,
    best: {
      chainId: normalizeChain(best.chainId),
      dexId: best.dexId,
      pairAddress: best.pairAddress,
      baseToken: best.baseToken,
      quoteToken: best.quoteToken,
      priceUsd: num(best.priceUsd),
      liquidityUsd: num(best.liquidity?.usd),
      volume24h: num(best.volume?.h24),
      fdv: num(best.fdv),
      marketCap: num(best.marketCap),
      pairCreatedAt: best.pairCreatedAt || null,
      priceChange24h: num(best.priceChange?.h24),
    },
  };
}

export async function fetchGoPlus(address, chain) {
  const chainId = EVM_CHAIN_IDS[chain];
  if (!chainId) throw new Error(`GoPlus does not support chain ${chain}`);

  await acquire(goplusState);
  const data = await fetchJson(
    `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${encodeURIComponent(address)}`,
    { timeoutMs: 12_000 }
  );

  const key = Object.keys(data.result || {})[0];
  const t = key ? data.result[key] : null;
  if (!t) throw new Error("GoPlus returned no data");

  const holders = (t.holders || []).map((h) => ({
    address: h.address,
    percent: num(h.percent) * 100,
  }));
  const lpHolders = t.lp_holders || [];
  const lpLockedPercent = lpHolders.length
    ? lpHolders
        .filter((h) => String(h.is_locked) === "1")
        .reduce((sum, h) => sum + num(h.percent) * 100, 0)
    : null;

  const top1 = holders.length
    ? holders.reduce((max, h) => Math.max(max, h.percent), 0)
    : null;
  const top10 = holders.length
    ? holders
        .slice()
        .sort((a, b) => b.percent - a.percent)
        .slice(0, 10)
        .reduce((sum, h) => sum + h.percent, 0)
    : null;

  return {
    honeypot: String(t.is_honeypot) === "1",
    buyTax: percentOrNull(t.buy_tax),
    sellTax: percentOrNull(t.sell_tax),
    openSource: String(t.is_open_source) === "1",
    mintable: String(t.is_mintable) === "1",
    hiddenOwner: String(t.hidden_owner) === "1",
    canTakeBackOwnership: String(t.can_take_back_ownership) === "1",
    ownerChangeBalance: String(t.owner_change_balance) === "1",
    selfdestruct: String(t.selfdestruct) === "1",
    proxy: String(t.is_proxy) === "1",
    holderCount: t.holder_count ? Number(t.holder_count) : null,
    top1HolderPercent: top1,
    top10HolderPercent: top10,
    lpLockedPercent,
    creatorPercent: percentOrNull(t.creator_percent),
    ownerPercent: percentOrNull(t.owner_percent),
  };
}

export async function fetchHoneypot(address, chain) {
  const chainId = EVM_CHAIN_IDS[chain];
  if (!chainId) throw new Error(`Honeypot.is does not support chain ${chain}`);

  await acquire(honeypotState);
  const data = await fetchJson(
    `https://api.honeypot.is/v2/IsHoneypot?address=${encodeURIComponent(address)}&chainID=${chainId}`,
    { timeoutMs: 12_000 }
  );

  return {
    honeypot: !!data.honeypotResult?.isHoneypot,
    risk: data.summary?.risk || null,
    buyTax: num(data.simulationResult?.buyTax),
    sellTax: num(data.simulationResult?.sellTax),
    simulationSuccess: data.simulationResult?.simulationSuccess ?? null,
  };
}

export async function fetchRugCheck(address) {
  await acquire(rugcheckState);
  const data = await fetchJson(
    `https://api.rugcheck.xyz/v1/tokens/${encodeURIComponent(address)}/report`,
    { timeoutMs: 12_000 }
  );

  const markets = data.markets || [];
  let lpLockedPercent = num(data.lpLockedPct);
  if (!lpLockedPercent && markets.length) {
    lpLockedPercent = Math.max(
      ...markets.map((m) => num(m.lp?.lpLockedPct) || 0)
    );
  }

  const topHolders = (data.topHolders || []).map((h) => ({
    address: h.address,
    percent: num(h.pct) * (num(h.pct) <= 1 ? 100 : 1),
  }));
  const top1 = topHolders.length
    ? Math.max(...topHolders.map((h) => h.percent))
    : null;

  return {
    score: num(data.score),
    scoreNormalised: num(data.score_normalised ?? data.scoreNormalised ?? data.score),
    rugged: !!data.rugged,
    mintAuthority: data.mintAuthority || null,
    freezeAuthority: data.freezeAuthority || null,
    totalMarketLiquidity: num(data.totalMarketLiquidity),
    lpLockedPercent,
    top1HolderPercent: top1,
    risks: (data.risks || []).map((r) => ({
      name: r.name || r.id || "risk",
      description: r.description || "",
      level: r.level || "warn",
      score: num(r.score),
    })),
  };
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function percentOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n * 100 : null;
}
