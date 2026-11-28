"use client";

import { confirmationText } from "@/lib/cs-compensation";
import { miaBatchMessage } from "@/lib/cs-quotes";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { PageTabs } from "@/components/page-tabs";
import { cn } from "@/lib/utils";
import {
  CS_ISSUE_LABEL,
  CS_STATUSES,
  CS_STATUS_LABEL,
  CS_STORES,
  CS_STORE_LABEL,
  ageTone,
  type CsCaseView,
  type CsMiaMessageView,
  type CsStatus,
  type CsStoreKey,
  type CsTemplateView,
} from "@/lib/cs-types";
import type { CsData } from "@/lib/cs-data";
import type { QuoteProductView } from "@/lib/cs-quote-data";
import { AttentionBang } from "@/components/attention-bang";
import { PricesTab } from "./prices-tab";
import type { CogsChangeView } from "@/lib/cs-cogs-data";
import { ShipmentsTab } from "./shipments-tab";
import { InvoicesTab } from "./invoices-tab";
import { MiaSendGuard, useConfirmMiaSend, type MiaCoverageView } from "./mia-send-guard";
import type { InvoiceData } from "@/lib/cs-invoice-data";
import { shipmentAlert, type ShipmentView } from "@/lib/parcelpanel-csv";
import { CS_PHASES, CS_RULES, computeCsAlerts, type CsAlertLevel } from "@/lib/cs-rules";
import {
  importMiaChatAction,
  sendMiaBatchAction,
  closeCsCaseAction,
  decideCsCaseAction,
  saveCsTemplateAction,
  setCsTemplateAutoAction,
} from "./actions";

const TONE_CLASS = {
  verde: "bg-positive/10 text-positive",
  amarelo: "bg-warning/10 text-warning",
  vermelho: "bg-negative/10 text-negative",
} as const;

function Pill({ tone, children }: { tone: keyof typeof TONE_CLASS; children: React.ReactNode }) {
  return (
    <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", TONE_CLASS[tone])}>
      {children}
    </span>
  );
}

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r.error) setError(r.error);
      else router.refresh();
    });
  }
  return { run, pending, error };
}

export function AtendimentoClient({ data, quotes, cogsChanges, shipments, invoices, attentionTabs, canEdit, initialTab, miaCoverage }: { data: CsData; quotes: QuoteProductView[]; cogsChanges: CogsChangeView[]; shipments: ShipmentView[]; invoices: InvoiceData; attentionTabs: string[]; canEdit: boolean; initialTab?: string; miaCoverage: MiaCoverageView }) {
  const [tab, setTab] = useState(
    ["casos", "templates", "mia", "produtos", "precos", "envios", "faturas", "prazos", "geral"].includes(initialTab ?? "") ? (initialTab as string) : "casos",
  );
  // Ao carregar na faixa de pendentes já dentro do Atendimento, o endereço muda (?tab=) mas o componente mantém-se: seguir o separador pedido.
  useEffect(() => {
    if (initialTab && ["casos", "templates", "mia", "produtos", "precos", "envios", "faturas", "prazos", "geral"].includes(initialTab)) setTab(initialTab);
  }, [initialTab]);
  const open = data.cases.filter((c) => c.status !== "resolvido" && c.status !== "respondido");
  const alerts = useMemo(() => computeCsAlerts(data.cases, data.mia), [data.cases, data.mia]);
  const pill = (n: number) =>
    n ? (
      <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{n}</span>
    ) : undefined;
  const bang = (id: string, extra?: boolean) =>
    attentionTabs.includes(id) || extra ? <AttentionBang /> : undefined;
  const withBang = (id: string, badge: React.ReactNode, extra?: boolean) => (
    <>
      {badge}
      {bang(id, extra)}
    </>
  );
  const lastRead = data.cases.reduce((m, c) => (c.createdAt > m ? c.createdAt : m), "");
  const lastReadLabel = lastRead
    ? new Date(lastRead).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "sem registo";
  return (
    <MiaSendGuard coverage={miaCoverage}>
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Atendimento</h1>
        <p className="text-xs text-muted-foreground">Emails lidos pela última vez: {lastReadLabel}</p>
      </div>
      <PageTabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "casos", label: "Casos", badge: withBang("casos", pill(open.length)) },
          { id: "templates", label: "Templates", badge: pill(data.templates.filter((t) => t.approvedClean >= AUTONOMY_THRESHOLD && !t.autoSend && !t.alwaysManual).length) },
          { id: "mia", label: "Mia", badge: bang("mia") },
          { id: "produtos", label: "Produtos" },
          { id: "precos", label: "Preços", badge: withBang("precos", pill(quotes.filter((q) => q.status === "por_pedir").length)) },
          { id: "envios", label: "Envios", badge: withBang("envios", pill(shipments.filter((s) => shipmentAlert({ status: s.status, lastEventAt: s.lastEventAt ? new Date(s.lastEventAt) : null, orderedAt: s.orderedAt ? new Date(s.orderedAt) : null })).length)) },
          { id: "faturas", label: "Faturas", badge: withBang("faturas", pill(invoices.issues.filter((i) => i.level === "alto").length)) },
          { id: "prazos", label: "Prazos e alertas", badge: withBang("prazos", pill(alerts.length), alerts.some((a) => a.level === "critico")) },
          { id: "geral", label: "Visão geral" },
        ]}
      />
      {tab === "casos" && <CasesTab cases={data.cases} mia={data.mia} canEdit={canEdit} />}
      {tab === "templates" && <TemplatesTab templates={data.templates} canEdit={canEdit} />}
      {tab === "mia" && <MiaTab messages={data.mia} canEdit={canEdit} />}
      {tab === "produtos" && <ProductsTab cases={data.cases} />}
      {tab === "precos" && <PricesTab products={quotes} cogsChanges={cogsChanges} canEdit={canEdit} />}
      {tab === "envios" && <ShipmentsTab shipments={shipments} canEdit={canEdit} />}
      {tab === "faturas" && <InvoicesTab data={invoices} canEdit={canEdit} />}
      {tab === "prazos" && <DeadlinesTab alerts={alerts} />}
      {tab === "geral" && <OverviewTab cases={data.cases} />}
    </div>
    </MiaSendGuard>
  );
}

