"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import mongoose from "mongoose";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { roleRank } from "@/lib/rbac";
import { CompetitorStore } from "@/models/CompetitorStore";
import { parseDateInput } from "@/lib/period";

type Result = { ok?: boolean; error?: string };

const num = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, ""));
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  });

const schema = z.object({
  id: z.string().optional(),
  name: z.string().trim().max(120).default(""),
  competitorLink: z
    .string()
    .trim()
    .min(1, "Link da loja obrigatório.")
    .max(2000)
    .refine(
      (v) => /^https?:\/\//i.test(v) || v.startsWith("www.") || v.includes("."),
      "Link inválido.",
    ),
  productCount: num,
  monthlyVisits: num,
  trend: z.enum(["", "up", "down", "flat"]).default(""),
  country: z.string().trim().max(40).default(""),
  activeAds: num,
  priceRange: z.string().trim().max(80).default(""),
  mainCategories: z.string().trim().max(300).default(""),
  lastVerifiedAt: z.string().trim().nullable().optional(),
  status: z
    .enum(["to_analyze", "monitoring", "analyzed", "discarded"])
    .default("to_analyze"),
  niche: z.string().trim().max(120).default(""),
  notes: z.string().trim().max(4000).default(""),
  bestSellers: z.string().trim().max(2000).default(""),
});

export type StoreInput = z.input<typeof schema>;

async function requireEditor() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roleRank(user.role) < roleRank("editor")) return null;
  return user;
}

function normalizeLink(v: string): string {
  const t = v.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

function toFields(d: z.output<typeof schema>) {
  let lastVerifiedAt: Date | null = null;
  if (d.lastVerifiedAt) {
    try {
      lastVerifiedAt = parseDateInput(d.lastVerifiedAt);
    } catch {
      lastVerifiedAt = null;
    }
  }
  return {
    name: d.name,
    competitorLink: normalizeLink(d.competitorLink),
    productCount: d.productCount,
    monthlyVisits: d.monthlyVisits,
    trend: d.trend,
    country: d.country,
    activeAds: d.activeAds,
    priceRange: d.priceRange,
    mainCategories: d.mainCategories,
    lastVerifiedAt,
    status: d.status,
    niche: d.niche,
    notes: d.notes,
    bestSellers: d.bestSellers,
  };
}

export async function saveStoreAction(input: StoreInput): Promise<Result> {
  const user = await requireEditor();
  if (!user) return { error: "Sem permissão." };
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;
  await connectToDatabase();
  const workspaceId = new mongoose.Types.ObjectId(user.workspaceId);

  if (d.id) {
    if (!mongoose.isValidObjectId(d.id)) return { error: "ID inválido." };
    const res = await CompetitorStore.updateOne(
      { _id: d.id, workspaceId, deletedAt: null },
      { $set: toFields(d) },
    );
    if (!res.matchedCount) return { error: "Loja não encontrada." };
  } else {
    await CompetitorStore.create({
      workspaceId,
      ...toFields(d),
      createdBy: new mongoose.Types.ObjectId(user.id),
    });
  }
  revalidatePath("/pesquisa");
  return { ok: true };
}

export async function deleteStoreAction(id: string): Promise<Result> {
  const user = await requireEditor();
  if (!user) return { error: "Sem permissão." };
  if (!mongoose.isValidObjectId(id)) return { error: "ID inválido." };
  await connectToDatabase();
  const res = await CompetitorStore.updateOne(
    {
      _id: id,
      workspaceId: new mongoose.Types.ObjectId(user.workspaceId),
      deletedAt: null,
    },
    { $set: { deletedAt: new Date() } },
  );
  if (!res.matchedCount) return { error: "Loja não encontrada." };
  revalidatePath("/pesquisa");
  return { ok: true };
}
