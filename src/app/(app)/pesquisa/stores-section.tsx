"use client";

import { useRouter } from "next/navigation";
import {
  Minus,
  TrendingDown,
  TrendingUp,
  ExternalLink,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import {
  STORE_STATUSES,
  STORE_STATUS_LABEL,
  STORE_TRENDS,
  STORE_TREND_LABEL,
  type CompetitorStoreView,
  type StoreStatus,
  type StoreTrend,
} from "@/lib/competitor-stores-types";
import { formatDateInput } from "@/lib/period";
import { cn } from "@/lib/utils";
import { ActivityToggle } from "./activity-toggle";
import { deleteStoreAction, saveStoreAction } from "./store-actions";

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent";
const labelCls = "mb-1 block text-xs font-medium text-muted-foreground";

type Form = {
  id?: string;
  name: string;
  competitorLink: string;
  productCount: string;
  monthlyVisits: string;
  trend: StoreTrend;
  country: string;
  activeAds: string;
  priceRange: string;
  mainCategories: string;
  lastVerifiedAt: string;
  status: StoreStatus;
  niche: string;
  notes: string;
  bestSellers: string;
};

function emptyForm(): Form {
  return {
    name: "",
    competitorLink: "",
    productCount: "",
    monthlyVisits: "",
    trend: "",
    country: "",
    activeAds: "",
    priceRange: "",
    mainCategories: "",
    lastVerifiedAt: formatDateInput(new Date()),
    status: "to_analyze",
    niche: "",
    notes: "",
    bestSellers: "",
  };
}

function fromRow(r: CompetitorStoreView): Form {
  return {
    id: r.id,
    name: r.name,
    competitorLink: r.competitorLink,
    productCount: r.productCount != null ? String(r.productCount) : "",
    monthlyVisits: r.monthlyVisits != null ? String(r.monthlyVisits) : "",
    trend: r.trend,
    country: r.country,
    activeAds: r.activeAds != null ? String(r.activeAds) : "",
    priceRange: r.priceRange,
    mainCategories: r.mainCategories,
    lastVerifiedAt: r.lastVerifiedKey,
    status: r.status,
    niche: r.niche,
    notes: r.notes,
    bestSellers: r.bestSellers,
  };
}

function host(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return link;
  }
}

function TrendIcon({ trend }: { trend: StoreTrend }) {
  if (trend === "up")
    return (
      <span title={STORE_TREND_LABEL.up} className="text-positive">
        <TrendingUp className="h-5 w-5" />
      </span>
    );
  if (trend === "down")
    return (
      <span title={STORE_TREND_LABEL.down} className="text-negative">
        <TrendingDown className="h-5 w-5" />
      </span>
    );
  if (trend === "flat")
    return (
      <span title={STORE_TREND_LABEL.flat} className="text-muted-foreground">
        <Minus className="h-5 w-5" />
      </span>
    );
  return <span className="text-muted-foreground">—</span>;
}

