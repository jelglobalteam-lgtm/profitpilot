import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isValidThemeJson,
  matchesGlobs,
  planReplacements,
  searchFiles,
} from "../src/lib/mcp-theme.ts";

describe("matchesGlobs", () => {
  it("aceita tudo sem globs", () => {
    assert.equal(matchesGlobs("sections/a.liquid"), true);
  });
  it("respeita * e **", () => {
    assert.equal(matchesGlobs("sections/a.liquid", ["sections/*.liquid"]), true);
    assert.equal(matchesGlobs("sections/x/a.liquid", ["sections/*.liquid"]), false);
    assert.equal(matchesGlobs("templates/customers/a.json", ["templates/**"]), true);
    assert.equal(matchesGlobs("assets/base.css", ["sections/*"]), false);
  });
});

describe("searchFiles", () => {
  const files = [
    { filename: "a.liquid", content: "Benvenuti da RivaSylt\nnulla\nriva-sylt.it" },
    { filename: "b.json", content: "{\"x\":\"RIVASYLT\"}" },
  ];
  it("conta e localiza sem distinguir maiúsculas", () => {
    const r = searchFiles(files, "riva[ _-]?sylt");
    assert.equal(r.total, 3);
    assert.deepEqual(r.counts, { "a.liquid": 2, "b.json": 1 });
    assert.equal(r.matches[0].line, 1);
  });
  it("modo literal escapa metacaracteres", () => {
    const r = searchFiles(files, "riva-sylt.it", { literal: true });
    assert.equal(r.total, 1);
  });
  it("respeita max", () => {
    const r = searchFiles(files, "riva", { max: 1 });
    assert.equal(r.matches.length, 1);
    assert.equal(r.truncated, true);
  });
});

describe("planReplacements", () => {
  it("substitui e conta; ignora ficheiros sem alterações", () => {
    const plans = planReplacements(
      [
        { filename: "a.liquid", content: "RivaSylt e rivasylt" },
        { filename: "b.liquid", content: "nada" },
      ],
      [{ pattern: "riva-?sylt", replacement: "Essenza Vera" }],
    );
    assert.equal(plans.length, 1);
    assert.equal(plans[0].after, "Essenza Vera e Essenza Vera");
    assert.equal(plans[0].count, 2);
  });
  it("literal trata $ como texto", () => {
    const plans = planReplacements(
      [{ filename: "a.liquid", content: "preço X" }],
      [{ pattern: "X", replacement: "$1", literal: true }],
    );
    assert.equal(plans[0].after, "preço $1");
  });
  it("assinala JSON que ficaria inválido", () => {
    const plans = planReplacements(
      [{ filename: "a.json", content: "/* c */\n{\"a\":\"x\"}" }],
      [{ pattern: "\"x\"", replacement: "x", literal: true }],
    );
    assert.equal(plans[0].invalidJson, true);
  });
});

describe("isValidThemeJson", () => {
  it("aceita o comentário de cabeçalho da Shopify", () => {
    assert.equal(isValidThemeJson("/* a\n * b */\n{\"a\":1}"), true);
    assert.equal(isValidThemeJson("{a:1}"), false);
  });
});
