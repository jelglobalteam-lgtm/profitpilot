"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { updateFieldAction } from "./field-actions";

export type EditableType = "text" | "number" | "date" | "select" | "textarea";

export function EditableCell({
  target,
  id,
  field,
  type,
  raw,
  display,
  options,
  canEdit,
  className,
}: {
  target: "item" | "store";
  id: string;
  field: string;
  type: EditableType;
  /** Valor atual em texto simples (para o editor). */
  raw: string;
  /** Como mostrar quando não está a editar (por omissão, o valor ou —). */
  display?: React.ReactNode;
  options?: { value: string; label: string }[];
  canEdit: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(raw);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const cancelled = useRef(false);

  function open() {
    if (!canEdit || editing) return;
    cancelled.current = false;
    setDraft(raw);
    setError(null);
    setEditing(true);
  }

  function save(value: string) {
    if (cancelled.current) return;
    if (value === raw) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      const res = await updateFieldAction(target, id, field, value);
      if (res.error) {
        setError(res.error);
      } else {
        setEditing(false);
        router.refresh();
      }
    });
  }

  const inputCls =
    "w-full min-w-[5rem] rounded-md border border-accent bg-background px-2 py-1 text-sm outline-none";

  if (!editing) {
    return (
      <div
        role={canEdit ? "button" : undefined}
        tabIndex={canEdit ? 0 : undefined}
        title={canEdit ? "Clique para editar" : undefined}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === "Enter") open();
        }}
        className={cn(
          "-mx-1 min-h-[1.5rem] rounded px-1",
          canEdit && "cursor-text hover:bg-muted",
          className,
        )}
      >
        {display ?? (raw || "—")}
      </div>
    );
  }

  const keyHandler = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      cancelled.current = true;
      setEditing(false);
    } else if (e.key === "Enter" && (type !== "textarea" || !e.shiftKey)) {
      e.preventDefault();
      save(draft);
    }
  };

  return (
    <div className={cn("min-w-[6rem]", className)}>
      {type === "select" ? (
        <select
          autoFocus
          disabled={pending}
          className={inputCls}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            save(e.target.value);
          }}
          onBlur={() => !pending && setEditing(false)}
          onKeyDown={keyHandler}
        >
          {options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : type === "textarea" ? (
        <textarea
          autoFocus
          rows={3}
          disabled={pending}
          className={inputCls}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => save(draft)}
          onKeyDown={keyHandler}
        />
      ) : (
        <input
          autoFocus
          disabled={pending}
          type={type === "date" ? "date" : "text"}
          inputMode={type === "number" ? "numeric" : undefined}
          className={inputCls}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => save(draft)}
          onKeyDown={keyHandler}
        />
      )}
      {error && <p className="mt-1 text-xs text-negative">{error}</p>}
    </div>
  );
}
