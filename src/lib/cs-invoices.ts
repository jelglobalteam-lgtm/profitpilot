import { euCustomsFeePerOrderEurForDay } from "@/lib/eu-category-fees-types";
export const INVOICE_KINDS = ["mia_imposto", "mia_recarga", "agencia_google"] as const;
/** Identificador da loja RivaSylt IT nas faturas da Mia ("Store Name" no PDF). */
export const RIVASYLT_IT_STORE_ID = "7ff85d-50";
/** As faturas da Mia desta loja contam a partir de 19/09/2026; as anteriores não se aplicam. */
export const MIA_INVOICES_FROM = "20260919";
/** Número de fatura (WWLLYaaaammdd...) dentro do período que conta. */
export function isInvoiceInScope(number: string): boolean {
  const m = /^WWLLY(\d{8})/i.exec(number);
  return !m || m[1] >= MIA_INVOICES_FROM;
}

/** Recarga que é na verdade o saldo que a Mia indica numa data: já inclui as faturas anteriores. */
export const isOpeningBalance = (i: { kind: string; number: string }) => i.kind === "mia_recarga" && /^saldo anterior/i.test(i.number);

export type InvoiceKind = (typeof INVOICE_KINDS)[number];

export const INVOICE_KIND_LABEL: Record<InvoiceKind, string> = {
  mia_imposto: "Mia, imposto UE",
  mia_recarga: "Mia, recarga de saldo",
  agencia_google: "Agência Google (10%)",
};

export type AgencyLine = { label: string; spend: number; fee: number };

export type InvoiceView = {
  id: string;
  kind: InvoiceKind;
  number: string;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  amount: number;
  paid: boolean;
  quantity: number | null;
  orderFrom: number | null;
  orderTo: number | null;
  miaBalance: number | null;
  periodFrom: string | null;
  periodTo: string | null;
  lines: AgencyLine[];
  notes: string;
  /** Gasto Google Ads da app no período da fatura (só agência). */
  appSpend: number | null;
};

/** `ask`: mensagem (em inglês) para o fornecedor; o aviso só sai depois de o Emanuel a enviar. */
export type InvoiceIssue = { invoiceId: string; level: "alto" | "medio"; message: string; to?: "Mia" | "agência"; ask?: string };

const eur = (n: number, c = "EUR") => `${n.toFixed(2)} ${c === "EUR" ? "€" : c}`;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Saldo pré-pago de impostos: recargas menos faturas de imposto, por ordem de data. */
export function prepaidBalance(invoices: InvoiceView[]): number {
  const sorted = [...invoices].sort((a, b) => a.issueDate.localeCompare(b.issueDate));
  let run = 0;
  for (const i of sorted) {
    if (isOpeningBalance(i)) run = i.amount;
    else if (i.kind === "mia_recarga") run += i.amount;
    else if (i.kind === "mia_imposto") run -= i.amount;
  }
  return round2(run);
}

