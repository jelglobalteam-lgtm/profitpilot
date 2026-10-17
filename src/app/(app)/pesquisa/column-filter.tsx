"use client";

import { ListFilter, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { norm } from "@/lib/research-import";
import { formatDateInput } from "@/lib/period";
import { cn } from "@/lib/utils";

export type ColKind = "values" | "num" | "date" | "text";

export type ColDef<T> = {
  key: string;
  label: string;
  kind: ColKind;
  get: (row: T) => string | number | null | undefined;
  /** Texto a mostrar para um valor (kind "values"). */
  valueLabel?: (v: string) => string;
  align?: "left" | "right";
};

export type ColFilterState = {
  values?: string[];
  min?: string;
  max?: string;
  text?: string;
  /** Atalho de datas escolhido (today, yesterday, d7, d14, d30, custom). */
  preset?: string;
};
export type ColFilters = Record<string, ColFilterState>;

const DATE_PRESETS = [
  { id: "all", label: "Todas" },
  { id: "today", label: "Hoje" },
  { id: "yesterday", label: "Ontem" },
  { id: "d7", label: "Últimos 7 dias" },
  { id: "d14", label: "Últimos 14 dias" },
  { id: "d30", label: "Últimos 30 dias" },
  { id: "custom", label: "Personalizado" },
] as const;

function presetRange(id: string): { min: string; max: string } | null {
  const day = (offset: number) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + offset);
    return formatDateInput(d);
  };
  switch (id) {
    case "today":
      return { min: day(0), max: day(0) };
    case "yesterday":
      return { min: day(-1), max: day(-1) };
    case "d7":
      return { min: day(-6), max: day(0) };
    case "d14":
      return { min: day(-13), max: day(0) };
    case "d30":
      return { min: day(-29), max: day(0) };
    default:
      return null;
  }
}

export function isActive(f: ColFilterState | undefined): boolean {
  return Boolean(
    f && (f.values?.length || f.min || f.max || (f.text && f.text.trim())),
  );
}

export function applyColFilters<T>(
  rows: T[],
  defs: ColDef<T>[],
  filters: ColFilters,
): T[] {
  const active = defs.filter((d) => isActive(filters[d.key]));
  if (!active.length) return rows;
  return rows.filter((row) =>
    active.every((d) => {
      const f = filters[d.key];
      const raw = d.get(row);
      switch (d.kind) {
        case "values":
          return f.values!.length
            ? f.values!.includes(String(raw ?? ""))
            : true;
        case "num": {
          const min =
            f.min !== undefined && f.min !== "" ? Number(f.min) : null;
          const max =
            f.max !== undefined && f.max !== "" ? Number(f.max) : null;
          if (min === null && max === null) return true;
          if (raw === null || raw === undefined || raw === "") return false;
          const n = Number(raw);
          if (min !== null && Number.isFinite(min) && n < min) return false;
          if (max !== null && Number.isFinite(max) && n > max) return false;
          return true;
        }
        case "date": {
          if (!f.min && !f.max) return true;
          const s = String(raw ?? "");
          if (!s) return false;
          if (f.min && s < f.min) return false;
          if (f.max && s > f.max) return false;
          return true;
        }
        case "text":
          return f.text?.trim()
            ? norm(String(raw ?? "")).includes(norm(f.text))
            : true;
      }
    }),
  );
}

