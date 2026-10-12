"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import mongoose from "mongoose";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { roleRank } from "@/lib/rbac";
import { ResearchKeyword } from "@/models/ResearchKeyword";

type Result = { ok?: boolean; error?: string };

async function requireEditor() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roleRank(user.role) < roleRank("editor")) return null;
  return user;
}

export async function addKeywordAction(
  raw: string,
  rawCountry = "",
): Promise<Result> {
  const user = await requireEditor();
  if (!user) return { error: "Sem permissão." };
  const text = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!text) return { error: "Escreva uma keyword." };
  if (text.length > 120) return { error: "Keyword demasiado longa." };
  const country = (rawCountry ?? "").trim().replace(/\s+/g, " ");
  if (country.length > 40) return { error: "País demasiado longo." };

  await connectToDatabase();
  const workspaceId = new mongoose.Types.ObjectId(user.workspaceId);
  const key = (country ? `${text}|${country}` : text).toLowerCase();
  const exists = await ResearchKeyword.exists({
    workspaceId,
    key,
    deletedAt: null,
  });
  if (exists) return { error: "Essa keyword já existe." };

  try {
    await ResearchKeyword.create({
      workspaceId,
      text,
      country,
      key,
      createdBy: new mongoose.Types.ObjectId(user.id),
    });
  } catch {
    return { error: "Essa keyword já existe." };
  }
  revalidatePath("/pesquisa");
  return { ok: true };
}

export async function voteKeywordAction(
  id: string,
  vote: "like" | "dislike",
): Promise<Result> {
  const user = await requireEditor();
  if (!user) return { error: "Sem permissão." };
  if (!mongoose.isValidObjectId(id)) return { error: "ID inválido." };

  await connectToDatabase();
  const result = await ResearchKeyword.updateOne(
    {
      _id: id,
      workspaceId: new mongoose.Types.ObjectId(user.workspaceId),
      deletedAt: null,
    },
    { $inc: vote === "like" ? { likes: 1 } : { dislikes: 1 } },
  );
  if (!result.matchedCount) return { error: "Keyword não encontrada." };
  revalidatePath("/pesquisa");
  return { ok: true };
}

export async function deleteKeywordAction(id: string): Promise<Result> {
  const user = await requireEditor();
  if (!user) return { error: "Sem permissão." };
  if (!mongoose.isValidObjectId(id)) return { error: "ID inválido." };

  await connectToDatabase();
  const result = await ResearchKeyword.updateOne(
    {
      _id: id,
      workspaceId: new mongoose.Types.ObjectId(user.workspaceId),
      deletedAt: null,
    },
    { $set: { deletedAt: new Date() } },
  );
  if (!result.matchedCount) return { error: "Keyword não encontrada." };
  revalidatePath("/pesquisa");
  return { ok: true };
}

export async function setKeywordCountryAction(
  id: string,
  rawCountry: string,
): Promise<Result> {
  const user = await requireEditor();
  if (!user) return { error: "Sem permissão." };
  if (!mongoose.isValidObjectId(id)) return { error: "ID inválido." };
  const country = (rawCountry ?? "").trim().replace(/\s+/g, " ");
  if (country.length > 40) return { error: "País demasiado longo." };

  await connectToDatabase();
  const workspaceId = new mongoose.Types.ObjectId(user.workspaceId);
  const doc = await ResearchKeyword.findOne({
    _id: id,
    workspaceId,
    deletedAt: null,
  });
  if (!doc) return { error: "Keyword não encontrada." };

  const key = (country ? `${doc.text}|${country}` : doc.text).toLowerCase();
  const clash = await ResearchKeyword.exists({
    workspaceId,
    key,
    deletedAt: null,
    _id: { $ne: doc._id },
  });
  if (clash) return { error: "Essa keyword já existe para esse país." };

  doc.country = country;
  doc.key = key;
  await doc.save();
  revalidatePath("/pesquisa");
  return { ok: true };
}