export function checkInvoices(invoices: InvoiceView[], now = Date.now()): InvoiceIssue[] {
  const out: InvoiceIssue[] = [];
  const sorted = [...invoices].sort((a, b) => a.issueDate.localeCompare(b.issueDate));
  const seen = new Map<string, InvoiceView>();
  const mia = sorted.filter((i) => i.kind === "mia_imposto");
  let running = 0;
  // Só se avisa de diferenças contra o Emanuel. Quando há mensagem para o fornecedor, o aviso só sai depois de a enviar.
  const ask = (invoiceId: string, level: "alto" | "medio", message: string, to: "Mia" | "agência", text: string) =>
    out.push({ invoiceId, level, message, to, ask: text });
  for (const inv of sorted) {
    const dupKey = `${inv.kind}:${inv.number}`;
    if (seen.has(dupKey)) out.push({ invoiceId: inv.id, level: "alto", message: `A fatura ${inv.number} está registada duas vezes.` });
    seen.set(dupKey, inv);

    if (isOpeningBalance(inv)) running = inv.amount;
    else if (inv.kind === "mia_recarga") running += inv.amount;
    if (inv.kind === "mia_imposto") {
      running -= inv.amount;
      if (inv.quantity && inv.quantity > 0) {
        const rate = round2(inv.amount / inv.quantity);
        const expected = euCustomsFeePerOrderEurForDay(inv.issueDate.slice(0, 10));
        if (rate > expected + 0.001) {
          ask(inv.id, "alto", `${inv.number}: ${eur(rate)} por encomenda, acima da tarifa de ${eur(expected)}.`, "Mia",
            `Hi Mia, invoice ${inv.number} charges ${rate.toFixed(2)} EUR per order, but we expected ${expected.toFixed(2)} EUR. Could you please confirm the rate applied and send the settlement list?`);
        }
        if (inv.orderFrom != null && inv.orderTo != null) {
          const span = inv.orderTo - inv.orderFrom + 1;
          if (span < inv.quantity) {
            ask(inv.id, "alto", `${inv.number}: a fatura cobra ${inv.quantity} encomendas e o intervalo #${inv.orderFrom} a #${inv.orderTo} só tem ${span} números.`, "Mia",
              `Hi Mia, invoice ${inv.number} charges ${inv.quantity} orders but the range #${inv.orderFrom} to #${inv.orderTo} only has ${span}. Could you please send the settlement list so we can check?`);
          }
        }
      }
      for (const other of mia) {
        if (other.id === inv.id || other.issueDate > inv.issueDate) continue;
        if (inv.orderFrom != null && inv.orderTo != null && other.orderFrom != null && other.orderTo != null && inv.orderFrom <= other.orderTo && other.orderFrom <= inv.orderTo) {
          ask(inv.id, "alto", `${inv.number}: o intervalo de encomendas sobrepõe-se ao da fatura ${other.number}. Pode haver encomendas cobradas duas vezes.`, "Mia",
            `Hi Mia, the order range of invoice ${inv.number} (#${inv.orderFrom} to #${inv.orderTo}) overlaps with invoice ${other.number} (#${other.orderFrom} to #${other.orderTo}). Some orders may have been charged twice. Could you please check?`);
        }
      }
      if (inv.miaBalance != null && round2(inv.miaBalance) < round2(running) - 0.05) {
        ask(inv.id, "alto", `${inv.number}: a Mia indica saldo de ${eur(inv.miaBalance)} e as nossas contas dão ${eur(round2(running))}.`, "Mia",
          `Hi Mia, after invoice ${inv.number} you show a balance of ${inv.miaBalance.toFixed(2)} EUR, but our records show ${round2(running).toFixed(2)} EUR. Could you please send the balance statement so we can reconcile?`);
      }
    }
    if (inv.kind === "agencia_google") {
      for (const l of inv.lines) {
        if (l.fee > round2(l.spend * 0.1) + 0.011) {
          ask(inv.id, "alto", `${inv.number}, ${l.label}: 10% de ${eur(l.spend, inv.currency)} são ${eur(round2(l.spend * 0.1), inv.currency)} e a fatura cobra ${eur(l.fee, inv.currency)}.`, "agência",
            `Hi, on invoice ${inv.number} the line "${l.label}" charges ${l.fee.toFixed(2)} ${inv.currency}, but 10% of ${l.spend.toFixed(2)} ${inv.currency} is ${round2(l.spend * 0.1).toFixed(2)} ${inv.currency}. Could you please review it?`);
        }
      }
      const feeSum = round2(inv.lines.reduce((s, l) => s + l.fee, 0));
      const spendSum = round2(inv.lines.reduce((s, l) => s + l.spend, 0));
      if (inv.lines.length && inv.amount > feeSum + 0.011) {
        ask(inv.id, "alto", `${inv.number}: as comissões somam ${eur(feeSum, inv.currency)} e o total a pagar é ${eur(inv.amount, inv.currency)}.`, "agência",
          `Hi, invoice ${inv.number} lists fees of ${feeSum.toFixed(2)} ${inv.currency} but the total to pay is ${inv.amount.toFixed(2)} ${inv.currency}. Could you please review it?`);
      }
      if (inv.lines.length && inv.amount > round2(spendSum * 0.1) + 0.02) {
        ask(inv.id, "medio", `${inv.number}: 10% do gasto total (${eur(spendSum, inv.currency)}) seriam ${eur(round2(spendSum * 0.1), inv.currency)}; o total a pagar é ${eur(inv.amount, inv.currency)}.`, "agência",
          `Hi, 10% of the total ad spend on invoice ${inv.number} (${spendSum.toFixed(2)} ${inv.currency}) is ${round2(spendSum * 0.1).toFixed(2)} ${inv.currency}, but the total to pay is ${inv.amount.toFixed(2)} ${inv.currency}. Could you please review it?`);
      }
      if (inv.appSpend != null && spendSum > 0 && spendSum > inv.appSpend && (spendSum - inv.appSpend) / spendSum > 0.03) {
        ask(inv.id, "medio", `${inv.number}: o gasto de Google Ads na app é ${eur(inv.appSpend, inv.currency)} e a agência fatura sobre ${eur(spendSum, inv.currency)}.`, "agência",
          `Hi, invoice ${inv.number} bills 10% on an ad spend of ${spendSum.toFixed(2)} ${inv.currency}, but our Google Ads account shows ${inv.appSpend.toFixed(2)} ${inv.currency} for the same period. Could you please confirm the figures?`);
      }
    }
    if (!inv.paid && inv.dueDate && inv.kind !== "mia_recarga") {
      const days = Math.floor((now - new Date(inv.dueDate).getTime()) / 86_400_000);
      if (days >= 0 && inv.kind === "agencia_google") {
        out.push({ invoiceId: inv.id, level: "alto", message: `${inv.number} venceu há ${days} dia(s) e não está paga: a agência pausa as campanhas Google se não for paga.` });
      }
    }
  }
  // Lacunas: encomendas entre intervalos de faturas da Mia que não estão cobertas por nenhuma fatura importada.
  const ranged = mia
    .filter((i) => i.orderFrom != null && i.orderTo != null)
    .sort((a, b) => (a.orderFrom as number) - (b.orderFrom as number));
  let reach: InvoiceView | null = null;
  for (const inv of ranged) {
    if (reach && (inv.orderFrom as number) > (reach.orderTo as number) + 1) {
      const from = (reach.orderTo as number) + 1;
      const to = (inv.orderFrom as number) - 1;
      out.push({
        invoiceId: inv.id,
        level: "alto",
        message: `Faltam faturas da Mia das encomendas #${from}${to > from ? ` a #${to}` : ""}, entre ${reach.number} e ${inv.number}. Importe as faturas em falta.`,
      });
    }
    if (!reach || (inv.orderTo as number) > (reach.orderTo as number)) reach = inv;
  }
  if (running < 0 && mia.length) out.push({ invoiceId: mia[mia.length - 1].id, level: "alto", message: `O saldo pré-pago de impostos da Mia está negativo (${eur(round2(running))}). Falta uma recarga.` });
  return out;
}

