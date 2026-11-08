import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { badgeCls, cardCls, titleCls } from "../ui";

export default function Logs() {
  const { data: logs = [] } = useQuery({
    queryKey: ["logs"],
    queryFn: api.logs,
    refetchInterval: 10_000,
  });

  return (
    <section className={cardCls}>
      <h2 className={titleCls}>Agent logs</h2>
      <ul className="grid gap-2">
        {logs.length === 0 && <li className="text-sm text-slate-500">No agent runs yet.</li>}
        {logs.map((l, index) => (
          <li
            key={`${l.time}:${index}`}
            className={`rounded-lg border p-3 ${
              l.status === "error"
                ? "border-red-500/40 bg-red-500/5"
                : "border-line bg-[#0d1117]"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <strong className="text-slate-100">{l.agentName ?? "agent"}</strong>
              <span className={badgeCls}>{l.status}</span>
              <span className="text-slate-500">
                {new Date(l.time).toLocaleString()} · {l.trigger} · {l.ms}ms
              </span>
            </div>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-black/30 p-2 text-xs text-slate-300">
              {l.output}
            </pre>
          </li>
        ))}
      </ul>
    </section>
  );
}
