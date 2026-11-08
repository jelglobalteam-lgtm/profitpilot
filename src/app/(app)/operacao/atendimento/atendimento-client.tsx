"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
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
import type { InvoiceData } from "@/lib/cs-invoice-data";
import { shipmentAlert, type ShipmentView } from "@/lib/parcelpanel-csv";
import { CS_PHASES, CS_RULES, computeCsAlerts, type CsAlertLevel } from "@/lib/cs-rules";
import {
  addCsMiaMessageAction,
  closeCsCaseAction,
  decideCsCaseAction,
  saveCsTemplateAction,
  setCsMiaStatusAction,
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

export function AtendimentoClient({ data, quotes, cogsChanges, shipments, invoices, attentionTabs, canEdit, initialTab }: { data: CsData; quotes: QuoteProductView[]; cogsChanges: CogsChangeView[]; shipments: ShipmentView[]; invoices: InvoiceData; attentionTabs: string[]; canEdit: boolean; initialTab?: string }) {
  const [tab, setTab] = useState(
    ["casos", "templates", "mia", "produtos", "precos", "envios", "faturas", "prazos", "geral"].includes(initialTab ?? "") ? (initialTab as string) : "casos",
  );
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
          { id: "prazos", label: "Prazos e alertas", badge: withBang("prazos", pill(alerts.length), alerts.length > 0) },
          { id: "geral", label: "Visão geral" },
        ]}
      />
      {tab === "casos" && <CasesTab cases={data.cases} canEdit={canEdit} />}
      {tab === "templates" && <TemplatesTab templates={data.templates} canEdit={canEdit} />}
      {tab === "mia" && <MiaTab messages={data.mia} canEdit={canEdit} />}
      {tab === "produtos" && <ProductsTab cases={data.cases} />}
      {tab === "precos" && <PricesTab products={quotes} cogsChanges={cogsChanges} canEdit={canEdit} />}
      {tab === "envios" && <ShipmentsTab shipments={shipments} canEdit={canEdit} />}
      {tab === "faturas" && <InvoicesTab data={invoices} canEdit={canEdit} />}
      {tab === "prazos" && <DeadlinesTab alerts={alerts} />}
      {tab === "geral" && <OverviewTab cases={data.cases} />}
    </div>
  );
}

/* ---------------------------------- Casos --------------------------------- */

type CaseGroup = CsStatus | "aprovado" | "rejeitado" | "pendente";

