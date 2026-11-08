import mongoose, { Schema } from "mongoose";
import { QUOTE_RESPONSES } from "@/lib/cs-quotes";

const RoundSchema = new Schema(
  {
    units: { type: Number, required: true },
    requestedAt: { type: Date, default: () => new Date() },
    repliedAt: { type: Date, default: null },
    qualityCheck: { type: Boolean, default: true },
    response: { type: String, enum: [...QUOTE_RESPONSES, null], default: null },
    price: { type: Number, default: null },
    note: { type: String, default: "" },
  },
  { _id: false },
);

/** Histórico de cotações por produto: preço original, ronda a ronda, COGS atual. */
const CsQuoteSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    productId: { type: String, required: true },
    title: { type: String, default: "" },
    link: { type: String, default: "" },
    currency: { type: String, default: "EUR" },
    originalCogs: { type: Number, default: null },
    currentCogs: { type: Number, default: null },
    /** Última cotação aceite já confirmada numa fatura. */
    confirmed: { type: Boolean, default: false },
    rounds: { type: [RoundSchema], default: [] },
    notes: { type: String, default: "" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "cs_quotes" },
);

CsQuoteSchema.index({ workspaceId: 1, productId: 1 }, { unique: true });

export type CsQuoteDoc = mongoose.InferSchemaType<typeof CsQuoteSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const CsQuote =
  (mongoose.models.CsQuote as mongoose.Model<CsQuoteDoc>) ||
  mongoose.model<CsQuoteDoc>("CsQuote", CsQuoteSchema);
