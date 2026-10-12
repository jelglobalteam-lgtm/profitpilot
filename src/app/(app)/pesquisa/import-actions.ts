"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import mongoose from "mongoose";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { roleRank } from "@/lib/rbac";
import { ResearchItem } from "@/models/ResearchItem";
import { CompetitorStore } from "@/models/CompetitorStore";
import { parseDateInput, startOfDay } from "@/lib/period";
import {
  normalizeUrl,
  parseBlockKind,
  parseCount,
  parseDateKey,
  parseGender,
  parseImportText,
  parseItemStatus,
  parseStoreStatus,
  parseTrend,
} from "@/lib/research-import";

export type ImportResult = {
  ok?: boolean;
  error?: string;
  created: number;
  skipped: number;
  messages: string[];
};

const MAX_BLOCKS = 200;

function dateOrNull(key: string | null): Date | null {
  if (!key) return null;
  const d = parseDateInput(key);
  return d ? startOfDay(d) : null;
}

export async function importResearchTxtAction(
  text: string,
): Promise<ImportResult> {
  const empty = { created: 0, skipped: 0, messages: [] as string[] };
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roleRank(user.role) < roleRank("editor")) {
    return { ...empty, error: "Sem permissão para importar." };
  }
  if (!text || text.length > 300_000) {
    return { ...empty, error: "Ficheiro vazio ou demasiado grande." };
  }
  const blocks = parseImportText(text);
  if (!blocks.length) {
    return { ...empty, error: "Não encontrei nenhum bloco no ficheiro." };
  }
  if (blocks.length > MAX_BLOCKS) {
    return { ...empty, error: `Máximo de ${MAX_BLOCKS} blocos por ficheiro.` };
  }

  await connectToDatabase();
  const workspaceId = new mongoose.Types.ObjectId(user.workspaceId);
  const createdBy = new mongoose.Types.ObjectId(user.id);
  let created = 0;
  let skipped = 0;
  const messages: string[] = [];

  for (const { index, fields: f } of blocks) {
    const kind = parseBlockKind(f.TIPO);
    if (!kind) {
      messages.push(
        `Bloco ${index}: TIPO em falta ou inválido (LOJA, COLECAO ou PRODUTO).`,
      );
      skipped++;
      continue;
    }
    try {
      if (kind === "store") {
        const link = normalizeUrl(f.LINK ?? f.COMPETITOR_LINK);
        if (!link) {
          messages.push(`Bloco ${index}: LINK em falta.`);
          skipped++;
          continue;
        }
        const dup = await CompetitorStore.exists({
          workspaceId,
          competitorLink: link,
          deletedAt: null,
        });
        if (dup) {
          messages.push(`Bloco ${index}: loja já existe (${link}).`);
          skipped++;
          continue;
        }
        await CompetitorStore.create({
          workspaceId,
          name: (f.NOME ?? "").slice(0, 120),
          competitorLink: link,
          productCount: parseCount(f.N_PRODUTOS ?? f.N_PRODUCTS),
          monthlyVisits: parseCount(f.VISITAS_MENSAIS ?? f.VISITAS),
          trend: parseTrend(f.TENDENCIA),
          country: (f.PAIS ?? f.COUNTRY ?? f.MERCADO ?? "").slice(0, 40),
          activeAds: parseCount(f.ANUNCIOS_ATIVOS ?? f.ACTIVE_ADS),
          priceRange: (f.FAIXA_PRECO ?? f.PRICE_RANGE ?? "").slice(0, 80),
          mainCategories: (f.CATEGORIAS ?? "").slice(0, 300),
          lastVerifiedAt:
            dateOrNull(parseDateKey(f.ULTIMA_VERIFICACAO ?? f.LAST_VERIFIED)) ??
            startOfDay(new Date()),
          status: parseStoreStatus(f.STATUS),
          niche: (f.NICHO ?? "").slice(0, 120),
          notes: (f.NOTAS ?? f.NOTES ?? "").slice(0, 4000),
          bestSellers: (f.BEST_SELLERS ?? "").slice(0, 2000),
          createdBy,
        });
      } else {
        const name = (f.NOME ?? f.NAME ?? "").trim();
        if (!name) {
          messages.push(`Bloco ${index}: NOME em falta.`);
          skipped++;
          continue;
        }
        const market = (f.MERCADO ?? f.MARKET ?? f.PAIS ?? "").slice(0, 80);
        const dup = await ResearchItem.exists({
          workspaceId,
          kind,
          name: new RegExp(
            `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            "i",
          ),
          market,
          deletedAt: null,
        });
        if (dup) {
          messages.push(`Bloco ${index}: «${name}» já existe.`);
          skipped++;
          continue;
        }
        await ResearchItem.create({
          workspaceId,
          kind,
          name: name.slice(0, 200),
          reach: parseCount(f.ALCANCE ?? f.REACH),
          activeDays: parseCount(f.DIAS_ATIVOS ?? f.ACTIVE_DAYS),
          fbAdLink: normalizeUrl(f.LINK_ANUNCIO ?? f.FB_AD_LINK),
          storeLink: normalizeUrl(f.LINK_LOJA ?? f.STORE_LINK),
          market,
          researchedAt:
            dateOrNull(parseDateKey(f.DATA ?? f.DATE)) ??
            startOfDay(new Date()),
          gender: parseGender(f.GENERO ?? f.GENDER),
          notes: (f.NOTAS ?? f.NOTES ?? "").slice(0, 4000),
          angle: (f.ANGULO ?? f.ANGLE ?? "").slice(0, 300),
          status: parseItemStatus(f.ESTADO ?? f.STATUS),
          createdBy,
        });
      }
      created++;
    } catch {
      messages.push(`Bloco ${index}: erro ao gravar.`);
      skipped++;
    }
  }

  revalidatePath("/pesquisa");
  return { ok: true, created, skipped, messages };
}
