export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const USER_AGENT =
  "Mozilla/5.0 (compatible; JL-Trading-Engine/1.0; +https://localhost)";

async function request(url, { timeoutMs = 12000, headers = {}, accept = "*/*", method = "GET" } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers: {
        Accept: accept,
        "User-Agent": USER_AGENT,
        ...headers,
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const err = new Error(`HTTP ${res.status} from ${safeHost(url)}`);
      err.status = res.status;
      err.retryAfter = Number(res.headers.get("retry-after")) || 0;
      err.body = body.slice(0, 200);
      throw err;
    }

    return await res.text();
  } catch (err) {
    if (err.name === "AbortError") {
      const timeout = new Error(`Timeout after ${timeoutMs}ms from ${safeHost(url)}`);
      timeout.status = 0;
      throw timeout;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url, options = {}) {
  const text = await request(url, { accept: "application/json", ...options });
  return JSON.parse(text);
}

export async function fetchText(url, options = {}) {
  return request(url, {
    accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    ...options,
  });
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "provider";
  }
}
