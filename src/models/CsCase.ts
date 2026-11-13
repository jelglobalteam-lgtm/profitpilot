import mongoose, { Schema } from "mongoose";
import { COMPENSATION_KINDS, COMPENSATION_STATUSES } from "@/lib/cs-compensation";
import {
  CS_CLASSES,
  CS_DECISIONS,
  CS_ISSUE_TYPES,
  CS_STATUSES,
  CS_STORES,
} from "@/lib/cs-types";

const TimelineSchema = new Schema(
  {
    n: { type: Number, default: 0 },
    at: { type: Date, default: null },
    summary: { type: String, default: "" },
    /** Entradas antigas gravadas com "text" em vez de "summary". */
    text: { type: String, default: "" },
  },
  { _id: false },
);

const CompensationSchema = new Schema(
  {
    kind: { type: String, enum: COMPENSATION_KINDS, required: true },
    percent: { type: Number, required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: COMPENSATION_STATUSES, default: "proposta" },
    confirmedAt: { type: Date, default: null },
    confirmedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    executedAt: { type: Date, default: null },
    transactionId: { type: String, default: "" },
    error: { type: String, default: "" },
  },
  { _id: false },
);

/** Disputa aberta por nós no PrimeFlow, para o Emanuel a ver e a rotina a acompanhar. */
const PfDisputeSchema = new Schema(
  {
    status: { type: String, enum: ["aberta", "resposta_recebida", "resolvida", "recusada"], default: "aberta" },
    openedAt: { type: Date, default: null },
    lastCheckedAt: { type: Date, default: null },
    supplierReply: { type: String, default: "" },
    /** A resposta do fornecedor serve-nos (reembolso) ou não (alternativa que não aceitámos). */
    inOurInterest: { type: Boolean, default: null },
  },
  { _id: false },
);

const CsCaseSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    store: { type: String, enum: CS_STORES, required: true, index: true },
    status: {
      type: String,
      enum: CS_STATUSES,
      default: "para_aprovar",
      index: true,
    },
    classification: { type: String, enum: CS_CLASSES, default: "amarelo" },
    issueType: { type: String, enum: CS_ISSUE_TYPES, default: "outro" },
    customerName: { type: String, default: "" },
    customerEmail: { type: String, default: "", index: true },
    language: { type: String, default: "PT" },
    orderNumber: { type: String, default: "", index: true },
    items: { type: String, default: "" },
    complaintReason: { type: String, default: "" },
    orderValue: { type: String, default: "" },
    trackingStatus: { type: String, default: "" },
    timeline: { type: [TimelineSchema], default: [] },
    offered: { type: String, default: "" },
    requests: { type: String, default: "" },
    lastCustomerEmailOriginal: { type: String, default: "" },
    lastCustomerEmailPt: { type: String, default: "" },
    templateId: { type: String, default: "" },
    templateLabel: { type: String, default: "" },
    proposedReply: { type: String, default: "" },
    proposedReplyPt: { type: String, default: "" },
    managerNote: { type: String, default: "" },
    decisionQuestion: { type: String, default: "" },
    decision: { type: String, enum: [...CS_DECISIONS, null], default: null },
    compensation: { type: CompensationSchema, default: null },
    pfDispute: { type: PfDisputeSchema, default: null },
    decidedAt: { type: Date, default: null },
    decidedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    openedAt: { type: Date, default: () => new Date() },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "cs_cases" },
);

CsCaseSchema.index({ workspaceId: 1, status: 1, store: 1, updatedAt: -1 });

export type CsCaseDoc = mongoose.InferSchemaType<typeof CsCaseSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const CsCase =
  (mongoose.models.CsCase as mongoose.Model<CsCaseDoc>) ||
  mongoose.model<CsCaseDoc>("CsCase", CsCaseSchema);
