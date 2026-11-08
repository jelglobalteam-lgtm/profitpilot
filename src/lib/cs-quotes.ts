/** Patamares de unidades vendidas em que se pode pedir nova cotação (curso: 30, 60, 90 e depois a cada 100). */
export function nextQuoteThreshold(lastRoundUnits: number): number {
  if (lastRoundUnits < 30) return 30;
  if (lastRoundUnits < 60) return 60;
  if (lastRoundUnits < 90) return 90;
  return Math.floor(lastRoundUnits / 100) * 100 + 100;
}

export const QUOTE_RESPONSES = [
  "aceitou",
  "contraproposta",
  "recusou",
  "precisa_mais_volume",
] as const;
export type QuoteResponse = (typeof QUOTE_RESPONSES)[number];

export const QUOTE_RESPONSE_LABEL: Record<QuoteResponse, string> = {
  aceitou: "Aceitou o pedido",
  contraproposta: "Contraproposta",
  recusou: "Recusou",
  precisa_mais_volume: "Precisa de mais volume",
};

export type QuoteRoundView = {
  units: number;
  requestedAt: string;
  repliedAt: string | null;
  qualityCheck: boolean;
  response: QuoteResponse | null;
  price: number | null;
  note: string;
};

export type QuoteStatus = "por_pedir" | "a_aguardar" | "a_negociar" | "por_confirmar" | "em_dia";

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  por_pedir: "Por pedir",
  a_aguardar: "A aguardar resposta",
  a_negociar: "A negociar",
  por_confirmar: "Confirmar na fatura",
  em_dia: "Em dia",
};

/** Estado do produto a partir das unidades e da última ronda. */
export function quoteStatus(
  units: number,
  rounds: QuoteRoundView[],
  confirmed: boolean,
): QuoteStatus {
  const last = rounds[rounds.length - 1];
  if (last) {
    if (!last.repliedAt) return "a_aguardar";
    if (last.response === "contraproposta") return "a_negociar";
    if (last.response === "aceitou" && !confirmed) return "por_confirmar";
  }
  const base = last ? last.units : 0;
  return units >= nextQuoteThreshold(base) ? "por_pedir" : "em_dia";
}

/** Mensagem à Mia: só pede revisão pelo volume, nunca indica desconto nem preço alvo. */
export function miaQuoteMessage(opts: {
  title: string;
  link: string;
  units: number;
  qualityCheck: boolean;
}): string {
  const product = opts.link ? `${opts.title} (${opts.link})` : opts.title;
  const base = `Hi Mia, the product ${product} has reached ${opts.units} units sold. Would it be possible to review the quote for it?`;
  if (!opts.qualityCheck) return `${base} Thank you.`;
  return `${base} Along with this, could you please send photos of the latest batch, the size chart and a confirmation of material, colours and sizes available? Thank you.`;
}
