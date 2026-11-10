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

import { checkInvoices, missingInvoiceAlerts } from "../src/lib/cs-invoices.ts";

test("avisos de faturas por importar", () => {
  const now = Date.parse("2026-11-08T00:00:00Z");
  const base = { id: "1", number: "A", dueDate: null, currency: "EUR", amount: 5, paid: true, quantity: null, orderFrom: null, orderTo: null, miaBalance: null, periodFrom: null, periodTo: null, lines: [], notes: "", appSpend: null };
  const mia = { ...base, kind: "mia_imposto" as const, issueDate: "2026-11-07T00:00:00Z" };
  const g = { ...base, kind: "agencia_google" as const, issueDate: "2026-11-05T00:00:00Z" };
  assert.equal(missingInvoiceAlerts([mia, g], now).length, 0);
  assert.equal(missingInvoiceAlerts([{ ...mia, issueDate: "2026-11-01T00:00:00Z" }, g], now).length, 1);
  assert.equal(missingInvoiceAlerts([], now).length, 2);
});

test("lacuna entre intervalos de faturas da Mia", () => {
  const base = { id: "1", number: "A", dueDate: null, currency: "EUR", amount: 5, paid: true, quantity: 14, orderFrom: null, orderTo: null, miaBalance: null, periodFrom: null, periodTo: null, lines: [], notes: "", appSpend: null, kind: "mia_imposto" as const };
  const a = { ...base, id: "a", number: "F1", issueDate: "2026-11-05T00:00:00Z", orderFrom: 1018, orderTo: 1031 };
  const b = { ...base, id: "b", number: "F2", issueDate: "2026-11-07T00:00:00Z", orderFrom: 1044, orderTo: 1057 };
  const gap = checkInvoices([a, b]).filter((i) => i.message.startsWith("Faltam faturas"));
  assert.equal(gap.length, 1);
  assert.match(gap[0].message, /#1032 a #1043/);
  assert.equal(checkInvoices([a, { ...b, orderFrom: 1032, orderTo: 1045 }]).filter((i) => i.message.startsWith("Faltam faturas")).length, 0);
});

import { miaPriceIncreaseMessage } from "../src/lib/cs-quotes.ts";

test("mensagem à Mia quando o preço sobe", () => {
  const m = miaPriceIncreaseMessage({ title: "Casaco", link: "https://x.it/products/c", from: 5, to: 6, at: "2026-11-05T10:00:00Z", currency: "EUR" });
  assert.match(m, /from 5\.00 EUR to 6\.00 EUR/);
  assert.match(m, /explain the change/);
});

test("exportação do WhatsApp: Android, iPhone e linhas seguidas", async () => {
  const { parseWhatsAppExport, whatsAppSenders } = await import("../src/lib/cs-whatsapp.ts");
  const android = "08/11/2026, 14:05 - Mia: Hi Emanuel\nsecond line\n08/11/2026, 14:07 - Emanuel: ok";
  const a = parseWhatsAppExport(android);
  assert.equal(a.length, 2);
  assert.equal(a[0].text, "Hi Emanuel\nsecond line");
  assert.deepEqual(whatsAppSenders(a), ["Mia", "Emanuel"]);
  const ios = parseWhatsAppExport("[08/11/2026, 14:05:30] Mia: Done");
  assert.equal(ios[0].at.toISOString(), "2026-11-08T14:05:30.000Z");
});

test("mensagem à Mia em bloco: uma só saudação", async () => {
  const { miaBatchMessage } = await import("../src/lib/cs-quotes.ts");
  const one = miaBatchMessage(["Hi Mia, is it possible to change size? Thank you."]);
  assert.equal(one, "Hi Mia,\n\nIs it possible to change size?\n\nThank you.");
  const two = miaBatchMessage(["Hi Mia, question A. Thank you.", "Hi Mia, question B."]);
  assert.equal(two.match(/Hi Mia/g)?.length, 1);
  assert.ok(two.includes("1. Question A.") && two.includes("2. Question B."));
  const rem = miaBatchMessage([], ["Hi Mia, size change on #1081."]);
  assert.ok(rem.includes("gentle reminder") && rem.includes("Size change on #1081."));
});

test("exportação do WhatsApp: ordem mês/dia, PM e datas futuras", async () => {
  const { parseWhatsAppExport } = await import("../src/lib/cs-whatsapp.ts");
  const now = new Date("2026-11-10T01:00:00Z");
  const us = parseWhatsAppExport("11/8/26, 2:05 PM - Mia: a\n11/13/26, 1:00 AM - Mia: b", now);
  assert.equal(us[0].at.toISOString(), "2026-11-08T14:05:00.000Z");
  assert.equal(us.length, 1);
  const eu = parseWhatsAppExport("08/11/2026, 14:05 - Mia: a\n13/10/2026, 09:00 - Mia: b", now);
  assert.equal(eu[0].at.toISOString(), "2026-11-08T14:05:00.000Z");
});
