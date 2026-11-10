import mongoose, { Schema } from "mongoose";

/** Faturas que a Mia anunciou na conversa do WhatsApp (número, valor, saldo), para avisar se ainda não foram importadas. */
const CsMiaInvoiceNoteSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    number: { type: String, required: true },
    amount: { type: Number, default: null },
    balance: { type: Number, default: null },
    announcedAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "cs_mia_invoice_notes" },
);
CsMiaInvoiceNoteSchema.index({ workspaceId: 1, number: 1 }, { unique: true });

export const CsMiaInvoiceNote =
  (mongoose.models.CsMiaInvoiceNote as mongoose.Model<mongoose.InferSchemaType<typeof CsMiaInvoiceNoteSchema>>) ||
  mongoose.model("CsMiaInvoiceNote", CsMiaInvoiceNoteSchema);
