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

export type PdfFields = { number?: string; issueDate?: string; amount?: string; quantity?: string; orderFrom?: string; orderTo?: string };

/** Lê o PDF de uma fatura da Mia e devolve os campos encontrados para o Emanuel conferir. Não grava nada. */
export async function readInvoicePdfAction(formData: FormData): Promise<{ fields?: PdfFields; error?: string }> {
  const { error } = await editorUser();
  if (error) return { error };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 5_000_000) return { error: "Ficheiro inválido." };
  let text = "";
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const out = await extractText(pdf, { mergePages: true });
    text = out.text;
  } catch {
    return { error: "Não consegui ler o PDF. Preencha os campos à mão." };
  }
  const flat = text.replace(/\s+/g, " ");
  const fields: PdfFields = {};
  const number = flat.match(/WWLLY\s?\d{8}\s?[A-Z]?\s?\d{1,3}(?:-TPB)?/i);
  if (number) fields.number = number[0].replace(/\s+/g, " ").trim();
  const iso = flat.match(/(\d{4})-(\d{2})-(\d{2})/);
  const pt = flat.match(/(\d{2})[/.](\d{2})[/.](\d{4})/);
  if (iso) fields.issueDate = iso[0];
  else if (pt) fields.issueDate = `${pt[3]}-${pt[2]}-${pt[1]}`;
  const amount = flat.match(/Total Amount\D{0,20}(\d+(?:[.,]\d{1,2})?)/i);
  if (amount) fields.amount = amount[1].replace(",", ".");
  const range = flat.match(/#?(\d{4})(?:-A)?\s*(?:to|-|–)\s*#?(\d{4})(?:-A)?/i);
  if (range) {
    fields.orderFrom = range[1];
    fields.orderTo = range[2];
  }
  const qty = flat.match(/(?:Quantity|Qty|Orders?)\D{0,15}(\d{1,4})\b/i);
  if (qty) fields.quantity = qty[1];
  else if (range) fields.quantity = String(Number(range[2]) - Number(range[1]) + 1);
  if (Object.keys(fields).length === 0) return { error: "Não encontrei dados reconhecíveis no PDF. Preencha os campos à mão." };
  return { fields };
}
