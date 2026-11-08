import { getRugCheck, listRugChecks, saveRugCheck } from "../../db.js";
import {
  EVM_CHAIN_IDS,
  fetchDex,
  fetchGoPlus,
  fetchHoneypot,
  fetchRugCheck,
  normalizeChain,
} from "./providers.js";

const TTL = 10 * 60_000;

const SEVERITY_ORDER = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

const isEvm = (s) => /^0x[a-fA-F0-9]{40}$/.test(s);
const isBase58 = (s) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
const clampScore = (n) => Math.max(0, Math.min(100, Math.round(n)));

function add(checks, check) {
  checks.push(check);
  return check.points || 0;
}

function verdictFor(score, honeypot) {
  if (honeypot) return "danger";
  if (score >= 70) return "danger";
  if (score >= 40) return "caution";
  return "safe";
}

export async function rugCheck({ address, chain = "", refresh = false } = {}) {
  const addr = String(address || "").trim();
  if (!addr) throw new Error("address is required");
  if (!isEvm(addr) && !isBase58(addr)) {
    throw new Error("address must be an EVM (0x…) or Solana base58 address");
  }

  const requestedChain = normalizeChain(chain);

  if (!refresh) {
    const cached = getRugCheck(addr, requestedChain);
    if (cached && Date.now() - cached.createdAt < TTL) {
      return { ...cached.data, cached: true };
    }
  }

  const dex = await fetchDex(addr, requestedChain).catch(() => null);

  let kind = isEvm(addr) ? "evm" : "solana";
  let resolvedChain = requestedChain || dex?.best?.chainId || (kind === "solana" ? "solana" : "");
  if (resolvedChain === "solana") kind = "solana";
  else if (isEvm(addr)) kind = "evm";

  const providerPromises = [];
  const providerNames = [];

  if (kind === "solana") {
    providerPromises.push(fetchRugCheck(addr));
    providerNames.push("rugcheck");
  } else if (EVM_CHAIN_IDS[resolvedChain]) {
    providerPromises.push(fetchGoPlus(addr, resolvedChain));
    providerNames.push("goplus");
    providerPromises.push(fetchHoneypot(addr, resolvedChain));
    providerNames.push("honeypot");
  }

  const settled = await Promise.allSettled(providerPromises);
  const providerData = {};
  const errors = [];
  settled.forEach((result, i) => {
    const name = providerNames[i];
    if (result.status === "fulfilled") providerData[name] = result.value;
    else errors.push({ provider: name, error: result.reason?.message || "failed" });
  });

  const checks = [];
  let score = 0;

  const liquidity = dex?.best?.liquidityUsd ?? null;
  const ageHours = dex?.best?.pairCreatedAt
    ? (Date.now() - dex.best.pairCreatedAt) / 3_600_000
    : null;

  if (kind === "solana") {
    const rc = providerData.rugcheck;
    if (!rc) {
      throw new Error("RugCheck provider unavailable for this token");
    }

    const base = clampScore(rc.scoreNormalised ?? rc.score ?? 0);
    score += base;
    add(checks, {
      id: "rugcheck-score",
      label: "RugCheck risk score",
      severity: base >= 70 ? "critical" : base >= 40 ? "high" : base >= 15 ? "medium" : "low",
      detail: `Raw score ${rc.scoreNormalised ?? rc.score ?? 0}`,
    });

    if (rc.rugged) score += add(checks, { id: "rugged", label: "Token flagged as rugged", severity: "critical", detail: "RugCheck marks this token as rugged", points: 50 });

    if (rc.mintAuthority) score += add(checks, { id: "mint-authority", label: "Mint authority active", severity: "high", detail: "Owner can mint new tokens", points: 15 });
    if (rc.freezeAuthority) score += add(checks, { id: "freeze-authority", label: "Freeze authority active", severity: "high", detail: "Owner can freeze holder accounts", points: 15 });

    for (const risk of rc.risks || []) {
      add(checks, {
        id: `rugcheck-risk-${risk.name}`.slice(0, 60),
        label: risk.name,
        severity: risk.level === "danger" ? "critical" : risk.level === "warn" ? "medium" : "low",
        detail: risk.description || risk.level,
      });
    }

    if (rc.lpLockedPercent != null && rc.lpLockedPercent < 80) {
      score += add(checks, { id: "lp-unlocked", label: "LP not fully locked", severity: rc.lpLockedPercent < 50 ? "critical" : "high", detail: `${rc.lpLockedPercent.toFixed(1)}% of liquidity locked`, points: 12 });
    }
    if (rc.top1HolderPercent != null && rc.top1HolderPercent > 20) {
      score += add(checks, { id: "holder-concentration", label: "Top holder concentration", severity: "high", detail: `Top holder holds ${rc.top1HolderPercent.toFixed(1)}%`, points: 10 });
    }
  } else {
    const gp = providerData.goplus;
    const hp = providerData.honeypot;
    const honeypot = !!(gp?.honeypot || hp?.honeypot);
    const buyTax = gp?.buyTax ?? hp?.buyTax ?? null;
    const sellTax = gp?.sellTax ?? hp?.sellTax ?? null;

    if (honeypot) {
      score += add(checks, { id: "honeypot", label: "Honeypot detected", severity: "critical", detail: "Sells are blocked or redirected", points: 100 });
    } else {
      add(checks, { id: "honeypot-ok", label: "No honeypot detected", severity: "info", detail: "Buy/sell appears possible" });
    }

    if (!gp && !hp) {
      score += add(checks, { id: "no-security-data", label: "No token security data", severity: "medium", detail: `No GoPlus/Honeypot data for chain ${resolvedChain || "unknown"}`, points: 25 });
    }

    if (sellTax != null) {
      if (sellTax >= 50) score += add(checks, { id: "sell-tax", label: "Extreme sell tax", severity: "critical", detail: `${sellTax.toFixed(1)}% sell tax`, points: 40 });
      else if (sellTax >= 10) score += add(checks, { id: "sell-tax", label: "High sell tax", severity: "high", detail: `${sellTax.toFixed(1)}% sell tax`, points: 20 });
      else if (sellTax >= 5) score += add(checks, { id: "sell-tax", label: "Elevated sell tax", severity: "medium", detail: `${sellTax.toFixed(1)}% sell tax`, points: 8 });
    }

    if (buyTax != null) {
      if (buyTax >= 10) score += add(checks, { id: "buy-tax", label: "High buy tax", severity: "medium", detail: `${buyTax.toFixed(1)}% buy tax`, points: 8 });
      else if (buyTax >= 5) score += add(checks, { id: "buy-tax", label: "Elevated buy tax", severity: "low", detail: `${buyTax.toFixed(1)}% buy tax`, points: 4 });
    }

    if (gp) {
      if (!gp.openSource) score += add(checks, { id: "unverified", label: "Contract not verified", severity: "high", detail: "Source code is not open", points: 15 });
      if (gp.mintable) score += add(checks, { id: "mintable", label: "Mintable supply", severity: "high", detail: "Owner can mint more tokens", points: 12 });
      if (gp.hiddenOwner) score += add(checks, { id: "hidden-owner", label: "Hidden owner", severity: "high", detail: "Ownership hidden via proxy", points: 15 });
      if (gp.canTakeBackOwnership) score += add(checks, { id: "take-back", label: "Owner can reclaim ownership", severity: "high", detail: "Renounced ownership is reversible", points: 12 });
      if (gp.ownerChangeBalance) score += add(checks, { id: "owner-balance", label: "Owner can change balances", severity: "high", detail: "Owner can modify holder balances", points: 10 });
      if (gp.selfdestruct) score += add(checks, { id: "selfdestruct", label: "Self-destruct function", severity: "high", detail: "Contract can be destroyed", points: 15 });
      if (gp.proxy) score += add(checks, { id: "proxy", label: "Proxy contract", severity: "medium", detail: "Upgradeable/proxy contract", points: 5 });

      if (gp.top1HolderPercent != null && gp.top1HolderPercent > 20) {
        score += add(checks, { id: "holder-concentration", label: "Top holder concentration", severity: gp.top1HolderPercent > 40 ? "high" : "medium", detail: `Top holder owns ${gp.top1HolderPercent.toFixed(1)}%`, points: gp.top1HolderPercent > 40 ? 12 : 6 });
      }
      if (gp.lpLockedPercent != null && gp.lpLockedPercent > 0 && gp.lpLockedPercent < 80) {
        score += add(checks, { id: "lp-unlocked", label: "LP not fully locked", severity: gp.lpLockedPercent < 50 ? "high" : "medium", detail: `${gp.lpLockedPercent.toFixed(1)}% of LP locked`, points: gp.lpLockedPercent < 50 ? 15 : 8 });
      }
      if (gp.holderCount != null && gp.holderCount < 100) {
        score += add(checks, { id: "few-holders", label: "Very few holders", severity: "high", detail: `${gp.holderCount} holders`, points: 10 });
      } else if (gp.holderCount != null && gp.holderCount < 500) {
        score += add(checks, { id: "few-holders", label: "Low holder count", severity: "medium", detail: `${gp.holderCount} holders`, points: 4 });
      }
    }
  }

  if (liquidity != null) {
    if (liquidity < 10_000) score += add(checks, { id: "low-liquidity", label: "Very low liquidity", severity: "critical", detail: `$${Math.round(liquidity).toLocaleString()} liquidity`, points: 20 });
    else if (liquidity < 50_000) score += add(checks, { id: "low-liquidity", label: "Low liquidity", severity: "high", detail: `$${Math.round(liquidity).toLocaleString()} liquidity`, points: 10 });
    else if (liquidity < 200_000) score += add(checks, { id: "low-liquidity", label: "Thin liquidity", severity: "medium", detail: `$${Math.round(liquidity).toLocaleString()} liquidity`, points: 4 });
  }

  if (ageHours != null) {
    if (ageHours < 24) score += add(checks, { id: "new-pair", label: "New pair", severity: "medium", detail: `Pair is ${ageHours.toFixed(1)}h old`, points: 10 });
    else if (ageHours < 168) score += add(checks, { id: "new-pair", label: "Recently created pair", severity: "low", detail: `Pair is ${(ageHours / 24).toFixed(1)} days old`, points: 4 });
  }

  score = clampScore(score);
  const honeypotHit = checks.some((c) => c.id === "honeypot");
  const verdict = verdictFor(score, honeypotHit);

  checks.sort((a, b) => (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0));

  const result = {
    address: addr,
    chain: resolvedChain || null,
    kind,
    name: dex?.best?.baseToken?.name || null,
    symbol: dex?.best?.baseToken?.symbol || null,
    pairs: dex?.pairs || 0,
    dex: dex?.best || null,
    liquidityUsd: liquidity,
    volume24h: dex?.best?.volume24h ?? null,
    priceUsd: dex?.best?.priceUsd ?? null,
    pairAgeHours: ageHours == null ? null : Math.round(ageHours * 10) / 10,
    score,
    verdict,
    checks,
    signals: checks.filter((c) => c.severity !== "info"),
    taxes: {
      buy: providerData.goplus?.buyTax ?? providerData.honeypot?.buyTax ?? null,
      sell: providerData.goplus?.sellTax ?? providerData.honeypot?.sellTax ?? null,
    },
    holders: {
      count: providerData.goplus?.holderCount ?? null,
      top1Percent: providerData.goplus?.top1HolderPercent ?? providerData.rugcheck?.top1HolderPercent ?? null,
    },
    lpLockedPercent:
      providerData.goplus?.lpLockedPercent ?? providerData.rugcheck?.lpLockedPercent ?? null,
    providers: {
      goplus: !!providerData.goplus,
      honeypot: !!providerData.honeypot,
      rugcheck: !!providerData.rugcheck,
      dexscreener: !!dex?.best,
    },
    providerErrors: errors,
    createdAt: Date.now(),
  };

  saveRugCheck(result);
  return { ...result, cached: false };
}

export async function getRecentRugChecks(limit = 50) {
  return listRugChecks(limit);
}
