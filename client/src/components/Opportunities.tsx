import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Signal } from "../types";
import { btnCls, cardCls, inputCls, titleCls } from "../ui";

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString(undefined, { maximumFractionDigits: 8 });

const pct = (n: number | null | undefined) =>
  n == null ? "—" : `${n >= 0 ? "+" : ""}${Number(n).toFixed(2)}%`;

function SignalRow({ signal }: { signal: Signal }) {
  const isLong = signal.direction === "long";
  return (
    <tr className="border-t border-line/70 align-top">
      <td className="px-3 py-2 text-left">
        <strong className="text-slate-100">{signal.symbol}</strong>
        <div className="text-slate-500">
          {signal.interval} · {pct(signal.changePct)}
          {signal.oiChangePct != null ? ` · OI ${pct(signal.oiChangePct)}` : ""}
        </div>
      </td>
      <td
        className={`px-3 py-2 text-left font-semibold uppercase ${
          isLong ? "text-green-400" : "text-red-400"
        }`}
      >
        {signal.direction}
      </td>
      <td
        className={`px-3 py-2 text-right font-semibold ${
          signal.score >= 0 ? "text-green-400" : "text-red-400"
        }`}
      >
        {signal.score > 0 ? "+" : ""}
        {signal.score}
      </td>
      <td className="px-3 py-2 text-right text-slate-300">{signal.confidence}%</td>
      <td className="px-3 py-2 text-right text-slate-300">
        {signal.plan ? fmt(signal.plan.entry) : "—"}
      </td>
      <td className="px-3 py-2 text-right text-slate-400">
        {signal.plan ? fmt(signal.plan.stop) : "—"}
      </td>
      <td className="px-3 py-2 text-right text-slate-300">
        {signal.plan ? signal.plan.targets.map((t) => fmt(t)).join(" / ") : "—"}
      </td>
      <td className="px-3 py-2 text-left text-slate-400">
        {signal.reasons?.length ? signal.reasons.join(" · ") : "—"}
      </td>
    </tr>
  );
}

export default function Opportunities() {
  const qc = useQueryClient();
  const [interval, setInterval] = useState("1h");
  const [minScore, setMinScore] = useState(0);
  const [direction, setDirection] = useState("");

  const { data, isError } = useQuery({
    queryKey: ["signals"],
    queryFn: () => api.signals(150),
    refetchInterval: 30_000,
  });

  const scanMut = useMutation({
    mutationFn: () => api.scan({ interval, limit: 15, minScore: 25 }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["signals"] }),
  });

  const signals = useMemo(() => {
    const list = data?.signals ?? [];
    return list.filter(
      (s) =>
        (!direction || s.direction === direction) &&
        Math.abs(s.score) >= (minScore || 0)
    );
  }, [data, direction, minScore]);

  return (
    <section className={cardCls}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className={`${titleCls} mb-0`}>Trading opportunities</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={inputCls}
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
          >
            {["15m", "1h", "4h", "1d"].map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
          <button
            className={btnCls}
            onClick={() => scanMut.mutate()}
            disabled={scanMut.isPending}
          >
            {scanMut.isPending ? "Scanning…" : "Scan movers"}
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          className={inputCls}
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
        >
          <option value="">All directions</option>
          <option value="long">Long</option>
          <option value="short">Short</option>
        </select>
        <input
          type="number"
          min={0}
          max={100}
          className={`${inputCls} w-32`}
          value={minScore}
          onChange={(e) => setMinScore(Number(e.target.value))}
          title="Minimum absolute score"
        />
        <span className="text-xs text-slate-500">
          {isError
            ? "Unable to load signals."
            : data
              ? `${signals.length} shown · ${data.count} stored`
              : "Loading…"}
          {scanMut.data
            ? ` · scanned ${scanMut.data.scanned} movers, ${scanMut.data.opportunities.length} setups`
            : ""}
          {scanMut.isError ? ` · ${(scanMut.error as Error).message}` : ""}
        </span>
      </div>

      <div className="overflow-auto rounded-lg border border-line">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-panel">
            <tr className="text-slate-400">
              <th className="px-3 py-2 text-left">Symbol</th>
              <th className="px-3 py-2 text-left">Dir</th>
              <th className="px-3 py-2 text-right">Score</th>
              <th className="px-3 py-2 text-right">Conf</th>
              <th className="px-3 py-2 text-right">Entry</th>
              <th className="px-3 py-2 text-right">Stop</th>
              <th className="px-3 py-2 text-right">Targets</th>
              <th className="px-3 py-2 text-left">Why</th>
            </tr>
          </thead>
          <tbody>
            {signals.map((s) => (
              <SignalRow key={`${s.symbol}:${s.interval}`} signal={s} />
            ))}
            {!signals.length && (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-slate-500">
                  No signals yet — run a scan.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Heuristic multi-indicator scores and ATR-based levels — not financial advice.
      </p>
    </section>
  );
}
