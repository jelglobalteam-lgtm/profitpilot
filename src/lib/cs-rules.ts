import type { CsCaseView, CsMiaMessageView } from "@/lib/cs-types";

/**
 * Regras de prazos do Atendimento. Fonte: SOPs do Blueprint (formacao) e
 * ficheiros 01, 02 e 04 do projeto. Onde ha conflito, prevalecem as regras do
 * Emanuel (ver 03b_resumo_conflitos_a_decidir.md). Valores em horas, salvo indicacao.
 */
export const CS_RULES = {
  /** Resposta ao cliente: meta ideal e limite. */
  respostaIdealH: 4,
  respostaLimiteH: 6,
  /** Reembolso/escalado a espera do Emanuel. */
  decisaoEmanuelH: 24,
  /** Seguimento com o cliente (dias desde a abertura do caso): 2o, 3o email, decisao. */
  recontactoDias: [2, 5, 7] as const,
  /** Dia em que, sem solucao, se prepara o reembolso (decide o Emanuel). */
  propostaReembolsoDia: 8,
  /** Dia do "reembolsar agora" sem resposta (sistema do curso). */
  reembolsoAgoraDia: 10,
  /** Risco de disputa/chargeback para encomendas abertas ha mais de N dias. */
  riscoDisputaDia: 8,
  /** Pergunta/pedido a Mia sem resposta: seguir passadas N horas; escalar passadas N horas. */
  miaSeguirH: 24,
  miaEscalarH: 72,
  /** Rascunho para a Mia por enviar. */
  miaRascunhoH: 4,
} as const;

/** Fases da encomenda (dias) para referencia e para o texto das regras. */
export const CS_PHASES: { fase: string; prazo: string; acao: string }[] = [
  {
    fase: "Confirmacao",
    prazo: "Imediata",
    acao: "Email automatico da loja. Cancelamento apenas nas primeiras 24 h e antes de processar (acima de 100 EUR: recusar e escalar).",
  },
  {
    fase: "Processamento pelo fornecedor",
    prazo: "1 a 5 dias",
    acao: "Sem tracking ao fim de 3 dias: pedir a Mia. Mais de 7 dias: abrir caso. Alteracao de morada, cor ou variante so antes de processar.",
  },
  {
    fase: "Tracking criado",
    prazo: "Info received 1 dia normal; 2 a 3 dias ja e problema",
    acao: "Sem movimento 5 dias: pedir a Mia nova cotacao ou comprovativo de envio.",
  },
  {
    fase: "Transito e entrega",
    prazo: "7 a 15 dias no total (5 a 10 dias uteis em transito)",
    acao: "Se em transito, o cliente fala com a transportadora para alterar morada. Entregue sem queixa: enviar prova de entrega.",
  },
  {
    fase: "Reembolso",
    prazo: "Dia 8 sem solucao: preparar. Dia 10 sem resposta: reembolsar agora",
    acao: "Decide e executa sempre o Emanuel. RTS ou recusado: deducao de 15 por cento. Se ao dia 8 o tracking mostra pronto para levantar, nao reembolsar.",
  },
  {
    fase: "Disputa PayPal e chargeback",
    prazo: "Inquerito: no mesmo dia. Reclamacao: cerca de 21 dias. Chargeback: 30 dias. Appeal: cerca de 10 dias apos fechar",
    acao: "Escalar ao Emanuel no mesmo dia. Pedir a Mia comprovativo de entrega. Nunca reembolsar pelo dashboard durante uma disputa.",
  },
];

export type CsAlertLevel = "info" | "aviso" | "critico";

export type CsAlert = {
  id: string;
  level: CsAlertLevel;
  kind: "caso" | "mia";
  refId: string;
  title: string;
  detail: string;
  action: string;
};

const H = 3_600_000;
const OPEN = new Set(["para_aprovar", "reembolso", "escalar", "a_aguardar_cliente", "a_aguardar_fornecedor"]);

const LEVEL_ORDER: Record<CsAlertLevel, number> = { critico: 0, aviso: 1, info: 2 };

