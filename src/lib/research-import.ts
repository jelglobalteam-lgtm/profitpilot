/** Formato TXT para importar lojas e coleções/produtos na Pesquisa PR. */

export const IMPORT_TEMPLATE = `# MODELO DE IMPORTAÇÃO · Pesquisa PR
# Cada bloco é separado por uma linha com ---
# Deixe em branco o que não souber. Linhas a começar por # são ignoradas.

TIPO: LOJA
LINK: https://exemplo.com
NOME:
PAIS: DE
VISITAS_MENSAIS: 120000
TENDENCIA: A escalar
N_PRODUTOS: 85
ANUNCIOS_ATIVOS: 40
FAIXA_PRECO: 20€-60€
CATEGORIAS: Casacos, Botas
NICHO: Moda mulher
ULTIMA_VERIFICACAO: 2026-10-12
STATUS: Por analisar
ATIVA: Ativa
BEST_SELLERS: Casaco X, Bota Y
NOTAS:

---

TIPO: COLECAO
NOME: Casacos
ALCANCE: 320000
DIAS_ATIVOS: 30
LINK_ANUNCIO: https://facebook.com/ads/library/...
LINK_LOJA: https://exemplo.com/collections/casacos
MERCADO: DE
DATA: 2026-10-12
GENERO: Homem
ANGULO: Single image
ESTADO: Novo
ATIVA: Ativa
NOTAS:

# Valores aceites
# TIPO: LOJA | COLECAO | PRODUTO
# TENDENCIA: A escalar | A baixar | Estável
# ATIVA (loja e coleção): Ativa | Desativa (vazio = sem estado)
# STATUS (loja): Por analisar | A acompanhar | Analisada | Descartada
# GENERO: Mulher | Homem | Unissex
# ESTADO (coleção/produto): Novo | Shortlist | A testar | Winner | Descartado
`;

export type ParsedBlock = {
  index: number;
  fields: Record<string, string>;
};

function normKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[\s\-.]+/g, "_");
}

export function norm(raw: string): string {
  return raw.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

export function parseImportText(text: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  let current: Record<string, string> = {};
  let lastKey: string | null = null;
  let index = 0;

  const flush = () => {
    if (Object.keys(current).length) {
      index += 1;
      blocks.push({ index, fields: current });
    }
    current = {};
    lastKey = null;
  };

  for (const line of text.replace(/\r/g, "").split("\n")) {
    const trimmed = line.trim();
    if (/^-{3,}$/.test(trimmed)) {
      flush();
      continue;
    }
    if (trimmed.startsWith("#")) continue;
    if (!trimmed) {
      lastKey = null;
      continue;
    }
    const m = /^([A-Za-zÀ-ÿ_ .\-]{2,40}):\s*(.*)$/.exec(trimmed);
    if (m) {
      lastKey = normKey(m[1]);
      current[lastKey] = m[2].trim();
    } else if (lastKey) {
      current[lastKey] = `${current[lastKey]}\n${trimmed}`.trim();
    }
  }
  flush();
  return blocks;
}

/** "320 000", "320.000", "120k", "1,2M" -> número. */
export function parseCount(raw: string | undefined): number | null {
  if (!raw) return null;
  let s = norm(raw).replace(/\s/g, "");
  if (!s) return null;
  let mult = 1;
  if (/[0-9][km]$/.test(s)) {
    mult = s.endsWith("m") ? 1_000_000 : 1_000;
    s = s.slice(0, -1);
  }
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  else s = s.replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * mult);
}

export function parseDateKey(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return s;
  m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

export function parseTrend(
  raw: string | undefined,
): "" | "up" | "down" | "flat" {
  const s = norm(raw ?? "");
  if (!s) return "";
  if (/escal|^up|sub|cresc|▲/.test(s)) return "up";
  if (/baix|down|desc|cai|▼/.test(s)) return "down";
  if (/estav|flat|igual/.test(s)) return "flat";
  return "";
}

export function parseStoreStatus(
  raw: string | undefined,
): "to_analyze" | "monitoring" | "analyzed" | "discarded" {
  const s = norm(raw ?? "");
  if (/acompanh|monitor/.test(s)) return "monitoring";
  if (/analisad|analyzed/.test(s)) return "analyzed";
  if (/descart|reject/.test(s)) return "discarded";
  return "to_analyze";
}

export function parseItemStatus(
  raw: string | undefined,
): "new" | "shortlist" | "testing" | "winner" | "rejected" {
  const s = norm(raw ?? "");
  if (/shortlist/.test(s)) return "shortlist";
  if (/test/.test(s)) return "testing";
  if (/winner/.test(s)) return "winner";
  if (/descart|reject/.test(s)) return "rejected";
  return "new";
}

export function parseGender(
  raw: string | undefined,
): "female" | "male" | "unisex" | "unknown" {
  const s = norm(raw ?? "");
  if (/mulher|female|fem/.test(s)) return "female";
  if (/homem|male|masc/.test(s)) return "male";
  if (/unis/.test(s)) return "unisex";
  return "unknown";
}

export function parseActivity(
  raw: string | undefined,
): "active" | "inactive" | "" {
  const s = norm(raw ?? "");
  if (!s) return "";
  if (/^(desativ|inativ|inactiv|nao|no\b|off|false|0)/.test(s))
    return "inactive";
  if (/^(ativ|activ|sim|yes|on\b|true|1)/.test(s)) return "active";
  return "";
}

export function parseBlockKind(
  raw: string | undefined,
): "store" | "collection" | "product" | null {
  const s = norm(raw ?? "");
  if (/^(loja|store|concorrente)/.test(s)) return "store";
  if (/^(colec|collection)/.test(s)) return "collection";
  if (/^(produto|product)/.test(s)) return "product";
  return null;
}

export function normalizeUrl(raw: string | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}
