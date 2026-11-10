import mongoose, { Schema } from "mongoose";

/** Faturas carregadas pelo Emanuel (PDF ou zip), com o texto extraído, à espera de a rotina as ler e registar. */
const CsInvoiceUploadSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    fileName: { type: String, default: "" },
    text: { type: String, default: "" },
    status: { type: String, enum: ["por_ler", "lida"], default: "por_ler" },
    uploadedBy: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true, collection: "cs_invoice_uploads" },
);

export const CsInvoiceUpload =
  (mongoose.models.CsInvoiceUpload as mongoose.Model<mongoose.InferSchemaType<typeof CsInvoiceUploadSchema>>) ||
  mongoose.model("CsInvoiceUpload", CsInvoiceUploadSchema);