export function FilterHeader<T>({
  def,
  rows,
  filter,
  onChange,
}: {
  def: ColDef<T>;
  rows: T[];
  filter: ColFilterState | undefined;
  onChange: (next: ColFilterState | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    maxHeight: number;
  }>({ left: 0, maxHeight: 400 });
  const [search, setSearch] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const active = isActive(filter);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScroll = (e: Event) => {
      if (popRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("scroll", onScroll, true);
    document.addEventListener("keydown", onKey);
    const onResize = () => setOpen(false);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const distinct = useMemo(() => {
    if (def.kind !== "values") return [];
    const map = new Map<string, number>();
    for (const r of rows) {
      const v = String(def.get(r) ?? "");
      map.set(v, (map.get(v) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([value, count]) => ({
        value,
        count,
        label: value ? (def.valueLabel?.(value) ?? value) : "(vazio)",
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt"));
  }, [rows, def]);

  function toggleOpen() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - 14;
      const above = r.top - 14;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - 270));
      // Abre para cima se não houver espaço suficiente em baixo.
      if (below < 340 && above > below) {
        setPos({
          bottom: window.innerHeight - r.top + 6,
          left,
          maxHeight: Math.max(160, above),
        });
      } else {
        setPos({
          top: r.bottom + 6,
          left,
          maxHeight: Math.max(160, below),
        });
      }
      setSearch("");
      setShowCustom(filter?.preset === "custom");
    }
    setOpen((o) => !o);
  }

  const set = (patch: Partial<ColFilterState>) => {
    const next = { ...(filter ?? {}), ...patch };
    onChange(isActive(next) ? next : undefined);
  };

  const inputCls =
    "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent";

  const visibleValues = distinct.filter((d) =>
    search ? norm(d.label).includes(norm(search)) : true,
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggleOpen}
        className={cn(
          "inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted hover:text-foreground",
          active && "text-accent",
          def.align === "right" && "flex-row-reverse",
        )}
      >
        {def.label}
        <ListFilter
          className={cn("h-3 w-3", active ? "opacity-100" : "opacity-50")}
        />
      </button>
      {open && (
        <div
          ref={popRef}
          style={{
            position: "fixed",
            top: pos.top,
            bottom: pos.bottom,
            left: pos.left,
            maxHeight: pos.maxHeight,
          }}
          className="z-[60] w-64 overflow-y-auto rounded-xl border border-border bg-surface p-3 text-left text-sm font-normal text-foreground shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold">{def.label}</span>
            {active && (
              <button
                type="button"
                onClick={() => onChange(undefined)}
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                <X className="h-3 w-3" /> Limpar
              </button>
            )}
          </div>

          {def.kind === "values" && (
            <>
              {distinct.length > 8 && (
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Procurar…"
                  className={cn(inputCls, "mb-2")}
                />
              )}
              <ul className="max-h-60 space-y-0.5 overflow-y-auto">
                {visibleValues.length === 0 && (
                  <li className="py-2 text-xs text-muted-foreground">
                    Sem opções.
                  </li>
                )}
                {visibleValues.map((d) => {
                  const checked = filter?.values?.includes(d.value) ?? false;
                  return (
                    <li key={d.value || "__empty"}>
                      <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const cur = filter?.values ?? [];
                            set({
                              values: checked
                                ? cur.filter((v) => v !== d.value)
                                : [...cur, d.value],
                            });
                          }}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {d.label}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {d.count}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {def.kind === "date" && (
            <div>
              <ul className="space-y-0.5">
                {DATE_PRESETS.map((pr) => {
                  const selected =
                    pr.id === "all"
                      ? !active && !showCustom
                      : pr.id === "custom"
                        ? showCustom || filter?.preset === "custom"
                        : filter?.preset === pr.id && !showCustom;
                  return (
                    <li key={pr.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (pr.id === "all") {
                            setShowCustom(false);
                            onChange(undefined);
                          } else if (pr.id === "custom") {
                            setShowCustom(true);
                          } else {
                            setShowCustom(false);
                            const r = presetRange(pr.id)!;
                            onChange({ ...r, preset: pr.id });
                            setOpen(false);
                          }
                        }}
                        className={cn(
                          "w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                          selected
                            ? "bg-accent/10 font-medium text-accent"
                            : "hover:bg-muted",
                          pr.id === "custom" &&
                            !selected &&
                            "text-muted-foreground",
                        )}
                      >
                        {pr.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {showCustom && (
                <div className="mt-2 space-y-2 border-t border-border pt-2">
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      De
                    </label>
                    <input
                      type="date"
                      value={filter?.min ?? ""}
                      onChange={(e) =>
                        set({ min: e.target.value, preset: "custom" })
                      }
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      Até
                    </label>
                    <input
                      type="date"
                      value={filter?.max ?? ""}
                      onChange={(e) =>
                        set({ max: e.target.value, preset: "custom" })
                      }
                      className={inputCls}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {def.kind === "num" && (
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  Mínimo
                </label>
                <input
                  autoFocus
                  type="number"
                  inputMode="numeric"
                  value={filter?.min ?? ""}
                  onChange={(e) => set({ min: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  Máximo
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={filter?.max ?? ""}
                  onChange={(e) => set({ max: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>
          )}

          {def.kind === "text" && (
            <input
              autoFocus
              value={filter?.text ?? ""}
              onChange={(e) => set({ text: e.target.value })}
              placeholder="Contém…"
              className={inputCls}
            />
          )}
        </div>
      )}
    </>
  );
}