/* ---------------------------------- Casos --------------------------------- */

type CaseGroup = CsStatus | "aprovado" | "rejeitado" | "pendente" | "moradas";

const GROUPS: { key: CaseGroup; label: string }[] = [
  { key: "pendente", label: "Pendentes de si" },
  { key: "moradas", label: "Moradas" },
  { key: "para_aprovar", label: CS_STATUS_LABEL.para_aprovar },
  { key: "aprovado", label: "Aprovados, a enviar" },
  { key: "rejeitado", label: "Rejeitados, a rever" },
  ...CS_STATUSES.filter((s) => s !== "para_aprovar").map((s) => ({ key: s as CaseGroup, label: CS_STATUS_LABEL[s] })),
];

/** Grupos que esperam uma ação do Emanuel. */
const YOURS = new Set<CaseGroup>(["pendente", "para_aprovar", "escalar", "reembolso"]);

/** Um caso com decisão do Emanuel mas ainda por tratar deixa de contar como "para aprovar". */
function groupOf(c: CsCaseView): CaseGroup {
  const decidable = c.status === "para_aprovar" || c.status === "reembolso";
  if (decidable && (c.decision === "aprovado" || c.decision === "aprovado_com_edicao")) {
    return "aprovado";
  }
  if (decidable && c.decision === "rejeitado") return "rejeitado";
  return c.status;
}

/** Pedidos de confirmação ou alteração de morada ainda em aberto (a corrigir antes do envio). */
function isAddress(c: CsCaseView): boolean {
  return c.issueType === "alteracao_morada" && c.status !== "resolvido" && c.status !== "respondido";
}

/** Casos que esperam uma ação do Emanuel: para aprovar, escalados, reembolsos e moradas por ajustar na PrimeFlow. */
function isPending(c: CsCaseView): boolean {
  const g = groupOf(c);
  return g === "para_aprovar" || g === "escalar" || g === "reembolso" || isAddress(c);
}

function CasesTab({ cases, mia, canEdit }: { cases: CsCaseView[]; mia: CsMiaMessageView[]; canEdit: boolean }) {
  const [status, setStatus] = useState<CaseGroup>("pendente");
  const [store, setStore] = useState<CsStoreKey | "all">("all");
  const [selected, setSelected] = useState<string | null>(null);

  const counts = useMemo(() => {
    const m = new Map<CaseGroup, number>();
    for (const c of cases) {
      m.set(groupOf(c), (m.get(groupOf(c)) ?? 0) + 1);
      if (isPending(c)) m.set("pendente", (m.get("pendente") ?? 0) + 1);
      if (isAddress(c)) m.set("moradas", (m.get("moradas") ?? 0) + 1);
    }
    return m;
  }, [cases]);

  const list = cases.filter(
    (c) => (status === "pendente" ? isPending(c) : status === "moradas" ? isAddress(c) : groupOf(c) === status) && (store === "all" || c.store === store),
  );
  const current = cases.find((c) => c.id === selected) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {GROUPS.map(({ key: s, label }) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setStatus(s);
              setSelected(null);
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium",
              status === s
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {label} <span className="tabular-nums">({counts.get(s) ?? 0})</span>
            {YOURS.has(s) && (counts.get(s) ?? 0) > 0 && <AttentionBang title="Precisa da sua decisão" />}
          </button>
        ))}
      </div>
      <select
        value={store}
        onChange={(e) => setStore(e.target.value as CsStoreKey | "all")}
        className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
      >
        <option value="all">Todas as lojas</option>
        {CS_STORES.map((s) => (
          <option key={s} value={s}>
            {CS_STORE_LABEL[s]}
          </option>
        ))}
      </select>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-2">
          {list.length === 0 && (
            <p className="rounded-lg border border-border bg-surface p-4 text-sm text-muted-foreground">
              Sem casos neste estado.
            </p>
          )}
          {list.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelected(c.id)}
              className={cn(
                "w-full rounded-lg border bg-surface p-3 text-left",
                selected === c.id ? "border-accent" : "border-border hover:bg-muted",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">
                  {c.customerName || c.customerEmail || "Sem nome"}
                </span>
                <Pill tone={c.classification}>{c.classification}</Pill>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {CS_STORE_LABEL[c.store]} · {c.orderNumber || "sem encomenda"} · {CS_ISSUE_LABEL[c.issueType]}
              </p>
              <p className="mt-1 text-xs">
                <Pill tone={ageTone(c.ageDays)}>{c.ageDays} d em aberto</Pill>
              </p>
            </button>
          ))}
        </div>
        <div>
          {current ? (
            <CaseCard key={current.id} c={current} mia={mia.filter((m) => m.caseId === current.id)} canEdit={canEdit} />
          ) : (
            <p className="rounded-lg border border-border bg-surface p-4 text-sm text-muted-foreground">
              Selecione um caso para ver o resumo e a resposta proposta.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
      <div className="mt-0.5 whitespace-pre-wrap text-sm">{children || "—"}</div>
    </div>
  );
}


