import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { roleRank } from "@/lib/rbac";
import { loadCsData } from "@/lib/cs-data";
import { loadQuotes } from "@/lib/cs-quote-data";
import { loadCogsChanges } from "@/lib/cs-cogs-data";
import { loadShipments } from "@/lib/cs-shipment-data";
import { loadInvoices } from "@/lib/cs-invoice-data";
import { loadCsPending } from "@/lib/cs-pending";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { CsMiaCoverage } from "@/models/CsMiaCoverage";
import { AtendimentoClient } from "./atendimento-client";

export const metadata: Metadata = { title: "Atendimento · Operação" };

export default async function AtendimentoPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string; tab?: string }>;
}) {
  const { store, tab } = await searchParams;
  const user = await getCurrentUser();
  if (!user?.workspaceId) redirect("/login");
  const [data, quotes, cogsChanges, shipments, invoices, pending] = await Promise.all([
    loadCsData(user.workspaceId),
    loadQuotes(user, store),
    loadCogsChanges(user, store),
    loadShipments(user.workspaceId),
    loadInvoices(user.workspaceId),
    loadCsPending(user),
  ]);
  await connectToDatabase();
  const cov = await CsMiaCoverage.findOne({ workspaceId: new mongoose.Types.ObjectId(user.workspaceId) }).lean<{ coveredUntil: Date | null; updatedAt?: Date } | null>();
  const miaCoverage = { until: cov?.coveredUntil ? cov.coveredUntil.toISOString() : null, importedAt: cov?.updatedAt ? cov.updatedAt.toISOString() : null };
  const canEdit = roleRank(user.role) >= roleRank("editor");
  return <AtendimentoClient data={data} quotes={quotes} cogsChanges={cogsChanges} shipments={shipments} invoices={invoices} attentionTabs={[...new Set(pending.map((i) => i.tab))]} canEdit={canEdit} initialTab={tab} miaCoverage={miaCoverage} />;
}
