export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchJson(url, { timeoutMs = 12000, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "JoysIncome/1.0 (+https://localhost)",
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

    return await res.json();
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

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "provider";
  }
}
