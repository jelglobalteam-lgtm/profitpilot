"use client";

import { useRouter } from "next/navigation";
import { ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import type { ResearchKeywordView } from "@/lib/research-keywords";
import {
  addKeywordAction,
  deleteKeywordAction,
  voteKeywordAction,
} from "./keyword-actions";

export function KeywordsPanel({
  keywords,
  canEdit,
}: {
  keywords: ResearchKeywordView[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok?: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = text;
    if (!value.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await addKeywordAction(value);
      if (res.error) setError(res.error);
      else {
        setText("");
        router.refresh();
      }
    });
  }

  return (
    <aside className="mt-6 w-full shrink-0 lg:sticky lg:top-4 lg:mt-0 lg:w-72">
      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Keywords PR</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Ordenadas pelas que têm mais likes.
        </p>

        {canEdit && (
          <form onSubmit={submit} className="mt-3 flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Nova keyword"
              maxLength={120}
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
            />
            <button
              type="submit"
              disabled={pending || !text.trim()}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Adicionar
            </button>
          </form>
        )}

        {error && <p className="mt-2 text-xs text-negative">{error}</p>}

        <ul className="mt-3 max-h-[70vh] divide-y divide-border overflow-y-auto">
          {keywords.length === 0 && (
            <li className="py-6 text-center text-xs text-muted-foreground">
              Ainda sem keywords.
            </li>
          )}
          {keywords.map((k) => (
            <li key={k.id} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1 break-words text-sm">
                {k.text}
              </span>
              <button
                type="button"
                title="Gosto"
                disabled={!canEdit || pending}
                onClick={() => run(() => voteKeywordAction(k.id, "like"))}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-1.5 py-1 text-xs tabular-nums hover:bg-muted disabled:opacity-60"
              >
                <ThumbsUp className="h-3.5 w-3.5" />
                {k.likes}
              </button>
              <button
                type="button"
                title="Não gosto"
                disabled={!canEdit || pending}
                onClick={() => run(() => voteKeywordAction(k.id, "dislike"))}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-1.5 py-1 text-xs tabular-nums hover:bg-muted disabled:opacity-60"
              >
                <ThumbsDown className="h-3.5 w-3.5" />
                {k.dislikes}
              </button>
              {canEdit && (
                <button
                  type="button"
                  title="Apagar"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm(`Apagar «${k.text}»?`)) return;
                    run(() => deleteKeywordAction(k.id));
                  }}
                  className="rounded-lg p-1 text-negative hover:bg-negative/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
