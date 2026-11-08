/** Estados normalizados do Parcel Panel. */
export const SHIPMENT_STATUSES = [
  "pending",
  "info_received",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "failed_attempt",
  "exception",
  "expired",
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = {
  pending: "Pendente",
  info_received: "Informação recebida",
  in_transit: "Em trânsito",
  out_for_delivery: "Em distribuição",
  delivered: "Entregue",
  failed_attempt: "Tentativa falhada",
  exception: "Exceção",
  expired: "Expirado",
};

export type ShipmentRow = {
  orderNumber: string;
  tracking: string;
  carrier: string;
  status: ShipmentStatus;
  rawStatus: string;
  lastEventAt: Date | null;
  lastEvent: string;
  orderedAt: Date | null;
  customerEmail: string;
};

export function normalizeStatus(raw: string): ShipmentStatus {
  const s = raw.toLowerCase();
  if (/deliver(ed|y)\b/.test(s) && !/fail|attempt|out for|not/.test(s)) return "delivered";
  if (/out for|distribui/.test(s)) return "out_for_delivery";
  if (/attempt|fail|tentativa/.test(s)) return "failed_attempt";
  if (/exception|undeliver|return|exce/.test(s)) return "exception";
  if (/expire/.test(s)) return "expired";
  if (/transit|tr[aâ]nsito/.test(s)) return "in_transit";
  if (/info/.test(s)) return "info_received";
  return "pending";
}

/** Divide uma linha CSV respeitando aspas. */
function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

function parseDate(raw: string): Date | null {
  if (!raw) return null;
  const t = Date.parse(raw.replace(" ", "T"));
  if (!Number.isNaN(t)) return new Date(t);
  const m = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] ?? 0), +(m[5] ?? 0)));
  return null;
}

const ALIASES: Record<string, string[]> = {
  orderNumber: ["order number", "order", "order no", "order name", "order id", "encomenda", "número da encomenda"],
  tracking: ["tracking number", "tracking no", "tracking", "rastreio", "número de rastreio"],
  carrier: ["carrier", "courier", "carrier name", "transportadora"],
  status: ["status", "shipment status", "delivery status", "estado"],
  lastEventAt: ["last checkpoint time", "last update", "last event time", "last tracking update", "last updated", "latest event time", "última atualização"],
  lastEvent: ["last checkpoint", "last event", "latest event", "last tracking info", "última informação"],
  orderedAt: ["order date", "ordered at", "created at", "date", "data da encomenda"],
  customerEmail: ["email", "customer email", "e-mail"],
};

export function parseParcelPanelCsv(text: string): { rows: ShipmentRow[]; errors: string[] } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], errors: ["O ficheiro está vazio."] };
  const delim = [";", "\t", ","].sort(
    (a, b) => lines[0].split(b).length - lines[0].split(a).length,
  )[0];
  const header = splitLine(lines[0], delim).map((h) => h.toLowerCase());
  const idx: Record<string, number> = {};
  for (const [k, names] of Object.entries(ALIASES)) {
    idx[k] = header.findIndex((h) => names.includes(h.replace(/^#/, "")));
  }
  if (idx.orderNumber < 0 || idx.status < 0) {
    return { rows: [], errors: ["Não encontrei as colunas da encomenda e do estado. Confirme que é o export do Parcel Panel."] };
  }
  const get = (c: string[], k: string) => (idx[k] >= 0 ? (c[idx[k]] ?? "") : "");
  const rows: ShipmentRow[] = [];
  const errors: string[] = [];
  lines.slice(1).forEach((line, i) => {
    const c = splitLine(line, delim);
    const orderNumber = get(c, "orderNumber").replace(/^#/, "");
    if (!orderNumber) { errors.push(`Linha ${i + 2}: sem número de encomenda.`); return; }
    const rawStatus = get(c, "status");
    rows.push({
      orderNumber,
      tracking: get(c, "tracking"),
      carrier: get(c, "carrier"),
      status: normalizeStatus(rawStatus),
      rawStatus,
      lastEventAt: parseDate(get(c, "lastEventAt")),
      lastEvent: get(c, "lastEvent"),
      orderedAt: parseDate(get(c, "orderedAt")),
      customerEmail: get(c, "customerEmail"),
    });
  });
  return { rows, errors };
}

export type ShipmentAlert = "excecao" | "tentativa_falhada" | "parado" | "sem_movimento" | "expirado";

/** Alertas: exceção, tentativa falhada, expirado, em trânsito parado 7+ dias, pendente 3+ dias. */
export function shipmentAlert(
  r: Pick<ShipmentRow, "status" | "lastEventAt" | "orderedAt">,
  now = Date.now(),
): ShipmentAlert | null {
  const days = (d: Date | null) => (d ? Math.floor((now - d.getTime()) / 86_400_000) : null);
  if (r.status === "exception") return "excecao";
  if (r.status === "failed_attempt") return "tentativa_falhada";
  if (r.status === "expired") return "expirado";
  if (r.status === "in_transit") {
    const d = days(r.lastEventAt);
    if (d != null && d >= 7) return "parado";
  }
  if (r.status === "pending" || r.status === "info_received") {
    const d = days(r.orderedAt);
    if (d != null && d >= 3) return "sem_movimento";
  }
  return null;
}

export const SHIPMENT_ALERT_LABEL: Record<ShipmentAlert, string> = {
  excecao: "Exceção na transportadora",
  tentativa_falhada: "Tentativa de entrega falhada",
  parado: "Em trânsito sem movimento há 7+ dias",
  sem_movimento: "Sem primeiro evento há 3+ dias",
  expirado: "Rastreio expirado",
};

export type ShipmentView = {
  orderNumber: string;
  tracking: string;
  carrier: string;
  status: ShipmentStatus;
  lastEventAt: string | null;
  lastEvent: string;
  orderedAt: string | null;
  importedAt: string;
};
