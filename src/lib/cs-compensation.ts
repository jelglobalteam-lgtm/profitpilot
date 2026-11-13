import type { CsStoreKey } from "@/lib/cs-types";

/** Compensações que a rotina pode executar no Shopify, depois de o Emanuel as confirmar na app. */
export const COMPENSATION_KINDS = ["reembolso_parcial", "credito", "cancelamento"] as const;
export type CompensationKind = (typeof COMPENSATION_KINDS)[number];

/** proposta: escrita pela rotina; confirmada: o Emanuel confirmou; em_execucao: a rotina reservou-a; executada; falhada. */
export const COMPENSATION_STATUSES = ["proposta", "confirmada", "em_execucao", "executada", "falhada"] as const;
export type CompensationStatus = (typeof COMPENSATION_STATUSES)[number];

/** Percentagens do funil: reembolso 10, 20 ou 30%; crédito 50, 75 ou 100%; cancelamento reembolsa 100%. */
const ALLOWED: Record<CompensationKind, number[]> = {
  reembolso_parcial: [10, 20, 30],
  credito: [50, 75, 100],
  cancelamento: [100],
};

export type CompensationView = {
  kind: CompensationKind;
  percent: number;
  /** Valor em euros calculado pela rotina a partir da encomenda; só serve para mostrar e confirmar. */
  amount: number;
  status: CompensationStatus;
  executedAt: string | null;
  transactionId: string;
  error: string;
};

export function compensationError(kind: string, percent: number, store: CsStoreKey): string | null {
  if (!(COMPENSATION_KINDS as readonly string[]).includes(kind)) return "Tipo de compensação inválido.";
  const k = kind as CompensationKind;
  if (!ALLOWED[k].includes(percent)) {
    return `Percentagem fora do funil: ${ALLOWED[k].join(", ")}%.`;
  }
  if (k === "credito" && store === "alma-vicentina") return "A Alma Vicentina não tem crédito de loja.";
  return null;
}

const eur = (n: number) => n.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });

/** Texto do aviso de confirmação mostrado ao Emanuel antes de aprovar. */
export function confirmationText(c: Pick<CompensationView, "kind" | "percent" | "amount">, orderNumber: string): string {
  if (c.kind === "cancelamento") {
    return `Tem a certeza que quer cancelar a encomenda ${orderNumber} e reembolsar ${eur(c.amount)} (100%) ao cliente?`;
  }
  const what = c.kind === "credito" ? "um crédito de loja" : "um reembolso parcial";
  return `Tem a certeza que quer emitir ${what} de ${c.percent}% (${eur(c.amount)}) na encomenda ${orderNumber}?`;
}
