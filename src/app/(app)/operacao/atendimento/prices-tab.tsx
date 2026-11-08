"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import type { QuoteProductView } from "@/lib/cs-quote-data";
import type { CogsChangeView } from "@/lib/cs-cogs-data";
import { CogsChanges } from "./cogs-changes";
import {
  QUOTE_RESPONSES,
  QUOTE_RESPONSE_LABEL,
  QUOTE_STATUS_LABEL,
  miaQuoteMessage,
  nextQuoteThreshold,
  type QuoteResponse,
  type QuoteStatus,
} from "@/lib/cs-quotes";
import {
  confirmQuoteInvoiceAction,
  recordObservedPriceAction,
  recordQuoteReplyAction,
  recordQuoteRequestAction,
} from "./quote-actions";

type Filter = QuoteStatus | "todos" | "alterados";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "por_pedir", label: "Por pedir" },
  { key: "a_aguardar", label: "A aguardar resposta" },
  { key: "a_negociar", label: "A negociar" },
  { key: "por_confirmar", label: "Confirmar na fatura" },
  { key: "alterados", label: "Preço mudou sem pedido" },
  { key: "todos", label: "Todos" },
];

const eur = (n: number | null, cur = "EUR") =>
  n == null ? "—" : new Intl.NumberFormat("pt-PT", { style: "currency", currency: cur }).format(n);
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon" }) : "—";

