import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseMiaInvoiceNotes } from "@/lib/cs-whatsapp";

const msg = (h: number, m: number, text: string, sender = "Mia") => ({ at: new Date(2026, 10, 10, h, m), sender, text });

describe("parseMiaInvoiceNotes", () => {
  it("lê número, valor e saldo da Mia", () => {
    const notes = parseMiaInvoiceNotes(
      [
        msg(6, 10, "Total Amount:€ 70\\nInvoice Number:WWLLY20261110A01-TPB updated".replace("\\n", "\n")),
        msg(6, 10, "All left :89.11-15.34-70=€3.77"),
        msg(7, 0, "Hi", "Emanuel"),
      ],
      "Mia",
    );
    assert.equal(notes.length, 1);
    assert.equal(notes[0].number, "WWLLY20261110A01");
    assert.equal(notes[0].amount, 70);
    assert.equal(notes[0].balance, 3.77);
  });
  it("ignora outras mensagens", () => {
    assert.deepEqual(parseMiaInvoiceNotes([msg(6, 10, "ok")], "Mia"), []);
  });
});