type TlRole = "cliente" | "nos" | "decisao" | "sistema";

function classifyTimeline(summary: string): TlRole {
  const t = summary.trim();
  if (/^(\d+\.[ºª]\s+)?(resposta\s+(aprovada\s+)?enviada|resposta nossa|pedido enviado)/i.test(t)) return "nos";
  if (/^\d+\.[ªº]\s+resposta\s+aprovada/i.test(t)) return "nos";
  if (/^(aprovado|rejeitado|escalado)/i.test(t)) return "decisao";
  if (/^(\d+\.[ºª]\s+)?(email|formul[aá]rio|cliente|novo email)/i.test(t)) return "cliente";
  return "sistema";
}

function splitSummary(summary: string): { meta: string; body: string } {
  const i = summary.indexOf(": ");
  if (i > 0 && i < 80) return { meta: summary.slice(0, i), body: summary.slice(i + 2) };
  return { meta: "", body: summary };
}

const ROLE_LABEL: Record<TlRole, string> = {
  cliente: "Cliente",
  nos: "Nós (enviado)",
  decisao: "Decisão",
  sistema: "Rotina",
};

function Bubble({ role, meta, body, at, title }: { role: TlRole | "proposta"; meta?: string; body: string; at?: string | null; title?: string }) {
  const label = title ?? (role === "proposta" ? "Resposta proposta (por aprovar)" : ROLE_LABEL[role]);
  const side = role === "cliente" ? "mr-auto" : role === "nos" || role === "proposta" ? "ml-auto" : "mx-auto";
  const tone =
    role === "cliente"
      ? "border-border bg-muted/40"
      : role === "nos"
        ? "border-accent/40 bg-accent/15"
        : role === "proposta"
          ? "border-dashed border-accent bg-accent/5"
          : role === "decisao"
            ? "border-warning/60 bg-warning/10"
            : "border-border bg-transparent text-muted-foreground";
  const when = at ? new Date(at).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <div className={`${side} max-w-[92%] rounded-lg border p-2.5 text-sm ${tone}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
        {label}
        {when ? ` · ${when}` : ""}
      </p>
      {meta ? <p className="mt-0.5 text-xs opacity-70">{meta}</p> : null}
      <p className="mt-1 whitespace-pre-wrap">{body}</p>
    </div>
  );
}

function Latest({ c }: { c: CsCaseView }) {
  const open = c.status === "para_aprovar" || c.status === "reembolso" || c.status === "escalar";
  const title = open ? "Resposta proposta (por aprovar)" : "Última resposta guardada (já tratada)";
  if (!c.lastCustomerEmailPt && !c.proposedReplyPt && c.images.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {c.lastCustomerEmailPt ? <Bubble role="cliente" meta="Último email do cliente (PT)" body={c.lastCustomerEmailPt} /> : null}
      {c.images.length > 0 && (
        <div className="mr-auto max-w-[92%] rounded-lg border border-border bg-muted/40 p-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">Fotografias do cliente ({c.images.length})</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {c.images.map((im) => (
              <a key={im.id} href={`/api/cs-images/${im.id}`} target="_blank" rel="noreferrer" title={im.name}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/cs-images/${im.id}`} alt={im.name || "Fotografia do cliente"} className="h-36 w-auto max-w-[240px] rounded-md border border-border object-cover" />
              </a>
            ))}
          </div>
        </div>
      )}
      {c.proposedReplyPt ? <Bubble role="proposta" title={title} body={c.proposedReplyPt} /> : null}
    </div>
  );
}

function fmtWhen(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
}

