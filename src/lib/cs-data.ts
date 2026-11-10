import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { CsCase, type CsCaseDoc } from "@/models/CsCase";
import { CsTemplate, type CsTemplateDoc } from "@/models/CsTemplate";
import { CsMiaMessage, type CsMiaMessageDoc } from "@/models/CsMiaMessage";
import { CS_SEED_TEMPLATES } from "@/lib/cs-seed";
import type {
  CsCaseView,
  CsMiaMessageView,
  CsTemplateView,
  CsStoreKey,
  CsStatus,
  CsClass,
  CsIssueType,
  CsDecision,
} from "@/lib/cs-types";

const DAY_MS = 86_400_000;

function toCaseView(d: CsCaseDoc): CsCaseView {
  const ageDays = Math.floor((Date.now() - new Date(d.openedAt).getTime()) / DAY_MS);
  return {
    id: String(d._id),
    store: d.store as CsStoreKey,
    status: d.status as CsStatus,
    classification: d.classification as CsClass,
    issueType: d.issueType as CsIssueType,
    customerName: d.customerName ?? "",
    customerEmail: d.customerEmail ?? "",
    language: d.language ?? "PT",
    orderNumber: d.orderNumber ?? "",
    items: d.items ?? "",
    complaintReason: d.complaintReason ?? "",
    orderValue: d.orderValue ?? "",
    trackingStatus: d.trackingStatus ?? "",
    timeline: (d.timeline ?? []).map((t, i) => ({
      n: t.n || i + 1,
      at: t.at ? new Date(t.at).toISOString() : null,
      summary: t.summary || t.text || "",
    })),
    offered: d.offered ?? "",
    requests: d.requests ?? "",
    lastCustomerEmailOriginal: d.lastCustomerEmailOriginal ?? "",
    lastCustomerEmailPt: d.lastCustomerEmailPt ?? "",
    templateId: d.templateId ?? "",
    templateLabel: d.templateLabel ?? "",
    proposedReply: d.proposedReply ?? "",
    proposedReplyPt: d.proposedReplyPt ?? "",
    managerNote: d.managerNote ?? "",
    decisionQuestion: d.decisionQuestion ?? "",
    decision: (d.decision as CsDecision | null) ?? null,
    ageDays: Math.max(0, ageDays),
    openedAt: new Date(d.openedAt).toISOString(),
    createdAt: new Date(d.createdAt ?? d.openedAt).toISOString(),
    updatedAt: new Date(d.updatedAt).toISOString(),
  };
}

function toTemplateView(d: CsTemplateDoc): CsTemplateView {
  return {
    id: String(d._id),
    number: d.number,
    store: d.store as CsTemplateView["store"],
    language: d.language ?? "PT",
    label: d.label,
    classification: d.classification as CsClass,
    body: d.body ?? "",
    autoSend: !!d.autoSend && !d.alwaysManual,
    approvedClean: d.approvedClean ?? 0,
    approvedEdited: d.approvedEdited ?? 0,
    alwaysManual: !!d.alwaysManual,
  };
}

function toMiaView(d: CsMiaMessageDoc): CsMiaMessageView {
  return {
    id: String(d._id),
    direction: d.direction as CsMiaMessageView["direction"],
    status: d.status as CsMiaMessageView["status"],
    caseId: d.caseId ? String(d.caseId) : null,
    textPt: d.textPt ?? "",
    textEn: d.textEn ?? "",
    reply: d.reply ?? "",
    followUp: d.followUp ?? "",
    reviewed: d.reviewed !== false,
    createdAt: new Date(d.createdAt).toISOString(),
  };
}

export async function ensureSeedTemplates(workspaceId: string): Promise<void> {
  const wid = new mongoose.Types.ObjectId(workspaceId);
  const count = await CsTemplate.countDocuments({ workspaceId: wid });
  if (count > 0) return;
  await CsTemplate.insertMany(
    CS_SEED_TEMPLATES.map((t, i) => ({
      workspaceId: wid,
      number: i + 1,
      store: "all",
      language: "PT",
      label: t.label,
      classification: t.classification,
      alwaysManual: t.classification === "vermelho",
    })),
  );
}

export async function loadCsData(workspaceId: string) {
  await connectToDatabase();
  await ensureSeedTemplates(workspaceId);
  const wid = new mongoose.Types.ObjectId(workspaceId);
  const [cases, templates, mia] = await Promise.all([
    CsCase.find({ workspaceId: wid, deletedAt: null })
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean<CsCaseDoc[]>(),
    CsTemplate.find({ workspaceId: wid, deletedAt: null })
      .sort({ number: 1 })
      .lean<CsTemplateDoc[]>(),
    CsMiaMessage.find({ workspaceId: wid, deletedAt: null })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean<CsMiaMessageDoc[]>(),
  ]);
  return {
    cases: cases.map(toCaseView),
    templates: templates.map(toTemplateView),
    mia: mia.map(toMiaView),
  };
}

export type CsData = Awaited<ReturnType<typeof loadCsData>>;
