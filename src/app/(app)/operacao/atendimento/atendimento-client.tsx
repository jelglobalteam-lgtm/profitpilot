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
import { CS_PHASES, CS_RULES, computeCsAlerts, type CsAlertLevel } from "@/lib/cs-rules";
import {
  addCsMiaMessageAction,
  decideCsCaseAction,
  saveCsNoteAction,
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

export function AtendimentoClient({ data, canEdit }: { data: CsData; canEdit: boolean }) {
  const [tab, setTab] = useState("casos");
  const open = data.cases.filter((c) => c.status !== "resolvido" && c.status !== "respondido");
  const alerts = useMemo(() => computeCsAlerts(data.cases, data.mia), [data.cases, data.mia]);
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Atendimento</h1>
      <PageTabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "casos", label: "Casos", badge: open.length || undefined },
          { id: "templates", label: "Templates" },
          { id: "mia", label: "Mia" },
          { id: "prazos", label: "Prazos e alertas", badge: alerts.length || undefined },
          { id: "geral", label: "Visão geral" },
        ]}
      />
      {tab === "casos" && <CasesTab cases={data.cases} canEdit={canEdit} />}
      {tab === "templates" && <TemplatesTab templates={data.templates} canEdit={canEdit} />}
      {tab === "mia" && <MiaTab messages={data.mia} canEdit={canEdit} />}
      {tab === "prazos" && <DeadlinesTab alerts={alerts} />}
      {tab === "geral" && <OverviewTab cases={data.cases} />}
    </div>
  );
}

/* ---------------------------------- Casos --------------------------------- */

function CasesTab({ cases, canEdit }: { cases: CsCaseView[]; canEdit: boolean }) {
  const [status, setStatus] = useState<CsStatus>("para_aprovar");
  const [store, setStore] = useState<CsStoreKey | "all">("all");
  const [selected, setSelected] = useState<string | null>(null);

  const counts = useMemo(() => {
    const m = new Map<CsStatus, number>();
    for (const c of cases) m.set(c.status, (m.get(c.status) ?? 0) + 1);
    return m;
  }, [cases]);

  const list = cases.filter(
    (c) => c.status === status && (store === "all" || c.store === store),
  );
  const current = cases.find((c) => c.id === selected) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {CS_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setStatus(s);
              setSelected(null);
            }}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-medium",
              status === s
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {CS_STATUS_LABEL[s]} <span className="tabular-nums">({counts.get(s) ?? 0})</span>
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
  const [note, setNote] = useState(c.managerNote);
  const [reply, setReply] = useState(c.proposedReply);
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
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Email">{c.customerEmail}</Field>
        <Field label="Encomenda">{c.orderNumber}</Field>
        <Field label="Artigos">{c.items}</Field>
        <Field label="Valor">{c.orderValue}</Field>
        <Field label="Estado e rastreio">{c.trackingStatus}</Field>
        <Field label="Template">{c.templateLabel}</Field>
      </div>
      <Field label="Cronologia">
        {c.timeline.length
          ? c.timeline.map((t) => `${t.n}.º email: ${t.summary}`).join("\n")
          : ""}
      </Field>
      <Field label="Ofertas feitas e recusadas">{c.offered}</Field>
      <Field label="O que o cliente pede agora">{c.requests}</Field>
      <Field label="Último email do cliente (PT)">{c.lastCustomerEmailPt}</Field>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Original ({c.language})</summary>
        <p className="mt-1 whitespace-pre-wrap">{c.lastCustomerEmailOriginal}</p>
      </details>

      <div>
        <p className="text-[13px] font-medium text-muted-foreground">
          Resposta proposta ({c.language})
        </p>
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          disabled={!canEdit}
          rows={7}
          className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm"
        />
      </div>
      <Field label="Tradução PT">{c.proposedReplyPt}</Field>

      <div>
        <p className="text-[13px] font-medium text-muted-foreground">Nota do Emanuel</p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={!canEdit}
          rows={3}
          className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm"
        />
      </div>

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
                  note,
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
            onClick={() => run(() => decideCsCaseAction({ caseId: c.id, decision: "rejeitado", note }))}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Rejeitar
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => decideCsCaseAction({ caseId: c.id, decision: "escalado", note }))}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Escalar
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => saveCsNoteAction({ caseId: c.id, note }))}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Guardar nota
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------- Templates -------------------------------- */

function TemplatesTab({ templates, canEdit }: { templates: CsTemplateView[]; canEdit: boolean }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Por defeito, todos os templates exigem a sua aprovação. Só passam a seguir sozinhos depois de os marcar,
        e os contadores mostram se o template está bem estruturado ou foi um caso isolado.
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
  const total = t.approvedClean + t.approvedEdited;
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
          {total >= 5 && t.approvedEdited === 0 ? " · pronto para autonomia" : ""}
        </span>
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
          <li>Ciclo de emails: dias {R.recontactoDias.join(", ")}; ao dia {R.propostaReembolsoDia} propõe-se reembolso (decide o Emanuel).</li>
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
