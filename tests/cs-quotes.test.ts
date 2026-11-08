import { test } from "node:test";
import assert from "node:assert/strict";
import { miaQuoteMessage, nextQuoteThreshold, quoteStatus } from "../src/lib/cs-quotes.ts";

test("patamares de cotação", () => {
  assert.equal(nextQuoteThreshold(0), 30);
  assert.equal(nextQuoteThreshold(30), 60);
  assert.equal(nextQuoteThreshold(60), 90);
  assert.equal(nextQuoteThreshold(90), 100);
  assert.equal(nextQuoteThreshold(100), 200);
});

test("estado do produto", () => {
  assert.equal(quoteStatus(29, [], false), "em_dia");
  assert.equal(quoteStatus(31, [], false), "por_pedir");
  const r = { units: 30, requestedAt: "", repliedAt: null, qualityCheck: true, response: null, price: null, note: "" };
  assert.equal(quoteStatus(70, [r], false), "a_aguardar");
  assert.equal(quoteStatus(70, [{ ...r, repliedAt: "x", response: "aceitou" }], false), "por_confirmar");
  assert.equal(quoteStatus(70, [{ ...r, repliedAt: "x", response: "aceitou" }], true), "por_pedir");
});

test("mensagem à Mia não indica desconto", () => {
  const m = miaQuoteMessage({ title: "Ring", link: "https://x", units: 30, qualityCheck: true });
  assert.match(m, /reached 30 units sold/);
  assert.doesNotMatch(m, /discount|%|target/i);
});
