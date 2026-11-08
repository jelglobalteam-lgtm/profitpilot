import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { CsShipment, type CsShipmentDoc } from "@/models/CsShipment";
import type { ShipmentStatus, ShipmentView } from "@/lib/parcelpanel-csv";

export async function loadShipments(workspaceId: string): Promise<ShipmentView[]> {
  await connectToDatabase();
  const rows = await CsShipment.find({ workspaceId: new mongoose.Types.ObjectId(workspaceId) })
    .sort({ orderedAt: -1 })
    .limit(2000)
    .lean<CsShipmentDoc[]>();
  const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);
  return rows.map((r) => ({
    orderNumber: r.orderNumber,
    tracking: r.tracking ?? "",
    carrier: r.carrier ?? "",
    status: r.status as ShipmentStatus,
    lastEventAt: iso(r.lastEventAt),
    lastEvent: r.lastEvent ?? "",
    orderedAt: iso(r.orderedAt),
    importedAt: new Date(r.importedAt).toISOString(),
  }));
}
