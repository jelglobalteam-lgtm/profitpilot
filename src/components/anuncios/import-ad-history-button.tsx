"use client";

import { useState, useTransition } from "react";
import { syncAdAccountsNowAction } from "@/app/(app)/anuncios/ad-account-actions";

/** Importa até 45 dias de gasto das contas API ligadas (backfill existente). */
export function ImportAdHistoryButton({
  storeId,
  onDone,
}: {
  storeId: string;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  function run() {
    start(async () => {
      setMsg(null);
      const res = await syncAdAccountsNowAction(storeId, { fullBackfill: true });
      if (res.error) {
        setIsError(true);
        setMsg(res.error);
        return;
      }
      setIsError(false);
      setMsg("Histórico importado.");
      onDone();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-60"
      >
        {pending ? "A importar…" : "Importar histórico (45 dias)"}
      </button>
      {msg && (
        <span
          className={
            isError ? "text-xs text-negative" : "text-xs text-muted-foreground"
          }
        >
          {msg}
        </span>
      )}
    </div>
  );
}
