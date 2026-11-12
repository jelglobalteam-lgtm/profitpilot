/** Leitura da exportação de conversa do WhatsApp (ficheiro .txt, Android ou iPhone). Função pura, sem acesso à base. */
export type WhatsAppMessage = { at: Date; sender: string; text: string };

const ANDROID = /^(\d{1,4})[/.](\d{1,2})[/.](\d{1,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?\s*[-–]\s+([^:]+?):\s?(.*)$/i;
const IOS = /^\[(\d{1,4})[/.](\d{1,2})[/.](\d{1,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?\]\s+([^:]+?):\s?(.*)$/i;

type Raw = { a: number; b: number; c: number; hh: number; mm: number; ss: number; ampm: string; sender: string; text: string };

/** Descobre a ordem da data olhando para o ficheiro todo (dia/mês/ano, mês/dia/ano ou ano/mês/dia). */
function dateOrder(raws: Raw[]): "dmy" | "mdy" | "ymd" {
  if (raws.some((r) => r.a > 31)) return "ymd";
  if (raws.some((r) => r.a > 12)) return "dmy";
  if (raws.some((r) => r.b > 12)) return "mdy";
  return "dmy";
}

export function parseWhatsAppExport(raw: string, now = new Date()): WhatsAppMessage[] {
  const raws: Raw[] = [];
  const clean = raw.replace(/[‎‏‪-‮﻿]/g, "");
  for (const line of clean.split(/\r?\n/)) {
    const m = ANDROID.exec(line) ?? IOS.exec(line);
    if (m) {
      raws.push({
        a: Number(m[1]), b: Number(m[2]), c: Number(m[3]), hh: Number(m[4]), mm: Number(m[5]), ss: Number(m[6] ?? 0),
        ampm: (m[7] ?? "").toLowerCase().replace(/\./g, ""), sender: m[8].trim(), text: m[9],
      });
    } else if (raws.length && line.length) {
      raws[raws.length - 1].text += `\n${line}`;
    }
  }
  const order = dateOrder(raws);
  const limit = now.getTime() + 86_400_000;
  const out: WhatsAppMessage[] = [];
  for (const r of raws) {
    const [d, mo, y] = order === "dmy" ? [r.a, r.b, r.c] : order === "mdy" ? [r.b, r.a, r.c] : [r.c, r.b, r.a];
    const year = y < 100 ? 2000 + y : y;
    let hh = r.hh;
    if (r.ampm === "pm" && hh < 12) hh += 12;
    if (r.ampm === "am" && hh === 12) hh = 0;
    const at = new Date(Date.UTC(year, mo - 1, d, hh, r.mm, r.ss));
    // Datas no futuro só podem ser leitura errada: ignora a mensagem.
    if (Number.isNaN(at.getTime()) || at.getTime() > limit) continue;
    out.push({ at, sender: r.sender, text: r.text });
  }
  return out;
}

export function whatsAppSenders(messages: WhatsAppMessage[]): string[] {
  return [...new Set(messages.map((m) => m.sender))];
}

export type MiaInvoiceNote = { number: string; amount: number | null; balance: number | null; at: Date };

const toNum = (s: string) => Number(s.replace(",", "."));

/**
 * Procura na conversa as mensagens em que a Mia anuncia uma fatura ("Invoice Number:WWLLY...", "Total Amount:€ 70")
 * e o saldo que se segue ("All left :89.11-15.34-70=€3.77"). Função pura.
 */
export function parseMiaInvoiceNotes(messages: WhatsAppMessage[], miaName: string): MiaInvoiceNote[] {
  const name = miaName.trim().toLowerCase();
  const mine = messages.filter((m) => m.sender.toLowerCase() === name).sort((a, b) => a.at.getTime() - b.at.getTime());
  const notes: MiaInvoiceNote[] = [];
  for (let i = 0; i < mine.length; i++) {
    const m = mine[i];
    const num = m.text.match(/Invoice\s*Number\s*[:：]?\s*(WWLLY\d{8}[A-Z]\d{1,3})/i);
    if (!num) continue;
    const amt = m.text.match(/Total\s*Amount\s*[:：]?\s*€?\s*(\d+(?:[.,]\d{1,2})?)/i);
    let balance: number | null = null;
    const next = mine[i + 1];
    const text = next && next.at.getTime() - m.at.getTime() < 6 * 3600_000 ? next.text : "";
    const left = text.match(/All\s*left\s*[:：]?[^=]*=\s*€?\s*(-?\d+(?:[.,]\d{1,2})?)/i);
    if (left) balance = toNum(left[1]);
    notes.push({ number: num[1].toUpperCase(), amount: amt ? toNum(amt[1]) : null, balance, at: m.at });
  }
  return notes;
}

export type OpenMiaQuestion = { id: string; text: string; sentAt: Date };
export type MiaReplyLink = { questionId: string; reply: string; at: Date };

const orderNumbers = (s: string) => new Set([...s.matchAll(/#\s?(\d{3,6})\b/g)].map((m) => m[1]));

/**
 * Liga respostas da Mia a pedidos em aberto, só quando a resposta cita o número da encomenda (#1081) que o pedido também cita
 * e foi escrita depois de o pedido ser enviado. Respostas sem número ficam por ligar (ambíguas). Função pura.
 */
export function linkMiaReplies(replies: { text: string; at: Date }[], questions: OpenMiaQuestion[]): MiaReplyLink[] {
  const out: MiaReplyLink[] = [];
  const used = new Set<string>();
  for (const r of [...replies].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const nums = orderNumbers(r.text);
    if (nums.size === 0) continue;
    for (const q of questions) {
      if (used.has(q.id) || q.sentAt.getTime() > r.at.getTime()) continue;
      const qn = orderNumbers(q.text);
      if ([...nums].some((n) => qn.has(n))) {
        used.add(q.id);
        out.push({ questionId: q.id, reply: r.text, at: r.at });
      }
    }
  }
  return out;
}
