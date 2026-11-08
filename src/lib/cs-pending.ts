import "server-only";
import mongoose from "mongoose";
import type { CurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { CsCase } from "@/models/CsCase";
import { CsMiaMessage } from "@/models/CsMiaMessage";
import { CsMiaCoverage } from "@/models/CsMiaCoverage";
import { CsShipment } from "@/models/CsShipment";
import { loadQuotes } from "@/lib/cs-quote-data";
import { loadInvoices } from "@/lib/cs-invoice-data";
import { shipmentAlert, type ShipmentStatus } from "@/lib/parcelpanel-csv";

export type PendingItem = { key: string; label: string; count: number; tab: string };

const DAY = 86_400_000;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Intervalo a exportar do WhatsApp: do dia da última mensagem lida até hoje (o dia repetido é ignorado na leitura). */
export function miaExportRange(coveredUntil: Date | null, now = new Date()) {
  if (!coveredUntil) return null;
  const f = (d: Date) => d.toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit" });
  return { from: f(coveredUntil), to: f(now), staleDays: Math.floor((now.getTime() - coveredUntil.getTime()) / DAY) };
}

/** Tudo o que está do lado do Emanuel, para o aviso visível em todas as páginas. */
export async function loadCsPending(user: Pick<CurrentUser, "workspaceId" | "storeAccess">): Promise<PendingItem[]> {
  await connectToDatabase();
  const wid = new mongoose.Types.ObjectId(user.workspaceId);
  const [cases, miaWaiting, coverage, shipments, quotes, invoices] = await Promise.all([
    CsCase.countDocuments({ workspaceId: wid, deletedAt: null, status: { $in: ["para_aprovar", "escalar", "reembolso"] }, decision: null }),
    CsMiaMessage.countDocuments({ workspaceId: wid, deletedAt: null, status: "enviada" }),
    CsMiaCoverage.findOne({ workspaceId: wid }).lean<{ coveredUntil: Date | null } | null>(),
    CsShipment.find({ workspaceId: wid }).select("status lastEventAt orderedAt importedAt").lean<{ status: ShipmentStatus; lastEventAt: Date | null; orderedAt: Date | null; importedAt: Date }[]>(),
    loadQuotes(user),
    loadInvoices(user.workspaceId),
  ]);
  const items: PendingItem[] = [];
  const add = (key: string, label: string, count: number, tab: string) => count > 0 && items.push({ key, label, count, tab });

  add("casos", plural(cases, "caso para decidir", "casos para decidir"), cases, "casos");
  add("mia", plural(miaWaiting, "pedido à Mia sem resposta registada", "pedidos à Mia sem resposta registada"), miaWaiting, "mia");

  const range = miaExportRange(coverage?.coveredUntil ?? null);
  if (!range) add("mia-export", "Exportar a conversa da Mia", 1, "mia");
  else if (range.staleDays >= 2) add("mia-export", `Exportar a conversa da Mia de ${range.from} a ${range.to}`, 1, "mia");

  const toRequest = quotes.filter((q) => q.status === "por_pedir").length;
  const toDecide = quotes.filter((q) => q.status === "a_negociar").length;
  const toConfirm = quotes.filter((q) => q.status === "por_confirmar").length;
  const changed = quotes.filter((q) => q.changedWithoutRequest).length;
  add("cotacoes", plural(toRequest, "produto para pedir cotação", "produtos para pedir cotação"), toRequest, "precos");
  add("contrapropostas", plural(toDecide, "contraproposta a decidir", "contrapropostas a decidir"), toDecide, "precos");
  add("confirmar", plural(toConfirm, "preço novo a confirmar na fatura", "preços novos a confirmar na fatura"), toConfirm, "precos");
  add("alterados", plural(changed, "preço alterado sem pedido registado", "preços alterados sem pedido registado"), changed, "precos");

  const lastImport = shipments.reduce((m, s) => Math.max(m, new Date(s.importedAt).getTime()), 0);
  const shipAlerts = shipments.filter((s) => shipmentAlert({ status: s.status, lastEventAt: s.lastEventAt, orderedAt: s.orderedAt })).length;
  add("envios", plural(shipAlerts, "envio com alerta", "envios com alerta"), shipAlerts, "envios");
  if (lastImport && Date.now() - lastImport > 2 * DAY) add("envios-import", "Importar o CSV do Parcel Panel", 1, "envios");

  const high = invoices.issues.filter((i) => i.level === "alto");
  add("faturas", plural(high.length, "aviso em faturas", "avisos em faturas"), high.length, "faturas");
  return items;
}
