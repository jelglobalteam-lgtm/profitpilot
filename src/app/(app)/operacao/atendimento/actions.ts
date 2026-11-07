"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import mongoose from "mongoose";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { roleRank } from "@/lib/rbac";
import { CsCase } from "@/models/CsCase";
import { CsTemplate } from "@/models/CsTemplate";
import { CsMiaMessage } from "@/models/CsMiaMessage";
import { CsEvent } from "@/models/CsEvent";

type Result = { ok?: boolean; error?: string };

async function editor() {
  const user = await getCurrentUser();
  if (!user?.workspaceId) redirect("/login");
  if (roleRank(user.role) < roleRank("editor")) return { user: null as never, error: "Sem permissão." };
  return { user, error: null };
}

const oid = (s: string) => mongoose.isValidObjectId(s);

const decideSchema = z.object({
  caseId: z.string().min(1),
  decision: z.enum(["aprovado", "aprovado_com_edicao", "rejeitado", "escalado"]),
  note: z.string().max(4000).default(""),
  editedReply: z.string().max(10000).optional(),
});

/**
 * Regista a decisão do Emanuel. Não envia nada: o Claude lê as decisões
 * (cs_cases) e responde no email. Reembolsos ficam sempre manuais.
 */
export async function decideCsCaseAction(
  input: z.input<typeof decideSchema>,
): Promise<Result> {
  const { user, error } = await editor();
  if (error) return { error };
  const p = decideSchema.safeParse(input);
  if (!p.success || !oid(p.data.caseId)) return { error: "Dados inválidos." };

  await connectToDatabase();
  const wid = new mongoose.Types.ObjectId(user.workspaceId);
  const c = await CsCase.findOne({ _id: p.data.caseId, workspaceId: wid });
  if (!c) return { error: "Caso não encontrado." };

  const { decision, note, editedReply } = p.data;
  c.decision = decision;
  c.managerNote = note;
  c.decidedAt = new Date();
  c.decidedBy = new mongoose.Types.ObjectId(user.id);
  if (decision === "aprovado_com_edicao" && editedReply) c.proposedReply = editedReply;
  if (decision === "escalado") c.status = "escalar";
  else if (decision === "rejeitado") c.status = "para_aprovar";
  else c.status = c.status === "reembolso" ? "reembolso" : "para_aprovar";
  await c.save();

  // Contadores do template: só aprovações contam (sem edição vs com edição).
  if (c.templateId && oid(c.templateId)) {
    if (decision === "aprovado") {
      await CsTemplate.updateOne({ _id: c.templateId, workspaceId: wid }, { $inc: { approvedClean: 1 } });
    } else if (decision === "aprovado_com_edicao") {
      await CsTemplate.updateOne({ _id: c.templateId, workspaceId: wid }, { $inc: { approvedEdited: 1 } });
    }
  }

  await CsEvent.create({
    workspaceId: wid,
    caseId: c._id,
    type: `decisao:${decision}`,
    note,
    actorId: new mongoose.Types.ObjectId(user.id),
  });
  revalidatePath("/operacao/atendimento");
  return { ok: true };
}

const noteSchema = z.object({ caseId: z.string().min(1), note: z.string().max(4000) });

export async function saveCsNoteAction(input: z.infer<typeof noteSchema>): Promise<Result> {
  const { user, error } = await editor();
  if (error) return { error };
  const p = noteSchema.safeParse(input);
  if (!p.success || !oid(p.data.caseId)) return { error: "Dados inválidos." };
  await connectToDatabase();
  await CsCase.updateOne(
    { _id: p.data.caseId, workspaceId: new mongoose.Types.ObjectId(user.workspaceId) },
    { $set: { managerNote: p.data.note } },
  );
  revalidatePath("/operacao/atendimento");
  return { ok: true };
}

const toggleSchema = z.object({ templateId: z.string().min(1), autoSend: z.boolean() });

export async function setCsTemplateAutoAction(
  input: z.infer<typeof toggleSchema>,
): Promise<Result> {
  const { user, error } = await editor();
  if (error) return { error };
  const p = toggleSchema.safeParse(input);
  if (!p.success || !oid(p.data.templateId)) return { error: "Dados inválidos." };
  await connectToDatabase();
  const t = await CsTemplate.findOne({
    _id: p.data.templateId,
    workspaceId: new mongoose.Types.ObjectId(user.workspaceId),
  });
  if (!t) return { error: "Template não encontrado." };
  if (t.alwaysManual && p.data.autoSend) {
    return { error: "Reembolsos e casos vermelhos ficam sempre com aprovação obrigatória." };
  }
  t.autoSend = p.data.autoSend;
  await t.save();
  revalidatePath("/operacao/atendimento");
  return { ok: true };
}

const tplSchema = z.object({
  templateId: z.string().min(1),
  label: z.string().min(1).max(200),
  body: z.string().max(10000),
});

export async function saveCsTemplateAction(input: z.infer<typeof tplSchema>): Promise<Result> {
  const { user, error } = await editor();
  if (error) return { error };
  const p = tplSchema.safeParse(input);
  if (!p.success || !oid(p.data.templateId)) return { error: "Dados inválidos." };
  await connectToDatabase();
  await CsTemplate.updateOne(
    { _id: p.data.templateId, workspaceId: new mongoose.Types.ObjectId(user.workspaceId) },
    { $set: { label: p.data.label, body: p.data.body } },
  );
  revalidatePath("/operacao/atendimento");
  return { ok: true };
}

const miaSchema = z.object({
  direction: z.enum(["pergunta", "pedido"]),
  textPt: z.string().max(8000).default(""),
  reply: z.string().max(8000).default(""),
  caseId: z.string().optional(),
});

export async function addCsMiaMessageAction(input: z.input<typeof miaSchema>): Promise<Result> {
  const { user, error } = await editor();
  if (error) return { error };
  const p = miaSchema.safeParse(input);
  if (!p.success) return { error: "Dados inválidos." };
  if (p.data.direction === "pergunta" && !p.data.textPt.trim()) return { error: "Escreva a pergunta." };
  if (p.data.direction === "pedido" && !p.data.reply.trim()) return { error: "Cole a resposta da Mia." };
  await connectToDatabase();
  await CsMiaMessage.create({
    workspaceId: new mongoose.Types.ObjectId(user.workspaceId),
    direction: p.data.direction,
    status: p.data.direction === "pergunta" ? "rascunho" : "respondida",
    textPt: p.data.textPt,
    reply: p.data.reply,
    caseId: p.data.caseId && oid(p.data.caseId) ? p.data.caseId : null,
  });
  revalidatePath("/operacao/atendimento");
  return { ok: true };
}

const miaStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["rascunho", "enviada", "respondida"]),
});

export async function setCsMiaStatusAction(
  input: z.infer<typeof miaStatusSchema>,
): Promise<Result> {
  const { user, error } = await editor();
  if (error) return { error };
  const p = miaStatusSchema.safeParse(input);
  if (!p.success || !oid(p.data.id)) return { error: "Dados inválidos." };
  await connectToDatabase();
  await CsMiaMessage.updateOne(
    { _id: p.data.id, workspaceId: new mongoose.Types.ObjectId(user.workspaceId) },
    { $set: { status: p.data.status } },
  );
  revalidatePath("/operacao/atendimento");
  return { ok: true };
}