/** Ponto de situação de um pedido de alteração de morada: PrimeFlow e Mia. */
function AddressStatus({ c, mia }: { c: CsCaseView; mia: CsMiaMessageView[] }) {
  const adj = c.addressAdjusted?.done ? c.addressAdjusted : null;
  const sorted = [...mia].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const last = sorted[0];
  let primeTone = "border-warning/60 bg-warning/10";
  let prime = "Ainda não alterada na PrimeFlow.";
  if (adj) {
    primeTone = "border-accent/40 bg-accent/10";
    prime = `Alterada na PrimeFlow${adj.at ? ` a ${fmtWhen(adj.at)}` : ""}${adj.orderName ? ` (${adj.orderName})` : ""}: ${adj.address}.`;
  }
  let miaTone = "border-border";
  let miaText = adj ? "Pedido à Mia não necessário, a morada já foi alterada." : "Sem pedido à Mia preparado.";
  if (last) {
    if (last.status === "respondida") {
      miaTone = "border-accent/40 bg-accent/10";
      miaText = `Mia respondeu${last.reply ? `: ${last.reply}` : "."}`;
    } else if (last.status === "enviada") {
      miaTone = "border-warning/60 bg-warning/10";
      miaText = `Pedido enviado à Mia a ${fmtWhen(last.updatedAt)}, sem resposta registada.`;
    } else if (adj) {
      miaText = "Rascunho para a Mia por enviar, mas já não é preciso (morada alterada na PrimeFlow).";
    } else {
      miaTone = "border-warning/60 bg-warning/10";
      miaText = "Pedido à Mia preparado, ainda por enviar. Copie-o na secção Mia.";
    }
  } else if (!adj) {
    miaTone = "border-warning/60 bg-warning/10";
  }
  const miaConfirmed = last?.status === "respondida";
  const mustInform = !!adj || miaConfirmed;
  const informed = !!adj?.customerNotifiedAt;
  let clientTone = "border-border";
  let clientText = "Cliente: ainda sem alteração a comunicar.";
  if (mustInform && informed) {
    clientTone = "border-accent/40 bg-accent/10";
    clientText = `Cliente: já avisado da alteração a ${fmtWhen(adj?.customerNotifiedAt)}.`;
  } else if (mustInform) {
    clientTone = "border-warning/60 bg-warning/10";
    clientText = "Cliente: falta avisar que a morada foi atualizada. O cliente não vai escrever outra vez, por isso a rotina prepara a confirmação e fica em Para aprovar.";
  }
  const nextStep = adj
    ? informed
      ? "Tratado: nada a fazer."
      : "Nada a fazer na PrimeFlow (já alterada pela rotina). Só falta aprovar a confirmação ao cliente."
    : last?.status === "enviada"
      ? "À espera da resposta da Mia."
      : last?.status === "rascunho"
        ? "Envie o pedido à Mia (secção Mia)."
        : "A rotina ainda não tratou a morada.";
  return (
    <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
      <p className="text-[13px] font-medium">Ponto de situação da morada</p>
      <p className="text-xs text-muted-foreground">{nextStep}</p>
      <p className={`rounded-md border p-2 ${primeTone}`}><span className="font-medium">PrimeFlow:</span> {prime}</p>
      <p className={`rounded-md border p-2 ${miaTone}`}><span className="font-medium">Mia:</span> {miaText}</p>
      <p className={`rounded-md border p-2 ${clientTone}`}>{clientText}</p>
    </div>
  );
}

function Conversation({ c }: { c: CsCaseView }) {
  const items = [...c.timeline].sort((a, b) => (a.n || 999) - (b.n || 999) || 0);
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-[13px] font-medium text-muted-foreground">Conversa ({items.length})</p>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span>Cliente à esquerda</span>
        <span>Nós à direita</span>
        <span>Notas da rotina e decisões ao centro</span>
      </div>
      <div className="mt-2 flex flex-col gap-2">
        {items.map((t, i) => {
          const role = classifyTimeline(t.summary);
          const { meta, body } = splitSummary(t.summary);
          return <Bubble key={i} role={role} meta={meta} body={body} at={t.at} />;
        })}
      </div>
    </div>
  );
}

