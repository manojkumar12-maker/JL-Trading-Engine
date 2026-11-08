import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { AgentInput } from "../types";
import {
  badgeCls,
  btnCls,
  cardCls,
  dangerBtnCls,
  inputCls,
  smallBtnCls,
  titleCls,
} from "../ui";

const ACTIONS = [
  { value: "fetch-klines", label: "Fetch latest klines" },
  { value: "fetch-history", label: "Sync history" },
  { value: "refresh-markets", label: "Refresh markets" },
];

const AGENT_INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"];

export default function Agents() {
  const qc = useQueryClient();
  const [action, setAction] = useState("fetch-klines");

  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: api.agents,
    refetchInterval: 10_000,
  });

  const create = useMutation({
    mutationFn: (input: AgentInput) => api.createAgent(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteAgent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });

  const run = useMutation({
    mutationFn: (id: string) => api.runAgent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["logs"] });
      qc.invalidateQueries({ queryKey: ["datasets"] });
    },
  });

  const showSymbol = action !== "refresh-markets";
  const showLimit = action === "fetch-klines";
  const showDays = action === "fetch-history";

  return (
    <section className={cardCls}>
      <h2 className={titleCls}>Automation agents</h2>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          create.mutate({
            name: String(f.get("name") || ""),
            action,
            symbol: String(f.get("symbol") || ""),
            interval: String(f.get("interval") || "1h"),
            limit: String(f.get("limit") || "200"),
            days: String(f.get("days") || "30"),
            intervalMinutes: String(f.get("intervalMinutes") || "0"),
          });
          form.reset();
          setAction("fetch-klines");
        }}
      >
        <input name="name" placeholder="Agent name" required className={`${inputCls} flex-1`} />

        <select value={action} onChange={(e) => setAction(e.target.value)} className={inputCls}>
          {ACTIONS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>

        {showSymbol && (
          <input
            name="symbol"
            defaultValue="BTC/USDT"
            placeholder="Symbol"
            className={`${inputCls} w-32`}
          />
        )}

        {showSymbol && (
          <select name="interval" defaultValue="1h" className={inputCls}>
            {AGENT_INTERVALS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        )}

        {showLimit && (
          <input
            name="limit"
            type="number"
            min={1}
            defaultValue={200}
            title="Candles to fetch"
            className={`${inputCls} w-24`}
          />
        )}

        {showDays && (
          <input
            name="days"
            type="number"
            min={1}
            defaultValue={30}
            title="Days of history"
            className={`${inputCls} w-24`}
          />
        )}

        <input
          name="intervalMinutes"
          type="number"
          min={0}
          placeholder="Every (min)"
          className={`${inputCls} w-28`}
        />

        <button type="submit" disabled={create.isPending} className={btnCls}>
          Create
        </button>
      </form>

      {create.isError && (
        <p className="mt-2 text-sm text-red-400">{(create.error as Error).message}</p>
      )}

      <ul className="mt-4 grid gap-2">
        {agents.length === 0 && <li className="text-sm text-slate-500">No agents yet.</li>}
        {agents.map((a) => (
          <li
            key={a.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-[#0d1117] p-3"
          >
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <strong className="text-slate-100">{a.name}</strong>
              <span className={badgeCls}>{a.action}</span>
              {a.symbol && (
                <span className="text-slate-400">
                  {a.symbol} {a.interval}
                </span>
              )}
              <span className="text-slate-500">
                {a.intervalMinutes ? `every ${a.intervalMinutes}m` : "manual"}
              </span>
              {a.lastRunAt && (
                <span className="text-slate-500">
                  last {new Date(a.lastRunAt).toLocaleTimeString()}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                className={smallBtnCls}
                disabled={run.isPending}
                onClick={() => run.mutate(a.id)}
              >
                Run now
              </button>
              <button className={dangerBtnCls} onClick={() => remove.mutate(a.id)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      {run.isError && <p className="mt-2 text-sm text-red-400">{(run.error as Error).message}</p>}
      {run.isSuccess && <p className="mt-2 text-sm text-green-400">{run.data.output}</p>}
    </section>
  );
}
