import { WebSocketServer } from "ws";
import { getKlines } from "./lib/crypto/index.js";

const POLL_MS = 10_000;

export function attachWebSocket(server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url, "http://localhost");
    let symbol = (url.searchParams.get("symbol") || "").toUpperCase();
    let interval = url.searchParams.get("interval") || "1h";
    let timer = null;
    let closed = false;
    let busy = false;

    const tick = async () => {
      if (closed || busy || !symbol) return;
      busy = true;
      try {
        const data = await getKlines({ symbol, interval, limit: 300 });
        if (!closed) {
          ws.send(
            JSON.stringify({
              type: "candles",
              symbol: data.symbol,
              interval: data.interval,
              source: data.source,
              updatedAt: data.updatedAt,
              candles: data.candles,
            })
          );
        }
      } catch (err) {
        if (!closed) ws.send(JSON.stringify({ type: "error", error: err.message }));
      } finally {
        busy = false;
      }
    };

    const start = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(tick, POLL_MS);
      tick();
    };

    ws.on("message", (buf) => {
      try {
        const msg = JSON.parse(buf.toString());
        if (msg.action === "subscribe") {
          if (msg.symbol) symbol = String(msg.symbol).toUpperCase();
          if (msg.interval) interval = msg.interval;
          start();
        } else if (msg.action === "unsubscribe") {
          if (timer) clearInterval(timer);
          timer = null;
        }
      } catch {
        /* ignore malformed messages */
      }
    });

    ws.on("close", () => {
      closed = true;
      if (timer) clearInterval(timer);
    });
    ws.on("error", () => {
      closed = true;
      if (timer) clearInterval(timer);
    });

    ws.send(JSON.stringify({ type: "ready", symbol, interval, pollMs: POLL_MS }));
    if (symbol) start();
  });

  return wss;
}
