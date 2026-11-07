import mongoose, { Schema } from "mongoose";
import { CS_CLASSES } from "@/lib/cs-types";

const CsTemplateSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    number: { type: Number, required: true },
    /** "all" ou chave da loja (rivasylt-de, rivasylt-it, alma-vicentina). */
    store: { type: String, default: "all" },
    language: { type: String, default: "PT" },
    label: { type: String, required: true, trim: true },
    classification: { type: String, enum: CS_CLASSES, default: "verde" },
    /** Texto com variáveis entre parêntesis retos, ex.: [Nome], [#]. */
    body: { type: String, default: "" },
    /** false = aprovação obrigatória (por defeito); true = pode seguir sozinho. */
    autoSend: { type: Boolean, default: false },
    approvedClean: { type: Number, default: 0 },
    approvedEdited: { type: Number, default: 0 },
    /** Reembolsos e escalar: nunca podem seguir sozinhos. */
    alwaysManual: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "cs_templates" },
);

CsTemplateSchema.index({ workspaceId: 1, number: 1 });

export type CsTemplateDoc = mongoose.InferSchemaType<typeof CsTemplateSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const CsTemplate =
  (mongoose.models.CsTemplate as mongoose.Model<CsTemplateDoc>) ||
  mongoose.model<CsTemplateDoc>("CsTemplate", CsTemplateSchema);
