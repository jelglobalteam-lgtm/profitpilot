/** Leitura da exportação de conversa do WhatsApp (ficheiro .txt, Android ou iPhone). Função pura, sem acesso à base. */
export type WhatsAppMessage = { at: Date; sender: string; text: string };

const ANDROID = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(?:[ap]\.?m\.?)?\s*[-–]\s+([^:]+?):\s?(.*)$/i;
const IOS = /^\[(\d{1,2})[/.](\d{1,2})[/.](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(?:[ap]\.?m\.?)?\]\s+([^:]+?):\s?(.*)$/i;

function toDate(d: string, m: string, y: string, hh: string, mm: string, ss?: string): Date {
  const year = y.length === 2 ? 2000 + Number(y) : Number(y);
  return new Date(Date.UTC(year, Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss ?? 0)));
}

export function parseWhatsAppExport(raw: string): WhatsAppMessage[] {
  const out: WhatsAppMessage[] = [];
  const clean = raw.replace(/[‎‏‪-‮﻿]/g, "");
  for (const line of clean.split(/\r?\n/)) {
    const m = ANDROID.exec(line) ?? IOS.exec(line);
    if (m) {
      out.push({ at: toDate(m[1], m[2], m[3], m[4], m[5], m[6]), sender: m[7].trim(), text: m[8] });
    } else if (out.length && line.length) {
      out[out.length - 1].text += `\n${line}`;
    }
  }
  return out;
}

export function whatsAppSenders(messages: WhatsAppMessage[]): string[] {
  return [...new Set(messages.map((m) => m.sender))];
}
