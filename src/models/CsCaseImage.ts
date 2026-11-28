import mongoose, { Schema } from "mongoose";

/** Fotografia enviada pelo cliente num caso de atendimento (miniatura já reduzida pela rotina). */
const CsCaseImageSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    caseId: { type: Schema.Types.ObjectId, ref: "CsCase", required: true, index: true },
    name: { type: String, default: "" },
    contentType: { type: String, default: "image/jpeg" },
    size: { type: Number, default: 0 },
    /** SHA-1 do conteúdo, para não guardar duas vezes a mesma fotografia no mesmo caso. */
    hash: { type: String, default: "" },
    data: { type: Buffer, required: true },
  },
  { timestamps: true, collection: "cs_case_images" },
);

CsCaseImageSchema.index({ caseId: 1, hash: 1 });

export type CsCaseImageDoc = mongoose.InferSchemaType<typeof CsCaseImageSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const CsCaseImage =
  (mongoose.models.CsCaseImage as mongoose.Model<CsCaseImageDoc>) ||
  mongoose.model<CsCaseImageDoc>("CsCaseImage", CsCaseImageSchema);
