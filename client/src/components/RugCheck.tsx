import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { RugCheckResult } from "../types";
import { badgeCls, btnCls, cardCls, inputCls, titleCls } from "../ui";

const CHAINS = [
  { value: "", label: "Auto-detect" },
  { value: "ethereum", label: "Ethereum" },
  { value: "bsc", label: "BNB Chain" },
  { value: "polygon", label: "Polygon" },
  { value: "arbitrum", label: "Arbitrum" },
  { value: "optimism", label: "Optimism" },
  { value: "base", label: "Base" },
  { value: "avalanche", label: "Avalanche" },
  { value: "solana", label: "Solana" },
];

const verdictStyle = (verdict: string) =>
  verdict === "danger"
    ? "border-red-500/50 bg-red-500/10 text-red-400"
    : verdict === "caution"
      ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
      : "border-green-500/50 bg-green-500/10 text-green-400";

const severityColor = (severity: string) =>
  severity === "critical"
    ? "text-red-400"
    : severity === "high"
      ? "text-orange-400"
      : severity === "medium"
        ? "text-amber-300"
        : severity === "low"
          ? "text-slate-300"
          : "text-slate-500";

const usd = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const num = (n: number | null | undefined, digits = 2) =>
  n == null ? "—" : Number(n).toFixed(digits);

export default function RugCheck() {
  const qc = useQueryClient();
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState("");
  const [refresh, setRefresh] = useState(false);

  const run = useMutation({
    mutationFn: () => api.rugCheck(address.trim(), chain, refresh),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rugchecks"] }),
  });

  const { data: recent = [] } = useQuery({
    queryKey: ["rugchecks"],
    queryFn: () => api.rugChecks(8),
    refetchInterval: 30_000,
  });

  const result: RugCheckResult | undefined = run.data;

  return (
    <section className={cardCls}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className={`${titleCls} mb-0`}>Rug check</h2>
        <span className="text-xs text-slate-500">
          EVM via GoPlus + Honeypot.is · Solana via RugCheck · liquidity via DexScreener
        </span>
      </div>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (address.trim()) run.mutate();
        }}
      >
        <input
          className={`${inputCls} min-w-[280px] flex-1`}
          value={address}
          onChange={(e) => setAddress(e.target.value.trim())}
          placeholder="Token contract (0x… or Solana mint)"
        />
        <select className={inputCls} value={chain} onChange={(e) => setChain(e.target.value)}>
          {CHAINS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-400">
          <input type="checkbox" checked={refresh} onChange={(e) => setRefresh(e.target.checked)} />
          Fresh
        </label>
        <button type="submit" className={btnCls} disabled={run.isPending || !address.trim()}>
          {run.isPending ? "Checking…" : "Run rug check"}
        </button>
      </form>

      {run.isError && (
        <p className="mt-2 text-sm text-red-400">{(run.error as Error).message}</p>
      )}

      {result && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`rounded-full border px-3 py-1 text-sm font-bold uppercase ${verdictStyle(
                result.verdict
              )}`}
            >
              {result.verdict} · {result.score}/100
            </span>
            <span className="text-sm text-slate-300">
              {result.name || "Unknown token"}
              {result.symbol ? ` (${result.symbol})` : ""} · {result.chain || result.kind}
              {result.cached ? " · cached" : ""}
            </span>
          </div>

          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#0d1117]">
            <div
              className={
                result.verdict === "danger"
                  ? "h-full bg-red-500"
                  : result.verdict === "caution"
                    ? "h-full bg-amber-400"
                    : "h-full bg-green-500"
              }
              style={{ width: `${Math.max(3, result.score)}%` }}
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-lg border border-line bg-[#0d1117] p-2">
              <div className="text-[10px] uppercase text-slate-500">Liquidity</div>
              <div className="font-semibold text-slate-200">{usd(result.liquidityUsd)}</div>
            </div>
            <div className="rounded-lg border border-line bg-[#0d1117] p-2">
              <div className="text-[10px] uppercase text-slate-500">24h volume</div>
              <div className="font-semibold text-slate-200">{usd(result.volume24h)}</div>
            </div>
            <div className="rounded-lg border border-line bg-[#0d1117] p-2">
              <div className="text-[10px] uppercase text-slate-500">Buy / sell tax</div>
              <div className="font-semibold text-slate-200">
                {num(result.taxes.buy)}% / {num(result.taxes.sell)}%
              </div>
            </div>
            <div className="rounded-lg border border-line bg-[#0d1117] p-2">
              <div className="text-[10px] uppercase text-slate-500">Holders</div>
              <div className="font-semibold text-slate-200">
                {result.holders.count == null ? "—" : result.holders.count.toLocaleString()}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-[#0d1117] p-2">
              <div className="text-[10px] uppercase text-slate-500">Top holder</div>
              <div className="font-semibold text-slate-200">
                {result.holders.top1Percent == null ? "—" : `${num(result.holders.top1Percent)}%`}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-[#0d1117] p-2">
              <div className="text-[10px] uppercase text-slate-500">LP locked</div>
              <div className="font-semibold text-slate-200">
                {result.lpLockedPercent == null ? "—" : `${num(result.lpLockedPercent)}%`}
              </div>
            </div>
          </div>

          <ul className="mt-3 grid gap-1.5">
            {result.checks.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-[#0d1117] px-3 py-2 text-sm"
              >
                <span className={`font-semibold uppercase ${severityColor(c.severity)}`}>
                  {c.severity}
                </span>
                <span className="text-slate-200">{c.label}</span>
                {c.detail && <span className="text-slate-500">· {c.detail}</span>}
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className={badgeCls}>providers</span>
            {Object.entries(result.providers)
              .filter(([, used]) => used)
              .map(([name]) => (
                <span key={name} className="rounded-full bg-green-500/10 px-2 py-0.5 text-green-400">
                  {name}
                </span>
              ))}
            {result.providerErrors.map((e) => (
              <span key={e.provider} className="rounded-full bg-red-500/10 px-2 py-0.5 text-red-400">
                {e.provider} failed
              </span>
            ))}
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Recent checks
          </h3>
          <ul className="grid gap-1.5">
            {recent.map((r) => (
              <li
                key={`${r.address}:${r.chain}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-[#0d1117] px-3 py-1.5 text-xs"
              >
                <button
                  className="text-left text-slate-300 hover:text-blue-400"
                  onClick={() => {
                    setAddress(r.address);
                    setChain(r.chain || "");
                  }}
                >
                  {r.address}
                  <span className="ml-2 text-slate-500">{r.chain}</span>
                </button>
                <span className={`font-semibold uppercase ${verdictStyle(r.verdict)}`}>
                  {r.verdict} · {r.score}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
