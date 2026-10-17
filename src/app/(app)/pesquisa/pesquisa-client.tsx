"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { ResearchItemView } from "@/lib/research";
import {
  RESEARCH_GENDER_LABEL,
  RESEARCH_GENDERS,
  RESEARCH_KINDS,
  RESEARCH_KIND_LABEL,
  RESEARCH_STATUSES,
  RESEARCH_STATUS_LABEL,
  type ResearchGender,
  type ResearchKind,
  type ResearchStatus,
} from "@/lib/research-types";
import { formatDateInput } from "@/lib/period";
import { cn } from "@/lib/utils";
import type { ResearchKeywordView } from "@/lib/research-keywords";
import { KeywordsPanel } from "./keywords-panel";
import { StoresSection } from "./stores-section";
import { ImportBox } from "./import-box";
import { ActivityToggle } from "./activity-toggle";
import { GlobalSearch } from "./global-search";
import { EditableCell } from "./editable-cell";
import {
  applyColFilters,
  FilterHeader,
  type ColDef,
  type ColFilters,
} from "./column-filter";
import { ActivityFilter, type ActivityFilterValue } from "./activity-filter";
import { norm } from "@/lib/research-import";
import type { CompetitorStoreView } from "@/lib/competitor-stores-types";
import {
  createResearchItemAction,
  deleteResearchItemAction,
  updateResearchItemAction,
} from "./actions";

type FormState = {
  kind: ResearchKind;
  name: string;
  reach: string;
  activeDays: string;
  fbAdLink: string;
  storeLink: string;
  market: string;
  researchedAt: string;
  gender: ResearchGender;
  notes: string;
  angle: string;
  status: ResearchStatus;
};

function emptyForm(today = formatDateInput(new Date())): FormState {
  return {
    kind: "product",
    name: "",
    reach: "",
    activeDays: "",
    fbAdLink: "",
    storeLink: "",
    market: "",
    researchedAt: today,
    gender: "unknown",
    notes: "",
    angle: "",
    status: "new",
  };
}

function fromRow(row: ResearchItemView): FormState {
  return {
    kind: row.kind,
    name: row.name,
    reach: row.reach != null ? String(row.reach) : "",
    activeDays: row.activeDays != null ? String(row.activeDays) : "",
    fbAdLink: row.fbAdLink,
    storeLink: row.storeLink,
    market: row.market,
    researchedAt: row.researchedAtKey,
    gender: row.gender,
    notes: row.notes,
    angle: row.angle,
    status: row.status,
  };
}

