"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import mongoose from "mongoose";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { roleRank } from "@/lib/rbac";
import { CsQuote } from "@/models/CsQuote";
import { QUOTE_RESPONSES } from "@/lib/cs-quotes";

type Result = { ok?: boolean; error?: string };

async function editor() {
  const user = await getCurrentUser();
  if (!user?.workspaceId) redirect("/login");
  if (roleRank(user.role) < roleRank("editor")) return { user: null as never, error: "Sem permissão." };
  return { user, error: null };
}

const requestSchema = z.object({
  productId: z.string().min(1),
  title: z.string().max(300).default(""),
  link: z.string().max(500).default(""),
  units: z.number().int().min(0),
  qualityCheck: z.boolean().default(true),
  originalCogs: z.number().min(0).nullable().optional(),
});

/** Regista que o pedido de revisão de cotação foi enviado à Mia (nova ronda). */
export async function recordQuoteRequestAction(input: z.input<typeof requestSchema>): Promise<Result> {
  const { user, error } = await editor();
  if (error) return { error };
  const p = requestSchema.safeParse(input);
  if (!p.success) return { error: "Dados inválidos." };
  await connectToDatabase();
  const wid = new mongoose.Types.ObjectId(user.workspaceId);
  const d = p.data;
  const set: Record<string, unknown> = { title: d.title, link: d.link, confirmed: false };
  const existing = await CsQuote.findOne({ workspaceId: wid, productId: d.productId });
  if (!existing && d.originalCogs != null) {
    set.originalCogs = d.originalCogs;
    set.currentCogs = d.originalCogs;
  }
  await CsQuote.updateOne(
    { workspaceId: wid, productId: d.productId },
    {
      $set: set,
      $push: { rounds: { units: d.units, requestedAt: new Date(), qualityCheck: d.qualityCheck } },
    },
    { upsert: true },
  );
  revalidatePath("/operacao/atendimento");
  return { ok: true };
}

const replySchema = z.object({
  productId: z.string().min(1),
  response: z.enum(QUOTE_RESPONSES),
  price: z.number().min(0).nullable().optional(),
  note: z.string().max(2000).default(""),
});

/** Regista a resposta da Mia à última ronda; se aceitou, atualiza o COGS atual (a confirmar na próxima fatura). */
export async function recordQuoteReplyAction(input: z.input<typeof replySchema>): Promise<Result> {
  const { user, error } = await editor();
  if (error) return { error };
  const p = replySchema.safeParse(input);
  if (!p.success) return { error: "Dados inválidos." };
  await connectToDatabase();
  const wid = new mongoose.Types.ObjectId(user.workspaceId);
  const q = await CsQuote.findOne({ workspaceId: wid, productId: p.data.productId });
  if (!q || q.rounds.length === 0) return { error: "Ainda não há pedido registado para este produto." };
  const last = q.rounds[q.rounds.length - 1];
  last.repliedAt = new Date();
  last.response = p.data.response;
  last.price = p.data.price ?? null;
  last.note = p.data.note;
  if (p.data.response === "aceitou" && p.data.price != null) q.currentCogs = p.data.price;
  q.markModified("rounds");
  await q.save();
  revalidatePath("/operacao/atendimento");
  return { ok: true };
}

const confirmSchema = z.object({ productId: z.string().min(1) });

/** Marca o novo preço como confirmado numa fatura da Mia. */
export async function confirmQuoteInvoiceAction(input: z.infer<typeof confirmSchema>): Promise<Result> {
  const { user, error } = await editor();
  if (error) return { error };
  const p = confirmSchema.safeParse(input);
  if (!p.success) return { error: "Dados inválidos." };
  await connectToDatabase();
  await CsQuote.updateOne(
    { workspaceId: new mongoose.Types.ObjectId(user.workspaceId), productId: p.data.productId },
    { $set: { confirmed: true } },
  );
  revalidatePath("/operacao/atendimento");
  return { ok: true };
}

const observedSchema = z.object({
  productId: z.string().min(1),
  title: z.string().max(300).default(""),
  price: z.number().min(0),
  source: z.string().max(60).default("manual"),
});

/** Regista o preço visto no PrimeFlow ou numa fatura, para detetar alterações feitas pela Mia sem aviso. */
export async function recordObservedPriceAction(input: z.input<typeof observedSchema>): Promise<Result> {
  const { user, error } = await editor();
  if (error) return { error };
  const p = observedSchema.safeParse(input);
  if (!p.success) return { error: "Dados inválidos." };
  await connectToDatabase();
  await CsQuote.updateOne(
    { workspaceId: new mongoose.Types.ObjectId(user.workspaceId), productId: p.data.productId },
    {
      $setOnInsert: { title: p.data.title },
      $push: { observed: { price: p.data.price, at: new Date(), source: p.data.source } },
    },
    { upsert: true },
  );
  revalidatePath("/operacao/atendimento");
  return { ok: true };
}
