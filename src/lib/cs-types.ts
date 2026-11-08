export const CS_STORES = ["rivasylt-de", "rivasylt-it", "alma-vicentina"] as const;
export type CsStoreKey = (typeof CS_STORES)[number];

export const CS_STORE_LABEL: Record<CsStoreKey, string> = {
  "rivasylt-de": "RivaSylt DE",
  "rivasylt-it": "RivaSylt IT",
  "alma-vicentina": "Alma Vicentina",
};

export const CS_STATUSES = [
  "para_aprovar",
  "reembolso",
  "escalar",
  "a_aguardar_cliente",
  "a_aguardar_fornecedor",
  "respondido",
  "resolvido",
] as const;
export type CsStatus = (typeof CS_STATUSES)[number];

export const CS_STATUS_LABEL: Record<CsStatus, string> = {
  para_aprovar: "Para aprovar",
  reembolso: "Reembolsos",
  escalar: "Escalar",
  a_aguardar_cliente: "A aguardar cliente",
  a_aguardar_fornecedor: "A aguardar fornecedor",
  respondido: "Respondidos",
  resolvido: "Resolvidos",
};

export const CS_CLASSES = ["verde", "amarelo", "vermelho"] as const;
export type CsClass = (typeof CS_CLASSES)[number];

export const CS_ISSUE_TYPES = [
  "estado_encomenda",
  "qualidade",
  "rastreio",
  "cancelamento",
  "devolucao",
  "troca_tamanho",
  "alteracao_morada",
  "reembolso",
  "disputa",
  "outro",
] as const;
export type CsIssueType = (typeof CS_ISSUE_TYPES)[number];

export const CS_ISSUE_LABEL: Record<CsIssueType, string> = {
  estado_encomenda: "Estado da encomenda",
  qualidade: "Qualidade",
  rastreio: "Rastreio",
  cancelamento: "Cancelamento",
  devolucao: "Devolução",
  troca_tamanho: "Troca de tamanho",
  alteracao_morada: "Alteração de morada",
  reembolso: "Reembolso",
  disputa: "Disputa / chargeback",
  outro: "Outro",
};

export const CS_DECISIONS = [
  "aprovado",
  "aprovado_com_edicao",
  "rejeitado",
  "escalado",
] as const;
export type CsDecision = (typeof CS_DECISIONS)[number];

/** Idade do caso em dias → cor (1-3 verde, 3-5 amarelo, >7 vermelho; 5-7 laranja/âmbar). */
export function ageTone(days: number): "verde" | "amarelo" | "vermelho" {
  if (days <= 3) return "verde";
  if (days <= 7) return "amarelo";
  return "vermelho";
}

export type CsTimelineEntry = {
  n: number;
  at: string | null;
  summary: string;
};

export type CsCaseView = {
  id: string;
  store: CsStoreKey;
  status: CsStatus;
  classification: CsClass;
  issueType: CsIssueType;
  customerName: string;
  customerEmail: string;
  language: string;
  orderNumber: string;
  items: string;
  complaintReason: string;
  orderValue: string;
  trackingStatus: string;
  timeline: CsTimelineEntry[];
  offered: string;
  requests: string;
  lastCustomerEmailOriginal: string;
  lastCustomerEmailPt: string;
  templateId: string;
  templateLabel: string;
  proposedReply: string;
  proposedReplyPt: string;
  managerNote: string;
  decisionQuestion: string;
  decision: CsDecision | null;
  ageDays: number;
  openedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type CsTemplateView = {
  id: string;
  number: number;
  store: CsStoreKey | "all";
  language: string;
  label: string;
  classification: CsClass;
  body: string;
  autoSend: boolean;
  approvedClean: number;
  approvedEdited: number;
  alwaysManual: boolean;
};

export type CsMiaMessageView = {
  id: string;
  direction: "pergunta" | "pedido";
  status: "rascunho" | "enviada" | "respondida";
  caseId: string | null;
  textPt: string;
  textEn: string;
  reply: string;
  followUp: string;
  createdAt: string;
};

/** Ações rápidas num caso (atalho de teclado entre parênteses na interface). */
export const CS_QUICK_ACTIONS = [
  { key: "imagens", label: "Pediu imagens", shortcut: "A", status: "a_aguardar_cliente" },
  { key: "desconto", label: "Ofereceu desconto", shortcut: "O", status: "a_aguardar_cliente" },
  { key: "estado", label: "Informou estado", shortcut: "I", status: "respondido" },
  { key: "morada", label: "Enviou morada de devolução", shortcut: "S", status: "a_aguardar_cliente" },
  { key: "recusou", label: "Recusou", shortcut: "D", status: "respondido" },
  { key: "reembolsou", label: "Reembolsou", shortcut: "F", status: "resolvido" },
] as const;
export type CsQuickActionKey = (typeof CS_QUICK_ACTIONS)[number]["key"];
