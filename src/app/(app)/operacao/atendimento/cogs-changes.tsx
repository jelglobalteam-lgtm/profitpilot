"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AttentionBang } from "@/components/attention-bang";
import type { CogsChangeView } from "@/lib/cs-cogs-data";
import { miaPriceIncreaseMessage } from "@/lib/cs-quotes";
import { reviewCogsChangeAction } from "./quote-actions";
import { useConfirmMiaSend } from "./mia-send-guard";

const eur = (n: number | null, cur = "EUR") =>
  n == null ? "—" : new Intl.NumberFormat("pt-PT", { style: "currency", currency: cur }).format(n);
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon" }) : "—";

/** Tabela das alterações de COGS: último COGS registado (e desde quando) contra o preço visto agora. */
export function CogsChanges({ rows, canEdit }: { rows: CogsChangeView[]; canEdit: boolean }) {
  const router = useRouter();
  const confirmSend = useConfirmMiaSend();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (rows.length === 0) return null;

  function copyAndAsk(r: CogsChangeView) {
    start(async () => {
      try {
        await navigator.clipboard.writeText(
          miaPriceIncreaseMessage({ title: r.title, link: r.link, from: r.from, to: r.to, at: r.changedAt, currency: r.currency }),
        );
        setMsg("Mensagem à Mia copiada. Envie-a e depois confirme em \"Já perguntei\".");
      } catch {
        setMsg("Não foi possível copiar a mensagem.");
      }
    });
  }
  function review(r: CogsChangeView, status: "perguntado" | "aceite") {
    start(async () => {
      await reviewCogsChangeAction({ productId: r.productId, status, price: r.to });
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Alterações de preço pago (COGS)</h3>
        {rows.some((r) => r.alert) && <AttentionBang title="Há aumentos por esclarecer" />}
      </div>
      <p className="text-xs text-muted-foreground">
        Compara o último COGS registado com o preço visto no PrimeFlow ou nas faturas, em todos os produtos com vendas,
        mesmo com poucas unidades. Um aumento fica em alerta até perguntar à Mia ou aceitar o preço novo.
      </p>
      {msg && <p className="text-xs">{msg}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-[13px] text-muted-foreground">
            <tr>
              <th className="p-2">Produto</th>
              <th className="p-2">Loja</th>
              <th className="p-2">Unid.</th>
              <th className="p-2">COGS antes</th>
              <th className="p-2">COGS agora</th>
              <th className="p-2">Diferença</th>
              <th className="p-2">Estado</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const delta = r.to - r.from;
              return (
                <tr key={r.productId} className="border-t border-border align-top">
                  <td className="p-2 font-medium">
                    <span className="inline-flex items-center gap-2">
                      {r.alert && <AttentionBang title="Aumento por esclarecer" />}
                      {r.title}
                    </span>
                  </td>
                  <td className="p-2">{r.storeName}</td>
                  <td className="p-2 tabular-nums">{r.units}</td>
                  <td className="p-2 tabular-nums">{eur(r.from, r.currency)}</td>
                  <td className="p-2 tabular-nums">
                    {eur(r.to, r.currency)}
                    <div className="text-xs text-muted-foreground">desde {day(r.changedAt)}</div>
                  </td>
                  <td className={`p-2 tabular-nums ${r.increase ? "font-semibold text-negative" : "text-positive"}`}>
                    {delta > 0 ? "+" : ""}
                    {eur(delta, r.currency)}
                  </td>
                  <td className="p-2 text-xs">
                    {r.review ? (r.review.status === "aceite" ? "Aceite" : `Perguntado à Mia a ${day(r.review.at)}`) : r.increase ? "Aumento por esclarecer" : "Baixou"}
                  </td>
                  <td className="p-2">
                    {canEdit && r.increase && !r.review && (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={pending} onClick={() => confirmSend(() => copyAndAsk(r))} className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-foreground disabled:opacity-50">
                          Copiar mensagem à Mia
                        </button>
                        <button type="button" disabled={pending} onClick={() => review(r, "perguntado")} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50">
                          Já perguntei
                        </button>
                        <button type="button" disabled={pending} onClick={() => review(r, "aceite")} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50">
                          Aceitar preço
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
