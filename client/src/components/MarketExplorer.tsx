import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { KlineResponse } from "../types";
import { btnCls, ghostBtnCls, inputCls, titleCls } from "../ui";

const INTERVALS = ["1m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d", "1w"];

interface Props {
  data: KlineResponse | null;
  onData: (data: KlineResponse) => void;
}

export default function MarketExplorer({ data, onData }: Props) {
  const [symbol, setSymbol] = useState("BTC/USDT");
  const [interval, setInterval] = useState("1h");
  const [limit, setLimit] = useState(200);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Pick a symbol and load data.");
  const [live, setLive] = useState(true);

  const { data: markets } = useQuery({
    queryKey: ["markets"],
    queryFn: () => api.markets("", 3000),
    staleTime: 10 * 60_000,
  });

  async function load(mode: "latest" | "history") {
    setLoading(true);
    setError("");
    try {
      const res =
        mode === "latest"
          ? await api.klines(symbol, interval, limit)
          : await api.history(symbol, interval, days);
      onData(res);
      setStatus(
        `${mode === "latest" ? "Latest klines" : "History"} · ${res.candles.length} candles from ${res.source}`
      );
    } catch (err) {
      setError((err as Error).message);
      setStatus("Request failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!live || !data) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${location.host}/ws?symbol=${encodeURIComponent(
      data.symbol
    )}&interval=${encodeURIComponent(data.interval)}`;
    const ws = new WebSocket(url);

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "candles" && Array.isArray(msg.candles)) {
          onData({
            symbol: msg.symbol,
            interval: msg.interval,
            source: msg.source,
            updatedAt: msg.updatedAt,
            candles: msg.candles,
          });
          setStatus(`Live · ${msg.candles.length} candles from ${msg.source}`);
        }
      } catch {
        /* ignore */
      }
    };

    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, data?.symbol, data?.interval]);

  return (
    <div>
      <h2 className={titleCls}>Market data</h2>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          load("latest");
        }}
      >
        <input
          list="symbol-options"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="Symbol e.g. BTC/USDT"
          className={`${inputCls} flex-1`}
          required
        />
        <datalist id="symbol-options">
          {(markets?.symbols ?? []).map((m) => (
            <option key={m.symbol} value={m.symbol} />
          ))}
        </datalist>

        <select value={interval} onChange={(e) => setInterval(e.target.value)} className={inputCls}>
          {INTERVALS.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>

        <input
          type="number"
          min={1}
          max={5000}
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          title="Number of latest candles"
          className={`${inputCls} w-24`}
        />
        <input
          type="number"
          min={1}
          max={3650}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          title="History days back"
          className={`${inputCls} w-24`}
        />

        <button type="submit" disabled={loading} className={btnCls}>
          Latest klines
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => load("history")}
          className={ghostBtnCls}
        >
          Load history
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
        <span className={error ? "text-red-400" : "text-slate-400"}>
          {loading ? "Working…" : error || status}
        </span>
        <label className="flex items-center gap-2 text-slate-400">
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
          Live
        </label>
        <span className="text-slate-500">
          Symbols: {markets ? markets.total.toLocaleString() : "…"}
        </span>
      </div>

      {data && (
        <p className="mt-3 text-sm text-slate-300">
          <strong className="text-slate-100">{data.symbol}</strong> · {data.interval} ·{" "}
          {data.candles.length} candles · source{" "}
          <strong className="text-slate-100">{data.source}</strong>
          {data.cached ? " · cached" : ""}
          {data.stale ? " · stale" : ""}
        </p>
      )}
    </div>
  );
}
