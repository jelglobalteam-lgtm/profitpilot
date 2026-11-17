/**
 * Ferramentas de tema para o servidor MCP: pesquisa e substituição de texto
 * nos ficheiros de um tema Shopify, a correr no servidor (sem passar os
 * ficheiros pela conversa). Escritas só com confirmação e com cópia de
 * segurança em MongoDB para poder repor.
 */

type Json = Record<string, unknown>;
export type Gql = (query: string, variables?: Json) => Promise<Json>;
export type BackupStore = {
  save: (
    backupId: string,
    themeId: string,
    files: { filename: string; content: string }[],
  ) => Promise<void>;
  load: (
    backupId: string,
  ) => Promise<{ themeId: string; filename: string; content: string }[]>;
};

export type ThemeFile = { filename: string; content: string };
export type ReplaceRule = {
  pattern: string;
  replacement: string;
  flags?: string;
  literal?: boolean;
};

const TEXT_TYPE = /(^text\/)|json|javascript|liquid|svg|xml/i;
const FETCH_BATCH = 20;
const UPSERT_BATCH = 25;

/** Converte um glob simples (*, **, ?) num RegExp. */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

export function matchesGlobs(filename: string, globs?: string[]): boolean {
  if (!globs || !globs.length) return true;
  return globs.some((g) => globToRegExp(g).test(filename));
}

function buildRegExp(rule: ReplaceRule | { pattern: string; flags?: string; literal?: boolean }, extraFlags = "") {
  const source = rule.literal
    ? rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    : rule.pattern;
  const flags = new Set((rule.flags ?? "i").split("").concat(extraFlags.split("")));
  flags.delete("");
  return new RegExp(source, [...flags].join(""));
}

export type SearchMatch = { file: string; line: number; text: string };

export function searchFiles(
  files: ThemeFile[],
  pattern: string,
  opts: { flags?: string; literal?: boolean; context?: number; max?: number } = {},
) {
  const re = buildRegExp({ pattern, flags: opts.flags, literal: opts.literal }, "g");
  const context = opts.context ?? 90;
  const max = opts.max ?? 200;
  const counts: Record<string, number> = {};
  const matches: SearchMatch[] = [];
  let total = 0;
  for (const f of files) {
    const lines = f.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(lines[i])) !== null) {
        total++;
        counts[f.filename] = (counts[f.filename] ?? 0) + 1;
        if (matches.length < max) {
          const start = Math.max(0, m.index - context);
          const end = Math.min(lines[i].length, m.index + m[0].length + context);
          matches.push({
            file: f.filename,
            line: i + 1,
            text: lines[i].slice(start, end),
          });
        }
        if (m[0].length === 0) re.lastIndex++;
      }
    }
  }
  return { total, counts, matches, truncated: total > matches.length };
}

