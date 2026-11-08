/** Win-Win: €3 por encomenda enviada para a UE — vigência desde 26/06/2026 (hora China). */
export const EU_CUSTOMS_FEE_EFFECTIVE_FROM = "2026-06-26";

/** @deprecated use EU_CUSTOMS_FEE_EFFECTIVE_FROM */
export const EU_CATEGORY_FEE_EFFECTIVE_FROM = EU_CUSTOMS_FEE_EFFECTIVE_FROM;

/** Tarifa antiga (26/06 a 31/10/2026). */
export const EU_CUSTOMS_FEE_PER_ORDER_EUR = 3;

/** Nova tarifa de imposto UE da Win-Win, a partir de 01/11/2026 (aviso da Mia de 31/10). */
export const EU_CUSTOMS_FEE_NEW_FROM = "2026-11-01";
export const EU_CUSTOMS_FEE_NEW_PER_ORDER_EUR = 5;

/** Tarifa por encomenda UE no dia indicado (YYYY-MM-DD, dia da encomenda). */
export function euCustomsFeePerOrderEurForDay(dateKey: string): number {
  return dateKey >= EU_CUSTOMS_FEE_NEW_FROM
    ? EU_CUSTOMS_FEE_NEW_PER_ORDER_EUR
    : EU_CUSTOMS_FEE_PER_ORDER_EUR;
}

export type EuCustomsFeeDaySummary = {
  dateKey: string;
  label: string;
  euOrders: number;
  amount: number;
  baseCurrency: string;
};

export type EuCustomsFeeAutoSummary = {
  automatic: true;
  feePerOrderEur: number;
  effectiveFrom: string;
  baseCurrency: string;
  periodEuOrders: number;
  periodFee: number;
  recentDays: EuCustomsFeeDaySummary[];
};

/** @deprecated manual entries — só legado */
export type EuCategoryFeeEntry = {
  dateKey: string;
  label: string;
  amount: number;
  inputAmount: number | null;
  inputCurrency: string | null;
  fxRate: number | null;
  note: string;
  baseCurrency: string;
};
