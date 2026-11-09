import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api";
import type { BacktestResult } from "../types";
import { btnCls, cardCls, inputCls, titleCls } from "../ui";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-[#0d1117] p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-bold ${accent || "text-slate-100"}`}>{value}</div>
    </div>
  );
}

function Sparkline({ points }: { points: { r: number }[] }) {
  if (points.length < 2) return null;
  const values = points.map((p) => p.r);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const w = 320;
  const h = 70;
  const x = (i: number) => (i / (values.length - 1)) * w;
  const y = (v: number) => h - ((v - min) / (max - min || 1)) * h;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 h-20 w-full">
      <polyline
        fill="none"
        stroke="#3fb950"
        strokeWidth="2"
        points={values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
      />
    </svg>
  );
}

export default function Backtest() {
  const [symbol, setSymbol] = useState("BTC/USD");
  const [interval, setInterval] = useState("5m");
  const [days, setDays] = useState(7);
  const [minScore, setMinScore] = useState(35);
  const [minConfidence, setMinConfidence] = useState(70);
  const [stopAtr, setStopAtr] = useState(2.2);
  const [tpAtr, setTpAtr] = useState(0.8);

  const run = useMutation({
    mutationFn: () =>
      api.runBacktest({ symbol, interval, days, minScore, minConfidence, stopAtr, tpAtr }),
  });

  const result: BacktestResult | undefined = run.data;
  const s = result?.summary;

  return (
    <section className={cardCls}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className={`${titleCls} mb-0`}>Backtest</h2>
        <span className="text-xs text-slate-500">
          Replays historical candles through the 5m MTF logic with TP/SL fills
        </span>
      </div>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run.mutate();
        }}
      >
        <input
          className={`${inputCls} w-32`}
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="Symbol"
        />
        <select className={inputCls} value={interval} onChange={(e) => setInterval(e.target.value)}>
          {["5m", "15m", "1h"].map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          max={90}
          className={`${inputCls} w-20`}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          title="Days of history"
        />
        <input
          type="number"
          min={0}
          max={100}
          className={`${inputCls} w-24`}
          value={minScore}
          onChange={(e) => setMinScore(Number(e.target.value))}
          title="Minimum score"
        />
        <input
          type="number"
          min={0}
          max={95}
          className={`${inputCls} w-24`}
          value={minConfidence}
          onChange={(e) => setMinConfidence(Number(e.target.value))}
          title="Minimum confidence"
        />
        <input
          type="number"
          step="0.1"
          min={0.1}
          className={`${inputCls} w-24`}
          value={stopAtr}
          onChange={(e) => setStopAtr(Number(e.target.value))}
          title="Stop loss in ATR"
        />
        <input
          type="number"
          step="0.1"
          min={0.1}
          className={`${inputCls} w-24`}
          value={tpAtr}
          onChange={(e) => setTpAtr(Number(e.target.value))}
          title="Take profit in ATR"
        />
        <button type="submit" className={btnCls} disabled={run.isPending}>
          {run.isPending ? "Running…" : "Run backtest"}
        </button>
      </form>

      {run.isError && (
        <p className="mt-2 text-sm text-red-400">{(run.error as Error).message}</p>
      )}
      {run.isPending && (
        <p className="mt-2 text-sm text-slate-400">
          Fetching history and simulating trades… this can take a minute.
        </p>
      )}

      {s && result && (
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Trades" value={String(s.trades)} />
            <Stat
              label="Win rate"
              value={pct(s.winRate)}
              accent={s.winRate >= 0.5 ? "text-green-400" : "text-slate-100"}
            />
            <Stat
              label="Avg R"
              value={String(s.avgR)}
              accent={s.avgR >= 0 ? "text-green-400" : "text-red-400"}
            />
            <Stat
              label="Profit factor"
              value={s.profitFactor == null ? "∞" : String(s.profitFactor)}
              accent={(s.profitFactor ?? 99) >= 1 ? "text-green-400" : "text-red-400"}
            />
            <Stat
              label="Total R"
              value={String(s.totalR)}
              accent={s.totalR >= 0 ? "text-green-400" : "text-red-400"}
            />
            <Stat label="Max DD (R)" value={String(s.maxDrawdownR)} accent="text-red-400" />
          </div>

          <p className="mt-2 text-xs text-slate-500">
            {result.symbol} · {result.interval} · {result.days}d · {result.candles} candles ·
            minScore {result.params.minScore} · minConf {result.params.minConfidence ?? "—"} ·
            stop {result.params.stopAtr}×ATR · TP {result.params.tpAtr}×ATR
            {result.params.mode ? ` · ${result.params.mode}` : ""}
          </p>

          <Sparkline points={result.equity} />

          <div className="mt-3 max-h-80 overflow-auto rounded-lg border border-line">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 bg-panel">
                <tr className="text-slate-400">
                  <th className="px-3 py-2 text-left">Entry time</th>
                  <th className="px-3 py-2 text-left">Dir</th>
                  <th className="px-3 py-2 text-right">Entry</th>
                  <th className="px-3 py-2 text-right">Exit</th>
                  <th className="px-3 py-2 text-right">R</th>
                  <th className="px-3 py-2 text-left">Result</th>
                </tr>
              </thead>
              <tbody>
                {result.trades
                  .slice()
                  .reverse()
                  .map((t, idx) => (
                    <tr key={`${t.entryTime}:${idx}`} className="border-t border-line/70">
                      <td className="px-3 py-1.5 text-left text-slate-400">
                        {new Date(t.entryTime).toLocaleString()}
                      </td>
                      <td
                        className={`px-3 py-1.5 text-left font-semibold uppercase ${
                          t.direction === "long" ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {t.direction}
                      </td>
                      <td className="px-3 py-1.5 text-right text-slate-300">{t.entry}</td>
                      <td className="px-3 py-1.5 text-right text-slate-300">{t.exit}</td>
                      <td
                        className={`px-3 py-1.5 text-right font-semibold ${
                          t.r >= 0 ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {t.r > 0 ? "+" : ""}
                        {t.r}
                      </td>
                      <td
                        className={`px-3 py-1.5 text-left ${
                          t.outcome === "win" ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {t.outcome}
                      </td>
                    </tr>
                  ))}
                {!result.trades.length && (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-slate-500">
                      No trades triggered with these settings.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-2 text-xs text-slate-500">
            Conservative fills: stop checked before target within the same candle, entry at
            next candle open. Excludes fees/slippage and the news layer. Not financial advice.
          </p>
        </div>
      )}
    </section>
  );
}
