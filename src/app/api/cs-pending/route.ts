import { NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/require-auth";
import { loadCsPending } from "@/lib/cs-pending";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const items = await loadCsPending(user);
    return NextResponse.json({ items });
  } catch (e) {
    return authErrorResponse(e);
  }
}
