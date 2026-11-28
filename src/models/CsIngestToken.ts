import mongoose, { Schema } from "mongoose";

/** Chave que a rotina usa para enviar fotografias de clientes para a app (cs_ingest_tokens). */
const CsIngestTokenSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    label: { type: String, default: "" },
    token: { type: String, required: true, unique: true },
  },
  { timestamps: true, collection: "cs_ingest_tokens" },
);

export type CsIngestTokenDoc = mongoose.InferSchemaType<typeof CsIngestTokenSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const CsIngestToken =
  (mongoose.models.CsIngestToken as mongoose.Model<CsIngestTokenDoc>) ||
  mongoose.model<CsIngestTokenDoc>("CsIngestToken", CsIngestTokenSchema);
