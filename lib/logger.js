import { addEvent } from "../db.js";

function serialize(data) {
  if (data == null) return null;
  try {
    const text = typeof data === "string" ? data : JSON.stringify(data);
    return text.length > 4000 ? text.slice(0, 4000) : text;
  } catch {
    return null;
  }
}

export function logEvent({
  level = "info",
  category = "system",
  event = "event",
  message = "",
  data = null,
} = {}) {
  try {
    addEvent({
      time: Date.now(),
      level,
      category,
      event,
      message,
      data: serialize(data),
    });
  } catch (err) {
    console.error("logger failed:", err.message);
  }

  if (level === "error") {
    console.error(`[${category}] ${event}: ${message}`);
  }
}

export const logger = {
  debug: (category, event, message, data) =>
    logEvent({ level: "debug", category, event, message, data }),
  info: (category, event, message, data) =>
    logEvent({ level: "info", category, event, message, data }),
  warn: (category, event, message, data) =>
    logEvent({ level: "warn", category, event, message, data }),
  error: (category, event, message, data) =>
    logEvent({ level: "error", category, event, message, data }),
  trade: (event, message, data) =>
    logEvent({ level: "info", category: "trade", event, message, data }),
};
