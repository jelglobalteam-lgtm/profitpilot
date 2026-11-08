import mongoose, { Schema } from "mongoose";
import { SHIPMENT_STATUSES } from "@/lib/parcelpanel-csv";

/** Último estado de cada envio, importado do CSV do Parcel Panel. */
const CsShipmentSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    orderNumber: { type: String, required: true },
    tracking: { type: String, default: "" },
    carrier: { type: String, default: "" },
    status: { type: String, enum: SHIPMENT_STATUSES, default: "pending" },
    rawStatus: { type: String, default: "" },
    lastEventAt: { type: Date, default: null },
    lastEvent: { type: String, default: "" },
    orderedAt: { type: Date, default: null },
    customerEmail: { type: String, default: "" },
    importedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true, collection: "cs_shipments" },
);

CsShipmentSchema.index({ workspaceId: 1, orderNumber: 1 }, { unique: true });

export type CsShipmentDoc = mongoose.InferSchemaType<typeof CsShipmentSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const CsShipment =
  (mongoose.models.CsShipment as mongoose.Model<CsShipmentDoc>) ||
  mongoose.model<CsShipmentDoc>("CsShipment", CsShipmentSchema);
