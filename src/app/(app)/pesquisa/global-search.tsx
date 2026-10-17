"use client";

import { ExternalLink, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { ResearchItemView } from "@/lib/research";
import type { ResearchKeywordView } from "@/lib/research-keywords";
import type { CompetitorStoreView } from "@/lib/competitor-stores-types";
import { STORE_STATUS_LABEL } from "@/lib/competitor-stores-types";
import { norm } from "@/lib/research-import";
import { cn } from "@/lib/utils";

function host(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return link;
  }
}

function ActivityDot({ value }: { value: "active" | "inactive" | "" }) {
  if (!value) return null;
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-medium text-white",
        value === "active" ? "bg-positive" : "bg-negative",
      )}
    >
      {value === "active" ? "Ativa" : "Desativa"}
    </span>
  );
}

export function GlobalSearch({
  items,
  stores,
  keywords,
}: {
  items: ResearchItemView[];
  stores: CompetitorStoreView[];
  keywords: ResearchKeywordView[];
}) {
  const [q, setQ] = useState("");
  const term = norm(q);

  const results = useMemo(() => {
    if (!term) return null;
    const has = (...parts: (string | null | undefined)[]) =>
      norm(parts.filter(Boolean).join(" ")).includes(term);
    return {
      items: items.filter((r) =>
        has(r.name, r.kindLabel, r.market, r.notes, r.angle, r.genderLabel),
      ),
      stores: stores.filter((s) =>
        has(
          s.name,
          s.competitorLink,
          s.country,
          s.niche,
          s.notes,
          s.bestSellers,
          s.mainCategories,
        ),
      ),
      keywords: keywords.filter((k) => has(k.text, k.country)),
    };
  }, [term, items, stores, keywords]);

  const total = results
    ? results.items.length + results.stores.length + results.keywords.length
    : 0;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Pesquisar em tudo: produtos, coleções, lojas e keywords (ex. blazer)"
          className="w-full rounded-lg border border-border bg-surface py-2.5 pl-9 pr-9 text-sm outline-none focus:border-accent"
        />
        {q && (
          <button
            type="button"
            title="Limpar"
            onClick={() => setQ("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {results && (
        <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
          <p className="text-sm font-medium">
            {total === 0
              ? `Sem resultados para «${q.trim()}».`
              : `${total} resultado${total === 1 ? "" : "s"} para «${q.trim()}»`}
          </p>

          {results.items.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Produtos e coleções ({results.items.length})
              </h3>
              <ul className="space-y-2">
                {results.items.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-lg border border-border bg-background p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {r.kindLabel}
                        {r.market ? ` · ${r.market}` : ""} · {r.statusLabel}
                      </span>
                      <ActivityDot value={r.activity} />
                    </div>
                    {r.notes && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {r.notes}
                      </p>
                    )}
                    <div className="mt-1 flex gap-3 text-xs">
                      {r.fbAdLink && (
                        <a
                          href={r.fbAdLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-accent hover:underline"
                        >
                          FB Ad <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {r.storeLink && (
                        <a
                          href={r.storeLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-accent hover:underline"
                        >
                          Store <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {results.stores.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Lojas concorrentes ({results.stores.length})
              </h3>
              <ul className="space-y-2">
                {results.stores.map((s) => (
                  <li
                    key={s.id}
                    className="rounded-lg border border-border bg-background p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={s.competitorLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
                      >
                        {s.name || host(s.competitorLink)}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      <span className="text-xs text-muted-foreground">
                        {s.country ? `${s.country} · ` : ""}
                        {STORE_STATUS_LABEL[s.status]}
                        {s.monthlyVisits != null
                          ? ` · ${s.monthlyVisits.toLocaleString("pt-PT")} visitas/mês`
                          : ""}
                      </span>
                      <ActivityDot value={s.activity} />
                    </div>
                    {(s.niche || s.mainCategories || s.bestSellers) && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {[s.niche, s.mainCategories, s.bestSellers]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {results.keywords.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Keywords ({results.keywords.length})
              </h3>
              <ul className="flex flex-wrap gap-2">
                {results.keywords.map((k) => (
                  <li
                    key={k.id}
                    className="rounded-full border border-border bg-background px-3 py-1 text-xs"
                  >
                    {k.text}
                    {k.country ? ` · ${k.country}` : ""} · 👍 {k.likes}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
