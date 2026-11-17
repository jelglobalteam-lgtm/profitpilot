import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { getStoreCredentials } from "@/lib/shopify-sync";
import {
  SHOPIFY_API_VERSION,
  getClientCredentialsToken,
  normalizeShopDomain,
} from "@/lib/shopify";
import { timingSafeStringEqual } from "@/lib/timing-safe";
import { Store } from "@/models/Store";
import mongoose from "mongoose";
import {
  type BackupStore,
  type Gql,
  toolThemeReplace,
  toolThemeRestore,
  toolThemeSearch,
  toolThemeWriteFile,
} from "@/lib/mcp-theme";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Servidor MCP (JSON-RPC sobre HTTP) para o Claude falar com TODAS as lojas
 * Shopify ligadas ao ProfitPilot, sem reautorizações.
 * Autenticação: segredo MCP_SECRET no caminho do URL.
 */

type Json = Record<string, unknown>;
type RpcReq = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Json };

const TOOLS = [
  {
    name: "list_stores",
    description:
      "Lista as lojas Shopify ligadas ao ProfitPilot (nome, domínio, moeda).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "shopify_graphql",
    description:
      "Executa uma query ou mutation Shopify Admin GraphQL numa ou em várias lojas. " +
      "'stores': lista de domínios myshopify, nomes, ou [\"all\"] para todas. " +
      "Mutations só são executadas com confirm=true; sem isso devolve pré-visualização. " +
      "Nota: preços/IDs diferem por loja; para a mesma mutation em várias lojas use variáveis equivalentes ou chame uma loja de cada vez.",
    inputSchema: {
      type: "object",
      properties: {
        stores: { type: "array", items: { type: "string" } },
        query: { type: "string" },
        variables: { type: "object" },
        confirm: { type: "boolean" },
      },
      required: ["stores", "query"],
    },
  },
  {
    name: "theme_search",
    description:
      "Pesquisa texto/regex nos ficheiros de um tema Shopify, no servidor. " +
      "Devolve ficheiro, linha e excerto. 'store': domínio ou nome da loja. " +
      "'theme_id' opcional (omitido = tema ativo). 'files': globs opcionais (ex. [\"sections/*.liquid\"]). " +
      "'pattern' é regex (flags por defeito 'i'); com literal=true é texto simples.",
    inputSchema: {
      type: "object",
      properties: {
        store: { type: "string" },
        theme_id: { type: "string" },
        pattern: { type: "string" },
        flags: { type: "string" },
        literal: { type: "boolean" },
        files: { type: "array", items: { type: "string" } },
        context: { type: "number" },
        max: { type: "number" },
      },
      required: ["store", "pattern"],
    },
  },
  {
    name: "theme_replace",
    description:
      "Substitui texto/regex em vários ficheiros de um tema, no servidor. " +
      "Sem confirm=true só mostra o que mudaria. Com confirm=true grava, guarda " +
      "cópia de segurança (devolve backupId) e recusa JSON que ficasse inválido. " +
      "'rules': [{pattern, replacement, flags?, literal?}]. 'files': globs opcionais.",
    inputSchema: {
      type: "object",
      properties: {
        store: { type: "string" },
        theme_id: { type: "string" },
        rules: {
          type: "array",
          items: {
            type: "object",
            properties: {
              pattern: { type: "string" },
              replacement: { type: "string" },
              flags: { type: "string" },
              literal: { type: "boolean" },
            },
            required: ["pattern", "replacement"],
          },
        },
        files: { type: "array", items: { type: "string" } },
        confirm: { type: "boolean" },
      },
      required: ["store", "rules"],
    },
  },
  {
    name: "theme_write_file",
    description:
      "Cria ou substitui um ficheiro do tema: 'content' (texto) ou 'base64' (binário, ex. PNG em assets/). " +
      "Sem confirm=true só pré-visualiza. Ficheiros de texto existentes ficam com cópia de segurança.",
    inputSchema: {
      type: "object",
      properties: {
        store: { type: "string" },
        theme_id: { type: "string" },
        filename: { type: "string" },
        content: { type: "string" },
        base64: { type: "string" },
        confirm: { type: "boolean" },
      },
      required: ["store", "filename"],
    },
  },
  {
    name: "theme_restore",
    description:
      "Repõe os ficheiros guardados numa cópia de segurança (backupId de theme_replace/theme_write_file). Requer confirm=true.",
    inputSchema: {
      type: "object",
      properties: {
        store: { type: "string" },
        backup_id: { type: "string" },
        confirm: { type: "boolean" },
      },
      required: ["store", "backup_id"],
    },
  },
];

