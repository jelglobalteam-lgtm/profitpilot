"use server";

import { redirect } from "next/navigation";
import mongoose from "mongoose";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { roleRank } from "@/lib/rbac";
import { Order } from "@/models/Order";
import { CsQuote } from "@/models/CsQuote";
import {
  checkInvoice,
  miaInvoiceMessage,
  parseInvoiceText,
  type InvoiceFinding,
} from "@/lib/cs-invoice-check";

type Result = { error?: string; lines?: number; findings?: InvoiceFinding[]; message?: string; warnings?: string[] };

/** Confere uma fatura da Mia (colada pelo Emanuel) com as encomendas da Shopify e a última cotação. Não grava nada. */
export async function checkMiaInvoiceAction(text: string, fee = 5): Promise<Result> {
  const user = await getCurrentUser();
  if (!user?.workspaceId) redirect("/login");
  if (roleRank(user.role) < roleRank("editor")) return { error: "Sem permissão." };
  if (typeof text !== "string" || text.length > 500_000) return { error: "Texto inválido." };
  const { lines, errors } = parseInvoiceText(text);
  if (lines.length === 0) return { error: "Não encontrei linhas válidas. Use: encomenda;valor por linha." };
  await connectToDatabase();
  const wid = new mongoose.Types.ObjectId(user.workspaceId);
  const names = [...new Set(lines.map((l) => l.orderNumber))].flatMap((n) => [n, `#${n}`]);
  const [orders, quotes] = await Promise.all([
    Order.find({ workspaceId: wid, name: { $in: names } })
      .select("name cancelledAt refunded totalPrice")
      .lean<{ name: string; cancelledAt: Date | null; refunded: number; totalPrice: number }[]>(),
    CsQuote.find({ workspaceId: wid, deletedAt: null, currentCogs: { $ne: null } })
      .select("title currentCogs")
      .lean<{ title: string; currentCogs: number }[]>(),
  ]);
  const ctx = {
    orders: new Map(
      orders.map((o) => [
        o.name.replace(/^#/, ""),
        { cancelled: !!o.cancelledAt, refunded: o.totalPrice > 0 && o.refunded >= o.totalPrice },
      ]),
    ),
    quotedCogs: new Map(quotes.map((q) => [q.title.toLowerCase(), q.currentCogs])),
  };
  const findings = checkInvoice(lines, ctx, Number.isFinite(fee) && fee > 0 ? fee : 5);
  return { lines: lines.length, findings, message: miaInvoiceMessage(findings), warnings: errors.slice(0, 5) };
}

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CsInvoice } from "@/models/CsInvoice";
import { CsInvoiceUpload } from "@/models/CsInvoiceUpload";
import { INVOICE_KINDS } from "@/lib/cs-invoices";

const invoiceSchema = z.object({
  kind: z.enum(INVOICE_KINDS),
  number: z.string().min(1).max(80),
  issueDate: z.string().min(8),
  dueDate: z.string().nullable().optional(),
  currency: z.string().max(5).default("EUR"),
  amount: z.number(),
  paid: z.boolean().default(false),
  quantity: z.number().int().nullable().optional(),
  orderFrom: z.number().int().nullable().optional(),
  orderTo: z.number().int().nullable().optional(),
  miaBalance: z.number().nullable().optional(),
  periodFrom: z.string().nullable().optional(),
  periodTo: z.string().nullable().optional(),
  lines: z.array(z.object({ label: z.string().max(200), spend: z.number(), fee: z.number() })).max(60).default([]),
  notes: z.string().max(2000).default(""),
});

async function editorUser() {
  const user = await getCurrentUser();
  if (!user?.workspaceId) redirect("/login");
  if (roleRank(user.role) < roleRank("editor")) return { user: null as never, error: "Sem permissão." };
  return { user, error: null };
}

/** Regista uma fatura (Mia ou agência) para conferência. */
export async function addCsInvoiceAction(input: z.input<typeof invoiceSchema>): Promise<{ ok?: boolean; error?: string }> {
  const { user, error } = await editorUser();
  if (error) return { error };
  const p = invoiceSchema.safeParse(input);
  if (!p.success) return { error: "Dados inválidos." };
  const d = p.data;
  const date = (s?: string | null) => (s ? new Date(s) : null);
  await connectToDatabase();
  await CsInvoice.create({
    workspaceId: new mongoose.Types.ObjectId(user.workspaceId),
    ...d,
    issueDate: new Date(d.issueDate),
    dueDate: date(d.dueDate),
    periodFrom: date(d.periodFrom),
    periodTo: date(d.periodTo),
  });
  revalidatePath("/operacao/atendimento");
  return { ok: true };
}

