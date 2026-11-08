import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { roleRank } from "@/lib/rbac";
import { loadCsData } from "@/lib/cs-data";
import { loadQuotes } from "@/lib/cs-quote-data";
import { loadShipments } from "@/lib/cs-shipment-data";
import { loadInvoices } from "@/lib/cs-invoice-data";
import { loadCsPending } from "@/lib/cs-pending";
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
  const [data, quotes, shipments, invoices, pending] = await Promise.all([
    loadCsData(user.workspaceId),
    loadQuotes(user, store),
    loadShipments(user.workspaceId),
    loadInvoices(user.workspaceId),
    loadCsPending(user),
  ]);
  const canEdit = roleRank(user.role) >= roleRank("editor");
  return <AtendimentoClient data={data} quotes={quotes} shipments={shipments} invoices={invoices} attentionTabs={[...new Set(pending.map((i) => i.tab))]} canEdit={canEdit} initialTab={tab} />;
}
