import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { badgeCls, cardCls, ghostBtnCls, inputCls, titleCls } from "../ui";

function timeAgo(ms: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function News() {
  const qc = useQueryClient();
  const [source, setSource] = useState("");
  const [query, setQuery] = useState("");

  const { data, isError } = useQuery({
    queryKey: ["news"],
    queryFn: () => api.news(150),
    refetchInterval: 60_000,
  });

  const refresh = useMutation({
    mutationFn: api.refreshNews,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["news"] }),
  });

  const articles = useMemo(() => {
    const list = data?.articles ?? [];
    const q = query.trim().toLowerCase();
    return list.filter(
      (a) =>
        (!source || a.sourceId === source) &&
        (!q || a.title.toLowerCase().includes(q) || a.summary.toLowerCase().includes(q))
    );
  }, [data, source, query]);

  const sources = data?.sources ?? [];

  return (
    <section className={cardCls}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className={`${titleCls} mb-0`}>Crypto news</h2>
        <button
          className={ghostBtnCls}
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
        >
          {refresh.isPending ? "Refreshing…" : "Refresh news"}
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <input
          className={`${inputCls} flex-1`}
          placeholder="Search headlines…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className={inputCls}
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          <option value="">All sources</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <p className="mb-2 text-xs text-slate-500">
        {isError
          ? "Unable to load news."
          : data
            ? `${articles.length} shown · ${data.total} stored`
            : "Loading…"}
        {refresh.data ? ` · last refresh: ${refresh.data.inserted} new` : ""}
        {refresh.isError ? ` · ${(refresh.error as Error).message}` : ""}
      </p>

      <ul className="grid max-h-[520px] gap-2 overflow-auto pr-1">
        {articles.map((a) => (
          <li key={a.id} className="rounded-lg border border-line bg-[#0d1117] p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={badgeCls}>{a.sourceName}</span>
              <span className="text-slate-500">{timeAgo(a.publishedAt)}</span>
            </div>
            <a
              href={a.link}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block font-semibold text-slate-100 hover:text-blue-400"
            >
              {a.title}
            </a>
            {a.summary && (
              <p className="mt-1 line-clamp-2 text-sm text-slate-400">{a.summary}</p>
            )}
          </li>
        ))}
        {!articles.length && (
          <li className="text-sm text-slate-500">
            No news yet — click “Refresh news”.
          </li>
        )}
      </ul>
    </section>
  );
}
