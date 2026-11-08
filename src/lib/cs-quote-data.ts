import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Order } from "@/models/Order";
import { CsQuote, type CsQuoteDoc } from "@/models/CsQuote";
import { quoteStatus, type QuoteResponse, type QuoteRoundView, type QuoteStatus } from "@/lib/cs-quotes";

export type QuoteProductView = {
  productId: string;
  title: string;
  units: number;
  recentUnits: number;
  lastSale: string | null;
  shopifyCogs: number;
  link: string;
  currency: string;
  originalCogs: number | null;
  currentCogs: number | null;
  confirmed: boolean;
  notes: string;
  rounds: QuoteRoundView[];
  status: QuoteStatus;
};

const DAY_MS = 86_400_000;

function toRounds(q: CsQuoteDoc | undefined): QuoteRoundView[] {
  return (q?.rounds ?? []).map((r) => ({
    units: r.units,
    requestedAt: new Date(r.requestedAt).toISOString(),
    repliedAt: r.repliedAt ? new Date(r.repliedAt).toISOString() : null,
    qualityCheck: !!r.qualityCheck,
    response: (r.response as QuoteResponse | null) ?? null,
    price: r.price ?? null,
    note: r.note ?? "",
  }));
}

/** Unidades vendidas por produto (encomendas não canceladas) cruzadas com o histórico de cotações. */
export async function loadQuotes(workspaceId: string): Promise<QuoteProductView[]> {
  await connectToDatabase();
  const wid = new mongoose.Types.ObjectId(workspaceId);
  const since = new Date(Date.now() - 30 * DAY_MS);
  const [sold, quotes] = await Promise.all([
    Order.aggregate<{
      _id: string;
      title: string;
      units: number;
      recent: number;
      last: Date;
      cost: number;
    }>([
      { $match: { workspaceId: wid, cancelledAt: null } },
      { $unwind: "$lineItems" },
      { $match: { "lineItems.productId": { $nin: [null, ""] } } },
      { $sort: { orderDate: 1 } },
      {
        $group: {
          _id: "$lineItems.productId",
          title: { $last: "$lineItems.title" },
          units: { $sum: "$lineItems.quantity" },
          recent: {
            $sum: { $cond: [{ $gte: ["$orderDate", since] }, "$lineItems.quantity", 0] },
          },
          last: { $max: "$orderDate" },
          cost: { $last: "$lineItems.unitCost" },
        },
      },
      { $match: { units: { $gte: 5 } } },
    ]),
    CsQuote.find({ workspaceId: wid, deletedAt: null }).lean<CsQuoteDoc[]>(),
  ]);
  const byId = new Map(quotes.map((q) => [q.productId, q]));
  const seen = new Set<string>();
  const rows: QuoteProductView[] = sold.map((s) => {
    seen.add(s._id);
    const q = byId.get(s._id);
    const rounds = toRounds(q);
    return {
      productId: s._id,
      title: q?.title || s.title || s._id,
      units: s.units,
      recentUnits: s.recent,
      lastSale: s.last ? new Date(s.last).toISOString() : null,
      shopifyCogs: s.cost ?? 0,
      link: q?.link ?? "",
      currency: q?.currency ?? "EUR",
      originalCogs: q?.originalCogs ?? null,
      currentCogs: q?.currentCogs ?? null,
      confirmed: !!q?.confirmed,
      notes: q?.notes ?? "",
      rounds,
      status: quoteStatus(s.units, rounds, !!q?.confirmed),
    };
  });
  for (const q of quotes) {
    if (seen.has(q.productId)) continue;
    const rounds = toRounds(q);
    rows.push({
      productId: q.productId, title: q.title, units: 0, recentUnits: 0, lastSale: null,
      shopifyCogs: 0, link: q.link ?? "", currency: q.currency ?? "EUR",
      originalCogs: q.originalCogs ?? null, currentCogs: q.currentCogs ?? null,
      confirmed: !!q.confirmed, notes: q.notes ?? "", rounds,
      status: quoteStatus(0, rounds, !!q.confirmed),
    });
  }
  return rows.sort((a, b) => b.units - a.units);
}