export function PricesTab({ products, cogsChanges, canEdit }: { products: QuoteProductView[]; cogsChanges: CogsChangeView[]; canEdit: boolean }) {
  const [filter, setFilter] = useState<Filter>("por_pedir");
  const [openId, setOpenId] = useState<string | null>(null);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) m.set(p.status, (m.get(p.status) ?? 0) + 1);
    return m;
  }, [products]);
  const changed = products.filter((p) => p.changedWithoutRequest).length;
  const rows = products.filter((p) =>
    filter === "todos" ? true : filter === "alterados" ? p.changedWithoutRequest : p.status === filter,
  );
  const open = products.find((p) => p.productId === openId) ?? null;

  return (
    <div className="space-y-3">
      <CogsChanges rows={cogsChanges} canEdit={canEdit} />
      <p className="text-sm text-muted-foreground">
        Pode pedir nova cotação à Mia aos 30, 60, 90 e depois a cada 100 unidades vendidas. O pedido só pergunta se é
        possível rever a cotação por causa do volume, sem indicar desconto, e deve vir com verificação de qualidade.
      </p>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-medium",
              filter === f.key
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {f.label}{" "}
            <span className="tabular-nums">
              ({f.key === "todos" ? products.length : f.key === "alterados" ? changed : (counts.get(f.key) ?? 0)})
            </span>
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum produto neste estado.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="text-[13px] text-muted-foreground">
              <tr>
                <th className="p-3">Produto</th>
                <th className="p-3">Unidades</th>
                <th className="p-3">Última venda</th>
                <th className="p-3">Loja</th>
                <th className="p-3">COGS original</th>
                <th className="p-3">COGS atual</th>
                <th className="p-3">Rondas</th>
                <th className="p-3">Próxima ronda</th>
                <th className="p-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const last = p.rounds[p.rounds.length - 1];
                return (
                  <tr
                    key={p.productId}
                    className="cursor-pointer border-t border-border hover:bg-muted/40"
                    onClick={() => setOpenId(p.productId)}
                  >
                    <td className="p-3 font-medium">{p.title}</td>
                    <td className="p-3 tabular-nums">
                      {p.units}
                      <span className="ml-1 text-xs text-muted-foreground">(+{p.recentUnits} em 30 dias)</span>
                    </td>
                    <td className="p-3">{day(p.lastSale)}</td>
                    <td className="p-3">{p.storeName}</td>
                    <td className="p-3 tabular-nums">{eur(p.originalCogs, p.currency)}</td>
                    <td className="p-3 tabular-nums">
                      {eur(p.currentCogs, p.currency)}
                      {p.cogsChangedAt && (
                        <span className="block text-xs text-muted-foreground">alterado a {day(p.cogsChangedAt)}</span>
                      )}
                      {p.changedWithoutRequest && <span className="block text-xs text-negative">mudou sem pedido registado</span>}
                    </td>
                    <td className="p-3 tabular-nums">{p.rounds.length}</td>
                    <td className="p-3 tabular-nums">{nextQuoteThreshold(last?.units ?? 0)} un.</td>
                    <td className="p-3">{QUOTE_STATUS_LABEL[p.status]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {open && <QuoteDialog product={open} canEdit={canEdit} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function QuoteDialog({
  product: p,
  canEdit,
  onClose,
}: {
  product: QuoteProductView;
  canEdit: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState(p.link);
  const [qc, setQc] = useState(true);
  const [original, setOriginal] = useState(p.originalCogs != null ? String(p.originalCogs) : "");
  const [response, setResponse] = useState<QuoteResponse>("aceitou");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [seen, setSeen] = useState("");
  const last = p.rounds[p.rounds.length - 1];
  const waiting = !!last && !last.repliedAt;
  const text = miaQuoteMessage({ title: p.title, link, units: p.units, qualityCheck: qc });

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r.error) setError(r.error);
      else router.refresh();
    });
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setError("Não foi possível copiar.");
    }
  }
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-lg border border-border bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{p.title}</h2>
            <p className="text-sm text-muted-foreground">
              {p.units} unidades vendidas · COGS atual {eur(p.currentCogs, p.currency)} · original{" "}
              {eur(p.originalCogs, p.currency)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-muted-foreground">
            Fechar
          </button>
        </div>

        {p.rounds.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="text-[13px] text-muted-foreground">
              <tr>
                <th className="py-1">Ronda</th>
                <th>Unidades</th>
                <th>Pedido</th>
                <th>Resposta</th>
                <th>Preço</th>
                <th>Verif. qualidade</th>
              </tr>
            </thead>
            <tbody>
              {p.rounds.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="py-1">{i + 1}</td>
                  <td className="tabular-nums">{r.units}</td>
                  <td>{day(r.requestedAt)}</td>
                  <td>{r.response ? `${QUOTE_RESPONSE_LABEL[r.response]} (${day(r.repliedAt)})` : "A aguardar"}</td>
                  <td className="tabular-nums">{eur(r.price, p.currency)}</td>
                  <td>{r.qualityCheck ? "Sim" : "Não"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {canEdit && !waiting && (
          <div className="space-y-2 rounded-md border border-border p-3">
            <p className="text-sm font-medium">Pedir revisão da cotação</p>
            <input
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
              placeholder="Link do produto"
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
            {p.rounds.length === 0 && (
              <input
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                placeholder="COGS original (preço da primeira cotação)"
                value={original}
                onChange={(e) => setOriginal(e.target.value)}
              />
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={qc} onChange={(e) => setQc(e.target.checked)} />
              Com verificação de qualidade
            </label>
            <textarea
              readOnly
              rows={4}
              className="w-full rounded-md border border-border bg-background p-2 text-sm"
              value={text}
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={copy} className="rounded-md border border-border px-3 py-1 text-sm">
                {copied ? "Copiado" : "Só copiar"}
              </button>
              <button
                type="button"
                disabled={pending}
                className="rounded-md bg-accent px-3 py-1 text-sm font-medium text-accent-foreground disabled:opacity-50"
                onClick={async () => {
                  await copy();
                  run(() =>
                    recordQuoteRequestAction({
                      productId: p.productId,
                      title: p.title,
                      link,
                      units: p.units,
                      qualityCheck: qc,
                      originalCogs: num(original),
                    }),
                  );
                }}
              >
                Copiar e registar pedido
              </button>
            </div>
          </div>
        )}

        {canEdit && waiting && (
          <div className="space-y-2 rounded-md border border-border p-3">
            <p className="text-sm font-medium">Registar resposta da Mia</p>
            <select
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
              value={response}
              onChange={(e) => setResponse(e.target.value as QuoteResponse)}
            >
              {QUOTE_RESPONSES.map((r) => (
                <option key={r} value={r}>
                  {QUOTE_RESPONSE_LABEL[r]}
                </option>
              ))}
            </select>
            <input
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
              placeholder="Novo preço por unidade (se houver)"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
            <textarea
              rows={2}
              className="w-full rounded-md border border-border bg-background p-2 text-sm"
              placeholder="Notas"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button
              type="button"
              disabled={pending}
              className="rounded-md bg-accent px-3 py-1 text-sm font-medium text-accent-foreground disabled:opacity-50"
              onClick={() => run(() => recordQuoteReplyAction({ productId: p.productId, response, price: num(price), note }))}
            >
              Guardar resposta
            </button>
          </div>
        )}

        {canEdit && p.status === "por_confirmar" && (
          <button
            type="button"
            disabled={pending}
            className="rounded-md border border-border px-3 py-1 text-sm"
            onClick={() => run(() => confirmQuoteInvoiceAction({ productId: p.productId }))}
          >
            Confirmar que a fatura já traz o novo preço
          </button>
        )}
        {canEdit && (
          <div className="space-y-2 rounded-md border border-border p-3">
            <p className="text-sm font-medium">Preço visto no PrimeFlow ou na fatura</p>
            <p className="text-xs text-muted-foreground">
              Registe o preço que vê hoje. Se for diferente do COGS atual, o produto fica marcado como alterado sem pedido.
              {p.observedPrice != null && ` Último registado: ${eur(p.observedPrice, p.currency)} a ${day(p.observedAt)}.`}
            </p>
            <div className="flex gap-2">
              <input
                className="w-40 rounded-md border border-border bg-background px-2 py-1 text-sm"
                placeholder="Preço por unidade"
                value={seen}
                onChange={(e) => setSeen(e.target.value)}
              />
              <button
                type="button"
                disabled={pending || num(seen) == null}
                className="rounded-md border border-border px-3 py-1 text-sm disabled:opacity-50"
                onClick={() => run(() => recordObservedPriceAction({ productId: p.productId, title: p.title, price: num(seen) ?? 0 }))}
              >
                Registar
              </button>
            </div>
          </div>
        )}
        {error && <p className="text-sm text-negative">{error}</p>}
      </div>
    </div>
  );
}
