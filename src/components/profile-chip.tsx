"use client";

import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { updateOwnNameAction } from "@/app/(app)/profile-actions";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function ProfileChip({
  name,
  handle,
}: {
  name: string;
  handle: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await updateOwnNameAction(value);
      if (res.error) setError(res.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setValue(name);
          setError(null);
          setOpen((o) => !o);
        }}
        title="O meu perfil"
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface pl-1.5 pr-3 text-sm hover:bg-muted"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground">
          {initials(name)}
        </span>
        <span className="max-w-[9rem] truncate font-medium" data-sensitive>
          {name}
        </span>
      </button>

      {open && (
        <form
          onSubmit={save}
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-border bg-surface p-3 shadow-lg"
        >
          <p className="text-xs font-medium text-muted-foreground">
            O meu perfil
          </p>
          {handle && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {handle}
            </p>
          )}
          <label className="mt-3 block text-xs font-medium text-muted-foreground">
            Nome
          </label>
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={60}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {error && <p className="mt-1 text-xs text-negative">{error}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" /> Cancelar
            </button>
            <button
              type="submit"
              disabled={pending || value.trim().length < 2}
              className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" /> Guardar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
