"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  SHIPMENT_ALERT_LABEL,
  SHIPMENT_STATUS_LABEL,
  shipmentAlert,
  type ShipmentView,
  type ShipmentStatus,
} from "@/lib/parcelpanel-csv";
import { importParcelPanelCsvAction } from "./shipment-actions";


const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon" }) : "—";

export function ShipmentsTab({ shipments, canEdit }: { shipments: ShipmentView[]; canEdit: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const withAlert = shipments
    .map((s) => ({
      s,
      alert: shipmentAlert({
        status: s.status,
        lastEventAt: s.lastEventAt ? new Date(s.lastEventAt) : null,
        orderedAt: s.orderedAt ? new Date(s.orderedAt) : null,
      }),
    }))
    .filter((x) => x.alert);
  const counts = new Map<string, number>();
  for (const s of shipments) counts.set(s.status, (counts.get(s.status) ?? 0) + 1);
  const lastImport = shipments.reduce((m, s) => (s.importedAt > m ? s.importedAt : m), "");

  function onFile(f: File | undefined) {
    if (!f) return;
    start(async () => {
      const r = await importParcelPanelCsvAction(await f.text());
      setMsg(r.error ?? `${r.imported} envios importados.${r.warnings?.length ? " " + r.warnings.join(" ") : ""}`);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        A exportação de CSV do Parcel Panel só existe no plano Profissional. Com esse plano, em Pedidos, use
        Exportar e carregue aqui o CSV todos os dias: os envios em exceção, com tentativa falhada ou parados
        aparecem como alertas. No plano Essencial a rotina diária lê os estados no Parcel Panel.
        {lastImport && ` Última importação: ${day(lastImport)}.`}
      </p>
      {canEdit && (
        <div className="flex items-center gap-3">
          <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <button
            type="button"
            disabled={pending}
            onClick={() => input.current?.click()}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            {pending ? "A importar..." : "Importar CSV do Parcel Panel"}
          </button>
          {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
        </div>
      )}
      <div className="flex flex-wrap gap-2 text-sm">
        {[...counts.entries()].map(([k, n]) => (
          <span key={k} className="rounded-full border border-border bg-surface px-3 py-1">
            {SHIPMENT_STATUS_LABEL[k as ShipmentStatus]} <span className="tabular-nums">({n})</span>
          </span>
        ))}
      </div>
      {withAlert.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {shipments.length ? "Sem alertas nos envios importados." : "Ainda não importou nenhum CSV."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="text-[13px] text-muted-foreground">
              <tr>
                <th className="p-3">Encomenda</th>
                <th className="p-3">Rastreio</th>
                <th className="p-3">Transportadora</th>
                <th className="p-3">Estado</th>
                <th className="p-3">Último evento</th>
                <th className="p-3">Alerta</th>
              </tr>
            </thead>
            <tbody>
              {withAlert.map(({ s, alert }) => (
                <tr key={s.orderNumber} className="border-t border-border align-top">
                  <td className="p-3 font-medium">#{s.orderNumber}</td>
                  <td className="p-3">{s.tracking || "—"}</td>
                  <td className="p-3">{s.carrier || "—"}</td>
                  <td className="p-3">{SHIPMENT_STATUS_LABEL[s.status]}</td>
                  <td className="p-3">
                    {day(s.lastEventAt)}
                    {s.lastEvent && <span className="block text-xs text-muted-foreground">{s.lastEvent}</span>}
                  </td>
                  <td className="p-3 text-negative">{alert && SHIPMENT_ALERT_LABEL[alert]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
