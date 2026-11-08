"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AttentionBang } from "@/components/attention-bang";
import type { InvoiceFinding } from "@/lib/cs-invoice-check";
import {
  INVOICE_KIND_LABEL,
  prepaidBalance,
  type InvoiceKind,
} from "@/lib/cs-invoices";
import type { InvoiceData } from "@/lib/cs-invoice-data";
import { addCsInvoiceAction, checkMiaInvoiceAction, dismissCsInvoiceIssueAction, setCsInvoicePaidAction } from "./invoice-actions";

function LineChecker({ canEdit }: { canEdit: boolean }) {
  const [fee, setFee] = useState("5");
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ lines?: number; findings?: InvoiceFinding[]; message?: string; error?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Quando a Mia enviar a lista por encomenda (Settlement List), cole as linhas no formato encomenda;valor
        (opcionalmente ;produto;preço unitário). Confere duplicados, valores acima da tarifa, encomendas canceladas ou
        inexistentes e preços diferentes da última cotação.
      </p>
      <label className="flex items-center gap-2 text-sm">
        Imposto por encomenda (€)
        <input className="w-20 rounded-md border border-border bg-background px-2 py-1" value={fee} onChange={(e) => setFee(e.target.value)} />
      </label>
      <textarea
        rows={8}
        className="w-full rounded-md border border-border bg-background p-2 font-mono text-sm"
        placeholder={"1001;3\n1002;3\n1002;3"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {canEdit && (
        <button
          type="button"
          disabled={pending || !text.trim()}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
          onClick={() => start(async () => setResult(await checkMiaInvoiceAction(text, Number(fee.replace(",", ".")))))}
        >
          {pending ? "A conferir..." : "Conferir fatura"}
        </button>
      )}
      {result?.error && <p className="text-sm text-negative">{result.error}</p>}
      {result?.findings && (
        <div className="space-y-2">
          <p className="text-sm">
            {result.lines} linhas conferidas,{" "}
            {result.findings.length === 0 ? "sem divergências." : `${result.findings.length} divergências.`}
          </p>
          {result.findings.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-border bg-surface p-3 text-sm">
              {result.findings.map((f, i) => (
                <li key={i}>{f.message}</li>
              ))}
            </ul>
          )}
          {result.message && (
            <div className="space-y-2">
              <textarea readOnly rows={6} className="w-full rounded-md border border-border bg-background p-2 text-sm" value={result.message} />
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1 text-sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(result.message ?? "");
                  setCopied(true);
                }}
              >
                {copied ? "Copiado" : "Copiar mensagem à Mia"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon" }) : "—";
const money = (n: number, c: string) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: c }).format(n);

export function InvoicesTab({ data, canEdit }: { data: InvoiceData; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<InvoiceKind>("mia_imposto");
  const [f, setF] = useState<Record<string, string>>({});
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }));
  const balance = prepaidBalance(data.invoices);

  function parseLines(text: string) {
    return text
      .split(/\r?\n/)
      .map((l) => l.split(";").map((v) => v.trim()))
      .filter((c) => c.length >= 3 && num(c[1]) != null && num(c[2]) != null)
      .map((c) => ({ label: c[0], spend: num(c[1]) ?? 0, fee: num(c[2]) ?? 0 }));
  }

  function save() {
    setError(null);
    const amount = num(f.amount ?? "");
    if (!f.number || !f.issueDate || amount == null) return setError("Preencha número, data e valor.");
    start(async () => {
      const r = await addCsInvoiceAction({
        kind,
        number: f.number,
        issueDate: f.issueDate,
        dueDate: f.dueDate || null,
        currency: kind === "agencia_google" ? (f.currency || "USD") : "EUR",
        amount,
        quantity: num(f.quantity ?? "") as number | null,
        orderFrom: num(f.orderFrom ?? "") as number | null,
        orderTo: num(f.orderTo ?? "") as number | null,
        miaBalance: num(f.miaBalance ?? ""),
        periodFrom: f.periodFrom || null,
        periodTo: f.periodTo || null,
        lines: kind === "agencia_google" ? parseLines(f.lines ?? "") : [],
        paid: kind === "mia_recarga",
      });
      if (r.error) setError(r.error);
      else {
        setF({});
        router.refresh();
      }
    });
  }

  const input = "w-full rounded-md border border-border bg-background px-2 py-1 text-sm";
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        As faturas da Mia são de imposto aduaneiro da UE, pagas a partir de um saldo pré-pago que o Emanuel recarrega. A
        agência cobra 10% do gasto em Google Ads. Registe cada fatura e a app confere os valores, o saldo e os prazos.
      </p>
      <div className="rounded-lg border border-border bg-surface p-3 text-sm">
        Saldo pré-pago de impostos da Mia segundo a app:{" "}
        <span className={balance < 0 ? "font-semibold text-negative" : "font-semibold"}>{money(balance, "EUR")}</span>
      </div>

      {data.issues.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-border bg-surface p-3 text-sm">
          {data.issues.map((i, n) => (
            <li key={n} className={`flex items-start gap-2 ${i.level === "alto" ? "text-negative" : ""}`}><AttentionBang title="Aviso a ver" />
              <span className="flex-1">{i.message}</span>
              {canEdit && i.invoiceId && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => start(async () => { await dismissCsInvoiceIssueAction({ id: i.invoiceId, message: i.message }); router.refresh(); })}
                  className="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs text-foreground hover:bg-muted disabled:opacity-50"
                >
                  Já vi, remover aviso
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {data.invoices.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="text-[13px] text-muted-foreground">
              <tr>
                <th className="p-3">Fatura</th>
                <th className="p-3">Tipo</th>
                <th className="p-3">Data</th>
                <th className="p-3">Vencimento</th>
                <th className="p-3">Valor</th>
                <th className="p-3">Detalhe</th>
                <th className="p-3">Paga</th>
              </tr>
            </thead>
            <tbody>
              {data.invoices.map((i) => (
                <tr key={i.id} className="border-t border-border align-top">
                  <td className="p-3 font-medium">
                    <span className="inline-flex items-center gap-2">
                      {data.issues.some((x) => x.invoiceId === i.id) && <AttentionBang title="Esta fatura tem um aviso" />}
                      {i.number}
                    </span>
                  </td>
                  <td className="p-3">{INVOICE_KIND_LABEL[i.kind]}</td>
                  <td className="p-3">{day(i.issueDate)}</td>
                  <td className="p-3">{day(i.dueDate)}</td>
                  <td className="p-3 tabular-nums">{money(i.amount, i.currency)}</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {i.kind === "mia_imposto" && i.quantity ? `${i.quantity} encomendas (${money(i.amount / i.quantity, i.currency)} cada)` : ""}
                    {i.kind === "agencia_google" && i.appSpend != null ? `Gasto na app: ${money(i.appSpend, i.currency)}` : ""}
                  </td>
                  <td className="p-3">
                    {i.kind === "mia_recarga" ? "—" : (
                      <input
                        type="checkbox"
                        checked={i.paid}
                        disabled={!canEdit || pending}
                        onChange={(e) => start(async () => { await setCsInvoicePaidAction({ id: i.id, paid: e.target.checked }); router.refresh(); })}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
          <p className="text-sm font-medium">Registar fatura</p>
          <select className={input} value={kind} onChange={(e) => { setKind(e.target.value as InvoiceKind); setF({}); }}>
            {(Object.keys(INVOICE_KIND_LABEL) as InvoiceKind[]).map((k) => (
              <option key={k} value={k}>{INVOICE_KIND_LABEL[k]}</option>
            ))}
          </select>
          <div className="grid gap-2 sm:grid-cols-2">
            <input className={input} placeholder={kind === "mia_recarga" ? "Referência" : "Número da fatura"} value={f.number ?? ""} onChange={set("number")} />
            <input className={input} type="date" title="Data" value={f.issueDate ?? ""} onChange={set("issueDate")} />
            <input className={input} placeholder="Valor" value={f.amount ?? ""} onChange={set("amount")} />
            {kind === "agencia_google" && (
              <>
                <input className={input} type="date" title="Vencimento" value={f.dueDate ?? ""} onChange={set("dueDate")} />
                <input className={input} placeholder="Moeda (USD)" value={f.currency ?? ""} onChange={set("currency")} />
                <input className={input} type="date" title="Período de" value={f.periodFrom ?? ""} onChange={set("periodFrom")} />
                <input className={input} type="date" title="Período até" value={f.periodTo ?? ""} onChange={set("periodTo")} />
              </>
            )}
            {kind === "mia_imposto" && (
              <>
                <input className={input} placeholder="N.º de encomendas" value={f.quantity ?? ""} onChange={set("quantity")} />
                <input className={input} placeholder="Encomenda inicial (ex. 1058)" value={f.orderFrom ?? ""} onChange={set("orderFrom")} />
                <input className={input} placeholder="Encomenda final (ex. 1079)" value={f.orderTo ?? ""} onChange={set("orderTo")} />
                <input className={input} placeholder="Saldo que a Mia indica (All left)" value={f.miaBalance ?? ""} onChange={set("miaBalance")} />
              </>
            )}
          </div>
          {kind === "agencia_google" && (
            <textarea
              rows={4}
              className={input}
              placeholder={"Linhas: descrição;gasto;comissão\nOct 8 a 14;104.26;10.43"}
              value={f.lines ?? ""}
              onChange={set("lines")}
            />
          )}
          <button type="button" disabled={pending} onClick={save} className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-50">
            Guardar fatura
          </button>
          {error && <p className="text-sm text-negative">{error}</p>}
        </div>
      )}

      <details>
        <summary className="cursor-pointer text-sm font-medium">Conferir lista por encomenda (Settlement List)</summary>
        <div className="mt-3">
          <LineChecker canEdit={canEdit} />
        </div>
      </details>
    </div>
  );
}
