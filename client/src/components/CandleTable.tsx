import type { Candle } from "../types";

const fmt = (n: number) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 8 });

export default function CandleTable({ candles }: { candles: Candle[] }) {
  if (!candles.length) {
    return (
      <p className="rounded-lg border border-line bg-[#0d1117] p-4 text-sm text-slate-500">
        No candles loaded yet.
      </p>
    );
  }

  const rows = candles.slice(-100).reverse();

  return (
    <div className="max-h-80 overflow-auto rounded-lg border border-line">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 bg-panel">
          <tr className="text-slate-400">
            <th className="px-3 py-2 text-left font-semibold">Time</th>
            <th className="px-3 py-2 text-right font-semibold">Open</th>
            <th className="px-3 py-2 text-right font-semibold">High</th>
            <th className="px-3 py-2 text-right font-semibold">Low</th>
            <th className="px-3 py-2 text-right font-semibold">Close</th>
            <th className="px-3 py-2 text-right font-semibold">Volume</th>
            <th className="px-3 py-2 text-right font-semibold">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const change = c.o ? ((c.c - c.o) / c.o) * 100 : 0;
            return (
              <tr key={c.t} className="border-t border-line/70">
                <td className="px-3 py-1.5 text-left text-slate-400">
                  {new Date(c.t).toLocaleString()}
                </td>
                <td className="px-3 py-1.5 text-right text-slate-300">{fmt(c.o)}</td>
                <td className="px-3 py-1.5 text-right text-slate-300">{fmt(c.h)}</td>
                <td className="px-3 py-1.5 text-right text-slate-300">{fmt(c.l)}</td>
                <td className="px-3 py-1.5 text-right font-semibold text-slate-100">{fmt(c.c)}</td>
                <td className="px-3 py-1.5 text-right text-slate-400">{fmt(c.v)}</td>
                <td
                  className={`px-3 py-1.5 text-right font-semibold ${
                    change >= 0 ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {change.toFixed(2)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
