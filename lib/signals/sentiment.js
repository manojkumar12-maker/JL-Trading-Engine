import { listNews } from "../../db.js";
import { clamp, round } from "./indicators.js";

const BULLISH = [
  "surge", "rally", "bullish", "gain", "gains", "soar", "breakout", "adoption",
  "approval", "record", "jump", "rise", "buy", "inflow", "etf", "upgrade",
  "partnership", "launch", "win", "wins", "recover", "rebound", "high",
];

const BEARISH = [
  "crash", "plunge", "bearish", "loss", "losses", "drop", "fall", "hack",
  "exploit", "ban", "lawsuit", "sell", "outflow", "downgrade", "fear",
  "decline", "slump", "liquidat", "scam", "fraud", "warn", "delist", "low",
];

export function newsSentiment({ hours = 24, limit = 300 } = {}) {
  const since = Date.now() - hours * 3_600_000;

  let articles = [];
  try {
    articles = listNews({ limit });
  } catch {
    articles = [];
  }

  const recent = articles.filter((a) => (a.publishedAt || 0) >= since);
  let bullish = 0;
  let bearish = 0;

  for (const article of recent) {
    const text = `${article.title || ""} ${article.summary || ""}`.toLowerCase();
    let b = 0;
    let s = 0;
    for (const word of BULLISH) if (text.includes(word)) b++;
    for (const word of BEARISH) if (text.includes(word)) s++;
    if (b > s) bullish++;
    else if (s > b) bearish++;
  }

  const total = bullish + bearish;
  const score = total ? (bullish - bearish) / total : 0;

  return {
    score: round(clamp(score, -1, 1), 3),
    bullish,
    bearish,
    neutral: recent.length - total,
    articles: recent.length,
  };
}
