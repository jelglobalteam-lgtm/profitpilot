export const INVOICE_KINDS = ["mia_imposto", "mia_recarga", "agencia_google"] as const;
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

export type InvoiceIssue = { invoiceId: string; level: "alto" | "medio"; message: string };

const eur = (n: number, c = "EUR") => `${n.toFixed(2)} ${c === "EUR" ? "€" : c}`;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Saldo pré-pago de impostos: recargas menos faturas de imposto, por ordem de data. */
export function prepaidBalance(invoices: InvoiceView[]): number {
  return round2(
    invoices.reduce((s, i) => s + (i.kind === "mia_recarga" ? i.amount : i.kind === "mia_imposto" ? -i.amount : 0), 0),
  );
}

export function checkInvoices(invoices: InvoiceView[], now = Date.now()): InvoiceIssue[] {
  const out: InvoiceIssue[] = [];
  const sorted = [...invoices].sort((a, b) => a.issueDate.localeCompare(b.issueDate));
  const seen = new Map<string, InvoiceView>();
  const mia = sorted.filter((i) => i.kind === "mia_imposto");
  let running = 0;
  let prevRate: number | null = null;
  for (const inv of sorted) {
    const dupKey = `${inv.kind}:${inv.number}`;
    if (seen.has(dupKey)) out.push({ invoiceId: inv.id, level: "alto", message: `A fatura ${inv.number} está registada duas vezes.` });
    seen.set(dupKey, inv);

    if (inv.kind === "mia_recarga") running += inv.amount;
    if (inv.kind === "mia_imposto") {
      running -= inv.amount;
      if (inv.quantity && inv.quantity > 0) {
        const rate = round2(inv.amount / inv.quantity);
        if (prevRate != null && rate > prevRate + 0.001) {
          out.push({ invoiceId: inv.id, level: "medio", message: `${inv.number}: ${eur(rate)} por encomenda, acima dos ${eur(prevRate)} da fatura anterior. Confirme se é a nova tarifa da UE.` });
        }
        prevRate = rate;
        if (inv.orderFrom != null && inv.orderTo != null) {
          const span = inv.orderTo - inv.orderFrom + 1;
          if (span !== inv.quantity) {
            out.push({ invoiceId: inv.id, level: "medio", message: `${inv.number}: o intervalo #${inv.orderFrom} a #${inv.orderTo} tem ${span} números e a fatura conta ${inv.quantity} encomendas. Confirme se ${Math.abs(span - inv.quantity)} foi cancelada ou reembolsada.` });
          }
        }
      }
      for (const other of mia) {
        if (other.id === inv.id || other.issueDate > inv.issueDate) continue;
        if (inv.orderFrom != null && inv.orderTo != null && other.orderFrom != null && other.orderTo != null && inv.orderFrom <= other.orderTo && other.orderFrom <= inv.orderTo) {
          out.push({ invoiceId: inv.id, level: "alto", message: `${inv.number}: o intervalo de encomendas sobrepõe-se ao da fatura ${other.number}. Pode haver encomendas cobradas duas vezes.` });
        }
      }
      if (inv.miaBalance != null && Math.abs(round2(running) - inv.miaBalance) > 0.05) {
        out.push({ invoiceId: inv.id, level: "alto", message: `${inv.number}: a Mia indica saldo de ${eur(inv.miaBalance)} e as nossas contas dão ${eur(round2(running))}.` });
      }
    }
    if (inv.kind === "agencia_google") {
      for (const l of inv.lines) {
        if (Math.abs(round2(l.spend * 0.1) - l.fee) > 0.011) {
          out.push({ invoiceId: inv.id, level: "alto", message: `${inv.number}, ${l.label}: 10% de ${eur(l.spend, inv.currency)} são ${eur(round2(l.spend * 0.1), inv.currency)} e a fatura cobra ${eur(l.fee, inv.currency)}.` });
        }
      }
      const feeSum = round2(inv.lines.reduce((s, l) => s + l.fee, 0));
      const spendSum = round2(inv.lines.reduce((s, l) => s + l.spend, 0));
      if (inv.lines.length && Math.abs(feeSum - inv.amount) > 0.011) {
        out.push({ invoiceId: inv.id, level: "alto", message: `${inv.number}: as comissões somam ${eur(feeSum, inv.currency)} e o total a pagar é ${eur(inv.amount, inv.currency)}.` });
      }
      if (inv.lines.length && Math.abs(round2(spendSum * 0.1) - inv.amount) > 0.02) {
        out.push({ invoiceId: inv.id, level: "medio", message: `${inv.number}: 10% do gasto total (${eur(spendSum, inv.currency)}) seriam ${eur(round2(spendSum * 0.1), inv.currency)}; o total a pagar é ${eur(inv.amount, inv.currency)}.` });
      }
      if (inv.appSpend != null && spendSum > 0 && Math.abs(inv.appSpend - spendSum) / spendSum > 0.03) {
        out.push({ invoiceId: inv.id, level: "medio", message: `${inv.number}: o gasto de Google Ads na app é ${eur(inv.appSpend, inv.currency)} e a agência fatura sobre ${eur(spendSum, inv.currency)}.` });
      }
    }
    if (!inv.paid && inv.dueDate && inv.kind !== "mia_recarga") {
      const days = Math.floor((now - new Date(inv.dueDate).getTime()) / 86_400_000);
      if (days >= 0 && inv.kind === "agencia_google") {
        out.push({ invoiceId: inv.id, level: "alto", message: `${inv.number} venceu há ${days} dia(s) e não está paga${inv.kind === "agencia_google" ? ": a agência pausa as campanhas Google se não for paga" : ""}.` });
      }
    }
  }
  if (running < 0 && mia.length) out.push({ invoiceId: mia[mia.length - 1].id, level: "alto", message: `O saldo pré-pago de impostos da Mia está negativo (${eur(round2(running))}). Falta uma recarga.` });
  return out;
}

/** Intervalos de importação: Mia de 5 em 5 dias, agência Google semanal. */
export const MIA_IMPORT_DAYS = 5;
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
