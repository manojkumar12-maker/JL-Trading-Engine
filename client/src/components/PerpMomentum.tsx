import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PerpBacktest, PerpMetrics } from "../types";
import {
  badgeCls,
  btnCls,
  cardCls,
  ghostBtnCls,
  inputCls,
  titleCls,
} from "../ui";

const money = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const price = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString(undefined, { maximumFractionDigits: 8 });

const pct = (n: number | null | undefined) =>
  n == null ? "—" : `${n >= 0 ? "+" : ""}${Number(n).toFixed(2)}%`;

function Metrics({ label, m }: { label: string; m: PerpMetrics | null | undefined }) {
  if (!m) return null;
  return (
    <div className="rounded border border-line/70 p-2">
      <div className="mb-1 font-semibold text-slate-300">{label}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-slate-400">
        <span>
          return <strong className="text-slate-200">{m.totalReturn}%</strong>
        </span>
        <span>
          sharpe <strong className="text-slate-200">{m.sharpe}</strong>
        </span>
        <span>
          maxDD <strong className="text-slate-200">{m.maxDrawdown}%</strong>
        </span>
        <span>
          PF <strong className="text-slate-200">{m.profitFactor}</strong>
        </span>
        <span>
          periods <strong className="text-slate-200">{m.periods}</strong>
        </span>
        <span>
          win <strong className="text-slate-200">{m.winRate}%</strong>
        </span>
      </div>
    </div>
  );
}

export default function PerpMomentum() {
  const qc = useQueryClient();
  const [dataset, setDataset] = useState("current");

  const { data: status } = useQuery({
    queryKey: ["perpStatus"],
    queryFn: api.perpStatus,
    refetchInterval: 30_000,
  });

  const { data: backtest, isFetching: backtestLoading } = useQuery<PerpBacktest>({
    queryKey: ["perpBacktest", dataset],
    queryFn: () => api.perpBacktest(dataset),
  });

  const rebalance = useMutation({
    mutationFn: api.perpRebalance,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["perpStatus"] }),
  });

  const reset = useMutation({
    mutationFn: api.perpReset,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["perpStatus"] }),
  });

  const targets = status?.targets;
  const regime = targets?.regime ?? false;
  const exposure = status?.exposure ?? 0;
  const stale = status?.staleHours ?? null;

  return (
    <section className={cardCls}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className={`${titleCls} mb-0`}>Low-cap perp momentum</h2>
          <span className={badgeCls}>validated paper</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={inputCls}
            value={dataset}
            onChange={(e) => setDataset(e.target.value)}
            title="Backtest dataset"
          >
            <option value="current">current year</option>
            <option value="prior">prior year (holdout)</option>
            <option value="alt">alt universe current</option>
            <option value="alt-prior">alt universe prior</option>
          </select>
          <button className={btnCls} onClick={() => rebalance.mutate()} disabled={rebalance.isPending}>
            {rebalance.isPending ? "Rebalancing…" : "Rebalance now"}
          </button>
          <button className={ghostBtnCls} onClick={() => reset.mutate()} disabled={reset.isPending}>
            Reset
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-4 text-xs text-slate-400">
        <span>
          equity <strong className="text-slate-100">{money(status?.equity)}</strong>
        </span>
        <span>
          exposure{" "}
          <strong className={regime ? "text-green-400" : "text-amber-300"}>
            {(exposure * 100).toFixed(1)}%
          </strong>
        </span>
        <span>
          regime{" "}
          <strong className={regime ? "text-green-400" : "text-amber-300"}>
            {regime ? "risk-on" : "cash"}
          </strong>
        </span>
        <span>
          positions <strong className="text-slate-100">{status?.positions.length ?? 0}</strong>
        </span>
        <span>
          data age{" "}
          <strong className={stale != null && stale > 48 ? "text-amber-300" : "text-slate-100"}>
            {stale == null ? "—" : `${stale}h`}
          </strong>
        </span>
        <span>
          last rebalance{" "}
          <strong className="text-slate-100">
            {status?.lastRebalanceAt
              ? new Date(status.lastRebalanceAt).toLocaleString()
              : "never"}
          </strong>
        </span>
      </div>

      {rebalance.isError && (
        <p className="mb-2 text-xs text-red-400">{(rebalance.error as Error).message}</p>
      )}

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <div className="overflow-auto rounded-lg border border-line">
          <div className="border-b border-line bg-panel px-3 py-2 text-xs font-semibold text-slate-300">
            Target portfolio {targets ? `(${targets.targets.length} names)` : ""}
          </div>
          <table className="w-full border-collapse text-xs">
            <thead className="bg-panel text-slate-400">
              <tr>
                <th className="px-3 py-1.5 text-left">Symbol</th>
                <th className="px-3 py-1.5 text-right">3d return</th>
                <th className="px-3 py-1.5 text-right">Price</th>
                <th className="px-3 py-1.5 text-right">Weight</th>
              </tr>
            </thead>
            <tbody>
              {(targets?.targets ?? []).map((t) => (
                <tr key={t.symbol} className="border-t border-line/70">
                  <td className="px-3 py-1.5 text-slate-200">{t.symbol}</td>
                  <td className={`px-3 py-1.5 text-right ${t.pastReturn3d >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {pct(t.pastReturn3d)}
                  </td>
                  <td className="px-3 py-1.5 text-right text-slate-300">{price(t.price)}</td>
                  <td className="px-3 py-1.5 text-right text-slate-300">
                    {(t.weight * 100).toFixed(2)}%
                  </td>
                </tr>
              ))}
              {!targets?.targets.length && (
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-slate-500">
                    {regime ? "No targets." : "Regime off — staying in cash."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="overflow-auto rounded-lg border border-line">
          <div className="border-b border-line bg-panel px-3 py-2 text-xs font-semibold text-slate-300">
            Paper positions
          </div>
          <table className="w-full border-collapse text-xs">
            <thead className="bg-panel text-slate-400">
              <tr>
                <th className="px-3 py-1.5 text-left">Symbol</th>
                <th className="px-3 py-1.5 text-right">Entry</th>
                <th className="px-3 py-1.5 text-right">Price</th>
                <th className="px-3 py-1.5 text-right">Unrealized</th>
              </tr>
            </thead>
            <tbody>
              {(status?.positions ?? []).map((p) => (
                <tr key={p.id} className="border-t border-line/70">
                  <td className="px-3 py-1.5 text-slate-200">{p.symbol}</td>
                  <td className="px-3 py-1.5 text-right text-slate-300">{price(p.entry)}</td>
                  <td className="px-3 py-1.5 text-right text-slate-300">{price(p.price)}</td>
                  <td className={`px-3 py-1.5 text-right ${p.unrealizedPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {money(p.unrealizedPnl)}
                  </td>
                </tr>
              ))}
              {!status?.positions.length && (
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-slate-500">
                    No open positions.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Metrics label="Raw" m={backtest?.raw} />
        <Metrics label="Benchmark" m={backtest?.benchmark} />
        <Metrics label="Overlay" m={backtest?.overlay} />
        <Metrics label="2x costs" m={backtest?.stress} />
      </div>

      <p className="mt-2 text-xs text-slate-500">
        {backtestLoading ? "Loading backtest…" : ""} Validated on Binance low-cap perps: top {status?.config.topN ?? 10} by{" "}
        {status?.config.lookbackHours ?? 72}h return, rebalanced daily, regime/vol/drawdown overlay.
        Run <code>node scripts/perp-fetch.mjs 365</code> daily to refresh data. Paper only — not
        financial advice.
      </p>
    </section>
  );
}
