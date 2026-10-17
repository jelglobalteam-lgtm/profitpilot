"use client";

import { cn } from "@/lib/utils";

export type ActivityFilterValue = "" | "active" | "inactive";

export function ActivityFilter({
  value,
  onChange,
}: {
  value: ActivityFilterValue;
  onChange: (v: ActivityFilterValue) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-border text-xs font-medium">
      {(
        [
          ["", "Todas"],
          ["active", "Ativas"],
          ["inactive", "Desativadas"],
        ] as const
      ).map(([k, l], i) => (
        <button
          key={k || "all"}
          type="button"
          onClick={() => onChange(k)}
          className={cn(
            "px-3 py-1.5 transition-colors",
            i > 0 && "border-l border-border",
            value === k
              ? k === "active"
                ? "bg-positive text-white"
                : k === "inactive"
                  ? "bg-negative text-white"
                  : "bg-accent text-accent-foreground"
              : "hover:bg-muted",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