function CaseCard({ c, mia, canEdit }: { c: CsCaseView; mia: CsMiaMessageView[]; canEdit: boolean }) {
  const { run, pending, error } = useRun();
  const [dialog, setDialog] = useState<"rejeitado" | "escalado" | null>(null);
  const [reason, setReason] = useState("");
  const [reply, setReply] = useState(c.proposedReply);
  const [decisionText, setDecisionText] = useState("");
  const [confirming, setConfirming] = useState(false);
  const comp = c.compensation;
  const needsConfirm = comp?.status === "proposta";
  const edited = reply !== c.proposedReply;
  const approve = (confirmCompensation: boolean) =>
    run(() =>
      decideCsCaseAction({
        caseId: c.id,
        decision: edited ? "aprovado_com_edicao" : "aprovado",
        note: decisionText.trim() || c.managerNote,
        editedReply: edited ? reply : undefined,
        confirmCompensation,
      }),
    );
  const refundLocked = c.status === "reembolso" || c.classification === "vermelho";
  const canDecide = (c.status === "para_aprovar" || c.status === "reembolso" || c.status === "escalar") && groupOf(c) !== "aprovado";
  const showAddressButton = isAddress(c) && !c.addressAdjusted?.done;

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{c.customerName || c.customerEmail}</h2>
        <Pill tone={c.classification}>{c.classification}</Pill>
        <span className="text-xs text-muted-foreground">
          {CS_STORE_LABEL[c.store]} · {c.language}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        {c.orderNumber} · {c.items}
      </p>
      {c.decisionQuestion && (
        <div className="space-y-2 rounded-lg border border-warning/60 bg-warning/10 p-3">
          <p className="text-[13px] font-medium">Preciso da sua decisão</p>
          <p className="whitespace-pre-wrap text-sm">{c.decisionQuestion}</p>
          <textarea
            value={decisionText}
            onChange={(e) => setDecisionText(e.target.value)}
            disabled={!canEdit}
            rows={3}
            placeholder="A sua decisão (fica registada e eu ajusto a resposta)"
            className="w-full rounded-lg border border-border bg-background p-2 text-sm"
          />
        </div>
      )}
      {c.pfDispute && c.pfDispute.status !== "resolvida" && (
        <div className="rounded-lg border border-warning/60 bg-warning/10 p-3 text-sm">
          <p className="font-medium">Disputa pendente do nosso lado no PrimeFlow ({c.pfDispute.status.replace(/_/g, " ")})</p>
          {c.pfDispute.supplierReply && (
            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
              Resposta do fornecedor ({c.pfDispute.inOurInterest === false ? "não nos serve" : c.pfDispute.inOurInterest ? "serve-nos" : "por avaliar"}): {c.pfDispute.supplierReply}
            </p>
          )}
        </div>
      )}
      {comp && (
        <div className="rounded-lg border border-border p-3 text-sm">
          <p className="font-medium">
            {comp.kind === "cancelamento" ? "Cancelamento com reembolso total" : comp.kind === "credito" ? "Crédito de loja" : "Reembolso parcial"}: {comp.percent}% ({comp.amount.toLocaleString("pt-PT", { style: "currency", currency: "EUR" })})
          </p>
          <p className="text-muted-foreground">
            {comp.status === "proposta" && "Por confirmar: só é executado depois de aprovar e confirmar."}
            {comp.status === "confirmada" && "Confirmado: a rotina executa no Shopify na próxima execução."}
            {comp.status === "em_execucao" && "A executar."}
            {comp.status === "executada" && `Executado${comp.transactionId ? ` (${comp.transactionId})` : ""}.`}
            {comp.status === "falhada" && `Falhou: ${comp.error || "ver cronologia"}. Trate manualmente.`}
          </p>
        </div>
      )}
      {c.issueType === "alteracao_morada" && <AddressStatus c={c} mia={mia} />}
      <Latest c={c} />

      <details className="rounded-lg border border-border p-3 text-sm">
        <summary className="cursor-pointer font-medium text-muted-foreground">Ver mais</summary>
        <div className="mt-3 space-y-3">
          <Conversation c={c} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email">{c.customerEmail}</Field>
            <Field label="Valor">{c.orderValue}</Field>
            <Field label="Estado e rastreio">{c.trackingStatus}</Field>
            <Field label="Template">{c.templateLabel}</Field>
          </div>
          <Field label="Nota do Claude">{c.managerNote}</Field>
          <Field label="Ofertas feitas e recusadas">{c.offered}</Field>
          <Field label="O que o cliente pede agora">{c.requests}</Field>
          <div>
            <p className="text-[13px] font-medium text-muted-foreground">Email original ({c.language})</p>
            <p className="mt-1 whitespace-pre-wrap">{c.lastCustomerEmailOriginal}</p>
          </div>
          <div>
            <p className="text-[13px] font-medium text-muted-foreground">
              Resposta proposta ({c.language}), editável
            </p>
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              disabled={!canEdit}
              rows={8}
              className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm"
            />
          </div>
        </div>
      </details>

      {refundLocked && (
        <p className="text-xs text-warning">
          Reembolsos e casos vermelhos são sempre decididos por si. Sem compensação confirmada, aprovar não executa nada no Shopify.
        </p>
      )}
      {c.decision && (
        <p className="text-xs text-muted-foreground">
          Última decisão: {c.decision.replace(/_/g, " ")}
          {groupOf(c) === "aprovado" && ". Já aprovado, a aguardar envio pela rotina da caixa."}
        </p>
      )}
      {error && <p className="text-sm text-negative">{error}</p>}

      {canEdit && (canDecide || showAddressButton || c.status === "escalar" || c.status === "reembolso") && (
        <div className="flex flex-wrap gap-2">
          {canDecide && (<>
          <button
            type="button"
            disabled={pending}
            onClick={() => (needsConfirm ? setConfirming(true) : approve(false))}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            {edited ? "Aprovar com edição" : "Aprovar"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (decisionText.trim() && !reason) setReason(decisionText.trim());
              setDialog("rejeitado");
            }}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Rejeitar
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (decisionText.trim() && !reason) setReason(decisionText.trim());
              setDialog("escalado");
            }}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Escalar
          </button>
          </>)}
          {showAddressButton && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => closeCsCaseAction({ caseId: c.id, addressAdjusted: true }))}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
            >
              Já ajustado na PrimeFlow
            </button>
          )}
          {(c.status === "escalar" || c.status === "reembolso") && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => closeCsCaseAction({ caseId: c.id }))}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              Marcar como tratado
            </button>
          )}
        </div>
      )}
      {confirming && comp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md space-y-3 rounded-lg border border-border bg-surface p-4">
            <h3 className="text-base font-semibold">Confirmar compensação</h3>
            <p className="text-sm">{confirmationText(comp, c.orderNumber)}</p>
            <p className="text-xs text-muted-foreground">Depois de confirmar, a rotina executa no Shopify uma única vez.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirming(false)} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">
                Cancelar
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setConfirming(false);
                  approve(true);
                }}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
              >
                Sim, confirmo
              </button>
            </div>
          </div>
        </div>
      )}
      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md space-y-3 rounded-lg border border-border bg-surface p-4">
            <h3 className="text-base font-semibold">
              {dialog === "rejeitado" ? "Porque rejeita esta resposta?" : "Porque escala este caso?"}
            </h3>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              autoFocus
              placeholder={
                dialog === "rejeitado"
                  ? "Diga o que mudar, por exemplo: oferecer 30%."
                  : "Diga o que precisa de decidir."
              }
              className="w-full rounded-lg border border-border bg-background p-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDialog(null);
                  setReason("");
                }}
                className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={pending || !reason.trim()}
                onClick={() => {
                  const decision = dialog;
                  const note = reason.trim();
                  setDialog(null);
                  setReason("");
                  run(() => decideCsCaseAction({ caseId: c.id, decision, note }));
                }}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
              >
                {dialog === "rejeitado" ? "Rejeitar" : "Escalar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------- Templates -------------------------------- */

/** Aprovações seguidas sem edição necessárias para um template poder seguir sem aprovação. */
const AUTONOMY_THRESHOLD = 20;

function TemplatesTab({ templates, canEdit }: { templates: CsTemplateView[]; canEdit: boolean }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Por defeito, todos os templates exigem a sua aprovação. Com {AUTONOMY_THRESHOLD} aprovações sem edição,
        o template fica pronto para autonomia e o botão pisca; só passa a seguir sozinho quando o ativar. Os que
        seguem sozinhos mostram o aviso «Envio automático ativo».
      </p>
      {templates.map((t) => (
        <TemplateRow key={t.id} t={t} canEdit={canEdit} />
      ))}
    </div>
  );
}

