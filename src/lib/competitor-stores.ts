import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { CompetitorStore } from "@/models/CompetitorStore";
import { User } from "@/models/User";
import { formatDateInput } from "@/lib/period";
import type { CurrentUser } from "@/lib/auth";
import type {
  CompetitorStoreView,
  StoreStatus,
  StoreTrend,
} from "@/lib/competitor-stores-types";

/** Tolera dados gravados por fora da app (listas, objetos, datas em texto) para a página não falhar. */
function asText(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map((x) => asText(x)).filter(Boolean).join(", ");
  if (v && typeof v === "object") {
    const o = v as { min?: unknown; max?: unknown; currency?: unknown };
    if (o.min != null || o.max != null) return `${o.min ?? ""} – ${o.max ?? ""} ${typeof o.currency === "string" ? o.currency : ""}`.trim();
    return "";
  }
  return v == null ? "" : String(v);
}

function asDateKey(v: unknown): string {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v as string);
  return Number.isNaN(d.getTime()) ? "" : formatDateInput(d);
}

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
  const ids = Array.from(
    new Set(
      docs
        .map((d) => d.createdBy)
        .filter(Boolean)
        .map(String),
    ),
  );
  const users = ids.length
    ? await User.find({ _id: { $in: ids } })
        .select("name")
        .lean()
    : [];
  const names = new Map(users.map((u) => [String(u._id), u.name]));
  return docs.map((d) => ({
    id: String(d._id),
    name: asText(d.name),
    competitorLink: d.competitorLink,
    productCount: d.productCount ?? null,
    monthlyVisits: d.monthlyVisits ?? null,
    trend: (d.trend ?? "") as StoreTrend,
    country: asText(d.country),
    activeAds: d.activeAds ?? null,
    priceRange: asText(d.priceRange),
    mainCategories: asText(d.mainCategories),
    recheckIn: asText(d.recheckIn),
    lastVerifiedKey: asDateKey(d.lastVerifiedAt),
    status: (d.status ?? "to_analyze") as StoreStatus,
    niche: asText(d.niche),
    notes: asText(d.notes),
    bestSellers: asText(d.bestSellers),
    activity:
      d.activity === "active" || d.activity === "inactive" ? d.activity : "",
    authorName: d.createdBy ? (names.get(String(d.createdBy)) ?? null) : null,
  }));
}
