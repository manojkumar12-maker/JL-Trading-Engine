import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { cardCls, titleCls } from "../ui";

export default function Providers() {
  const { data = [], isError } = useQuery({
    queryKey: ["providers"],
    queryFn: api.providers,
    refetchInterval: 10_000,
  });

  return (
    <section className={cardCls}>
      <h2 className={titleCls}>Data providers</h2>
      {isError && <p className="text-sm text-red-400">Unable to load providers.</p>}
      <div className="flex flex-wrap gap-2">
        {data.map((p) => {
          const down = !p.available;
          const meta = down
            ? `cooldown${p.cooldownUntil ? ` until ${new Date(p.cooldownUntil).toLocaleTimeString()}` : ""}`
            : `${p.usedInWindow}/${p.limitPerWindow} req · ok ${p.successCount} · err ${p.errorCount}`;
          return (
            <span
              key={p.id}
              title={p.lastError ?? ""}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
                down ? "border-red-500/40 bg-red-500/10" : "border-line bg-[#0d1117]"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${down ? "bg-red-500" : "bg-green-500"}`} />
              <strong className="text-slate-200">{p.name}</strong>
              <span className="text-slate-500">{meta}</span>
            </span>
          );
        })}
      </div>
    </section>
  );
}