function TemplateRow({ t, canEdit }: { t: CsTemplateView; canEdit: boolean }) {
  const { run, pending, error } = useRun();
  const [label, setLabel] = useState(t.label);
  const [body, setBody] = useState(t.body);
  const eligible = t.approvedClean >= AUTONOMY_THRESHOLD && !t.autoSend && !t.alwaysManual;
  const dirty = label !== t.label || body !== t.body;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs tabular-nums text-muted-foreground">#{t.number}</span>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          disabled={!canEdit}
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
        />
        <Pill tone={t.classification}>{t.classification}</Pill>
        <span className="text-xs tabular-nums text-muted-foreground">
          {t.approvedClean} sem edição · {t.approvedEdited} editado{t.approvedEdited === 1 ? "" : "s"}
          {" "}de {AUTONOMY_THRESHOLD} necessárias
        </span>
        {t.autoSend && !t.alwaysManual && (
          <span className="animate-pulse rounded-md bg-positive/15 px-2 py-1 text-xs font-medium text-positive">
            Envio automático ativo
          </span>
        )}
        {eligible && canEdit && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setCsTemplateAutoAction({ templateId: t.id, autoSend: true }))}
            className="animate-pulse rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-foreground disabled:opacity-50"
          >
            Pronto: ativar envio automático
          </button>
        )}
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={t.autoSend}
            disabled={!canEdit || pending || t.alwaysManual}
            onChange={(e) => run(() => setCsTemplateAutoAction({ templateId: t.id, autoSend: e.target.checked }))}
          />
          {t.alwaysManual ? "Aprovação obrigatória" : t.autoSend ? "Pode seguir sozinho" : "Aprovação obrigatória"}
        </label>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={!canEdit}
        rows={3}
        placeholder="Texto do template, com variáveis entre parêntesis retos, ex.: [Nome], [#], [rastreio]"
        className="w-full rounded-md border border-border bg-background p-2 text-sm"
      />
      {error && <p className="text-sm text-negative">{error}</p>}
      {canEdit && dirty && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => saveCsTemplateAction({ templateId: t.id, label, body }))}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
        >
          Guardar template
        </button>
      )}
    </div>
  );
}

/* ----------------------------------- Mia ----------------------------------- */

