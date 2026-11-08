import mongoose, { Schema } from "mongoose";
import { INVOICE_KINDS } from "@/lib/cs-invoices";

const LineSchema = new Schema(
  { label: { type: String, default: "" }, spend: { type: Number, default: 0 }, fee: { type: Number, default: 0 } },
  { _id: false },
);

/** Faturas da Mia (imposto UE e recargas de saldo) e da agência Google. */
const CsInvoiceSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    kind: { type: String, enum: INVOICE_KINDS, required: true },
    number: { type: String, required: true },
    issueDate: { type: Date, required: true },
    dueDate: { type: Date, default: null },
    currency: { type: String, default: "EUR" },
    amount: { type: Number, required: true },
    paid: { type: Boolean, default: false },
    quantity: { type: Number, default: null },
    orderFrom: { type: Number, default: null },
    orderTo: { type: Number, default: null },
    /** Saldo ("All left") indicado pela Mia após esta fatura. */
    miaBalance: { type: Number, default: null },
    periodFrom: { type: Date, default: null },
    periodTo: { type: Date, default: null },
    lines: { type: [LineSchema], default: [] },
    notes: { type: String, default: "" },
    /** Avisos desta fatura que o Emanuel já viu e dispensou (texto do aviso). */
    dismissed: { type: [String], default: [] },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "cs_invoices" },
);

CsInvoiceSchema.index({ workspaceId: 1, kind: 1, number: 1 });

export type CsInvoiceDoc = mongoose.InferSchemaType<typeof CsInvoiceSchema> & { _id: mongoose.Types.ObjectId };

export const CsInvoice =
  (mongoose.models.CsInvoice as mongoose.Model<CsInvoiceDoc>) ||
  mongoose.model<CsInvoiceDoc>("CsInvoice", CsInvoiceSchema);
