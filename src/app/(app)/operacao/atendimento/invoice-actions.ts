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
export async function checkMiaInvoiceAction(text: string): Promise<Result> {
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
  const findings = checkInvoice(lines, ctx);
  return { lines: lines.length, findings, message: miaInvoiceMessage(findings), warnings: errors.slice(0, 5) };
}
