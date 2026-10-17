"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import mongoose from "mongoose";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { roleRank } from "@/lib/rbac";
import { ResearchItem } from "@/models/ResearchItem";
import { CompetitorStore } from "@/models/CompetitorStore";
import { parseDateInput, startOfDay } from "@/lib/period";

type FieldDef =
  | { type: "text"; max: number; required?: boolean }
  | { type: "int" }
  | { type: "url"; required?: boolean }
  | { type: "date"; required?: boolean }
  | { type: "enum"; options: readonly string[] };

const ITEM_FIELDS: Record<string, FieldDef> = {
  name: { type: "text", max: 200, required: true },
  market: { type: "text", max: 80 },
  notes: { type: "text", max: 4000 },
  angle: { type: "text", max: 300 },
  reach: { type: "int" },
  activeDays: { type: "int" },
  fbAdLink: { type: "url" },
  storeLink: { type: "url" },
  researchedAt: { type: "date", required: true },
  gender: { type: "enum", options: ["female", "male", "unisex", "unknown"] },
  status: {
    type: "enum",
    options: ["new", "shortlist", "testing", "winner", "rejected"],
  },
};

const STORE_FIELDS: Record<string, FieldDef> = {
  name: { type: "text", max: 120 },
  competitorLink: { type: "url", required: true },
  country: { type: "text", max: 40 },
  priceRange: { type: "text", max: 80 },
  mainCategories: { type: "text", max: 300 },
  niche: { type: "text", max: 120 },
  bestSellers: { type: "text", max: 2000 },
  notes: { type: "text", max: 4000 },
  monthlyVisits: { type: "int" },
  productCount: { type: "int" },
  activeAds: { type: "int" },
  lastVerifiedAt: { type: "date" },
  trend: { type: "enum", options: ["", "up", "down", "flat"] },
  status: {
    type: "enum",
    options: ["to_analyze", "monitoring", "analyzed", "discarded"],
  },
};

function normalizeLink(v: string): string {
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

function parseValue(
  def: FieldDef,
  raw: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const v = (raw ?? "").trim();
  switch (def.type) {
    case "text":
      if (def.required && !v) return { ok: false, error: "Campo obrigatório." };
      if (v.length > def.max)
        return { ok: false, error: "Texto demasiado longo." };
      return { ok: true, value: v };
    case "int": {
      if (!v) return { ok: true, value: null };
      const n = Number(v.replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(n) || n < 0) {
        return { ok: false, error: "Número inválido." };
      }
      return { ok: true, value: Math.round(n) };
    }
    case "url":
      if (!v) {
        return def.required
          ? { ok: false, error: "Link obrigatório." }
          : { ok: true, value: "" };
      }
      if (v.length > 2000 || /\s/.test(v)) {
        return { ok: false, error: "Link inválido." };
      }
      return { ok: true, value: normalizeLink(v) };
    case "date": {
      if (!v) {
        return def.required
          ? { ok: false, error: "Data obrigatória." }
          : { ok: true, value: null };
      }
      const d = parseDateInput(v);
      if (!d) return { ok: false, error: "Data inválida." };
      return { ok: true, value: startOfDay(d) };
    }
    case "enum":
      if (!def.options.includes(v))
        return { ok: false, error: "Valor inválido." };
      return { ok: true, value: v };
  }
}

export async function updateFieldAction(
  target: "item" | "store",
  id: string,
  field: string,
  raw: string,
): Promise<{ ok?: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roleRank(user.role) < roleRank("editor")) {
    return { error: "Sem permissão." };
  }
  if (!mongoose.isValidObjectId(id)) return { error: "ID inválido." };

  const defs = target === "store" ? STORE_FIELDS : ITEM_FIELDS;
  const def = Object.prototype.hasOwnProperty.call(defs, field)
    ? defs[field]
    : undefined;
  if (!def) return { error: "Campo não editável." };

  const parsed = parseValue(def, raw);
  if (!parsed.ok) return { error: parsed.error };

  await connectToDatabase();
  const filter = {
    _id: id,
    workspaceId: new mongoose.Types.ObjectId(user.workspaceId),
    deletedAt: null,
  };
  const update = { $set: { [field]: parsed.value } };
  const res =
    target === "store"
      ? await CompetitorStore.updateOne(filter, update)
      : await ResearchItem.updateOne(filter, update);
  if (!res.matchedCount) return { error: "Entrada não encontrada." };
  revalidatePath("/pesquisa");
  return { ok: true };
}
