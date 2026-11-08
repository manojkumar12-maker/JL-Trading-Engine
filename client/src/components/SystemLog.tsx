import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { cardCls, ghostBtnCls, inputCls, titleCls } from "../ui";

const LEVELS = ["info", "warn", "error", "debug"];
const CATEGORIES = [
  "trade",
  "signal",
  "news",
  "rug",
  "backtest",
  "provider",
  "equity",
  "system",
];

const levelColor = (level: string) =>
  level === "error"
    ? "text-red-400"
    : level === "warn"
      ? "text-amber-300"
      : level === "debug"
        ? "text-slate-500"
        : "text-green-400";

export default function SystemLog() {
  const qc = useQueryClient();
  const [level, setLevel] = useState("");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");

  const { data = [] } = useQuery({
    queryKey: ["events", level, category, q],
    queryFn: () => api.events({ limit: 200, level, category, q }),
    refetchInterval: 10_000,
  });

  const summary = useQuery({
    queryKey: ["eventsSummary"],
    queryFn: api.eventSummary,
    refetchInterval: 15_000,
  });

  const clear = useMutation({
    mutationFn: api.clearEvents,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["eventsSummary"] });
    },
  });

  return (
    <section className={cardCls}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className={`${titleCls} mb-0`}>System log</h2>
        <button className={ghostBtnCls} onClick={() => clear.mutate()} disabled={clear.isPending}>
          Clear
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <select className={inputCls} value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="">All levels</option>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          className={`${inputCls} flex-1`}
          placeholder="Search message / event / data…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <p className="mb-2 text-xs text-slate-500">
        {data.length} shown · {summary.data ? `${summary.data.total} total` : "…"}
        {summary.data?.byCategory?.length
          ? ` · ${summary.data.byCategory.map((c) => `${c.category}:${c.c}`).join("  ")}`
          : ""}
      </p>

      <ul className="grid max-h-[520px] gap-1.5 overflow-auto pr-1">
        {data.map((e) => (
          <li key={e.id} className="rounded-lg border border-line bg-[#0d1117] px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-500">{new Date(e.time).toLocaleString()}</span>
              <span className={`font-bold uppercase ${levelColor(e.level)}`}>{e.level}</span>
              <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-blue-300">{e.category}</span>
              <span className="text-slate-300">{e.event}</span>
            </div>
            <div className="mt-1 text-slate-200">{e.message}</div>
            {e.data && (
              <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-black/30 p-1.5 text-[11px] text-slate-400">
                {e.data}
              </pre>
            )}
          </li>
        ))}
        {!data.length && <li className="text-sm text-slate-500">No events yet.</li>}
      </ul>
    </section>
  );
}
