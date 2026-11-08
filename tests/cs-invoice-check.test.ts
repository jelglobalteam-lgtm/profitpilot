import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInvoice, miaInvoiceMessage, parseInvoiceText } from "../src/lib/cs-invoice-check.ts";

const ctx = {
  orders: new Map([["1001", { cancelled: false, refunded: false }], ["1002", { cancelled: true, refunded: false }]]),
  quotedCogs: new Map([["ring", 4.5]]),
};

test("deteta duplicado, valor acima, cancelada e inexistente", () => {
  const { lines } = parseInvoiceText("1001;3\n1001;3\n1002;6\n9999;3");
  const kinds = checkInvoice(lines, ctx).map((f) => `${f.kind}:${f.orderNumber}`);
  assert.deepEqual(kinds.sort(), ["cancelada:1002", "duplicado:1001", "encomenda_inexistente:9999", "valor_acima:1002"].sort());
});

test("fatura certa não gera divergências e preço diferente é apanhado", () => {
  assert.equal(checkInvoice(parseInvoiceText("1001;3").lines, ctx).length, 0);
  const f = checkInvoice(parseInvoiceText("1001;12;Ring;4").lines, ctx);
  assert.equal(f[0].kind, "preco_diferente");
  assert.match(miaInvoiceMessage(f), /Order #1001/);
});
