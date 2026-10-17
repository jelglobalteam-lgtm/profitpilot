export const STORE_STATUSES = [
  "to_analyze",
  "monitoring",
  "analyzed",
  "discarded",
] as const;
export type StoreStatus = (typeof STORE_STATUSES)[number];

export const STORE_STATUS_LABEL: Record<StoreStatus, string> = {
  to_analyze: "Por analisar",
  monitoring: "A acompanhar",
  analyzed: "Analisada",
  discarded: "Descartada",
};

export const STORE_TRENDS = ["", "up", "down", "flat"] as const;
export type StoreTrend = (typeof STORE_TRENDS)[number];

export const STORE_TREND_LABEL: Record<StoreTrend, string> = {
  "": "Sem info",
  up: "A escalar",
  down: "A baixar",
  flat: "Estável",
};

export type CompetitorStoreView = {
  id: string;
  name: string;
  competitorLink: string;
  productCount: number | null;
  monthlyVisits: number | null;
  trend: StoreTrend;
  country: string;
  activeAds: number | null;
  priceRange: string;
  mainCategories: string;
  lastVerifiedKey: string;
  status: StoreStatus;
  niche: string;
  notes: string;
  bestSellers: string;
  authorName: string | null;
  activity: "active" | "inactive" | "";
};
