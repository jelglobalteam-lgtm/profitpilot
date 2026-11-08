"use client";

import { useState, useTransition } from "react";
import type { InvoiceFinding } from "@/lib/cs-invoice-check";
import { checkMiaInvoiceAction } from "./invoice-actions";

export function InvoicesTab({ canEdit }: { canEdit: boolean }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ lines?: number; findings?: InvoiceFinding[]; message?: string; error?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Cole as linhas da fatura da Mia, uma por linha, no formato encomenda;valor (opcionalmente ;produto;preço
        unitário). A fatura normal é de 3 € por encomenda. Confere duplicados, valores acima, encomendas canceladas
        ou inexistentes e preços diferentes da última cotação.
      </p>
      <textarea
        rows={8}
        className="w-full rounded-md border border-border bg-background p-2 font-mono text-sm"
        placeholder={"1001;3\n1002;3\n1002;3"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {canEdit && (
        <button
          type="button"
          disabled={pending || !text.trim()}
          className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background disabled:opacity-50"
          onClick={() => start(async () => setResult(await checkMiaInvoiceAction(text)))}
        >
          {pending ? "A conferir..." : "Conferir fatura"}
        </button>
      )}
      {result?.error && <p className="text-sm text-negative">{result.error}</p>}
      {result?.findings && (
        <div className="space-y-2">
          <p className="text-sm">
            {result.lines} linhas conferidas,{" "}
            {result.findings.length === 0 ? "sem divergências." : `${result.findings.length} divergências.`}
          </p>
          {result.findings.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-border bg-surface p-3 text-sm">
              {result.findings.map((f, i) => (
                <li key={i}>{f.message}</li>
              ))}
            </ul>
          )}
          {result.message && (
            <div className="space-y-2">
              <textarea readOnly rows={6} className="w-full rounded-md border border-border bg-background p-2 text-sm" value={result.message} />
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1 text-sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(result.message ?? "");
                  setCopied(true);
                }}
              >
                {copied ? "Copiado" : "Copiar mensagem à Mia"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
