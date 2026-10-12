import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { ResearchKeyword } from "@/models/ResearchKeyword";
import { User } from "@/models/User";
import type { CurrentUser } from "@/lib/auth";

export type ResearchKeywordView = {
  id: string;
  text: string;
  country: string;
  likes: number;
  dislikes: number;
  authorName: string | null;
};

/** Ordenadas por likes (desc), depois menos dislikes, depois mais antigas. */
export async function listResearchKeywords(
  user: CurrentUser,
): Promise<ResearchKeywordView[]> {
  await connectToDatabase();
  const docs = await ResearchKeyword.find({
    workspaceId: new mongoose.Types.ObjectId(user.workspaceId),
    deletedAt: null,
  })
    .sort({ likes: -1, dislikes: 1, createdAt: 1 })
    .limit(500)
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
    text: d.text,
    country: d.country ?? "",
    likes: d.likes ?? 0,
    dislikes: d.dislikes ?? 0,
    authorName: d.createdBy ? (names.get(String(d.createdBy)) ?? null) : null,
  }));
}
