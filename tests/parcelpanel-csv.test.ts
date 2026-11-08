import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeStatus, parseParcelPanelCsv, shipmentAlert } from "../src/lib/parcelpanel-csv.ts";

test("estados normalizados", () => {
  assert.equal(normalizeStatus("Delivered"), "delivered");
  assert.equal(normalizeStatus("In Transit"), "in_transit");
  assert.equal(normalizeStatus("Out for delivery"), "out_for_delivery");
  assert.equal(normalizeStatus("Failed attempt"), "failed_attempt");
  assert.equal(normalizeStatus("Exception"), "exception");
  assert.equal(normalizeStatus("Pending"), "pending");
});

test("lê CSV com aspas e ponto e vírgula", () => {
  const csv = 'Order number;Tracking number;Carrier;Status;Last checkpoint time\n#1001;"AB;1";DHL;In Transit;2026-11-01 10:00\n';
  const { rows, errors } = parseParcelPanelCsv(csv);
  assert.equal(errors.length, 0);
  assert.equal(rows[0].orderNumber, "1001");
  assert.equal(rows[0].tracking, "AB;1");
  assert.equal(rows[0].status, "in_transit");
});

test("alerta de envio parado", () => {
  const now = Date.parse("2026-11-10T00:00:00Z");
  assert.equal(shipmentAlert({ status: "in_transit", lastEventAt: new Date("2026-11-01"), orderedAt: null }, now), "parado");
  assert.equal(shipmentAlert({ status: "in_transit", lastEventAt: new Date("2026-11-08"), orderedAt: null }, now), null);
});
