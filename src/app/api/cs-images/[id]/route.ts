import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { authErrorResponse, requireUser } from "@/lib/require-auth";
import { connectToDatabase } from "@/lib/db";
import { CsCaseImage } from "@/models/CsCaseImage";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Imagem inválida." }, { status: 400 });
    await connectToDatabase();
    const img = await CsCaseImage.findOne({ _id: id, workspaceId: new mongoose.Types.ObjectId(user.workspaceId) }).lean();
    if (!img) return NextResponse.json({ error: "Imagem não encontrada." }, { status: 404 });
    return new Response(new Uint8Array(img.data as unknown as Buffer), {
      headers: { "Content-Type": img.contentType, "Cache-Control": "private, max-age=86400" },
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}