function parseNum(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const ITEM_COLS: ColDef<ResearchItemView>[] = [
  { key: "date", label: "Date", kind: "date", get: (r) => r.researchedAtKey },
  { key: "name", label: "Nome", kind: "text", get: (r) => r.name },
  {
    key: "kind",
    label: "Tipo",
    kind: "values",
    get: (r) => r.kind,
    valueLabel: (v) => RESEARCH_KIND_LABEL[v as ResearchKind] ?? v,
  },
  {
    key: "reach",
    label: "Reach",
    kind: "num",
    get: (r) => r.reach,
    align: "right",
  },
  {
    key: "days",
    label: "Days",
    kind: "num",
    get: (r) => r.activeDays,
    align: "right",
  },
  { key: "market", label: "Market", kind: "values", get: (r) => r.market },
  {
    key: "gender",
    label: "Gender",
    kind: "values",
    get: (r) => r.gender,
    valueLabel: (v) => RESEARCH_GENDER_LABEL[v as ResearchGender] ?? v,
  },
  {
    key: "status",
    label: "Estado",
    kind: "values",
    get: (r) => r.status,
    valueLabel: (v) => RESEARCH_STATUS_LABEL[v as ResearchStatus] ?? v,
  },
  {
    key: "activity",
    label: "Ativa?",
    kind: "values",
    get: (r) => r.activity,
    valueLabel: (v) => (v === "active" ? "Ativa" : "Desativa"),
  },
];
const itemCol = (key: string) => ITEM_COLS.find((d) => d.key === key)!;

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent";
const labelCls = "mb-1 block text-xs font-medium text-muted-foreground";

function statusTone(status: ResearchStatus): string {
  switch (status) {
    case "winner":
      return "border-positive/30 bg-positive/10 text-positive";
    case "testing":
      return "border-accent/30 bg-accent/10 text-accent";
    case "shortlist":
      return "border-warning/30 bg-warning/10 text-warning";
    case "rejected":
      return "border-negative/30 bg-negative/10 text-negative";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

export function PesquisaClient({
  rows: allRows,
  keywords,
  stores,
  canEdit,
  initialQ,
  initialKind,
  initialStatus,
}: {
  rows: ResearchItemView[];
  keywords: ResearchKeywordView[];
  stores: CompetitorStoreView[];
  canEdit: boolean;
  initialQ: string;
  initialKind: ResearchKind | "all";
  initialStatus: ResearchStatus | "all";
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"items" | "stores">("items");
  const [kwOpen, setKwOpen] = useState(true);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [q, setQ] = useState(initialQ);
  const [kindFilter, setKindFilter] = useState<ResearchKind | "all">(
    initialKind,
  );
  const [statusFilter, setStatusFilter] = useState<ResearchStatus | "all">(
    initialStatus,
  );

  const isEditing = Boolean(editingId);

  function patchForm(patch: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function run(action: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else {
        setForm(emptyForm());
        setEditingId(null);
        router.refresh();
      }
    });
  }

  function submitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    const payload = {
      kind: form.kind,
      name: form.name,
      reach: parseNum(form.reach),
      activeDays: parseNum(form.activeDays),
      fbAdLink: form.fbAdLink,
      storeLink: form.storeLink,
      market: form.market,
      researchedAt: form.researchedAt || formatDateInput(new Date()),
      gender: form.gender,
      notes: form.notes,
      angle: form.angle,
      status: form.status,
    };
    if (editingId) {
      run(() => updateResearchItemAction({ id: editingId, ...payload }));
    } else {
      run(() => createResearchItemAction(payload));
    }
  }

  function startEdit(row: ResearchItemView) {
    setEditingId(row.id);
    setForm(fromRow(row));
    setError(null);
  }

  useEffect(() => {
    if (!editingId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setEditingId(null);
        setForm(emptyForm());
        setError(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editingId]);

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
  }

  const markets = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRows) {
      if (r.market) set.add(r.market);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pt"));
  }, [allRows]);

  const [activityFilter, setActivityFilter] =
    useState<ActivityFilterValue>("active");
  const [colFilters, setColFilters] = useState<ColFilters>({});
  const setCol = (key: string, f: ColFilters[string] | undefined) =>
    setColFilters((prev) => {
      const next = { ...prev };
      if (f) next[key] = f;
      else delete next[key];
      return next;
    });
  const colHeader = (key: string) => (
    <FilterHeader
      def={itemCol(key)}
      rows={allRows}
      filter={colFilters[key]}
      onChange={(f) => setCol(key, f)}
    />
  );
  const rows = useMemo(() => {
    const term = norm(q);
    const base = allRows.filter((r) => {
      if (activityFilter && r.activity !== activityFilter) return false;
      if (kindFilter !== "all" && r.kind !== kindFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!term) return true;
      return norm(
        [r.name, r.market, r.notes, r.angle, r.kindLabel, r.genderLabel].join(
          " ",
        ),
      ).includes(term);
    });
    return applyColFilters(base, ITEM_COLS, colFilters);
  }, [allRows, activityFilter, kindFilter, statusFilter, q, colFilters]);

  return (
    <div className="mx-auto max-w-[1600px] lg:flex lg:items-start lg:gap-6">
      <div className="min-w-0 flex-1 space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          Product & Collection Research
        </h1>
        <GlobalSearch items={allRows} stores={stores} keywords={keywords} />

        <div className="flex w-fit gap-1 rounded-lg border border-border bg-surface p-1 text-sm">
          {(
            [
              ["items", "Produtos & Coleções"],
              ["stores", "Lojas concorrentes"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setTab(k);
                setKwOpen(k === "items");
              }}
              className={cn(
                "rounded-md px-3 py-1.5 font-medium",
                tab === k
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {l}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setKwOpen((o) => !o)}
            className="ml-1 rounded-md border-l border-border px-3 py-1.5 font-medium text-muted-foreground hover:text-foreground"
          >
            {kwOpen ? "Esconder keywords" : "Mostrar keywords"}
          </button>
        </div>
        {canEdit && <ImportBox />}
        {tab === "stores" ? (
          <StoresSection stores={stores} canEdit={canEdit} />
        ) : (
          <>
            {error && (
              <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
                {error}
              </p>
            )}

            {canEdit && (
              <div
                className={
                  isEditing
                    ? "fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4"
                    : undefined
                }
                onMouseDown={(e) => {
                  if (isEditing && e.target === e.currentTarget) cancelEdit();
                }}
              >
                <form
                  onSubmit={submitForm}
                  className={cn(
                    "rounded-lg border border-border bg-surface p-4 sm:p-5",
                    isEditing && "my-8 w-full max-w-4xl shadow-xl",
                  )}
                >
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold">
                      {isEditing ? "Editar entrada" : "Nova entrada"}
                    </h2>
                    {isEditing && (
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                        Cancelar edição
                      </button>
                    )}
                  </div>
                  {isEditing && error && (
                    <p className="mb-3 rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
                      {error}
                    </p>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <label className={labelCls}>Tipo</label>
                      <select
                        className={inputCls}
                        value={form.kind}
                        onChange={(e) =>
                          patchForm({ kind: e.target.value as ResearchKind })
                        }
                      >
                        {RESEARCH_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {RESEARCH_KIND_LABEL[k]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2 lg:col-span-2">
                      <label className={labelCls}>Nome</label>
                      <input
                        className={inputCls}
                        value={form.name}
                        onChange={(e) => patchForm({ name: e.target.value })}
                        placeholder="Produto ou coleção"
                        required
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Estado</label>
                      <select
                        className={inputCls}
                        value={form.status}
                        onChange={(e) =>
                          patchForm({
                            status: e.target.value as ResearchStatus,
                          })
                        }
                      >
                        {RESEARCH_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {RESEARCH_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className={labelCls}>Reach</label>
                      <input
                        className={cn(inputCls, "tabular-nums")}
                        inputMode="numeric"
                        value={form.reach}
                        onChange={(e) => patchForm({ reach: e.target.value })}
                        placeholder="ex. 250000"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Active Days</label>
                      <input
                        className={cn(inputCls, "tabular-nums")}
                        inputMode="numeric"
                        value={form.activeDays}
                        onChange={(e) =>
                          patchForm({ activeDays: e.target.value })
                        }
                        placeholder="ex. 12"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Market</label>
                      <input
                        className={inputCls}
                        list="research-markets"
                        value={form.market}
                        onChange={(e) => patchForm({ market: e.target.value })}
                        placeholder="BE, FR, DE…"
                      />
                      <datalist id="research-markets">
                        {markets.map((m) => (
                          <option key={m} value={m} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <label className={labelCls}>Gender</label>
                      <select
                        className={inputCls}
                        value={form.gender}
                        onChange={(e) =>
                          patchForm({
                            gender: e.target.value as ResearchGender,
                          })
                        }
                      >
                        {(
                          Object.keys(RESEARCH_GENDER_LABEL) as ResearchGender[]
                        ).map((g) => (
                          <option key={g} value={g}>
                            {RESEARCH_GENDER_LABEL[g]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className={labelCls}>Fb Ad Link</label>
                      <input
                        className={inputCls}
                        value={form.fbAdLink}
                        onChange={(e) =>
                          patchForm({ fbAdLink: e.target.value })
                        }
                        placeholder="https://facebook.com/ads/library/…"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Store Link</label>
                      <input
                        className={inputCls}
                        value={form.storeLink}
                        onChange={(e) =>
                          patchForm({ storeLink: e.target.value })
                        }
                        placeholder="https://…"
                      />
                    </div>

                    <div>
                      <label className={labelCls}>Date</label>
                      <input
                        type="date"
                        className={cn(inputCls, "tabular-nums")}
                        value={form.researchedAt}
                        onChange={(e) =>
                          patchForm({ researchedAt: e.target.value })
                        }
                      />
                    </div>
                    <div className="sm:col-span-2 lg:col-span-3">
                      <label className={labelCls}>Ângulo / hook</label>
                      <input
                        className={inputCls}
                        value={form.angle}
                        onChange={(e) => patchForm({ angle: e.target.value })}
                        placeholder="Ex. before/after, UGC, problema→solução"
                      />
                    </div>

                    <div className="sm:col-span-2 lg:col-span-4">
                      <label className={labelCls}>Notes</label>
                      <textarea
                        className={cn(inputCls, "min-h-[72px] resize-y")}
                        value={form.notes}
                        onChange={(e) => patchForm({ notes: e.target.value })}
                        placeholder="Observações, preço, fornecedor, ideias…"
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={pending || !form.name.trim()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4" />
                      {isEditing ? "Guardar" : "Adicionar"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {!canEdit && (
              <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                Só consulta — precisas de papel editor ou superior para
                adicionar.
              </p>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="min-w-0 flex-1">
                <label className={labelCls}>Pesquisar</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    className={cn(inputCls, "pl-9")}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Nome, market, notas…"
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Tipo</label>
                <select
                  className={inputCls}
                  value={kindFilter}
                  onChange={(e) => {
                    const v = e.target.value as ResearchKind | "all";
                    setKindFilter(v);
                  }}
                >
                  <option value="all">Todos</option>
                  {RESEARCH_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {RESEARCH_KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Estado</label>
                <select
                  className={inputCls}
                  value={statusFilter}
                  onChange={(e) => {
                    const v = e.target.value as ResearchStatus | "all";
                    setStatusFilter(v);
                  }}
                >
                  <option value="all">Todos</option>
                  {RESEARCH_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {RESEARCH_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {rows.length} entrada{rows.length === 1 ? "" : "s"}
              </p>
              <ActivityFilter
                value={activityFilter}
                onChange={setActivityFilter}
              />
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface lg:block">
              <table className="w-full min-w-[960px] text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-muted-foreground">
                    <th className="px-4 py-3">{colHeader("date")}</th>
                    <th className="px-4 py-3">{colHeader("name")}</th>
                    <th className="px-4 py-3">{colHeader("kind")}</th>
                    <th className="px-4 py-3 text-right">
                      {colHeader("reach")}
                    </th>
                    <th className="px-4 py-3 text-right">
                      {colHeader("days")}
                    </th>
                    <th className="px-4 py-3">{colHeader("market")}</th>
                    <th className="px-4 py-3">{colHeader("gender")}</th>
                    <th className="px-4 py-3">{colHeader("status")}</th>
                    <th className="px-4 py-3">{colHeader("activity")}</th>
                    <th className="px-4 py-3">Links</th>
                    <th className="px-4 py-3">Notes</th>
                    {canEdit && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={canEdit ? 11 : 10}
                        className="px-4 py-8 text-center text-muted-foreground"
                      >
                        Ainda sem research. Adiciona a primeira entrada em cima.
                      </td>
                    </tr>
                  )}
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-t border-border hover:bg-muted/60"
                    >
                      <td className="px-4 py-3 tabular-nums text-muted-foreground whitespace-nowrap">
                        <EditableCell
                          target="item"
                          id={row.id}
                          field="researchedAt"
                          type="date"
                          raw={row.researchedAtKey}
                          display={row.researchedAtLabel}
                          canEdit={canEdit}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <EditableCell
                          target="item"
                          id={row.id}
                          field="name"
                          type="text"
                          raw={row.name}
                          display={
                            <span className="font-medium">{row.name}</span>
                          }
                          canEdit={canEdit}
                        />
                        <EditableCell
                          target="item"
                          id={row.id}
                          field="angle"
                          type="text"
                          raw={row.angle}
                          display={
                            row.angle ? (
                              <span className="text-xs text-muted-foreground">
                                {row.angle}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/60">
                                + ângulo
                              </span>
                            )
                          }
                          canEdit={canEdit}
                          className="mt-0.5"
                        />
                        {row.createdByName && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            por {row.createdByName}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.kindLabel}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <EditableCell
                          target="item"
                          id={row.id}
                          field="reach"
                          type="number"
                          raw={row.reach != null ? String(row.reach) : ""}
                          display={
                            row.reach != null
                              ? row.reach.toLocaleString("pt-PT")
                              : "—"
                          }
                          canEdit={canEdit}
                        />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <EditableCell
                          target="item"
                          id={row.id}
                          field="activeDays"
                          type="number"
                          raw={
                            row.activeDays != null ? String(row.activeDays) : ""
                          }
                          canEdit={canEdit}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <EditableCell
                          target="item"
                          id={row.id}
                          field="market"
                          type="text"
                          raw={row.market}
                          canEdit={canEdit}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <EditableCell
                          target="item"
                          id={row.id}
                          field="gender"
                          type="select"
                          raw={row.gender}
                          display={row.genderLabel}
                          options={RESEARCH_GENDERS.map((g) => ({
                            value: g,
                            label:
                              g === "unknown" ? "—" : RESEARCH_GENDER_LABEL[g],
                          }))}
                          canEdit={canEdit}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <EditableCell
                          target="item"
                          id={row.id}
                          field="status"
                          type="select"
                          raw={row.status}
                          display={
                            <span
                              className={cn(
                                "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                                statusTone(row.status),
                              )}
                            >
                              {row.statusLabel}
                            </span>
                          }
                          options={RESEARCH_STATUSES.map((st) => ({
                            value: st,
                            label: RESEARCH_STATUS_LABEL[st],
                          }))}
                          canEdit={canEdit}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <ActivityToggle
                          target="item"
                          id={row.id}
                          value={row.activity}
                          canEdit={canEdit}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {row.fbAdLink ? (
                            <a
                              href={row.fbAdLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-accent hover:underline"
                            >
                              FB <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          {row.storeLink ? (
                            <a
                              href={row.storeLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-accent hover:underline"
                            >
                              Store <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : null}
                        </div>
                      </td>
                      <td className="max-w-[220px] px-4 py-3 text-muted-foreground">
                        <EditableCell
                          target="item"
                          id={row.id}
                          field="notes"
                          type="textarea"
                          raw={row.notes}
                          display={
                            <p className="line-clamp-2">{row.notes || "—"}</p>
                          }
                          canEdit={canEdit}
                        />
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              title="Editar"
                              onClick={() => startEdit(row)}
                              className="rounded-lg border border-border p-1.5 hover:bg-muted"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Apagar"
                              disabled={pending}
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    `Apagar «${row.name}»? (soft delete)`,
                                  )
                                ) {
                                  return;
                                }
                                run(() => deleteResearchItemAction(row.id));
                              }}
                              className="rounded-lg border border-border p-1.5 text-negative hover:bg-negative/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-3 lg:hidden">
              {rows.length === 0 && (
                <p className="rounded-lg border border-border bg-surface px-4 py-8 text-center text-sm text-muted-foreground">
                  Ainda sem research.
                </p>
              )}
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="rounded-lg border border-border bg-surface p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{row.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {row.kindLabel} · {row.researchedAtLabel}
                        {row.market ? ` · ${row.market}` : ""}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium",
                        statusTone(row.status),
                      )}
                    >
                      {row.statusLabel}
                    </span>
                  </div>

                  <div className="mt-3">
                    <ActivityToggle
                      target="item"
                      id={row.id}
                      value={row.activity}
                      canEdit={canEdit}
                    />
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Reach</p>
                      <p className="tabular-nums">
                        {row.reach != null
                          ? row.reach.toLocaleString("pt-PT")
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Active Days
                      </p>
                      <p className="tabular-nums">{row.activeDays ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Gender</p>
                      <p>{row.genderLabel}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Ângulo</p>
                      <p className="truncate">{row.angle || "—"}</p>
                    </div>
                  </div>

                  {(row.fbAdLink || row.storeLink) && (
                    <div className="mt-3 flex flex-wrap gap-3 text-sm">
                      {row.fbAdLink && (
                        <a
                          href={row.fbAdLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-accent"
                        >
                          FB Ad <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {row.storeLink && (
                        <a
                          href={row.storeLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-accent"
                        >
                          Store <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  )}

                  {row.notes && (
                    <p className="mt-3 text-sm text-muted-foreground">
                      {row.notes}
                    </p>
                  )}

                  {canEdit && (
                    <div className="mt-3 flex gap-2 border-t border-border pt-3">
                      <button
                        type="button"
                        onClick={() => startEdit(row)}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-border py-2 text-sm"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          if (!window.confirm(`Apagar «${row.name}»?`)) return;
                          run(() => deleteResearchItemAction(row.id));
                        }}
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-border px-3 py-2 text-sm text-negative"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
        <p className="text-xs text-muted-foreground">
          Atalho:{" "}
          <Link href="/operacao" className="text-accent hover:underline">
            Modo operação
          </Link>
        </p>
      </div>
      {kwOpen && <KeywordsPanel keywords={keywords} canEdit={canEdit} />}
    </div>
  );
}
