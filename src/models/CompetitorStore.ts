import mongoose, { Schema } from "mongoose";

const CompetitorStoreSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    /** Nome curto (opcional; por omissão usa o domínio). */
    name: { type: String, trim: true, default: "" },
    competitorLink: { type: String, trim: true, required: true },
    productCount: { type: Number, min: 0, default: null },
    monthlyVisits: { type: Number, min: 0, default: null },
    /** up = a escalar, down = a baixar, flat = estável, "" = sem info */
    trend: {
      type: String,
      enum: ["up", "down", "flat", ""],
      default: "",
    },
    country: { type: String, trim: true, default: "", index: true },
    activeAds: { type: Number, min: 0, default: null },
    priceRange: { type: String, trim: true, default: "" },
    mainCategories: { type: String, trim: true, default: "" },
    lastVerifiedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["to_analyze", "monitoring", "analyzed", "discarded"],
      default: "to_analyze",
      index: true,
    },
    niche: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
    bestSellers: { type: String, trim: true, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

CompetitorStoreSchema.index({ workspaceId: 1, deletedAt: 1, updatedAt: -1 });

export type CompetitorStoreDoc = mongoose.InferSchemaType<
  typeof CompetitorStoreSchema
> & { _id: mongoose.Types.ObjectId };

export const CompetitorStore =
  (mongoose.models.CompetitorStore as mongoose.Model<CompetitorStoreDoc>) ||
  mongoose.model<CompetitorStoreDoc>(
    "CompetitorStore",
    CompetitorStoreSchema,
    "competitor_stores",
  );
