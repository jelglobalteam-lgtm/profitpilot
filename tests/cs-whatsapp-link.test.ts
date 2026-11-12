import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { linkMiaReplies } from "@/lib/cs-whatsapp";

const q = (id: string, text: string, h: number) => ({ id, text, sentAt: new Date(2026, 10, 12, h, 0) });
const r = (text: string, h: number) => ({ text, at: new Date(2026, 10, 12, h, 30) });

describe("linkMiaReplies", () => {
  it("liga pelo número da encomenda", () => {
    const l = linkMiaReplies([r("Order #1081 swapped to M", 9)], [q("a", "change size of order #1081", 8), q("b", "order #1056 stuck", 8)]);
    assert.deepEqual(l.map((x) => x.questionId), ["a"]);
  });
  it("não liga resposta sem número nem anterior ao pedido", () => {
    assert.deepEqual(linkMiaReplies([r("Done", 9)], [q("a", "order #1081", 8)]), []);
    assert.deepEqual(linkMiaReplies([r("#1081 ok", 7)], [q("a", "order #1081", 8)]), []);
  });
});