export function StoresSection({
  stores,
  canEdit,
}: {
  stores: CompetitorStoreView[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<Form>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [country, setCountry] = useState("");
  const [status, setStatus] = useState<StoreStatus | "">("");
  const [activity, setActivity] = useState<"" | "active" | "inactive">("");
  const [q, setQ] = useState("");

  const countries = useMemo(
    () =>
      Array.from(new Set(stores.map((s) => s.country).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [stores],
  );

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return stores.filter((s) => {
      if (country && s.country !== country) return false;
      if (status && s.status !== status) return false;
      if (activity && s.activity !== activity) return false;
      if (!term) return true;
      return [
        s.name,
        s.competitorLink,
        s.niche,
        s.notes,
        s.bestSellers,
        s.mainCategories,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [stores, country, status, activity, q]);

  const patch = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));
  const isEditing = Boolean(form.id);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await saveStoreAction({ ...form });
      if (res.error) setError(res.error);
      else {
        setForm(emptyForm());
        router.refresh();
      }
    });
  }

  function remove(r: CompetitorStoreView) {
    if (!window.confirm(`Apagar «${r.name || host(r.competitorLink)}»?`))
      return;
    setError(null);
    startTransition(async () => {
      const res = await deleteStoreAction(r.id);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          {error}
        </p>
      )}

      {canEdit && (
        <form
          onSubmit={submit}
          className="rounded-lg border border-border bg-surface p-4 sm:p-5"
        >
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              {isEditing ? "Editar loja" : "Nova loja concorrente"}
            </h2>
            {isEditing && (
              <button
                type="button"
                onClick={() => setForm(emptyForm())}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" /> Cancelar edição
              </button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <label className={labelCls}>Competitor Link</label>
              <input
                className={inputCls}
                placeholder="https://loja.com"
                value={form.competitorLink}
                onChange={(e) => patch({ competitorLink: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Nome (opcional)</label>
              <input
                className={inputCls}
                value={form.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Country / Market</label>
              <input
                className={inputCls}
                placeholder="DE, FR, BE…"
                value={form.country}
                onChange={(e) => patch({ country: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Visitas mensais</label>
              <input
                className={inputCls}
                inputMode="numeric"
                placeholder="ex. 120000"
                value={form.monthlyVisits}
                onChange={(e) => patch({ monthlyVisits: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Tendência</label>
              <select
                className={inputCls}
                value={form.trend}
                onChange={(e) => patch({ trend: e.target.value as StoreTrend })}
              >
                {STORE_TRENDS.map((t) => (
                  <option key={t || "none"} value={t}>
                    {t === "up"
                      ? "▲ A escalar"
                      : t === "down"
                        ? "▼ A baixar"
                        : STORE_TREND_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>N. Products</label>
              <input
                className={inputCls}
                inputMode="numeric"
                value={form.productCount}
                onChange={(e) => patch({ productCount: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Active Ads</label>
              <input
                className={inputCls}
                inputMode="numeric"
                value={form.activeAds}
                onChange={(e) => patch({ activeAds: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Price Range</label>
              <input
                className={inputCls}
                placeholder="ex. 20€–60€"
                value={form.priceRange}
                onChange={(e) => patch({ priceRange: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Nicho</label>
              <input
                className={inputCls}
                value={form.niche}
                onChange={(e) => patch({ niche: e.target.value })}
              />
            </div>
            <div className="lg:col-span-2">
              <label className={labelCls}>Categorias principais</label>
              <input
                className={inputCls}
                placeholder="Casacos, Botas…"
                value={form.mainCategories}
                onChange={(e) => patch({ mainCategories: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Last Verified</label>
              <input
                type="date"
                className={inputCls}
                value={form.lastVerifiedAt}
                onChange={(e) => patch({ lastVerifiedAt: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select
                className={inputCls}
                value={form.status}
                onChange={(e) =>
                  patch({ status: e.target.value as StoreStatus })
                }
              >
                {STORE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STORE_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Best Sellers</label>
              <textarea
                rows={2}
                className={inputCls}
                placeholder="Produtos mais vendidos / links"
                value={form.bestSellers}
                onChange={(e) => patch({ bestSellers: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Notes</label>
              <textarea
                rows={2}
                className={inputCls}
                value={form.notes}
                onChange={(e) => patch({ notes: e.target.value })}
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={pending || !form.competitorLink.trim()}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {isEditing ? "Guardar" : "Adicionar"}
          </button>
        </form>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1">
          <label className={labelCls}>Pesquisar</label>
          <input
            className={inputCls}
            placeholder="Loja, nicho, notas…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>País</label>
          <select
            className={inputCls}
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            <option value="">Todos</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Status</label>
          <select
            className={inputCls}
            value={status}
            onChange={(e) => setStatus(e.target.value as StoreStatus | "")}
          >
            <option value="">Todos</option>
            {STORE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STORE_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Ativa?</label>
          <select
            className={inputCls}
            value={activity}
            onChange={(e) =>
              setActivity(e.target.value as "" | "active" | "inactive")
            }
          >
            <option value="">Todas</option>
            <option value="active">Ativas</option>
            <option value="inactive">Desativadas</option>
          </select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {rows.length} {rows.length === 1 ? "loja" : "lojas"}
      </p>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[1200px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs font-semibold text-muted-foreground">
              <th className="px-3 py-3">Loja</th>
              <th className="px-3 py-3">Country</th>
              <th className="px-3 py-3 text-right">Visitas mensais</th>
              <th className="px-3 py-3 text-center">Tend.</th>
              <th className="px-3 py-3 text-right">N. Products</th>
              <th className="px-3 py-3 text-right">Active Ads</th>
              <th className="px-3 py-3">Price Range</th>
              <th className="px-3 py-3">Categorias</th>
              <th className="px-3 py-3">Nicho</th>
              <th className="px-3 py-3">Verified</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Ativa?</th>
              <th className="px-3 py-3">Best Sellers</th>
              <th className="px-3 py-3">Notes</th>
              {canEdit && <th className="px-3 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={canEdit ? 15 : 14}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  Ainda sem lojas.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="px-3 py-3">
                  <a
                    href={r.competitorLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
                  >
                    {r.name || host(r.competitorLink)}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  {r.authorName && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      por {r.authorName}
                    </p>
                  )}
                </td>
                <td className="px-3 py-3">{r.country || "—"}</td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {r.monthlyVisits != null
                    ? r.monthlyVisits.toLocaleString("pt-PT")
                    : "—"}
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-center">
                    <TrendIcon trend={r.trend} />
                  </div>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {r.productCount ?? "—"}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {r.activeAds ?? "—"}
                </td>
                <td className="px-3 py-3">{r.priceRange || "—"}</td>
                <td className="max-w-[160px] px-3 py-3 text-muted-foreground">
                  {r.mainCategories || "—"}
                </td>
                <td className="px-3 py-3">{r.niche || "—"}</td>
                <td className="px-3 py-3 tabular-nums text-muted-foreground">
                  {r.lastVerifiedKey || "—"}
                </td>
                <td className="px-3 py-3">
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-xs font-medium",
                      r.status === "monitoring" &&
                        "border-accent/30 bg-accent/10 text-accent",
                      r.status === "analyzed" &&
                        "border-positive/30 bg-positive/10 text-positive",
                      r.status === "discarded" &&
                        "border-negative/30 bg-negative/10 text-negative",
                      r.status === "to_analyze" &&
                        "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    {STORE_STATUS_LABEL[r.status]}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <ActivityToggle
                    target="store"
                    id={r.id}
                    value={r.activity}
                    canEdit={canEdit}
                  />
                </td>
                <td className="max-w-[200px] px-3 py-3 text-muted-foreground">
                  <p className="line-clamp-3 whitespace-pre-line">
                    {r.bestSellers || "—"}
                  </p>
                </td>
                <td className="max-w-[200px] px-3 py-3 text-muted-foreground">
                  <p className="line-clamp-3 whitespace-pre-line">
                    {r.notes || "—"}
                  </p>
                </td>
                {canEdit && (
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        title="Editar"
                        onClick={() => {
                          setForm(fromRow(r));
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="rounded-lg border border-border p-1.5 hover:bg-muted"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Apagar"
                        disabled={pending}
                        onClick={() => remove(r)}
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
    </div>
  );
}
