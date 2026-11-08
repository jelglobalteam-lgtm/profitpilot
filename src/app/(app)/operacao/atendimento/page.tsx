import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { roleRank } from "@/lib/rbac";
import { loadCsData } from "@/lib/cs-data";
import { loadQuotes } from "@/lib/cs-quote-data";
import { loadShipments } from "@/lib/cs-shipment-data";
import { AtendimentoClient } from "./atendimento-client";

export const metadata: Metadata = { title: "Atendimento · Operação" };

export default async function AtendimentoPage() {
  const user = await getCurrentUser();
  if (!user?.workspaceId) redirect("/login");
  const [data, quotes, shipments] = await Promise.all([
    loadCsData(user.workspaceId),
    loadQuotes(user.workspaceId),
    loadShipments(user.workspaceId),
  ]);
  const canEdit = roleRank(user.role) >= roleRank("editor");
  return <AtendimentoClient data={data} quotes={quotes} shipments={shipments} canEdit={canEdit} />;
}
