import { sleep } from "./http.js";

export class ProviderState {
  constructor({ id, name, priority = 10, maxPerWindow = 60, windowMs = 60_000 }) {
    this.id = id;
    this.name = name;
    this.priority = priority;
    this.maxPerWindow = maxPerWindow;
    this.windowMs = windowMs;
    this.hits = [];
    this.cooldownUntil = 0;
    this.lastError = null;
    this.lastOkAt = null;
    this.successCount = 0;
    this.errorCount = 0;
  }

  prune(now = Date.now()) {
    this.hits = this.hits.filter((t) => now - t < this.windowMs);
  }

  available() {
    const now = Date.now();
    this.prune(now);
    return now >= this.cooldownUntil && this.hits.length < this.maxPerWindow;
  }

  consume() {
    this.prune();
    this.hits.push(Date.now());
  }

  cooldown(ms) {
    this.cooldownUntil = Date.now() + ms;
  }

  status() {
    const now = Date.now();
    this.prune(now);
    return {
      id: this.id,
      name: this.name,
      priority: this.priority,
      available: now >= this.cooldownUntil && this.hits.length < this.maxPerWindow,
      cooldownUntil: this.cooldownUntil > now ? this.cooldownUntil : null,
      usedInWindow: this.hits.length,
      limitPerWindow: this.maxPerWindow,
      windowMs: this.windowMs,
      successCount: this.successCount,
      errorCount: this.errorCount,
      lastError: this.lastError,
      lastOkAt: this.lastOkAt,
    };
  }
}

export async function acquire(state, { maxWaitMs = 12_000 } = {}) {
  const start = Date.now();

  while (true) {
    const now = Date.now();
    state.prune(now);

    if (now < state.cooldownUntil) {
      if (now - start > maxWaitMs) throw rateLimited(state);
      await sleep(Math.min(state.cooldownUntil - now, 750));
      continue;
    }

    if (state.hits.length < state.maxPerWindow) {
      state.hits.push(now);
      return;
    }

    if (now - start > maxWaitMs) throw rateLimited(state);

    const wait = state.windowMs - (now - state.hits[0]) + 15;
    await sleep(Math.min(wait, 750));
  }
}

function rateLimited(state) {
  const err = new Error(`${state.name} rate limit reached`);
  err.status = 429;
  return err;
}