function MiaTab({ messages, canEdit }: { messages: CsMiaMessageView[]; canEdit: boolean }) {
  const { run, pending, error } = useRun();
  const [copied, setCopied] = useState(false);
  const confirmSend = useConfirmMiaSend();
  const questions = messages.filter((m) => m.direction === "pergunta");
  const staleAt = Date.now() - 18 * 3_600_000;
  // Por enviar: perguntas novas e lembretes (sem resposta há mais de 18 h), numa só mensagem.
  const fresh = questions.filter((m) => m.status === "rascunho");
  const reminders = questions.filter((m) => m.status === "enviada" && new Date(m.updatedAt).getTime() < staleAt);
  const toSend = [...fresh, ...reminders];
  const waiting = questions.filter((m) => m.status === "enviada" && !toSend.includes(m));
  const text = miaBatchMessage(fresh.map((m) => m.textEn), reminders.map((m) => m.textEn));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Mensagem para a Mia</h2>
        {toSend.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface p-3 text-sm text-muted-foreground">Nada por enviar à Mia.</p>
        ) : (
          <div className="space-y-2 rounded-lg border border-border bg-surface p-3 text-sm">
            <p className="whitespace-pre-wrap">{text}</p>
            {canEdit && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  confirmSend(() => {
                    void navigator.clipboard.writeText(text);
                    setCopied(true);
                    run(() => sendMiaBatchAction({ ids: toSend.map((m) => m.id) }));
                  })
                }
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
              >
                {copied ? "Copiado e marcado como enviado" : "Copiar e marcar como enviado"}
              </button>
            )}
          </div>
        )}
        {waiting.length > 0 && (
          <div className="space-y-1 rounded-lg border border-border bg-surface p-3 text-sm">
            <p className="font-medium">À espera da resposta da Mia</p>
            {waiting.map((m) => (
              <p key={m.id} className="text-muted-foreground">{m.textPt}</p>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Conversa da Mia</h2>
        {canEdit && <MiaChatImport />}
      </section>
      {error && <p className="text-sm text-negative lg:col-span-2">{error}</p>}
    </div>
  );
}

/** Lê um .txt ou o .zip que o WhatsApp gera ao exportar (extrai o primeiro .txt). */
async function readChatFile(f: File): Promise<string> {
  const buf = await f.arrayBuffer();
  const b = new DataView(buf);
  if (b.byteLength < 4 || b.getUint32(0, true) !== 0x04034b50) return new TextDecoder().decode(buf);
  let o = 0;
  while (o + 30 <= b.byteLength && b.getUint32(o, true) === 0x04034b50) {
    const flags = b.getUint16(o + 6, true);
    const method = b.getUint16(o + 8, true);
    const csize = b.getUint32(o + 18, true);
    const nlen = b.getUint16(o + 26, true);
    const xlen = b.getUint16(o + 28, true);
    const name = new TextDecoder().decode(new Uint8Array(buf, o + 30, nlen));
    const start = o + 30 + nlen + xlen;
    if (flags & 8) throw new Error("zip");
    if (name.toLowerCase().endsWith(".txt")) {
      const data = new Uint8Array(buf, start, csize);
      if (method === 0) return new TextDecoder().decode(data);
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new TextDecoder().decode(await new Response(stream).arrayBuffer());
    }
    o = start + csize;
  }
  throw new Error("zip");
}

function MiaChatImport() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [senders, setSenders] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const send = (body: string, name: string) =>
    start(async () => {
      const r = await importMiaChatAction({ text: body, miaName: name });
      if (r.error) setMsg(r.error);
      else if (r.senders) { setSenders(r.senders); setMsg("Quem é a Mia nesta conversa?"); }
      else { setSenders([]); setText(""); setMsg(`Importado: ${r.imported ?? 0} mensagens da Mia. Conversa guardada com as suas mensagens (${r.saved ?? 0} novas). ${r.markedSent ? `${r.markedSent} rascunho(s) passaram a enviados, porque a conversa mostra que já os enviou. ` : ""}Reveja as respostas e as perguntas pendentes. Conversa lida até ${new Date(r.until as string).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" })}.${r.missingInvoices?.length ? ` Há ${r.missingInvoices.length} faturas anunciadas pela Mia por importar; veja o separador Faturas.` : ""}`); router.refresh(); }
    });
  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface p-3 text-sm">
      <p className="font-medium">Importar a conversa da Mia</p>
      <p className="text-muted-foreground">No WhatsApp: abrir a conversa, Exportar conversa, sem multimédia, e escolher aqui o ficheiro (.zip ou .txt). Importa logo ao escolher.</p>
      <label className={cn("inline-block cursor-pointer rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground", pending && "opacity-50")}>
        {pending ? "A importar..." : "Importar conversa"}
        <input
          type="file"
          className="sr-only"
          disabled={pending}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              const t = await readChatFile(f);
              if (!t.trim()) return setMsg("O ficheiro está vazio.");
              setText(t);
              setSenders([]);
              send(t, "");
            } catch {
              setMsg("Não consegui ler este ficheiro. Exporte a conversa sem multimédia, em .txt ou .zip.");
            }
          }}
        />
      </label>
      {senders.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {senders.map((n) => (
            <button key={n} type="button" disabled={pending} onClick={() => send(text, n)} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">{n}</button>
          ))}
        </div>
      )}
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}

/* ------------------------------- Visão geral ------------------------------- */

function OverviewTab({ cases }: { cases: CsCaseView[] }) {
  const open = cases.filter((c) => c.status !== "resolvido" && c.status !== "respondido");
  const stalled = open.filter((c) => c.ageDays > 7);
  const oldest = open.reduce((m, c) => Math.max(m, c.ageDays), 0);
  const byType = new Map<string, number>();
  for (const c of cases) byType.set(c.issueType, (byType.get(c.issueType) ?? 0) + 1);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Casos abertos", String(open.length)],
          ["Parados (mais de 7 dias)", String(stalled.length)],
          ["Mais antigo", `${oldest} d`],
          ["Reembolsos pendentes", String(cases.filter((c) => c.status === "reembolso").length)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-surface p-4">
            <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {CS_STORES.map((s) => {
          const mine = open.filter((c) => c.store === s);
          return (
            <div key={s} className="rounded-lg border border-border bg-surface p-4">
              <p className="text-sm font-semibold">{CS_STORE_LABEL[s]}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {mine.length} abertos · {mine.filter((c) => c.ageDays > 7).length} parados
              </p>
            </div>
          );
        })}
      </div>
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-sm font-semibold">Queixas por tipo</p>
        <ul className="mt-2 space-y-1 text-sm">
          {[...byType.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => (
            <li key={k} className="flex justify-between">
              <span>{CS_ISSUE_LABEL[k as keyof typeof CS_ISSUE_LABEL] ?? k}</span>
              <span className="tabular-nums">{n}</span>
            </li>
          ))}
          {byType.size === 0 && <li className="text-muted-foreground">Sem dados ainda.</li>}
        </ul>
      </div>
    </div>
  );
}

/* ---------------------------- Prazos e alertas ---------------------------- */

const ALERT_LABEL: Record<CsAlertLevel, string> = {
  critico: "Crítico",
  aviso: "Aviso",
  info: "Info",
};
const ALERT_CLASS: Record<CsAlertLevel, string> = {
  critico: "text-negative",
  aviso: "text-warning",
  info: "text-muted-foreground",
};

