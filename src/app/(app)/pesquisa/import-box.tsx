"use client";

import { useRouter } from "next/navigation";
import { Download, Upload } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { IMPORT_TEMPLATE } from "@/lib/research-import";
import { importResearchTxtAction, type ImportResult } from "./import-actions";

export function ImportBox() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);

  function downloadTemplate() {
    const blob = new Blob([IMPORT_TEMPLATE], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-importacao-pesquisa.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    setResult(null);
    startTransition(async () => {
      const res = await importResearchTxtAction(text);
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Importar de ficheiro TXT</span>
        <button
          type="button"
          onClick={downloadTemplate}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted"
        >
          <Download className="h-3.5 w-3.5" /> Descarregar modelo
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" />
          {pending ? "A importar…" : "Carregar TXT"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".txt,text/plain"
          className="hidden"
          onChange={onFile}
        />
      </div>
      {result && (
        <div className="mt-2 text-xs">
          {result.error ? (
            <p className="text-negative">{result.error}</p>
          ) : (
            <p className="text-positive">
              {result.created} importadas, {result.skipped} ignoradas.
            </p>
          )}
          {result.messages.map((m, i) => (
            <p key={i} className="text-muted-foreground">
              {m}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
