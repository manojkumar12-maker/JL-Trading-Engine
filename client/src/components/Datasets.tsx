import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { KlineResponse } from "../types";
import { badgeCls, cardCls, smallBtnCls, titleCls } from "../ui";

export default function Datasets({ onOpen }: { onOpen: (data: KlineResponse) => void }) {
  const { data: datasets = [] } = useQuery({
    queryKey: ["datasets"],
    queryFn: api.datasets,
    refetchInterval: 15_000,
  });
  const [error, setError] = useState("");

  async function open(symbol: string, interval: string) {
    setError("");
    try {
      const data = await api.dataset(symbol, interval);
      onOpen({ ...data, cached: true });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className={cardCls}>
      <h2 className={titleCls}>Saved datasets</h2>
      {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
      <ul className="grid gap-2">
        {datasets.length === 0 && (
          <li className="text-sm text-slate-500">No datasets saved yet.</li>
        )}
        {datasets.map((d) => (
          <li
            key={`${d.symbol}:${d.interval}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-[#0d1117] p-3 text-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-slate-100">{d.symbol}</strong>
              <span className={badgeCls}>{d.interval}</span>
              <span className="text-slate-500">
                {d.count} candles · {d.source ?? "n/a"} ·{" "}
                {new Date(d.updatedAt).toLocaleString()}
              </span>
            </div>
            <button className={smallBtnCls} onClick={() => open(d.symbol, d.interval)}>
              Open
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
