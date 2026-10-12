import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { ResearchKeyword } from "@/models/ResearchKeyword";
import type { CurrentUser } from "@/lib/auth";

export type ResearchKeywordView = {
  id: string;
  text: string;
  country: string;
  likes: number;
  dislikes: number;
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
  return docs.map((d) => ({
    id: String(d._id),
    text: d.text,
    country: d.country ?? "",
    likes: d.likes ?? 0,
    dislikes: d.dislikes ?? 0,
  }));
}