export async function setCsInvoicePaidAction(input: { id: string; paid: boolean }): Promise<{ ok?: boolean; error?: string }> {
  const { user, error } = await editorUser();
  if (error) return { error };
  if (!mongoose.isValidObjectId(input.id)) return { error: "Dados inválidos." };
  await connectToDatabase();
  await CsInvoice.updateOne(
    { _id: input.id, workspaceId: new mongoose.Types.ObjectId(user.workspaceId) },
    { $set: { paid: !!input.paid } },
  );
  revalidatePath("/operacao/atendimento");
  return { ok: true };
}

/** Dispensa um aviso de uma fatura que o Emanuel já viu (não volta a aparecer nem a contar no aviso global). */
export async function dismissCsInvoiceIssueAction(input: { id: string; message: string }): Promise<{ ok?: boolean; error?: string }> {
  const { user, error } = await editorUser();
  if (error) return { error };
  if (!mongoose.isValidObjectId(input.id) || typeof input.message !== "string" || !input.message || input.message.length > 1000) {
    return { error: "Dados inválidos." };
  }
  await connectToDatabase();
  await CsInvoice.updateOne(
    { _id: input.id, workspaceId: new mongoose.Types.ObjectId(user.workspaceId) },
    { $addToSet: { dismissed: input.message } },
  );
  revalidatePath("/operacao/atendimento");
  return { ok: true };
}

/** Lê o PDF (ou zip) de uma fatura de imposto da Mia, regista-a e marca o ficheiro como lido. Sem preenchimentos manuais. */
export async function importInvoicePdfAction(formData: FormData): Promise<{ saved?: string; info?: string; error?: string }> {
  const { user, error } = await editorUser();
  if (error) return { error };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 5_000_000) return { error: "Ficheiro inválido." };
  let text = "";
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    let bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      const { unzipSync } = await import("fflate");
      const entries = unzipSync(bytes);
      const name = Object.keys(entries).find((n) => n.toLowerCase().endsWith(".pdf"));
      if (!name) return { error: "O zip não tem nenhum PDF." };
      bytes = entries[name];
    }
    const pdf = await getDocumentProxy(bytes);
    text = (await extractText(pdf, { mergePages: true })).text;
  } catch {
    return { error: "Não consegui ler o ficheiro." };
  }
  if (!text.trim()) return { error: "O ficheiro não tem texto legível." };
  await connectToDatabase();
  const wid = new mongoose.Types.ObjectId(user.workspaceId);
  const flat = text.replace(/\s+/g, " ");
  const number = flat.match(/Invoice No\s+(WWLLY\d{8}[A-Z]\d{1,3})\s*(-TPB)?/i);
  const date = flat.match(/Invoice Date\s+(\d{4}-\d{2}-\d{2})/i);
  const range = flat.match(/Orders range\s+#?(\d{4})(?:-[A-Z])?\s*-\s*#?(\d{4})/i);
  const qty = flat.match(/Orders quantity\s+(\d{1,4})/i);
  const amount = flat.match(/EU Customs Duty\s*€\s*(\d+(?:[.,]\d{1,2})?)/i);
  const upload = await CsInvoiceUpload.create({
    workspaceId: wid,
    fileName: file.name.slice(0, 200),
    text: text.slice(0, 60_000),
    uploadedBy: new mongoose.Types.ObjectId(user.id),
  });
  if (!number || !date || !amount) {
    revalidatePath("/operacao/atendimento");
    return { info: "Fatura recebida. A rotina lê-a e regista-a na próxima execução." };
  }
  const full = `${number[1]}${number[2] ?? ""}`.toUpperCase();
  const existing = await CsInvoice.findOne({ workspaceId: wid, kind: "mia_imposto", number: full, deletedAt: null }).select("_id").lean();
  if (!existing) {
    await CsInvoice.create({
      workspaceId: wid,
      kind: "mia_imposto",
      number: full,
      issueDate: new Date(date[1]),
      currency: "EUR",
      amount: Number(amount[1].replace(",", ".")),
      quantity: qty ? Number(qty[1]) : range ? Number(range[2]) - Number(range[1]) + 1 : null,
      orderFrom: range ? Number(range[1]) : null,
      orderTo: range ? Number(range[2]) : null,
    });
  }
  await CsInvoiceUpload.updateOne({ _id: upload._id }, { $set: { status: "lida" } });
  revalidatePath("/operacao/atendimento");
  return { saved: existing ? `${full} já estava registada.` : `Fatura ${full} registada.` };
}