export function computeCsAlerts(
  cases: CsCaseView[],
  mia: CsMiaMessageView[],
  now: number = Date.now(),
): CsAlert[] {
  const out: CsAlert[] = [];
  const R = CS_RULES;

  for (const c of cases) {
    if (!OPEN.has(c.status)) continue;
    const label = `${c.orderNumber ? `#${c.orderNumber} ` : ""}${c.customerName || c.customerEmail || "Caso"}`;
    const sinceUpdateH = (now - new Date(c.updatedAt).getTime()) / H;
    const sinceOpenH = (now - new Date(c.openedAt).getTime()) / H;

    if (c.issueType === "disputa" && c.status !== "escalar") {
      out.push({
        id: `${c.id}:disputa`,
        level: "critico",
        kind: "caso",
        refId: c.id,
        title: `${label}: disputa aberta`,
        detail: "Inquerito PayPal tem de ser tratado no mesmo dia.",
        action: "Escalar ao Emanuel e pedir a Mia comprovativo de entrega.",
      });
    }

    if (c.status === "para_aprovar") {
      if (sinceUpdateH > R.respostaLimiteH) {
        out.push({
          id: `${c.id}:resp`,
          level: "critico",
          kind: "caso",
          refId: c.id,
          title: `${label}: resposta em atraso`,
          detail: `A aguardar aprovacao ha ${Math.floor(sinceUpdateH)} h (limite ${R.respostaLimiteH} h).`,
          action: "Aprovar, editar ou escalar agora.",
        });
      } else if (sinceUpdateH > R.respostaIdealH) {
        out.push({
          id: `${c.id}:resp`,
          level: "aviso",
          kind: "caso",
          refId: c.id,
          title: `${label}: perto do limite de resposta`,
          detail: `A aguardar aprovacao ha ${Math.floor(sinceUpdateH)} h (ideal ${R.respostaIdealH} h).`,
          action: "Decidir nas proximas horas.",
        });
      }
    }

    if ((c.status === "reembolso" || c.status === "escalar") && sinceUpdateH > R.decisaoEmanuelH) {
      out.push({
        id: `${c.id}:decisao`,
        level: "critico",
        kind: "caso",
        refId: c.id,
        title: `${label}: decisao do Emanuel pendente`,
        detail: `Parado ha ${Math.floor(sinceUpdateH / 24)} dia(s) em ${c.status === "reembolso" ? "reembolsos" : "escalar"}.`,
        action: "Emanuel decide. Nada e enviado ao cliente sem aprovacao.",
      });
    }

    if (c.status === "a_aguardar_cliente") {
      const day = Math.floor(sinceOpenH / 24);
      if (day >= R.reembolsoAgoraDia) {
        out.push({
          id: `${c.id}:cliente`,
          level: "critico",
          kind: "caso",
          refId: c.id,
          title: `${label}: dia ${day} sem resposta`,
          detail: "Passou o limite do ciclo: reembolsar agora.",
          action: "Emanuel decide e executa o reembolso.",
        });
      } else if (day >= R.propostaReembolsoDia) {
        out.push({
          id: `${c.id}:cliente`,
          level: "aviso",
          kind: "caso",
          refId: c.id,
          title: `${label}: dia ${day} sem solucao`,
          detail: "Fim do ciclo de 3 emails em 8 dias.",
          action: "Preparar o reembolso para o Emanuel decidir.",
        });
      } else if (R.recontactoDias.some((d) => day >= d) && sinceUpdateH > 24) {
        out.push({
          id: `${c.id}:cliente`,
          level: "aviso",
          kind: "caso",
          refId: c.id,
          title: `${label}: recontactar o cliente`,
          detail: `Dia ${day}, sem resposta ha ${Math.floor(sinceUpdateH / 24)} dia(s).`,
          action: "Preparar o proximo email do ciclo para aprovacao.",
        });
      }
    }

    if (c.status === "a_aguardar_fornecedor") {
      if (sinceUpdateH > R.miaEscalarH) {
        out.push({
          id: `${c.id}:forn`,
          level: "critico",
          kind: "caso",
          refId: c.id,
          title: `${label}: fornecedor sem resposta`,
          detail: `${Math.floor(sinceUpdateH / 24)} dia(s) sem resposta da Mia.`,
          action: "Escalar ao Emanuel.",
        });
      } else if (sinceUpdateH > R.miaSeguirH) {
        out.push({
          id: `${c.id}:forn`,
          level: "aviso",
          kind: "caso",
          refId: c.id,
          title: `${label}: seguir com a Mia`,
          detail: `Sem resposta ha ${Math.floor(sinceUpdateH)} h.`,
          action: "Preparar mensagem de seguimento (agrupar perguntas, hora da China).",
        });
      }
    }

    if (c.status !== "a_aguardar_cliente" && sinceOpenH / 24 >= R.riscoDisputaDia) {
      out.push({
        id: `${c.id}:risco`,
        level: "aviso",
        kind: "caso",
        refId: c.id,
        title: `${label}: risco de disputa`,
        detail: `Caso aberto ha ${Math.floor(sinceOpenH / 24)} dias sem fecho.`,
        action: "Fechar ou propor reembolso ao Emanuel.",
      });
    }
  }

  for (const m of mia) {
    const ageH = (now - new Date(m.createdAt).getTime()) / H;
    const tag = m.direction === "pergunta" ? "Pergunta" : "Pedido";
    const preview = m.textPt.slice(0, 60);
    if (m.status === "rascunho" && ageH > R.miaRascunhoH) {
      out.push({
        id: `${m.id}:rasc`,
        level: "aviso",
        kind: "mia",
        refId: m.id,
        title: `${tag} a Mia por enviar`,
        detail: `Rascunho ha ${Math.floor(ageH)} h: ${preview}`,
        action: "Emanuel envia por WhatsApp e marca como enviada.",
      });
    }
    if (m.status === "enviada" && ageH > R.miaEscalarH) {
      out.push({
        id: `${m.id}:esc`,
        level: "critico",
        kind: "mia",
        refId: m.id,
        title: `${tag} sem resposta da Mia`,
        detail: `Enviada ha ${Math.floor(ageH / 24)} dia(s): ${preview}`,
        action: "Escalar ao Emanuel.",
      });
    } else if (m.status === "enviada" && ageH > R.miaSeguirH) {
      out.push({
        id: `${m.id}:seg`,
        level: "aviso",
        kind: "mia",
        refId: m.id,
        title: `${tag} sem resposta da Mia`,
        detail: `Enviada ha ${Math.floor(ageH)} h: ${preview}`,
        action: "Seguir com mensagem curta, agrupando pendentes.",
      });
    }
  }

  return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}
