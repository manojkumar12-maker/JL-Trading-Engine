import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { btnCls, cardCls, ghostBtnCls, inputCls, titleCls } from "../ui";

const money = (n: number) =>
  `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

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

export default function Equity() {
  const qc = useQueryClient();
  const [balance, setBalanceInput] = useState(50);

  const { data } = useQuery({
    queryKey: ["equity"],
    queryFn: api.equity,
    refetchInterval: 10_000,
  });

  const set = useMutation({
    mutationFn: (value: number) => api.setEquityBalance(value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["equity"] }),
  });

  const reset = useMutation({
    mutationFn: (value: number) => api.resetEquity(value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equity"] });
      qc.invalidateQueries({ queryKey: ["execStatus"] });
      qc.invalidateQueries({ queryKey: ["execPositions"] });
      qc.invalidateQueries({ queryKey: ["execOrders"] });
    },
  });

  return (
    <section className={cardCls}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className={`${titleCls} mb-0`}>Equity engine</h2>
        <span className="text-xs text-slate-500">
          Deploy 25% (½ of ½) · keep 75% reserve · split across {data?.maxConcurrent ?? 2} trades
        </span>
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          set.mutate(balance);
        }}
      >
        <label className="flex items-center gap-1 text-xs text-slate-400">
          Balance
          <input
            type="number"
            min={1}
            className={`${inputCls} w-28`}
            value={balance}
            onChange={(e) => setBalanceInput(Number(e.target.value))}
          />
        </label>
        <button type="submit" className={btnCls} disabled={set.isPending}>
          Set balance
        </button>
        <button
          type="button"
          className={ghostBtnCls}
          disabled={reset.isPending}
          onClick={() => reset.mutate(balance)}
        >
          Reset paper + balance
        </button>
        {set.isError && <span className="text-xs text-red-400">{(set.error as Error).message}</span>}
        {reset.isError && (
          <span className="text-xs text-red-400">{(reset.error as Error).message}</span>
        )}
      </form>

      {data && (
        <div className="mt-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="Balance" value={money(data.balance)} />
            <Stat
              label="Equity"
              value={money(data.equity)}
              accent={data.equity >= data.balance ? "text-green-400" : "text-red-400"}
            />
            <Stat label="Deployable (25%)" value={money(data.deployable)} />
            <Stat label="Reserve (75%)" value={money(data.reserve)} accent="text-blue-300" />
            <Stat
              label="Drawdown"
              value={`${data.drawdownPct}%`}
              accent={data.drawdownPct > 0 ? "text-amber-300" : "text-slate-100"}
            />
            <Stat label="Margin used" value={money(data.marginUsed)} />
            <Stat label="Available margin" value={money(data.availableMargin)} />
            <Stat label="Per-trade margin" value={money(data.perTradeMargin)} />
            <Stat label="Per-trade max notional" value={money(data.perTradeNotionalCap)} />
            <Stat label="Realized PnL" value={money(data.realized)} accent={data.realized >= 0 ? "text-green-400" : "text-red-400"} />
          </div>

          {(data.throttled || data.paused) && (
            <p className="mt-2 text-sm text-amber-300">
              {data.paused
                ? "Equity engine PAUSED — drawdown stop reached. No new trades."
                : "Drawdown throttle active — deployment cut to 12.5%."}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
            {Object.entries(data.policy).map(([k, v]) => (
              <span key={k} className="rounded-full border border-line bg-[#0d1117] px-2 py-0.5">
                <strong className="text-slate-300">{k}:</strong> {v}
              </span>
            ))}
            <span className="rounded-full border border-line bg-[#0d1117] px-2 py-0.5">
              leverage ≤ {data.maxLeverage}x
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