/** Intervalos de importação: Mia de 3 em 3 dias, agência Google semanal. */
export const MIA_IMPORT_DAYS = 3;
export const GOOGLE_IMPORT_DAYS = 7;

/** Avisos de faturas por importar, a partir da data da última fatura registada de cada tipo. */
export function missingInvoiceAlerts(invoices: InvoiceView[], now = Date.now()): InvoiceIssue[] {
  const out: InvoiceIssue[] = [];
  const check = (kind: InvoiceKind, days: number, label: string) => {
    const dates = invoices.filter((i) => i.kind === kind).map((i) => new Date(i.issueDate).getTime());
    const last = dates.length ? Math.max(...dates) : null;
    const age = last == null ? null : Math.floor((now - last) / 86_400_000);
    if (age == null) out.push({ invoiceId: "", level: "alto", message: `Ainda não importou nenhuma ${label}.` });
    else if (age >= days) out.push({ invoiceId: "", level: "alto", message: `Falta importar ${label}: a última registada é de há ${age} dias (importe de ${days} em ${days} dias).` });
  };
  check("mia_imposto", MIA_IMPORT_DAYS, "fatura de imposto da Mia");
  check("agencia_google", GOOGLE_IMPORT_DAYS, "fatura da agência Google");
  return out;
}
