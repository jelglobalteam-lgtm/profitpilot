"use client";

import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Pencil,
  Plus,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import type { ResearchKeywordView } from "@/lib/research-keywords";
import {
  addKeywordAction,
  deleteKeywordAction,
  setKeywordCountryAction,
  voteKeywordAction,
} from "./keyword-actions";

const fieldCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-accent";
const ghostBtn =
  "rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50";

export function KeywordsPanel({
  keywords,
  canEdit,
}: {
  keywords: ResearchKeywordView[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [country, setCountry] = useState("");
  const [filterCountry, setFilterCountry] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const countries = useMemo(
    () =>
      Array.from(new Set(keywords.map((k) => k.country).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [keywords],
  );
  const visible = filterCountry
    ? keywords.filter((k) => k.country === filterCountry)
    : keywords;

  function run(fn: () => Promise<{ ok?: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  async function copy(id: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    } catch {
      setError("Não foi possível copiar.");
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await addKeywordAction(text, country);
      if (res.error) setError(res.error);
      else {
        setText("");
        setCountry("");
        router.refresh();
      }
    });
  }

  return (
    <aside className="mt-6 w-full shrink-0 lg:sticky lg:top-4 lg:mt-0 lg:w-80">
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Keywords PR</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
              {visible.length}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Mais likes primeiro
          </p>
        </div>

        {canEdit && (
          <form onSubmit={submit} className="space-y-2 px-4 pt-3">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Nova keyword"
              maxLength={120}
              className={fieldCls}
            />
            <div className="flex gap-2">
              <input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="País"
                maxLength={40}
                className={`${fieldCls.replace("w-full", "")} w-24 shrink-0`}
              />
              <button
                type="submit"
                disabled={pending || !text.trim()}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Adicionar
              </button>
            </div>
          </form>
        )}

        <div className="px-4 pt-3">
          <select
            value={filterCountry}
            onChange={(e) => setFilterCountry(e.target.value)}
            className={fieldCls}
            aria-label="Filtrar por país"
          >
            <option value="">Todos os países</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {error && <p className="mt-2 text-xs text-negative">{error}</p>}
        </div>

        <ul className="mt-3 max-h-[65vh] space-y-2 overflow-y-auto px-3 pb-3">
          {visible.length === 0 && (
            <li className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
              Sem keywords.
            </li>
          )}
          {visible.map((k, i) => (
            <li
              key={k.id}
              className="rounded-lg border border-border bg-background p-3"
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 w-5 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <p className="min-w-0 flex-1 break-words text-sm font-medium leading-snug">
                  {k.text}
                </p>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 pl-7">
                {k.country && (
                  <button
                    type="button"
                    title="Copiar país"
                    onClick={() => copy(`${k.id}-c`, k.country)}
                    className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent hover:bg-accent/20"
                  >
                    {k.country}
                    {copied === `${k.id}-c` ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                )}
                {k.authorName && (
                  <span className="text-xs text-muted-foreground">
                    por {k.authorName}
                  </span>
                )}
              </div>

              <div className="mt-2 flex items-center justify-between gap-2 pl-7">
                <div className="inline-flex overflow-hidden rounded-lg border border-border">
                  <button
                    type="button"
                    title="Gosto"
                    disabled={!canEdit || pending}
                    onClick={() => run(() => voteKeywordAction(k.id, "like"))}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs tabular-nums transition-colors hover:bg-positive/10 hover:text-positive disabled:opacity-60"
                  >
                    <ThumbsUp className="h-3.5 w-3.5" />
                    {k.likes}
                  </button>
                  <button
                    type="button"
                    title="Não gosto"
                    disabled={!canEdit || pending}
                    onClick={() =>
                      run(() => voteKeywordAction(k.id, "dislike"))
                    }
                    className="inline-flex items-center gap-1 border-l border-border px-2 py-1 text-xs tabular-nums transition-colors hover:bg-negative/10 hover:text-negative disabled:opacity-60"
                  >
                    <ThumbsDown className="h-3.5 w-3.5" />
                    {k.dislikes}
                  </button>
                </div>

                <div className="flex items-center">
                  <button
                    type="button"
                    title="Copiar keyword"
                    onClick={() => copy(k.id, k.text)}
                    className={ghostBtn}
                  >
                    {copied === k.id ? (
                      <Check className="h-3.5 w-3.5 text-positive" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        title={k.country ? "Alterar país" : "Definir país"}
                        disabled={pending}
                        onClick={() => {
                          const v = window.prompt(
                            "País desta keyword (ex. DE):",
                            k.country,
                          );
                          if (v === null) return;
                          run(() => setKeywordCountryAction(k.id, v));
                        }}
                        className={ghostBtn}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Apagar"
                        disabled={pending}
                        onClick={() => {
                          if (!window.confirm(`Apagar «${k.text}»?`)) return;
                          run(() => deleteKeywordAction(k.id));
                        }}
                        className={`${ghostBtn} hover:!bg-negative/10 hover:!text-negative`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
