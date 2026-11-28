import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { CsCase } from "@/models/CsCase";
import { CsCaseImage } from "@/models/CsCaseImage";
import { CsIngestToken } from "@/models/CsIngestToken";

export const dynamic = "force-dynamic";

const MAX_BYTES = 600_000;
const MAX_PER_CASE = 10;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** A rotina envia as fotografias a partir da página do webmail do Hostinger (pedido entre origens). */
function cors(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";
  const ok = /^https:\/\/([a-z0-9-]+\.)*hostinger\.com$/i.test(origin);
  return ok
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "content-type, x-ingest-token",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        Vary: "Origin",
      }
    : {};
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: cors(request) });
}

export async function POST(request: Request) {
  const headers = cors(request);
  const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

  const token = request.headers.get("x-ingest-token") ?? "";
  if (!token) return fail("Não autorizado.", 401);

  let body: { caseId?: string; name?: string; contentType?: string; data?: string };
  try {
    body = await request.json();
  } catch {
    return fail("Pedido inválido.", 400);
  }
  const { caseId, name, contentType, data } = body;
  if (!caseId || !mongoose.isValidObjectId(caseId) || !data || !contentType || !TYPES.has(contentType)) {
    return fail("Dados inválidos.", 400);
  }

  await connectToDatabase();
  const t = await CsIngestToken.findOne({ token }).lean();
  if (!t) return fail("Não autorizado.", 401);
  const wid = t.workspaceId;

  const c = await CsCase.findOne({ _id: caseId, workspaceId: wid }, { _id: 1 }).lean();
  if (!c) return fail("Caso não encontrado.", 404);

  const buf = Buffer.from(data.replace(/^data:[^,]*,/, ""), "base64");
  if (buf.length === 0 || buf.length > MAX_BYTES) return fail("Imagem vazia ou demasiado grande (máx. 600 KB).", 413);

  const hash = createHash("sha1").update(buf).digest("hex");
  const dup = await CsCaseImage.findOne({ caseId: c._id, hash }, { _id: 1 }).lean();
  if (dup) return NextResponse.json({ ok: true, id: String(dup._id), duplicate: true }, { headers });
  const count = await CsCaseImage.countDocuments({ caseId: c._id });
  if (count >= MAX_PER_CASE) return fail("Limite de fotografias por caso atingido.", 409);

  const doc = await CsCaseImage.create({
    workspaceId: wid,
    caseId: c._id,
    name: (name ?? "").slice(0, 120),
    contentType,
    size: buf.length,
    hash,
    data: buf,
  });
  return NextResponse.json({ ok: true, id: String(doc._id) }, { headers });
}
