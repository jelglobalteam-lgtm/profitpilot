import mongoose, { Schema } from "mongoose";

const ResearchKeywordSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    text: { type: String, required: true, trim: true },
    country: { type: String, trim: true, default: "" },
    /** Versão normalizada (minúsculas) para evitar duplicados. */
    key: { type: String, required: true },
    likes: { type: Number, min: 0, default: 0 },
    dislikes: { type: Number, min: 0, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

ResearchKeywordSchema.index({ workspaceId: 1, likes: -1, dislikes: 1 });
ResearchKeywordSchema.index(
  { workspaceId: 1, key: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

export type ResearchKeywordDoc = mongoose.InferSchemaType<
  typeof ResearchKeywordSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const ResearchKeyword =
  (mongoose.models.ResearchKeyword as mongoose.Model<ResearchKeywordDoc>) ||
  mongoose.model<ResearchKeywordDoc>(
    "ResearchKeyword",
    ResearchKeywordSchema,
    "research_keywords",
  );
