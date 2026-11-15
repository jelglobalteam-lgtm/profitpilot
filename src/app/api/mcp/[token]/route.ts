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
