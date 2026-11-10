import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { AdCampaignDay } from "@/models/AdCampaignDay";
import { CsInvoice, type CsInvoiceDoc } from "@/models/CsInvoice";
import { CsMiaInvoiceNote } from "@/models/CsMiaInvoiceNote";
import { checkInvoices, missingInvoiceAlerts, type InvoiceIssue, type InvoiceKind, type InvoiceView } from "@/lib/cs-invoices";

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);
const key = (d: Date) => d.toISOString().slice(0, 10);

export async function loadInvoices(workspaceId: string) {
  await connectToDatabase();
  const wid = new mongoose.Types.ObjectId(workspaceId);
  const docs = await CsInvoice.find({ workspaceId: wid, deletedAt: null }).sort({ issueDate: -1 }).lean<CsInvoiceDoc[]>();
  const invoices: InvoiceView[] = [];
  const dismissed = new Map(docs.map((d) => [String(d._id), d.dismissed ?? []]));
  for (const d of docs) {
    let appSpend: number | null = null;
    if (d.kind === "agencia_google" && d.periodFrom && d.periodTo) {
      const r = await AdCampaignDay.aggregate<{ s: number; n: number }>([
        { $match: { workspaceId: wid, platform: "google", dateKey: { $gte: key(new Date(d.periodFrom)), $lte: key(new Date(d.periodTo)) } } },
        { $group: { _id: null, s: { $sum: "$spend" }, n: { $sum: 1 } } },
      ]);
      appSpend = r[0]?.n ? Math.round(r[0].s * 100) / 100 : null;
    }
    invoices.push({
      id: String(d._id),
      kind: d.kind as InvoiceKind,
      number: d.number,
      issueDate: new Date(d.issueDate).toISOString(),
      dueDate: iso(d.dueDate),
      currency: d.currency ?? "EUR",
      amount: d.amount,
      paid: !!d.paid,
      quantity: d.quantity ?? null,
      orderFrom: d.orderFrom ?? null,
      orderTo: d.orderTo ?? null,
      miaBalance: d.miaBalance ?? null,
      periodFrom: iso(d.periodFrom),
      periodTo: iso(d.periodTo),
      lines: (d.lines ?? []).map((l) => ({ label: l.label ?? "", spend: l.spend ?? 0, fee: l.fee ?? 0 })),
      notes: d.notes ?? "",
      appSpend,
    });
  }
  const notes = await CsMiaInvoiceNote.find({ workspaceId: wid }).lean<{ number: string; amount: number | null }[]>();
  const announced = notes
    .filter((n) => !invoices.some((i) => i.kind === "mia_imposto" && i.number.toUpperCase().startsWith(n.number.toUpperCase())))
    .map((n): InvoiceIssue => ({
      invoiceId: "",
      level: "alto",
      message: `A Mia enviou na conversa a fatura ${n.number}${n.amount != null ? ` (${n.amount} €)` : ""} e ainda não foi importada. Importe o PDF.`,
    }));
  const issues = [...announced, ...missingInvoiceAlerts(invoices), ...checkInvoices(invoices)].filter(
    (i) => !i.invoiceId || !(dismissed.get(i.invoiceId) ?? []).includes(i.message),
  );
  return { invoices, issues };
}
export type InvoiceData = Awaited<ReturnType<typeof loadInvoices>>;
