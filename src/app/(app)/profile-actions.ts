"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import mongoose from "mongoose";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";

export async function updateOwnNameAction(
  raw: string,
): Promise<{ ok?: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const name = (raw ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2) return { error: "Nome demasiado curto." };
  if (name.length > 60) return { error: "Nome demasiado longo." };

  await connectToDatabase();
  await User.updateOne(
    { _id: new mongoose.Types.ObjectId(user.id) },
    { $set: { name } },
  );
  revalidatePath("/", "layout");
  return { ok: true };
}