function rpcResult(id: RpcReq["id"], result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}
function rpcError(id: RpcReq["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}
function text(t: string, isError = false) {
  return { content: [{ type: "text", text: t }], isError };
}

async function loadStores() {
  await connectToDatabase();
  return Store.find({
    platform: "shopify",
    deletedAt: null,
    credentials: { $exists: true, $ne: null },
  }).lean();
}

async function runOnStore(
  store: Awaited<ReturnType<typeof loadStores>>[number],
  query: string,
  variables?: Json,
) {
  const domain = normalizeShopDomain(store.shopDomain ?? "");
  const { clientId, clientSecret } = getStoreCredentials(store as never);
  const { accessToken } = await getClientCredentialsToken(
    domain,
    clientId,
    clientSecret,
  );
  const res = await fetch(
    `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    },
  );
  return res.json();
}

const BACKUPS: BackupStore = {
  async save(backupId, themeId, files) {
    if (!files.length) return;
    await connectToDatabase();
    const col = mongoose.connection.db!.collection("theme_backups");
    await col.insertMany(
      files.map((f) => ({
        backupId,
        themeId,
        filename: f.filename,
        content: f.content,
        createdAt: new Date(),
      })),
    );
  },
  async load(backupId) {
    await connectToDatabase();
    const col = mongoose.connection.db!.collection("theme_backups");
    const docs = await col.find({ backupId }).toArray();
    return docs.map((d) => ({
      themeId: String(d.themeId),
      filename: String(d.filename),
      content: String(d.content),
    }));
  },
};

async function callTool(name: string, args: Json) {
  const stores = await loadStores();
  if (name === "list_stores") {
    return text(
      JSON.stringify(
        stores.map((s) => ({
          name: s.name,
          domain: s.shopDomain,
          currency: s.currency,
        })),
        null,
        2,
      ),
    );
  }
  if (name === "shopify_graphql") {
    const query = String(args.query ?? "");
    const variables = (args.variables as Json) ?? undefined;
    const wanted = ((args.stores as string[]) ?? []).map((x) =>
      x.toLowerCase(),
    );
    const all = wanted.includes("all");
    const targets = stores.filter(
      (s) =>
        all ||
        wanted.includes((s.shopDomain ?? "").toLowerCase()) ||
        wanted.includes(s.name.toLowerCase()),
    );
    if (!targets.length) return text("Nenhuma loja corresponde.", true);
    const isMutation = /^\s*mutation\b/i.test(query.replace(/#.*$/gm, ""));
    if (isMutation && args.confirm !== true) {
      return text(
        `PRÉ-VISUALIZAÇÃO (nada executado). Lojas: ${targets
          .map((s) => s.shopDomain)
          .join(", ")}\n${query}\nVariáveis: ${JSON.stringify(variables ?? {})}\nRepita com confirm=true para executar.`,
      );
    }
    const out: Json = {};
    for (const s of targets) {
      try {
        out[s.shopDomain ?? s.name] = await runOnStore(s, query, variables);
      } catch (e) {
        out[s.shopDomain ?? s.name] = {
          error: e instanceof Error ? e.message : "erro",
        };
      }
    }
    return text(JSON.stringify(out, null, 2));
  }
  if (name.startsWith("theme_")) {
    const wanted = String(args.store ?? "").toLowerCase();
    const store = stores.find(
      (s) =>
        (s.shopDomain ?? "").toLowerCase() === wanted ||
        s.name.toLowerCase() === wanted,
    );
    if (!store) return text("Nenhuma loja corresponde.", true);
    const gql: Gql = (query, variables) => runOnStore(store, query, variables);
    let out: unknown;
    if (name === "theme_search") out = await toolThemeSearch(gql, args);
    else if (name === "theme_replace")
      out = await toolThemeReplace(gql, BACKUPS, args);
    else if (name === "theme_write_file")
      out = await toolThemeWriteFile(gql, BACKUPS, args);
    else if (name === "theme_restore")
      out = await toolThemeRestore(gql, BACKUPS, args);
    else return text(`Ferramenta desconhecida: ${name}`, true);
    return text(JSON.stringify(out, null, 2));
  }
  return text(`Ferramenta desconhecida: ${name}`, true);
}

async function handle(msg: RpcReq) {
  switch (msg.method) {
    case "initialize":
      return rpcResult(msg.id, {
        protocolVersion:
          (msg.params?.protocolVersion as string) ?? "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "profitpilot-shopify", version: "1.0.0" },
      });
    case "ping":
      return rpcResult(msg.id, {});
    case "tools/list":
      return rpcResult(msg.id, { tools: TOOLS });
    case "tools/call":
      try {
        return rpcResult(
          msg.id,
          await callTool(
            String(msg.params?.name ?? ""),
            (msg.params?.arguments as Json) ?? {},
          ),
        );
      } catch (e) {
        return rpcResult(
          msg.id,
          text(e instanceof Error ? e.message : "Erro.", true),
        );
      }
    default:
      return msg.id === undefined
        ? null
        : rpcError(msg.id, -32601, "Método não suportado.");
  }
}

function authorized(token: string) {
  const secret = process.env.MCP_SECRET;
  return Boolean(secret && secret.length >= 24 && timingSafeStringEqual(token, secret));
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  if (!authorized(token)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json(rpcError(null, -32700, "JSON inválido."), {
      status: 400,
    });
  }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map(handle))).filter(Boolean);
    return NextResponse.json(out);
  }
  const out = await handle(body as RpcReq);
  if (!out) return new NextResponse(null, { status: 202 });
  return NextResponse.json(out);
}

export async function GET() {
  return new NextResponse(null, { status: 405 });
}
