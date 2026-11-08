import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import {
  badgeCls,
  btnCls,
  cardCls,
  ghostBtnCls,
  inputCls,
  smallBtnCls,
  titleCls,
} from "../ui";

const money = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const num = (n: number | null | undefined, d = 6) =>
  n == null ? "—" : Number(n).toLocaleString(undefined, { maximumFractionDigits: d });

function Chip({
  label,
  on,
  tone,
}: {
  label: string;
  on: boolean;
  tone: "good" | "bad";
}) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
        on
          ? tone === "good"
            ? "border-green-500/40 bg-green-500/10 text-green-400"
            : "border-amber-500/40 bg-amber-500/10 text-amber-300"
          : "border-line bg-[#0d1117] text-slate-400"
      }`}
    >
      {label}
    </span>
  );
}

export default function Executer() {
  const qc = useQueryClient();

  const [symbol, setSymbol] = useState("BTC/USDT");
  const [side, setSide] = useState("buy");
  const [notional, setNotional] = useState(100);
  const [stop, setStop] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [mode, setMode] = useState("paper");
  const [confirm, setConfirm] = useState(false);

  const [sigSymbol, setSigSymbol] = useState("BTC/USDT");
  const [sigInterval, setSigInterval] = useState("5m");
  const [equity, setEquity] = useState(10000);
  const [riskPct, setRiskPct] = useState(1);

  const [autoLimit, setAutoLimit] = useState(3);

  const { data: status } = useQuery({
    queryKey: ["execStatus"],
    queryFn: api.executerStatus,
    refetchInterval: 10_000,
  });

  const { data: positions = [] } = useQuery({
    queryKey: ["execPositions", "open"],
    queryFn: () => api.executerPositions("open"),
    refetchInterval: 10_000,
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["execOrders"],
    queryFn: () => api.executerOrders(20),
    refetchInterval: 15_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["execStatus"] });
    qc.invalidateQueries({ queryKey: ["execPositions"] });
    qc.invalidateQueries({ queryKey: ["execOrders"] });
  };

  const kill = useMutation({
    mutationFn: (enabled: boolean) => api.setKillSwitch(enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["execStatus"] }),
  });

  const place = useMutation({
    mutationFn: (body: Parameters<typeof api.placeOrder>[0]) => api.placeOrder(body),
    onSuccess: invalidate,
  });

  const fromSignal = useMutation({
    mutationFn: (body: Parameters<typeof api.executeFromSignal>[0]) =>
      api.executeFromSignal(body),
    onSuccess: invalidate,
  });

  const closePos = useMutation({
    mutationFn: (id: string) => api.closeExecPosition(id),
    onSuccess: invalidate,
  });

  const auto = useMutation({
    mutationFn: (body: Parameters<typeof api.autoTrade>[0]) => api.autoTrade(body),
    onSuccess: invalidate,
  });

  return (
    <section className={cardCls}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className={`${titleCls} mb-0`}>Executer</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Chip label="FUTURES" on tone="good" />
          <Chip label={status?.liveEnabled ? "LIVE ENABLED" : "PAPER ONLY"} on={!!status?.liveEnabled} tone="bad" />
          <Chip label={status?.autoTradeEnabled ? "AUTO ON" : "AUTO OFF"} on={!!status?.autoTradeEnabled} tone="good" />
          <Chip
            label={status?.binance?.testnet ? "Binance testnet" : "Binance mainnet"}
            on={!!status?.binance?.configured}
            tone="good"
          />
          <button
            className={status?.killSwitch ? "rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white" : ghostBtnCls}
            onClick={() => kill.mutate(!status?.killSwitch)}
            disabled={kill.isPending || !status}
          >
            {status?.killSwitch ? "Kill switch ON — reset" : "Kill switch"}
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2 text-xs text-slate-500">
        <span className={badgeCls}>risk limits</span>
        <span>lev ≤ {status?.maxLeverage ?? "—"}x</span>
        <span>max order {money(status?.limits.maxOrderNotional)}</span>
        <span>max open {status?.limits.maxOpenPositions}</span>
        <span>max exposure {money(status?.limits.maxTotalExposure)}</span>
        <span>daily loss {money(status?.limits.maxDailyLoss)}</span>
        <span>open {status?.openPositions ?? 0} · exposure {money(status?.openExposure)}</span>
        <span className={status && status.dailyPnl < 0 ? "text-red-400" : "text-slate-400"}>
          daily PnL {money(status?.dailyPnl)}
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <form
          className="rounded-lg border border-line bg-[#0d1117] p-3"
          onSubmit={(e) => {
            e.preventDefault();
            place.mutate({
              symbol,
              side,
              notional,
              stop: stop ? Number(stop) : undefined,
              takeProfit: takeProfit ? Number(takeProfit) : undefined,
              mode,
              confirm,
            });
          }}
        >
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Manual order
          </h3>
          <div className="flex flex-wrap gap-2">
            <input className={`${inputCls} w-28`} value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="Symbol" />
            <select className={inputCls} value={side} onChange={(e) => setSide(e.target.value)}>
              <option value="buy">Buy / long</option>
              <option value="sell">Sell / short</option>
            </select>
            <input type="number" min={1} className={`${inputCls} w-28`} value={notional} onChange={(e) => setNotional(Number(e.target.value))} title="Notional $" />
            <input className={`${inputCls} w-24`} value={stop} onChange={(e) => setStop(e.target.value)} placeholder="Stop" />
            <input className={`${inputCls} w-24`} value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} placeholder="TP" />
            <select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="paper">Paper</option>
              <option value="live">Live</option>
            </select>
            <label className="flex items-center gap-1 text-xs text-slate-400">
              <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
              Confirm live
            </label>
            <button type="submit" className={btnCls} disabled={place.isPending || status?.killSwitch}>
              {place.isPending ? "Placing…" : "Place order"}
            </button>
          </div>
          {place.isError && <p className="mt-2 text-xs text-red-400">{(place.error as Error).message}</p>}
          {place.isSuccess && (
            <p className="mt-2 text-xs text-green-400">
              Placed {place.data.order.symbol} {place.data.order.side} · {place.data.order.status} @{" "}
              {num(place.data.order.filledPrice, 8)}
            </p>
          )}
        </form>

        <form
          className="rounded-lg border border-line bg-[#0d1117] p-3"
          onSubmit={(e) => {
            e.preventDefault();
            fromSignal.mutate({
              symbol: sigSymbol,
              interval: sigInterval,
              equity,
              riskPct,
              mode,
              confirm,
              feePct: 0.1,
              maxLeverage: 10,
            });
          }}
        >
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            From signal (auto-sized)
          </h3>
          <div className="flex flex-wrap gap-2">
            <input className={`${inputCls} w-28`} value={sigSymbol} onChange={(e) => setSigSymbol(e.target.value.toUpperCase())} placeholder="Symbol" />
            <select className={inputCls} value={sigInterval} onChange={(e) => setSigInterval(e.target.value)}>
              {["5m", "15m", "1h"].map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
            <input type="number" min={1} className={`${inputCls} w-28`} value={equity} onChange={(e) => setEquity(Number(e.target.value))} title="Equity" />
            <input type="number" step="0.1" min={0.1} className={`${inputCls} w-20`} value={riskPct} onChange={(e) => setRiskPct(Number(e.target.value))} title="Risk %" />
            <button type="submit" className={btnCls} disabled={fromSignal.isPending || status?.killSwitch || !status?.liveEnabled && mode === "live"}>
              {fromSignal.isPending ? "Executing…" : "Size & execute"}
            </button>
          </div>
          {fromSignal.isError && <p className="mt-2 text-xs text-red-400">{(fromSignal.error as Error).message}</p>}
          {fromSignal.isSuccess && (
            <p className="mt-2 text-xs text-green-400">
              {fromSignal.data.order.symbol} · {fromSignal.data.order.status} · qty {num(fromSignal.data.order.quantity)}
            </p>
          )}
        </form>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-slate-400">
          Auto equity
          <input type="number" min={1} className={`${inputCls} w-28`} value={equity} onChange={(e) => setEquity(Number(e.target.value))} />
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-400">
          Risk %
          <input type="number" step="0.1" className={`${inputCls} w-20`} value={riskPct} onChange={(e) => setRiskPct(Number(e.target.value))} />
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-400">
          Top N
          <input type="number" min={1} max={10} className={`${inputCls} w-16`} value={autoLimit} onChange={(e) => setAutoLimit(Number(e.target.value))} />
        </label>
        <button
          className={ghostBtnCls}
          disabled={auto.isPending || !status?.autoTradeEnabled || status?.killSwitch}
          onClick={() => auto.mutate({ equity, riskPct, interval: "5m", limit: autoLimit, mode })}
        >
          {auto.isPending ? "Auto-trading…" : "Auto-trade aligned signals"}
        </button>
        {!status?.autoTradeEnabled && (
          <span className="text-xs text-slate-500">enable with ENABLE_AUTO_TRADE=true</span>
        )}
      </div>
      {auto.isError && <p className="mt-2 text-xs text-red-400">{(auto.error as Error).message}</p>}
      {auto.isSuccess && (
        <p className="mt-2 text-xs text-slate-400">
          placed {auto.data.placed}/{auto.data.candidates} from {auto.data.scanned} scanned
          {auto.data.outcomes.map((o) => (
            <span key={o.symbol} className={o.status === "placed" ? "ml-2 text-green-400" : "ml-2 text-red-400"}>
              {o.symbol}:{o.status}
              {o.error ? ` (${o.error})` : ""}
            </span>
          ))}
        </p>
      )}

      <div className="mt-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Open positions</h3>
        <div className="overflow-auto rounded-lg border border-line">
          <table className="w-full border-collapse text-xs">
            <thead className="bg-panel">
              <tr className="text-slate-400">
                <th className="px-3 py-2 text-left">Symbol</th>
                <th className="px-3 py-2 text-left">Side</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Entry</th>
                <th className="px-3 py-2 text-right">Stop</th>
                <th className="px-3 py-2 text-right">TP</th>
                <th className="px-3 py-2 text-left">Mode</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.id} className="border-t border-line/70">
                  <td className="px-3 py-1.5 text-left text-slate-200">{p.symbol}</td>
                  <td className={`px-3 py-1.5 text-left font-semibold uppercase ${p.side === "long" ? "text-green-400" : "text-red-400"}`}>{p.side}</td>
                  <td className="px-3 py-1.5 text-right text-slate-300">{num(p.quantity)}</td>
                  <td className="px-3 py-1.5 text-right text-slate-300">{num(p.entry, 8)}</td>
                  <td className="px-3 py-1.5 text-right text-slate-400">{num(p.stop, 8)}</td>
                  <td className="px-3 py-1.5 text-right text-slate-400">{num(p.takeProfit, 8)}</td>
                  <td className="px-3 py-1.5 text-left text-slate-400">{p.mode}</td>
                  <td className="px-3 py-1.5 text-right">
                    <button className={smallBtnCls} disabled={closePos.isPending} onClick={() => closePos.mutate(p.id)}>
                      Close
                    </button>
                  </td>
                </tr>
              ))}
              {!positions.length && (
                <tr>
                  <td colSpan={8} className="px-3 py-4 text-slate-500">No open positions.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Recent orders</h3>
        <div className="max-h-64 overflow-auto rounded-lg border border-line">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-panel">
              <tr className="text-slate-400">
                <th className="px-3 py-2 text-left">Time</th>
                <th className="px-3 py-2 text-left">Symbol</th>
                <th className="px-3 py-2 text-left">Side</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Mode</th>
                <th className="px-3 py-2 text-left">Source</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-line/70">
                  <td className="px-3 py-1.5 text-left text-slate-400">{new Date(o.createdAt).toLocaleTimeString()}</td>
                  <td className="px-3 py-1.5 text-left text-slate-200">{o.symbol}</td>
                  <td className={`px-3 py-1.5 text-left font-semibold uppercase ${o.side === "buy" ? "text-green-400" : "text-red-400"}`}>{o.side}</td>
                  <td className="px-3 py-1.5 text-right text-slate-300">{num(o.quantity)}</td>
                  <td className={`px-3 py-1.5 text-left ${o.status === "rejected" ? "text-red-400" : "text-slate-300"}`}>{o.status}</td>
                  <td className="px-3 py-1.5 text-left text-slate-400">{o.mode}</td>
                  <td className="px-3 py-1.5 text-left text-slate-400">{o.source}</td>
                </tr>
              ))}
              {!orders.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-slate-500">No orders yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Paper fills at live market price. Live orders are Binance USDⓈ-M futures market orders with
        leverage set per order. Live trading is disabled unless ENABLE_LIVE_TRADING=true with API
        keys, and every live order requires confirm. Not financial advice.
      </p>
    </section>
  );
}
