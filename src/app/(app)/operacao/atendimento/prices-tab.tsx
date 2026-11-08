"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import type { QuoteProductView } from "@/lib/cs-quote-data";
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
  recordQuoteReplyAction,
  recordQuoteRequestAction,
} from "./quote-actions";

const FILTERS: { key: QuoteStatus | "todos"; label: string }[] = [
  { key: "por_pedir", label: "Por pedir" },
  { key: "a_aguardar", label: "A aguardar resposta" },
  { key: "a_negociar", label: "A negociar" },
  { key: "por_confirmar", label: "Confirmar na fatura" },
  { key: "todos", label: "Todos" },
];

const eur = (n: number | null, cur = "EUR") =>
  n == null ? "—" : new Intl.NumberFormat("pt-PT", { style: "currency", currency: cur }).format(n);
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon" }) : "—";

export function PricesTab({ products, canEdit }: { products: QuoteProductView[]; canEdit: boolean }) {
  const [filter, setFilter] = useState<QuoteStatus | "todos">("por_pedir");
  const [openId, setOpenId] = useState<string | null>(null);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) m.set(p.status, (m.get(p.status) ?? 0) + 1);
    return m;
  }, [products]);
  const rows = products.filter((p) => filter === "todos" || p.status === filter);
  const open = products.find((p) => p.productId === openId) ?? null;

  return (
    <div className="space-y-3">
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
              "rounded-full border px-3 py-1 text-sm",
              filter === f.key ? "border-foreground bg-foreground text-background" : "border-border bg-surface",
            )}
          >
            {f.label}{" "}
            <span className="tabular-nums">
              ({f.key === "todos" ? products.length : (counts.get(f.key) ?? 0)})
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
                    <td className="p-3 tabular-nums">{eur(p.currentCogs ?? p.shopifyCogs, p.currency)}</td>
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
              {p.units} unidades vendidas · COGS atual {eur(p.currentCogs ?? p.shopifyCogs, p.currency)} · original{" "}
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
                className="rounded-md bg-foreground px-3 py-1 text-sm text-background disabled:opacity-50"
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
              className="rounded-md bg-foreground px-3 py-1 text-sm text-background disabled:opacity-50"
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
        {error && <p className="text-sm text-negative">{error}</p>}
      </div>
    </div>
  );
}
