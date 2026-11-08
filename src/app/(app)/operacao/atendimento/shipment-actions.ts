"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import mongoose from "mongoose";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { roleRank } from "@/lib/rbac";
import { CsShipment } from "@/models/CsShipment";
import { parseParcelPanelCsv } from "@/lib/parcelpanel-csv";

type Result = { ok?: boolean; error?: string; imported?: number; warnings?: string[] };

/** Importa o CSV exportado do Parcel Panel (Pedidos, Exportar). Atualiza por número de encomenda. */
export async function importParcelPanelCsvAction(text: string): Promise<Result> {
  const user = await getCurrentUser();
  if (!user?.workspaceId) redirect("/login");
  if (roleRank(user.role) < roleRank("editor")) return { error: "Sem permissão." };
  if (typeof text !== "string" || text.length > 5_000_000) return { error: "Ficheiro inválido ou demasiado grande." };
  const { rows, errors } = parseParcelPanelCsv(text);
  if (rows.length === 0) return { error: errors[0] ?? "Nenhuma linha válida." };
  await connectToDatabase();
  const wid = new mongoose.Types.ObjectId(user.workspaceId);
  const now = new Date();
  await CsShipment.bulkWrite(
    rows.map((r) => ({
      updateOne: {
        filter: { workspaceId: wid, orderNumber: r.orderNumber },
        update: { $set: { ...r, importedAt: now } },
        upsert: true,
      },
    })),
  );
  revalidatePath("/operacao/atendimento");
  return { ok: true, imported: rows.length, warnings: errors.slice(0, 5) };
}