const GROUPS: { key: CaseGroup; label: string }[] = [
  { key: "pendente", label: "Pendentes de si" },
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

/** Casos que esperam uma decisão do Emanuel: para aprovar, escalados e reembolsos. */
function isPending(c: CsCaseView): boolean {
  const g = groupOf(c);
  return g === "para_aprovar" || g === "escalar" || g === "reembolso";
}

function CasesTab({ cases, canEdit }: { cases: CsCaseView[]; canEdit: boolean }) {
  const [status, setStatus] = useState<CaseGroup>("pendente");
  const [store, setStore] = useState<CsStoreKey | "all">("all");
  const [selected, setSelected] = useState<string | null>(null);

  const counts = useMemo(() => {
    const m = new Map<CaseGroup, number>();
    for (const c of cases) {
      m.set(groupOf(c), (m.get(groupOf(c)) ?? 0) + 1);
      if (isPending(c)) m.set("pendente", (m.get("pendente") ?? 0) + 1);
    }
    return m;
  }, [cases]);

  const list = cases.filter(
    (c) => (status === "pendente" ? isPending(c) : groupOf(c) === status) && (store === "all" || c.store === store),
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
            <CaseCard key={current.id} c={current} canEdit={canEdit} />
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

function CaseCard({ c, canEdit }: { c: CsCaseView; canEdit: boolean }) {
  const { run, pending, error } = useRun();
  const [dialog, setDialog] = useState<"rejeitado" | "escalado" | null>(null);
  const [reason, setReason] = useState("");
  const [reply, setReply] = useState(c.proposedReply);
  const [decisionText, setDecisionText] = useState("");
  const edited = reply !== c.proposedReply;
  const refundLocked = c.status === "reembolso" || c.classification === "vermelho";

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
      <Field label="Último email do cliente (PT)">{c.lastCustomerEmailPt}</Field>
      <Field label="Resposta proposta (PT)">{c.proposedReplyPt}</Field>

      <details className="rounded-lg border border-border p-3 text-sm">
        <summary className="cursor-pointer font-medium text-muted-foreground">Ver mais</summary>
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email">{c.customerEmail}</Field>
            <Field label="Valor">{c.orderValue}</Field>
            <Field label="Estado e rastreio">{c.trackingStatus}</Field>
            <Field label="Template">{c.templateLabel}</Field>
          </div>
          <Field label="Cronologia">
            {c.timeline.length
              ? c.timeline.map((t) => `${t.n}.º email: ${t.summary}`).join("\n\n")
              : ""}
          </Field>
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
          Reembolsos e casos vermelhos são sempre decididos por si. Aprovar regista a decisão, não executa nada.
        </p>
      )}
      {c.decision && (
        <p className="text-xs text-muted-foreground">Última decisão: {c.decision.replace(/_/g, " ")}</p>
      )}
      {error && <p className="text-sm text-negative">{error}</p>}

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(() =>
                decideCsCaseAction({
                  caseId: c.id,
                  decision: edited ? "aprovado_com_edicao" : "aprovado",
                  note: decisionText.trim() || c.managerNote,
                  editedReply: edited ? reply : undefined,
                }),
              )
            }
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
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState("");
  const questions = messages.filter((m) => m.direction === "pergunta");
  const requests = messages.filter((m) => m.direction === "pedido");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Perguntas à Mia</h2>
        {canEdit && (
          <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              placeholder="Escreva em português. O Claude prepara a mensagem em inglês."
              className="w-full rounded-md border border-border bg-background p-2 text-sm"
            />
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const r = await addCsMiaMessageAction({ direction: "pergunta", textPt: question });
                  if (!r.error) setQuestion("");
                  return r;
                })
              }
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
            >
              Guardar pergunta
            </button>
          </div>
        )}
        {questions.map((m) => (
          <div key={m.id} className="space-y-1 rounded-lg border border-border bg-surface p-3 text-sm">
            <p className="whitespace-pre-wrap">{m.textPt}</p>
            {m.textEn && <p className="whitespace-pre-wrap text-muted-foreground">{m.textEn}</p>}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-muted-foreground">Estado:</span>
              <select
                value={m.status}
                disabled={!canEdit || pending}
                onChange={(e) =>
                  run(() =>
                    setCsMiaStatusAction({
                      id: m.id,
                      status: e.target.value as CsMiaMessageView["status"],
                    }),
                  )
                }
                className="rounded-md border border-border bg-background px-2 py-1 text-xs"
              >
                <option value="rascunho">Rascunho</option>
                <option value="enviada">Enviada</option>
                <option value="respondida">Respondida</option>
              </select>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Pedidos da Mia</h2>
        {canEdit && (
          <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={3}
              placeholder="Cole aqui a resposta ou o pedido da Mia. O Claude propõe o seguimento."
              className="w-full rounded-md border border-border bg-background p-2 text-sm"
            />
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const r = await addCsMiaMessageAction({ direction: "pedido", reply });
                  if (!r.error) setReply("");
                  return r;
                })
              }
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
            >
              Guardar resposta
            </button>
          </div>
        )}
        {requests.map((m) => (
          <div key={m.id} className="space-y-1 rounded-lg border border-border bg-surface p-3 text-sm">
            <p className="whitespace-pre-wrap">{m.reply}</p>
            <p className="text-xs text-muted-foreground">
              Seguimento proposto: {m.followUp || "a aguardar análise"}
            </p>
          </div>
        ))}
      </section>
      {error && <p className="text-sm text-negative lg:col-span-2">{error}</p>}
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

function productName(items: string): string {
  return items.split(",")[0].trim() || "Sem produto";
}

function ProductsTab({ cases }: { cases: CsCaseView[] }) {
  const rows = useMemo(() => {
    const map = new Map<string, { total: number; week: number; reasons: Map<string, number> }>();
    for (const c of cases) {
      if (!COMPLAINT_TYPES.has(c.issueType)) continue;
      const name = productName(c.items);
      const row = map.get(name) ?? { total: 0, week: 0, reasons: new Map() };
      row.total += 1;
      if (c.ageDays <= 7) row.week += 1;
      const reason = c.complaintReason.trim() || CS_ISSUE_LABEL[c.issueType];
      row.reasons.set(reason, (row.reasons.get(reason) ?? 0) + 1);
      map.set(name, row);
    }
    return [...map.entries()]
      .map(([name, r]) => ({
        name,
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
