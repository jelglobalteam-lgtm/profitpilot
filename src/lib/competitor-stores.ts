import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { CompetitorStore } from "@/models/CompetitorStore";
import { formatDateInput } from "@/lib/period";
import type { CurrentUser } from "@/lib/auth";
import type {
  CompetitorStoreView,
  StoreStatus,
  StoreTrend,
} from "@/lib/competitor-stores-types";

export async function listCompetitorStores(
  user: CurrentUser,
): Promise<CompetitorStoreView[]> {
  await connectToDatabase();
  const docs = await CompetitorStore.find({
    workspaceId: new mongoose.Types.ObjectId(user.workspaceId),
    deletedAt: null,
  })
    .sort({ monthlyVisits: -1, updatedAt: -1 })
    .limit(1000)
    .lean();
  return docs.map((d) => ({
    id: String(d._id),
    name: d.name ?? "",
    competitorLink: d.competitorLink,
    productCount: d.productCount ?? null,
    monthlyVisits: d.monthlyVisits ?? null,
    trend: (d.trend ?? "") as StoreTrend,
    country: d.country ?? "",
    activeAds: d.activeAds ?? null,
    priceRange: d.priceRange ?? "",
    mainCategories: d.mainCategories ?? "",
    lastVerifiedKey: d.lastVerifiedAt ? formatDateInput(d.lastVerifiedAt) : "",
    status: (d.status ?? "to_analyze") as StoreStatus,
    niche: d.niche ?? "",
    notes: d.notes ?? "",
    bestSellers: d.bestSellers ?? "",
  }));
}