/** Remove o comentário de cabeçalho que a Shopify põe nos JSON de tema. */
function stripJsonComment(s: string) {
  return s.replace(/^\s*\/\*[\s\S]*?\*\//, "");
}

export function isValidThemeJson(content: string): boolean {
  try {
    JSON.parse(stripJsonComment(content));
    return true;
  } catch {
    return false;
  }
}

export type ReplacePlan = {
  filename: string;
  before: string;
  after: string;
  count: number;
  samples: { before: string; after: string }[];
  invalidJson?: boolean;
};

export function planReplacements(
  files: ThemeFile[],
  rules: ReplaceRule[],
): ReplacePlan[] {
  const compiled = rules.map((r) => ({
    re: buildRegExp(r, "g"),
    replacement: r.literal
      ? r.replacement.replace(/\$/g, "$$$$")
      : r.replacement,
  }));
  const plans: ReplacePlan[] = [];
  for (const f of files) {
    let content = f.content;
    let count = 0;
    const samples: { before: string; after: string }[] = [];
    for (const { re, replacement } of compiled) {
      const single = new RegExp(re.source, re.flags.replace("g", ""));
      for (const m of content.matchAll(re)) {
        count++;
        if (samples.length < 3 && m[0].length > 0) {
          samples.push({ before: m[0], after: m[0].replace(single, replacement) });
        }
      }
      content = content.replace(re, replacement);
    }
    if (count > 0 && content !== f.content) {
      const plan: ReplacePlan = {
        filename: f.filename,
        before: f.content,
        after: content,
        count,
        samples,
      };
      if (f.filename.endsWith(".json") && !isValidThemeJson(content)) {
        plan.invalidJson = true;
      }
      plans.push(plan);
    }
  }
  return plans;
}

// ---------------------------------------------------------------------------
// Acesso à Shopify

export async function resolveThemeId(gql: Gql, themeId?: string) {
  if (themeId) return themeId;
  const r = (await gql(
    `{ themes(first: 50, roles: [MAIN]) { nodes { id name role } } }`,
  )) as { data?: { themes?: { nodes?: { id: string }[] } } };
  const id = r.data?.themes?.nodes?.[0]?.id;
  if (!id) throw new Error("Não foi possível obter o tema ativo.");
  return id;
}

export async function listThemeFiles(gql: Gql, themeId: string) {
  const out: { filename: string; size: number; contentType: string }[] = [];
  let after: string | null = null;
  for (let page = 0; page < 20; page++) {
    const r = (await gql(
      `query($id: ID!, $after: String){ theme: node(id:$id){ ... on OnlineStoreTheme { files(first: 250, after: $after){ pageInfo{hasNextPage endCursor} nodes{ filename size contentType } } } } }`,
      { id: themeId, after },
    )) as {
      data?: {
        theme?: {
          files: {
            pageInfo: { hasNextPage: boolean; endCursor: string };
            nodes: { filename: string; size: string | number; contentType: string }[];
          };
        };
      };
      errors?: { message: string }[];
    };
    const files = r.data?.theme?.files;
    if (!files) {
      throw new Error(r.errors?.[0]?.message ?? "Tema não encontrado.");
    }
    for (const n of files.nodes) {
      out.push({
        filename: n.filename,
        size: Number(n.size),
        contentType: n.contentType ?? "",
      });
    }
    if (!files.pageInfo.hasNextPage) break;
    after = files.pageInfo.endCursor;
  }
  return out;
}

export async function readThemeFiles(
  gql: Gql,
  themeId: string,
  filenames: string[],
): Promise<ThemeFile[]> {
  const batches: string[][] = [];
  for (let i = 0; i < filenames.length; i += FETCH_BATCH) {
    batches.push(filenames.slice(i, i + FETCH_BATCH));
  }
  const results: ThemeFile[] = [];
  const PARALLEL = 3;
  for (let i = 0; i < batches.length; i += PARALLEL) {
    const chunk = await Promise.all(
      batches.slice(i, i + PARALLEL).map(async (names) => {
        const r = (await gql(
          `query($id: ID!, $names: [String!]!){ theme: node(id:$id){ ... on OnlineStoreTheme { files(first: ${FETCH_BATCH}, filenames: $names){ nodes{ filename body{ ... on OnlineStoreThemeFileBodyText{ content } } } } } } }`,
          { id: themeId, names },
        )) as {
          data?: {
            theme?: {
              files: {
                nodes: { filename: string; body?: { content?: string } }[];
              };
            };
          };
          errors?: { message: string }[];
        };
        const nodes = r.data?.theme?.files.nodes;
        if (!nodes) throw new Error(r.errors?.[0]?.message ?? "Falha a ler ficheiros.");
        return nodes
          .filter((n) => typeof n.body?.content === "string")
          .map((n) => ({ filename: n.filename, content: n.body!.content! }));
      }),
    );
    for (const c of chunk) results.push(...c);
  }
  return results;
}

/** Lê todos os ficheiros de texto do tema que correspondem aos globs. */
export async function loadTextFiles(
  gql: Gql,
  themeId: string,
  globs?: string[],
) {
  const all = await listThemeFiles(gql, themeId);
  const wanted = all.filter(
    (f) => TEXT_TYPE.test(f.contentType) && matchesGlobs(f.filename, globs),
  );
  const files = await readThemeFiles(
    gql,
    themeId,
    wanted.map((f) => f.filename),
  );
  return { files, scanned: wanted.length, total: all.length };
}

type UpsertInput = { filename: string; type: "TEXT" | "BASE64"; value: string };

export async function upsertFiles(gql: Gql, themeId: string, files: UpsertInput[]) {
  const written: string[] = [];
  const errors: { filename?: string; message: string }[] = [];
  for (let i = 0; i < files.length; i += UPSERT_BATCH) {
    const batch = files.slice(i, i + UPSERT_BATCH);
    const r = (await gql(
      `mutation($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!){ themeFilesUpsert(themeId: $themeId, files: $files){ upsertedThemeFiles{ filename } userErrors{ filename message } } }`,
      {
        themeId,
        files: batch.map((f) => ({
          filename: f.filename,
          body: { type: f.type, value: f.value },
        })),
      },
    )) as {
      data?: {
        themeFilesUpsert?: {
          upsertedThemeFiles?: { filename: string }[];
          userErrors?: { filename?: string; message: string }[];
        };
      };
      errors?: { message: string }[];
    };
    const res = r.data?.themeFilesUpsert;
    if (!res) {
      errors.push({ message: r.errors?.[0]?.message ?? "Erro desconhecido." });
      continue;
    }
    for (const f of res.upsertedThemeFiles ?? []) written.push(f.filename);
    for (const e of res.userErrors ?? []) errors.push(e);
  }
  return { written, errors };
}

// ---------------------------------------------------------------------------
// Ferramentas

export async function toolThemeSearch(gql: Gql, args: Json) {
  const themeId = await resolveThemeId(gql, args.theme_id as string | undefined);
  const { files, scanned, total } = await loadTextFiles(
    gql,
    themeId,
    args.files as string[] | undefined,
  );
  const res = searchFiles(files, String(args.pattern ?? ""), {
    flags: args.flags as string | undefined,
    literal: args.literal === true,
    context: args.context as number | undefined,
    max: args.max as number | undefined,
  });
  return { themeId, filesScanned: scanned, filesInTheme: total, ...res };
}

export async function toolThemeReplace(
  gql: Gql,
  backups: BackupStore,
  args: Json,
) {
  const rules = (args.rules as ReplaceRule[]) ?? [];
  if (!rules.length) throw new Error("Falta 'rules'.");
  const themeId = await resolveThemeId(gql, args.theme_id as string | undefined);
  const { files, scanned } = await loadTextFiles(
    gql,
    themeId,
    args.files as string[] | undefined,
  );
  const plans = planReplacements(files, rules);
  const summary = plans.map((p) => ({
    file: p.filename,
    replacements: p.count,
    invalidJson: p.invalidJson === true,
    samples: p.samples,
  }));
  if (args.confirm !== true) {
    return {
      dryRun: true,
      themeId,
      filesScanned: scanned,
      filesChanged: plans.length,
      summary,
      note: "Nada gravado. Repita com confirm=true para aplicar (é criada uma cópia de segurança).",
    };
  }
  const safe = plans.filter((p) => !p.invalidJson);
  const skipped = plans.filter((p) => p.invalidJson).map((p) => p.filename);
  const backupId = `bk_${Date.now().toString(36)}`;
  await backups.save(
    backupId,
    themeId,
    safe.map((p) => ({ filename: p.filename, content: p.before })),
  );
  const { written, errors } = await upsertFiles(
    gql,
    themeId,
    safe.map((p) => ({ filename: p.filename, type: "TEXT", value: p.after })),
  );
  return {
    dryRun: false,
    themeId,
    backupId,
    written,
    skippedInvalidJson: skipped,
    errors,
    summary,
  };
}

export async function toolThemeWriteFile(
  gql: Gql,
  backups: BackupStore,
  args: Json,
) {
  const filename = String(args.filename ?? "");
  if (!filename) throw new Error("Falta 'filename'.");
  const hasText = typeof args.content === "string";
  const hasB64 = typeof args.base64 === "string";
  if (hasText === hasB64) throw new Error("Indique 'content' ou 'base64'.");
  const themeId = await resolveThemeId(gql, args.theme_id as string | undefined);
  if (args.confirm !== true) {
    return {
      dryRun: true,
      themeId,
      filename,
      bytes: hasText
        ? Buffer.byteLength(args.content as string)
        : Buffer.from(args.base64 as string, "base64").length,
      note: "Nada gravado. Repita com confirm=true.",
    };
  }
  let backupId: string | undefined;
  if (hasText) {
    const existing = await readThemeFiles(gql, themeId, [filename]);
    if (existing.length) {
      backupId = `bk_${Date.now().toString(36)}`;
      await backups.save(backupId, themeId, existing);
    }
    if (filename.endsWith(".json") && !isValidThemeJson(args.content as string)) {
      throw new Error("JSON inválido; nada foi gravado.");
    }
  }
  const { written, errors } = await upsertFiles(gql, themeId, [
    {
      filename,
      type: hasText ? "TEXT" : "BASE64",
      value: (hasText ? args.content : args.base64) as string,
    },
  ]);
  return { dryRun: false, themeId, backupId, written, errors };
}

export async function toolThemeRestore(
  gql: Gql,
  backups: BackupStore,
  args: Json,
) {
  const backupId = String(args.backup_id ?? "");
  const docs = await backups.load(backupId);
  if (!docs.length) throw new Error("Cópia de segurança não encontrada.");
  const themeId = docs[0].themeId;
  if (args.confirm !== true) {
    return {
      dryRun: true,
      themeId,
      files: docs.map((d) => d.filename),
      note: "Nada reposto. Repita com confirm=true.",
    };
  }
  const { written, errors } = await upsertFiles(
    gql,
    themeId,
    docs.map((d) => ({ filename: d.filename, type: "TEXT" as const, value: d.content })),
  );
  return { dryRun: false, themeId, written, errors };
}
