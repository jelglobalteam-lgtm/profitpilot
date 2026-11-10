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
