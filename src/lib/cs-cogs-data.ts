import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { activeStoreQueryForUser } from "@/lib/store-scope";
import { Order } from "@/models/Order";
import { Store } from "@/models/Store";
import { CogsHistory } from "@/models/CogsHistory";
import { CsQuote, type CsQuoteDoc } from "@/models/CsQuote";
import { ProductCatalog } from "@/models/ProductCatalog";

export type CogsChangeView = {
  productId: string;
  storeName: string;
  title: string;
  link: string;
  currency: string;
  units: number;
  /** COGS registado na app e desde quando. */
  registered: number | null;
  registeredAt: string | null;
  /** COGS anterior ao registado (se a app o alterou). */
  previous: number | null;
  previousAt: string | null;
  /** Último preço visto no PrimeFlow ou numa fatura. */
  observed: number | null;
  observedAt: string | null;
  /** Preço novo e antigo usados para comparar. */
  from: number;
  to: number;
  changedAt: string;
  increase: boolean;
  review: { status: "perguntado" | "aceite"; at: string } | null;
  /** Precisa de ação do Emanuel: aumento ainda não perguntado nem aceite. */
  alert: boolean;
};

const EPS = 0.004;
const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);

/** Produtos (com qualquer número de vendas) cujo preço pago difere do COGS registado, ou cujo COGS registado mudou. */
export async function loadCogsChanges(
  user: Pick<CurrentUser, "workspaceId" | "storeAccess">,
  storeId?: string | null,
): Promise<CogsChangeView[]> {
  await connectToDatabase();
  const wid = new mongoose.Types.ObjectId(user.workspaceId);
  const storeQuery = activeStoreQueryForUser(user);
  if (storeId && mongoose.isValidObjectId(storeId)) storeQuery._id = new mongoose.Types.ObjectId(storeId);
  const stores = await Store.find(storeQuery)
    .select("name displayUrl shopDomain")
    .lean<{ _id: mongoose.Types.ObjectId; name: string; displayUrl?: string; shopDomain?: string }[]>();
  const storeIds = stores.map((s) => s._id);
  if (storeIds.length === 0) return [];
  const sold = await Order.aggregate<{ _id: string; storeId: mongoose.Types.ObjectId; title: string; units: number; cost: number }>([
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
        cost: { $last: "$lineItems.unitCost" },
      },
    },
  ]);
  const productIds = sold.map((s) => s._id);
  const [quotes, costs, catalog] = await Promise.all([
    CsQuote.find({ workspaceId: wid, deletedAt: null, productId: { $in: productIds } }).lean<CsQuoteDoc[]>(),
    CogsHistory.find({ storeId: { $in: storeIds }, productId: { $in: productIds } })
      .sort({ effectiveFrom: 1 })
      .select("productId cost effectiveFrom")
      .lean<{ productId: string; cost: number; effectiveFrom: Date }[]>(),
    ProductCatalog.find({ storeId: { $in: storeIds }, productId: { $in: productIds } })
      .select("productId handle")
      .lean<{ productId: string; handle?: string | null }[]>(),
  ]);
  const quoteBy = new Map(quotes.map((q) => [q.productId, q]));
  const handleBy = new Map(catalog.filter((c) => c.handle).map((c) => [c.productId, c.handle as string]));
  const host = new Map(
    stores.map((s) => [String(s._id), (s.displayUrl || s.shopDomain || "").replace(/^https?:\/\//, "").replace(/\/+$/, "")]),
  );
  const storeName = new Map(stores.map((s) => [String(s._id), s.name]));
  const histBy = new Map<string, { cost: number; from: Date }[]>();
  for (const c of costs) {
    const list = histBy.get(c.productId) ?? [];
    const prev = list[list.length - 1];
    if (!prev || Math.abs(prev.cost - c.cost) > EPS) list.push({ cost: c.cost, from: new Date(c.effectiveFrom) });
    histBy.set(c.productId, list);
  }

  const out: CogsChangeView[] = [];
  for (const s of sold) {
    const q = quoteBy.get(s._id);
    const hist = histBy.get(s._id) ?? [];
    const last = hist[hist.length - 1] ?? null;
    const before = hist.length > 1 ? hist[hist.length - 2] : null;
    const registered = last?.cost ?? q?.currentCogs ?? (s.cost || null);
    const obs = q?.observed?.length ? q.observed[q.observed.length - 1] : null;
    const obsDiffers = !!obs && registered != null && Math.abs(obs.price - registered) > EPS;
    if (!obsDiffers && !before) continue;
    const from = obsDiffers ? (registered as number) : (before as { cost: number }).cost;
    const to = obsDiffers ? (obs as { price: number }).price : (registered as number);
    const changedAt = obsDiffers ? new Date((obs as { at: Date }).at) : (last as { from: Date }).from;
    const increase = to > from + EPS;
    const rev = q?.cogsReview ?? null;
    const reviewed = !!rev && new Date(rev.at) >= changedAt && (!obsDiffers || rev.price == null || Math.abs(rev.price - to) < EPS);
    const sid = String(s.storeId);
    const handle = handleBy.get(s._id);
    out.push({
      productId: s._id,
      storeName: storeName.get(sid) ?? "—",
      title: q?.title || s.title || s._id,
      link: q?.link || (handle && host.get(sid) ? `https://${host.get(sid)}/products/${handle}` : ""),
      currency: q?.currency ?? "EUR",
      units: s.units,
      registered,
      registeredAt: iso(last?.from),
      previous: before?.cost ?? null,
      previousAt: iso(before?.from),
      observed: obs ? obs.price : null,
      observedAt: iso(obs?.at),
      from,
      to,
      changedAt: changedAt.toISOString(),
      increase,
      review: rev && reviewed ? { status: rev.status as "perguntado" | "aceite", at: new Date(rev.at).toISOString() } : null,
      alert: increase && !reviewed,
    });
  }
  return out.sort((a, b) => Number(b.alert) - Number(a.alert) || b.changedAt.localeCompare(a.changedAt));
}
