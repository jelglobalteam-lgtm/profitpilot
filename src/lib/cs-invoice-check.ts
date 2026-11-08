/** Imposto UE por encomenda desde 1/11/2026 (era 3 € antes; confirmar no resumo da fatura). */
export const MIA_FULFILMENT_FEE = 5;

export type InvoiceLine = { orderNumber: string; amount: number; product: string; unitPrice: number | null };

export type InvoiceContext = {
  /** Encomendas existentes na Shopify, por número (sem #). */
  orders: Map<string, { cancelled: boolean; refunded: boolean }>;
  /** COGS atual acordado por título de produto (minúsculas). */
  quotedCogs: Map<string, number>;
};

export type InvoiceFinding = {
  kind: "duplicado" | "valor_acima" | "encomenda_inexistente" | "cancelada" | "preco_diferente";
  orderNumber: string;
  message: string;
};

const num = (s: string) => {
  const n = Number(s.replace(/[€\s]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Texto colado: uma linha por item, "encomenda;valor[;produto;preço unitário]" (separador ; , ou tab). */
export function parseInvoiceText(text: string): { lines: InvoiceLine[]; errors: string[] } {
  const lines: InvoiceLine[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim()) return;
    const c = raw.split(/[;\t]|,(?=\s*[\d€])/).map((v) => v.trim());
    const order = c[0]?.replace(/^#/, "");
    const amount = num(c[1] ?? "");
    if (!order || amount == null) {
      if (i > 0) errors.push(`Linha ${i + 1} ignorada.`);
      return;
    }
    lines.push({ orderNumber: order, amount, product: c[2] ?? "", unitPrice: c[3] ? num(c[3]) : null });
  });
  return { lines, errors };
}

export function checkInvoice(lines: InvoiceLine[], ctx: InvoiceContext, fee = MIA_FULFILMENT_FEE): InvoiceFinding[] {
  const out: InvoiceFinding[] = [];
  const byOrder = new Map<string, InvoiceLine[]>();
  for (const l of lines) byOrder.set(l.orderNumber, [...(byOrder.get(l.orderNumber) ?? []), l]);
  for (const [order, ls] of byOrder) {
    const fulfilment = ls.filter((l) => !l.product);
    const total = fulfilment.reduce((s, l) => s + l.amount, 0);
    if (fulfilment.length > 1) {
      out.push({ kind: "duplicado", orderNumber: order, message: `A encomenda #${order} aparece ${fulfilment.length} vezes (${total.toFixed(2)} €) e devia ter ${fee} €.` });
    } else if (total > fee + 0.001) {
      out.push({ kind: "valor_acima", orderNumber: order, message: `A encomenda #${order} está com ${total.toFixed(2)} € e devia ter ${fee} €.` });
    }
    const o = ctx.orders.get(order);
    if (!o) out.push({ kind: "encomenda_inexistente", orderNumber: order, message: `A encomenda #${order} não existe na Shopify.` });
    else if (o.cancelled || o.refunded) out.push({ kind: "cancelada", orderNumber: order, message: `A encomenda #${order} foi cancelada ou reembolsada: confirme se a Mia já a creditou.` });
    for (const l of ls) {
      if (!l.product || l.unitPrice == null) continue;
      const quoted = ctx.quotedCogs.get(l.product.toLowerCase());
      if (quoted != null && Math.abs(quoted - l.unitPrice) > 0.005) {
        out.push({ kind: "preco_diferente", orderNumber: order, message: `${l.product}: a fatura traz ${l.unitPrice.toFixed(2)} € e a última cotação é ${quoted.toFixed(2)} €.` });
      }
    }
  }
  return out;
}

/** Mensagem à Mia só com os erros que lhe cabe corrigir (duplicados e valores acima). */
export function miaInvoiceMessage(findings: InvoiceFinding[]): string {
  const items = findings.filter((f) => f.kind === "duplicado" || f.kind === "valor_acima" || f.kind === "preco_diferente");
  if (items.length === 0) return "";
  return `Hi Mia, while checking the latest invoice I found the following:\n${items.map((f) => `Order #${f.orderNumber}: ${f.message}`).join("\n")}\nCould you please review and send a corrected invoice? Thank you.`;
}
