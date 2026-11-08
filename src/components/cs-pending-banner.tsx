"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BellRing } from "lucide-react";

type Item = { key: string; label: string; count: number; tab: string };

/** Aviso em todas as páginas com o que está pendente do lado do Emanuel (atendimento, cotações, faturas, envios). */
export function CsPendingBanner() {
  const [items, setItems] = useState<Item[]>([]);
  const pathname = usePathname();

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await fetch("/api/cs-pending", { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { items?: Item[] };
        if (alive) setItems(j.items ?? []);
      } catch {
        /* sem rede: mantém o último estado */
      }
    }
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pathname]);

  if (items.length === 0) return null;
  return (
    <div className="border-b border-warning/30 bg-warning/10 px-4 py-2.5 md:px-6">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1.5">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <BellRing className="h-4 w-4 shrink-0 text-warning" />
          Tem coisas por fazer
        </p>
        {items.map((i) => (
          <Link
            key={i.key}
            href={`/operacao/atendimento?tab=${i.tab}`}
            className="rounded-md border border-warning/40 bg-surface px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
          >
            {i.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
