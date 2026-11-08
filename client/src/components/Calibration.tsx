import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api";
import type { CalibrationConfig, CalibrationResult } from "../types";
import { btnCls, cardCls, inputCls, titleCls } from "../ui";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const pf = (n: number | null) => (n == null ? "∞" : String(n));

function ConfigRow({ config }: { config: CalibrationConfig }) {
  const { params, all, outOfSample } = config;
  return (
    <tr className="border-t border-line/70 text-xs">
      <td className="px-2 py-1.5 text-left text-slate-300">
        TP {params.tpAtr}× · SL {params.stopAtr}×
      </td>
      <td className="px-2 py-1.5 text-right text-slate-400">{params.minScore}</td>
      <td className="px-2 py-1.5 text-right text-slate-400">{params.minConfidence}</td>
      <td className="px-2 py-1.5 text-right text-slate-300">{all.trades}</td>
      <td className={`px-2 py-1.5 text-right font-semibold ${all.winRate >= 0.7 ? "text-green-400" : "text-slate-200"}`}>
        {pct(all.winRate)}
      </td>
      <td className={`px-2 py-1.5 text-right ${(all.profitFactor ?? 0) >= 1 ? "text-green-400" : "text-red-400"}`}>
        {pf(all.profitFactor)}
      </td>
      <td className={`px-2 py-1.5 text-right ${all.avgR >= 0 ? "text-green-400" : "text-red-400"}`}>
        {all.avgR}
      </td>
      <td className="px-2 py-1.5 text-right text-slate-400">{outOfSample.trades}</td>
      <td className="px-2 py-1.5 text-right text-slate-300">{pct(outOfSample.winRate)}</td>
      <td className={`px-2 py-1.5 text-right ${(outOfSample.profitFactor ?? 0) >= 1 ? "text-green-400" : "text-red-400"}`}>
        {pf(outOfSample.profitFactor)}
      </td>
    </tr>
  );
}

export default function Calibration() {
  const [symbol, setSymbol] = useState("XRP/USD");
  const [interval, setInterval] = useState("5m");
  const [days, setDays] = useState(5);
  const [targetWinRate, setTargetWinRate] = useState(70);
  const [targetPF, setTargetPF] = useState(1.3);
  const [minTrades, setMinTrades] = useState(20);

  const run = useMutation({
    mutationFn: () =>
      api.calibrate({
        symbol,
        interval,
        days,
        targetWinRate: targetWinRate / 100,
        targetProfitFactor: targetPF,
        minTrades,
      }),
  });

  const result: CalibrationResult | undefined = run.data;
  const rows = result?.feasible ? result.recommended : result?.top ?? [];

  return (
    <section className={cardCls}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className={`${titleCls} mb-0`}>Calibration / optimizer</h2>
        <span className="text-xs text-slate-500">
          Grid-searches TP/SL/score/confidence with in-sample vs out-of-sample split
        </span>
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run.mutate();
        }}
      >
        <input className={`${inputCls} w-28`} value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="Symbol" />
        <select className={inputCls} value={interval} onChange={(e) => setInterval(e.target.value)}>
          {["5m", "15m", "1h"].map((i) => (
            <option key={i} value={i}>{i}</option>
          ))}
        </select>
        <input type="number" min={1} max={30} className={`${inputCls} w-20`} value={days} onChange={(e) => setDays(Number(e.target.value))} title="Days" />
        <label className="flex items-center gap-1 text-xs text-slate-400">
          Win% target
          <input type="number" min={40} max={95} className={`${inputCls} w-20`} value={targetWinRate} onChange={(e) => setTargetWinRate(Number(e.target.value))} />
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-400">
          PF target
          <input type="number" step="0.1" min={1} className={`${inputCls} w-20`} value={targetPF} onChange={(e) => setTargetPF(Number(e.target.value))} />
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-400">
          Min trades
          <input type="number" min={5} className={`${inputCls} w-20`} value={minTrades} onChange={(e) => setMinTrades(Number(e.target.value))} />
        </label>
        <button type="submit" className={btnCls} disabled={run.isPending}>
          {run.isPending ? "Optimizing…" : "Run calibration"}
        </button>
      </form>

      {run.isError && <p className="mt-2 text-sm text-red-400">{(run.error as Error).message}</p>}
      {run.isPending && (
        <p className="mt-2 text-sm text-slate-400">Fetching history and evaluating the grid…</p>
      )}

      {result && (
        <div className="mt-3">
          <div
            className={`rounded-lg border p-3 text-sm ${
              result.feasible
                ? "border-green-500/40 bg-green-500/10 text-green-300"
                : "border-amber-500/40 bg-amber-500/10 text-amber-200"
            }`}
          >
            {result.feasible
              ? `Found ${result.recommended.length} config(s) meeting ≥${pct(result.target.winRate)} win and PF ≥ ${result.target.profitFactor} with positive expectancy (out-of-sample validated).`
              : `No config met ≥${pct(result.target.winRate)} win AND PF ≥ ${result.target.profitFactor} AND positive expectancy. Showing best by out-of-sample score.`}
          </div>

          <p className="mt-2 text-xs text-slate-500">
            {result.symbol} · {result.interval} · {result.days}d · {result.candles} candles ·{" "}
            {result.signals} signals · {result.evaluated}/{result.gridSize} configs · split{" "}
            {(result.splitPct * 100).toFixed(0)}/{(100 - result.splitPct * 100).toFixed(0)}
          </p>

          <div className="mt-2 overflow-auto rounded-lg border border-line">
            <table className="w-full border-collapse text-xs">
              <thead className="bg-panel">
                <tr className="text-slate-400">
                  <th className="px-2 py-2 text-left">Params</th>
                  <th className="px-2 py-2 text-right">Min score</th>
                  <th className="px-2 py-2 text-right">Min conf</th>
                  <th className="px-2 py-2 text-right">Trades</th>
                  <th className="px-2 py-2 text-right">Win</th>
                  <th className="px-2 py-2 text-right">PF</th>
                  <th className="px-2 py-2 text-right">Avg R</th>
                  <th className="px-2 py-2 text-right">OOS trades</th>
                  <th className="px-2 py-2 text-right">OOS win</th>
                  <th className="px-2 py-2 text-right">OOS PF</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => (
                  <ConfigRow key={i} config={c} />
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={10} className="px-3 py-4 text-slate-500">
                      No configs produced enough trades.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-2 text-xs text-slate-500">{result.note}</p>
        </div>
      )}
    </section>
  );
}
