import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api";
import type { PortfolioResult, SizerResult, SignalSizerResult } from "../types";
import { btnCls, cardCls, inputCls, titleCls } from "../ui";

type Mode = "manual" | "signal" | "portfolio";

type RunResult =
  | { kind: "single"; data: SizerResult }
  | { kind: "signal"; data: SignalSizerResult }
  | { kind: "portfolio"; data: PortfolioResult };

const money = (n: number) =>
  `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const num = (n: number, d = 6) =>
  Number(n).toLocaleString(undefined, { maximumFractionDigits: d });

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
      <div className={`mt-1 text-base font-bold ${accent || "text-slate-100"}`}>{value}</div>
    </div>
  );
}

function SizeDetails({ size }: { size: SizerResult }) {
  return (
    <div className="mt-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="Side"
          value={size.side.toUpperCase()}
          accent={size.side === "long" ? "text-green-400" : "text-red-400"}
        />
        <Stat label="Risk" value={money(size.riskAmount)} />
        <Stat label="Units" value={num(size.units)} />
        <Stat label="Notional" value={money(size.notional)} />
        <Stat label="Leverage" value={`${size.leverage}x`} />
        <Stat label="Margin @max" value={money(size.marginAtMaxLeverage)} />
      </div>

      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
        <span>Entry {num(size.entry, 8)}</span>
        <span>Stop {num(size.stop, 8)}</span>
        <span>Risk/unit {num(size.riskPerUnit, 8)}</span>
        <span>Fees ~{money(size.feeEstimate)}</span>
        {size.confidence != null && <span>Confidence {size.confidence}%</span>}
      </div>

      {size.targets.length > 0 && (
        <div className="mt-3 overflow-auto rounded-lg border border-line">
          <table className="w-full border-collapse text-xs">
            <thead className="bg-panel">
              <tr className="text-slate-400">
                <th className="px-3 py-2 text-left">Target</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">R</th>
                <th className="px-3 py-2 text-right">Profit</th>
              </tr>
            </thead>
            <tbody>
              {size.targets.map((t, i) => (
                <tr key={i} className="border-t border-line/70">
                  <td className="px-3 py-1.5 text-left text-slate-300">TP{i + 1}</td>
                  <td className="px-3 py-1.5 text-right text-slate-300">{num(t.price, 8)}</td>
                  <td className="px-3 py-1.5 text-right text-green-400">{t.rMultiple}R</td>
                  <td className="px-3 py-1.5 text-right text-green-400">{money(t.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {size.warnings.length > 0 && (
        <ul className="mt-2 text-xs text-amber-300">
          {size.warnings.map((w, i) => (
            <li key={i}>• {w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Sizer() {
  const [mode, setMode] = useState<Mode>("manual");
  const [equity, setEquity] = useState(10000);
  const [riskPct, setRiskPct] = useState(1);
  const [feePct, setFeePct] = useState(0.1);
  const [maxLeverage, setMaxLeverage] = useState(10);
  const [scaleByConfidence, setScaleByConfidence] = useState(true);

  const [entry, setEntry] = useState(100);
  const [stop, setStop] = useState(98);
  const [targets, setTargets] = useState("102,104,106");
  const [side, setSide] = useState("auto");

  const [symbol, setSymbol] = useState("BTC/USD");
  const [interval, setInterval] = useState("5m");

  const [maxTotalRiskPct, setMaxTotalRiskPct] = useState(5);
  const [limit, setLimit] = useState(5);

  const run = useMutation({
    mutationFn: async (): Promise<RunResult> => {
      if (mode === "manual") {
        const parsed = targets
          .split(",")
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isFinite(n) && n > 0);
        const data = await api.size({
          equity,
          riskPct,
          feePct,
          maxLeverage,
          scaleByConfidence,
          entry,
          stop,
          targets: parsed,
          side: side === "auto" ? undefined : side,
        });
        return { kind: "single", data };
      }

      if (mode === "signal") {
        const data = await api.sizeSignal({
          symbol,
          interval,
          equity,
          riskPct,
          feePct,
          maxLeverage,
          scaleByConfidence,
        });
        return { kind: "signal", data };
      }

      const data = await api.sizePortfolio({
        equity,
        riskPct,
        maxTotalRiskPct,
        limit,
        scaleByConfidence,
        feePct,
        maxLeverage,
      });
      return { kind: "portfolio", data };
    },
  });

  const result = run.data;

  return (
    <section className={cardCls}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className={`${titleCls} mb-0`}>Position sizer</h2>
        <div className="flex gap-1">
          {(["manual", "signal", "portfolio"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                mode === m
                  ? "bg-blue-500 text-white"
                  : "border border-line text-slate-300 hover:bg-white/5"
              }`}
            >
              {m === "signal" ? "From signal" : m === "portfolio" ? "Portfolio" : "Manual"}
            </button>
          ))}
        </div>
      </div>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run.mutate();
        }}
      >
        <label className="flex items-center gap-1 text-xs text-slate-400">
          Equity
          <input type="number" min={1} className={`${inputCls} w-28`} value={equity} onChange={(e) => setEquity(Number(e.target.value))} />
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-400">
          Risk %
          <input type="number" step="0.1" min={0.1} className={`${inputCls} w-20`} value={riskPct} onChange={(e) => setRiskPct(Number(e.target.value))} />
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-400">
          Fee %
          <input type="number" step="0.01" min={0} className={`${inputCls} w-20`} value={feePct} onChange={(e) => setFeePct(Number(e.target.value))} />
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-400">
          Max lev
          <input type="number" step="1" min={1} className={`${inputCls} w-16`} value={maxLeverage} onChange={(e) => setMaxLeverage(Number(e.target.value))} />
        </label>

        {mode === "manual" && (
          <>
            <input type="number" step="any" className={`${inputCls} w-24`} placeholder="Entry" value={entry} onChange={(e) => setEntry(Number(e.target.value))} />
            <input type="number" step="any" className={`${inputCls} w-24`} placeholder="Stop" value={stop} onChange={(e) => setStop(Number(e.target.value))} />
            <input className={`${inputCls} w-40`} placeholder="Targets 102,104" value={targets} onChange={(e) => setTargets(e.target.value)} />
            <select className={inputCls} value={side} onChange={(e) => setSide(e.target.value)}>
              <option value="auto">Auto side</option>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </>
        )}

        {mode === "signal" && (
          <>
            <input className={`${inputCls} w-32`} value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="Symbol" />
            <select className={inputCls} value={interval} onChange={(e) => setInterval(e.target.value)}>
              {["5m", "15m", "1h"].map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </>
        )}

        {mode === "portfolio" && (
          <>
            <label className="flex items-center gap-1 text-xs text-slate-400">
              Max total risk %
              <input type="number" step="0.5" min={0.5} className={`${inputCls} w-20`} value={maxTotalRiskPct} onChange={(e) => setMaxTotalRiskPct(Number(e.target.value))} />
            </label>
            <label className="flex items-center gap-1 text-xs text-slate-400">
              Top N
              <input type="number" min={1} max={20} className={`${inputCls} w-16`} value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
            </label>
          </>
        )}

        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={scaleByConfidence} onChange={(e) => setScaleByConfidence(e.target.checked)} />
          Scale by confidence
        </label>

        <button type="submit" className={btnCls} disabled={run.isPending}>
          {run.isPending ? "Sizing…" : "Compute size"}
        </button>
      </form>

      {run.isError && (
        <p className="mt-2 text-sm text-red-400">{(run.error as Error).message}</p>
      )}

      {result?.kind === "single" && <SizeDetails size={result.data} />}

      {result?.kind === "signal" && (
        <div className="mt-3">
          <p className="text-sm text-slate-300">
            <strong>{result.data.signal.symbol}</strong>{" "}
            {result.data.signal.direction.toUpperCase()} · score {result.data.signal.score} · conf{" "}
            {result.data.signal.confidence}% · {result.data.signal.alignment ?? "—"}
          </p>
          <SizeDetails size={result.data.size} />
        </div>
      )}

      {result?.kind === "portfolio" && (
        <div className="mt-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Allocations" value={String(result.data.allocations.length)} />
            <Stat label="Total risk" value={money(result.data.totalRiskAmount)} />
            <Stat label="Total notional" value={money(result.data.totalNotional)} />
            <Stat
              label="Risk of equity"
              value={`${result.data.equity > 0 ? ((result.data.totalRiskAmount / result.data.equity) * 100).toFixed(2) : "0"}%`}
            />
          </div>

          <div className="mt-3 overflow-auto rounded-lg border border-line">
            <table className="w-full border-collapse text-xs">
              <thead className="bg-panel">
                <tr className="text-slate-400">
                  <th className="px-3 py-2 text-left">Symbol</th>
                  <th className="px-3 py-2 text-left">Side</th>
                  <th className="px-3 py-2 text-right">Risk</th>
                  <th className="px-3 py-2 text-right">Units</th>
                  <th className="px-3 py-2 text-right">Notional</th>
                  <th className="px-3 py-2 text-right">Lev</th>
                </tr>
              </thead>
              <tbody>
                {result.data.allocations.map((a, i) => (
                  <tr key={`${a.symbol}:${i}`} className="border-t border-line/70">
                    <td className="px-3 py-1.5 text-left text-slate-200">{a.symbol ?? "—"}</td>
                    <td className={`px-3 py-1.5 text-left font-semibold uppercase ${a.side === "long" ? "text-green-400" : "text-red-400"}`}>
                      {a.side}
                    </td>
                    <td className="px-3 py-1.5 text-right text-slate-300">{money(a.riskAmount)}</td>
                    <td className="px-3 py-1.5 text-right text-slate-300">{num(a.units)}</td>
                    <td className="px-3 py-1.5 text-right text-slate-300">{money(a.notional)}</td>
                    <td className="px-3 py-1.5 text-right text-slate-300">{a.leverage}x</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.data.warnings.length > 0 && (
            <ul className="mt-2 text-xs text-amber-300">
              {result.data.warnings.map((w, i) => (
                <li key={i}>• {w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="mt-3 text-xs text-slate-500">
        Risk-based sizing: units = risk budget ÷ (price risk + round-trip fees), capped at max
        leverage. Not financial advice.
      </p>
    </section>
  );
}
