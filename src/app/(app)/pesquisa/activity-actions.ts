"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import mongoose from "mongoose";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { roleRank } from "@/lib/rbac";
import { ResearchItem } from "@/models/ResearchItem";
import { CompetitorStore } from "@/models/CompetitorStore";

export async function setActivityAction(
  target: "item" | "store",
  id: string,
  value: "active" | "inactive" | "",
): Promise<{ ok?: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roleRank(user.role) < roleRank("editor")) {
    return { error: "Sem permissão." };
  }
  if (!mongoose.isValidObjectId(id)) return { error: "ID inválido." };
  if (value !== "active" && value !== "inactive" && value !== "") {
    return { error: "Valor inválido." };
  }

  await connectToDatabase();
  const filter = {
    _id: id,
    workspaceId: new mongoose.Types.ObjectId(user.workspaceId),
    deletedAt: null,
  };
  const res =
    target === "store"
      ? await CompetitorStore.updateOne(filter, { $set: { activity: value } })
      : await ResearchItem.updateOne(filter, { $set: { activity: value } });
  if (!res.matchedCount) return { error: "Entrada não encontrada." };
  revalidatePath("/pesquisa");
  return { ok: true };
}
