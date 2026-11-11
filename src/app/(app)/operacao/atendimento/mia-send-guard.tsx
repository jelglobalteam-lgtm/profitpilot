"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

export type MiaCoverageView = { until: string | null; importedAt: string | null };

const fmt = (d: Date) =>
  d.toLocaleString("pt-PT", {
    timeZone: "Europe/Lisbon",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const GuardContext = createContext<(onConfirm: () => void) => void>((onConfirm) => onConfirm());

/** Antes de copiar qualquer mensagem à Mia, pede confirmação e mostra até quando a conversa está importada. */
export function useConfirmMiaSend() {
  return useContext(GuardContext);
}

export function MiaSendGuard({ coverage, children }: { coverage: MiaCoverageView; children: React.ReactNode }) {
  const [open, setOpen] = useState<{ run: () => void; now: Date } | null>(null);
  const ask = useCallback((run: () => void) => setOpen({ run, now: new Date() }), []);
  const value = useMemo(() => ask, [ask]);

  const until = coverage.until ? new Date(coverage.until) : null;
  const importedAt = coverage.importedAt ? new Date(coverage.importedAt) : null;
  const hours = until && open ? Math.floor((open.now.getTime() - until.getTime()) / 3_600_000) : null;
  const old = hours != null && hours >= 3;

  return (
    <GuardContext.Provider value={value}>
      {children}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(null)}>
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md space-y-3 rounded-lg border border-border bg-surface p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">Tem a certeza que quer enviar?</h2>
            <p className="text-sm">
              {until ? (
                <>
                  A última mensagem da conversa com a Mia que importámos é de <strong>{fmt(until)}</strong>
                  {hours != null && hours >= 1 ? ` (há ${hours} h)` : ""}.
                </>
              ) : (
                <>Ainda não foi importada nenhuma conversa com a Mia.</>
              )}
            </p>
            {importedAt && <p className="text-sm text-muted-foreground">Importada na app em {fmt(importedAt)}.</p>}
            <p className="text-sm text-muted-foreground">Agora, na app, são {fmt(open.now)}.</p>
            <p className={old || !until ? "text-sm font-medium text-negative" : "text-sm"}>
              A mensagem pode estar desatualizada: a Mia pode já ter respondido ou enviado faturas depois desta hora.
              Importe primeiro a conversa mais recente, se não tiver a certeza.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setOpen(null)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const run = open.run;
                  setOpen(null);
                  run();
                }}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground"
              >
                Sim, copiar a mensagem
              </button>
            </div>
          </div>
        </div>
      )}
    </GuardContext.Provider>
  );
}
