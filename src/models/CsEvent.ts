import mongoose, { Schema } from "mongoose";

const CsEventSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    caseId: { type: Schema.Types.ObjectId, ref: "CsCase", index: true },
    type: { type: String, required: true },
    note: { type: String, default: "" },
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "cs_events" },
);

export type CsEventDoc = mongoose.InferSchemaType<typeof CsEventSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const CsEvent =
  (mongoose.models.CsEvent as mongoose.Model<CsEventDoc>) ||
  mongoose.model<CsEventDoc>("CsEvent", CsEventSchema);
