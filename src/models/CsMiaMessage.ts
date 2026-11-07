import mongoose, { Schema } from "mongoose";

const CsMiaMessageSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    /** pergunta = Emanuel → Mia; pedido = resposta/pedido recebido da Mia. */
    direction: { type: String, enum: ["pergunta", "pedido"], required: true },
    status: {
      type: String,
      enum: ["rascunho", "enviada", "respondida"],
      default: "rascunho",
    },
    caseId: { type: Schema.Types.ObjectId, ref: "CsCase", default: null },
    textPt: { type: String, default: "" },
    textEn: { type: String, default: "" },
    reply: { type: String, default: "" },
    followUp: { type: String, default: "" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "cs_mia_messages" },
);

CsMiaMessageSchema.index({ workspaceId: 1, direction: 1, createdAt: -1 });

export type CsMiaMessageDoc = mongoose.InferSchemaType<
  typeof CsMiaMessageSchema
> & { _id: mongoose.Types.ObjectId; createdAt: Date };

export const CsMiaMessage =
  (mongoose.models.CsMiaMessage as mongoose.Model<CsMiaMessageDoc>) ||
  mongoose.model<CsMiaMessageDoc>("CsMiaMessage", CsMiaMessageSchema);
