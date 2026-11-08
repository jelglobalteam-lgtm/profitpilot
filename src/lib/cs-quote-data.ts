import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { activeStoreQueryForUser } from "@/lib/store-scope";
import { Order } from "@/models/Order";
import { Store } from "@/models/Store";
import { CogsHistory } from "@/models/CogsHistory";
import { CsQuote, type CsQuoteDoc } from "@/models/CsQuote";
import { quoteStatus, type QuoteResponse, type QuoteRoundView, type QuoteStatus } from "@/lib/cs-quotes";

export type QuoteProductView = {
  productId: string;
  storeName: string;
  title: string;
  units: number;
  recentUnits: number;
  lastSale: string | null;
  link: string;
  currency: string;
  originalCogs: number | null;
  currentCogs: number | null;
  /** Data em que o COGS mudou pela última vez (histórico da app). */
  cogsChangedAt: string | null;
  observedPrice: number | null;
  observedAt: string | null;
  /** Preço diferente do último acordado, sem pedido registado. */
  changedWithoutRequest: boolean;
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

type CostPoint = { cost: number; from: Date };

/** Unidades vendidas por produto (encomendas não canceladas) das lojas visíveis, com histórico de COGS e de cotações. */
export async function loadQuotes(
  user: Pick<CurrentUser, "workspaceId" | "storeAccess">,
  storeId?: string | null,
): Promise<QuoteProductView[]> {
  await connectToDatabase();
  const wid = new mongoose.Types.ObjectId(user.workspaceId);
  const storeQuery = activeStoreQueryForUser(user);
  if (storeId && mongoose.isValidObjectId(storeId)) storeQuery._id = new mongoose.Types.ObjectId(storeId);
  const stores = await Store.find(storeQuery).select("name").lean<{ _id: mongoose.Types.ObjectId; name: string }[]>();
  const storeIds = stores.map((s) => s._id);
  const storeName = new Map(stores.map((s) => [String(s._id), s.name]));
  if (storeIds.length === 0) return [];
  const since = new Date(Date.now() - 30 * DAY_MS);

  const sold = await Order.aggregate<{
    _id: string;
    storeId: mongoose.Types.ObjectId;
    title: string;
    units: number;
    recent: number;
    last: Date;
    cost: number;
  }>([
    { $match: { workspaceId: wid, storeId: { $in: storeIds }, cancelledAt: null } },
    { $unwind: "$lineItems" },
    { $match: { "lineItems.productId": { $nin: [null, ""] } } },
    { $sort: { orderDate: 1 } },
    {
      $group: {
        _id: "$lineItems.productId",
        storeId: { $last: "$storeId" },
        title: { $last: "$lineItems.title" },
        units: { $sum: "$lineItems.quantity" },
        recent: { $sum: { $cond: [{ $gte: ["$orderDate", since] }, "$lineItems.quantity", 0] } },
        last: { $max: "$orderDate" },
        cost: { $last: "$lineItems.unitCost" },
      },
    },
    { $match: { units: { $gte: 5 } } },
  ]);

  const productIds = sold.map((s) => s._id);
  const [quotes, costs] = await Promise.all([
    CsQuote.find({ workspaceId: wid, deletedAt: null }).lean<CsQuoteDoc[]>(),
    CogsHistory.find({ storeId: { $in: storeIds }, productId: { $in: productIds } })
      .sort({ effectiveFrom: 1 })
      .select("productId cost effectiveFrom")
      .lean<{ productId: string; cost: number; effectiveFrom: Date }[]>(),
  ]);
  const costsBy = new Map<string, CostPoint[]>();
  for (const c of costs) {
    const list = costsBy.get(c.productId) ?? [];
    const prev = list[list.length - 1];
    if (!prev || Math.abs(prev.cost - c.cost) > 0.004) list.push({ cost: c.cost, from: new Date(c.effectiveFrom) });
    costsBy.set(c.productId, list);
  }

  const byId = new Map(quotes.map((q) => [q.productId, q]));
  return sold
    .map((s): QuoteProductView => {
      const q = byId.get(s._id);
      const rounds = toRounds(q);
      const hist = costsBy.get(s._id) ?? [];
      const changed = hist.length > 1 ? hist[hist.length - 1] : null;
      const current = q?.currentCogs ?? hist[hist.length - 1]?.cost ?? (s.cost || null);
      const original = q?.originalCogs ?? hist[0]?.cost ?? (s.cost || null);
      const obs = q?.observed?.length ? q.observed[q.observed.length - 1] : null;
      const lastRound = rounds[rounds.length - 1];
      const lastTouch = lastRound ? new Date(lastRound.repliedAt ?? lastRound.requestedAt) : null;
      const cogsMovedAlone = !!changed && (!lastTouch || changed.from > lastTouch);
      const observedDiffers = !!obs && current != null && Math.abs(obs.price - current) > 0.004;
      return {
        productId: s._id,
        storeName: storeName.get(String(s.storeId)) ?? "—",
        title: q?.title || s.title || s._id,
        units: s.units,
        recentUnits: s.recent,
        lastSale: s.last ? new Date(s.last).toISOString() : null,
        link: q?.link ?? "",
        currency: q?.currency ?? "EUR",
        originalCogs: original,
        currentCogs: current,
        cogsChangedAt: changed ? changed.from.toISOString() : null,
        observedPrice: obs ? obs.price : null,
        observedAt: obs ? new Date(obs.at).toISOString() : null,
        changedWithoutRequest: cogsMovedAlone || observedDiffers,
        confirmed: !!q?.confirmed,
        notes: q?.notes ?? "",
        rounds,
        status: quoteStatus(s.units, rounds, !!q?.confirmed),
      };
    })
    .sort((a, b) => b.units - a.units);
}
