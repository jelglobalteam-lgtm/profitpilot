import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compensationError, confirmationText } from "@/lib/cs-compensation";

describe("compensationError", () => {
  it("aceita só percentagens do funil", () => {
    assert.equal(compensationError("reembolso_parcial", 20, "rivasylt-it"), null);
    assert.equal(compensationError("credito", 75, "rivasylt-de"), null);
    assert.equal(compensationError("cancelamento", 100, "alma-vicentina"), null);
    assert.ok(compensationError("reembolso_parcial", 40, "rivasylt-it"));
    assert.ok(compensationError("credito", 20, "rivasylt-it"));
    assert.ok(compensationError("cancelamento", 50, "rivasylt-it"));
  });
  it("nega crédito na Alma Vicentina e tipos desconhecidos", () => {
    assert.ok(compensationError("credito", 75, "alma-vicentina"));
    assert.ok(compensationError("reembolso_total", 100, "rivasylt-it"));
  });
});

describe("confirmationText", () => {
  it("pergunta se tem a certeza com tipo, percentagem e valor", () => {
    const t = confirmationText({ kind: "credito", percent: 75, amount: 44.96 }, "#1071");
    assert.match(t, /Tem a certeza/);
    assert.match(t, /crédito de loja de 75%/);
    assert.match(t, /#1071/);
  });
});
