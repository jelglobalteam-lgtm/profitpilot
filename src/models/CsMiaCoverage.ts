import mongoose, { Schema } from "mongoose";

/** Até que momento a conversa do WhatsApp com a Mia já foi lida (um documento por workspace). */
const CsMiaCoverageSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, unique: true },
    coveredFrom: { type: Date, default: null },
    coveredUntil: { type: Date, default: null },
  },
  { timestamps: true, collection: "cs_mia_coverage" },
);

export type CsMiaCoverageDoc = mongoose.InferSchemaType<typeof CsMiaCoverageSchema> & { _id: mongoose.Types.ObjectId };

export const CsMiaCoverage =
  (mongoose.models.CsMiaCoverage as mongoose.Model<CsMiaCoverageDoc>) ||
  mongoose.model<CsMiaCoverageDoc>("CsMiaCoverage", CsMiaCoverageSchema);