function DeadlinesTab({ alerts }: { alerts: ReturnType<typeof computeCsAlerts> }) {
  const R = CS_RULES;
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-sm font-semibold">Alertas ({alerts.length})</p>
        {alerts.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Sem encomendas em atraso nem respostas pendentes.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {alerts.map((a) => (
              <li key={a.id} className="flex flex-col gap-0.5 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className={cn("text-xs font-semibold uppercase", ALERT_CLASS[a.level])}>
                    {ALERT_LABEL[a.level]}
                  </span>
                  <span className="font-medium">{a.title}</span>
                </div>
                <p className="text-muted-foreground">{a.detail}</p>
                <p>{a.action}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-sm font-semibold">Regras de seguimento</p>
        <ul className="mt-2 space-y-1 text-sm">
          <li>Resposta ao cliente: ideal {R.respostaIdealH} h, limite {R.respostaLimiteH} h.</li>
          <li>Ciclo de emails: dias {R.recontactoDias.join(", ")}; ao dia {R.propostaReembolsoDia} prepara-se o reembolso e ao dia {R.reembolsoAgoraDia} reembolsa-se agora (decide o Emanuel).</li>
          <li>Mia: seguir após {R.miaSeguirH} h sem resposta; escalar ao Emanuel após {R.miaEscalarH} h.</li>
          <li>Reembolsos e escalados parados mais de {R.decisaoEmanuelH} h aparecem como críticos.</li>
          <li>Casos abertos há {R.riscoDisputaDia} dias ou mais têm risco de disputa.</li>
        </ul>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-[13px] text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Fase</th>
              <th className="px-4 py-2 font-medium">Prazo</th>
              <th className="px-4 py-2 font-medium">O que fazer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {CS_PHASES.map((p) => (
              <tr key={p.fase} className="align-top">
                <td className="px-4 py-2 font-medium">{p.fase}</td>
                <td className="px-4 py-2">{p.prazo}</td>
                <td className="px-4 py-2">{p.acao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


/* -------------------------------- Produtos -------------------------------- */

const COMPLAINT_TYPES = new Set(["qualidade", "troca_tamanho", "devolucao", "reembolso", "disputa"]);

const GENERIC_SUEDE = "Casaco de camurça (modelo não identificado)";

/** Nome do produto sem variante, quantidade, nº de encomenda nem segundo artigo. */
function productName(items: string): string {
  const first = items.split(",")[0];
  const name = first
    .replace(/\([^)]*\)/g, " ") // variantes e notas entre parênteses
    .split(/;|\.\s/)[0] // notas e segundos artigos separados por ; ou ponto
    .split(/\s\+\s/)[0] // "A + B": fica só o primeiro artigo
    .replace(/^\s*\d+\s*x\s+/i, "") // "2x "
    .replace(/^\s*#\d+\s+/, "") // "#1066 "
    .replace(/\s+x\d+$/i, "") // " x2" no fim
    .replace(/\s+/g, " ")
    .trim();
  if (!name || /^sem (encomenda|produto)/i.test(name)) return "Sem produto";
  // Descrições vagas do casaco de camurça (sem nome de modelo) ficam numa só linha.
  if (/^giacca (in|di) (camoscio|pelle scamosciata)( marrone)?$/i.test(name)) return GENERIC_SUEDE;
  return name;
}

/** Chave para juntar o mesmo produto escrito de formas ligeiramente diferentes. */
function productKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function ProductsTab({ cases }: { cases: CsCaseView[] }) {
  const rows = useMemo(() => {
    const complaints = cases.filter((c) => COMPLAINT_TYPES.has(c.issueType));
    // Nomes limpos e respetivas chaves; um nome com pelo menos 3 palavras absorve os que
    // começam por ele (ex.: "... Scamosciata Brown L" fica junto de "... Scamosciata").
    const keys = [
      ...new Set(
        complaints.map((c) => productName(c.items)).filter((n) => n !== GENERIC_SUEDE).map(productKey),
      ),
    ].sort((a, b) => a.length - b.length);
    const canonical = (key: string) =>
      keys.find((k) => k.split(" ").length >= 3 && (key === k || key.startsWith(k + " "))) ?? key;
    const map = new Map<string, { name: string; total: number; week: number; reasons: Map<string, number> }>();
    for (const c of complaints) {
      const name = productName(c.items);
      const key = canonical(productKey(name));
      const row = map.get(key) ?? { name, total: 0, week: 0, reasons: new Map() };
      if (name.length < row.name.length) row.name = name;
      row.total += 1;
      if (c.ageDays <= 7) row.week += 1;
      const reason = c.complaintReason.trim() || CS_ISSUE_LABEL[c.issueType];
      row.reasons.set(reason, (row.reasons.get(reason) ?? 0) + 1);
      map.set(key, row);
    }
    return [...map.values()]
      .map((r) => ({
        name: r.name,
        total: r.total,
        week: r.week,
        reasons: [...r.reasons.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t),
      }))
      .sort((a, b) => b.total - a.total || b.week - a.week);
  }, [cases]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Produtos com mais reclamações (qualidade, tamanho, devolução, reembolso e disputa). 3 ou mais numa semana
        marcam o produto como de risco, para avisar a cadeia de abastecimento.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ainda não há reclamações registadas.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="text-left text-[13px] text-muted-foreground">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">Produto</th>
                <th className="p-3">Reclamações</th>
                <th className="p-3">Últimos 7 dias</th>
                <th className="p-3">Porque reclamam</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.name} className="border-t border-border align-top">
                  <td className="p-3">{i + 1}</td>
                  <td className="p-3 font-medium">
                    {r.name}
                    {r.week >= 3 && <span className="ml-2 text-xs text-negative">Produto de risco</span>}
                  </td>
                  <td className="p-3">{r.total}</td>
                  <td className="p-3">{r.week}</td>
                  <td className="p-3">{r.reasons.slice(0, 3).join("; ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
