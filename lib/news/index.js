import { createHash } from "node:crypto";
import { countNews, listNews, upsertNews } from "../../db.js";
import { fetchText } from "../crypto/http.js";
import { acquire } from "../crypto/limiter.js";
import { parseFeed } from "./parser.js";
import { NEWS_SOURCES } from "./sources.js";

let inFlight = null;

function articleId(link, title) {
  return createHash("sha1").update(link || title).digest("hex").slice(0, 16);
}

async function fetchSource(source) {
  await acquire(source.state);
  const xml = await fetchText(source.url);
  const items = parseFeed(xml);
  const now = Date.now();

  return items
    .slice(0, 60)
    .map((item) => ({
      id: articleId(item.link, item.title),
      sourceId: source.id,
      sourceName: source.name,
      title: (item.title || "").slice(0, 300),
      link: item.link || "",
      summary: (item.summary || "").slice(0, 600),
      publishedAt: item.publishedAt || now,
      fetchedAt: now,
    }))
    .filter((item) => item.title);
}

export function newsProviderStatus() {
  return NEWS_SOURCES.map((source) => source.state.status());
}

export async function refreshNews({ source = "" } = {}) {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const targets = source
      ? NEWS_SOURCES.filter((s) => s.id === source)
      : NEWS_SOURCES;

    if (!targets.length) throw new Error(`Unknown news source: ${source}`);

    const errors = [];
    const results = await Promise.allSettled(
      targets.map(async (s) => {
        if (!s.state.available()) {
          errors.push({ source: s.id, error: "rate-limited" });
          throw new Error("rate-limited");
        }
        try {
          const articles = await fetchSource(s);
          s.state.successCount++;
          s.state.lastOkAt = Date.now();
          return articles;
        } catch (err) {
          s.state.errorCount++;
          s.state.lastError = err.message;
          if (err.status === 429 || err.status === 418) s.state.cooldown(60_000);
          errors.push({ source: s.id, error: err.message });
          throw err;
        }
      })
    );

    const articles = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    const inserted = upsertNews(articles);

    return {
      fetched: articles.length,
      inserted,
      total: countNews(),
      sources: newsProviderStatus(),
      errors,
    };
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

export function getNews(options = {}) {
  return listNews(options);
}
