"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { setActivityAction } from "./activity-actions";

type Activity = "active" | "inactive" | "";

export function ActivityToggle({
  target,
  id,
  value,
  canEdit,
}: {
  target: "item" | "store";
  id: string;
  value: Activity;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  function set(next: "active" | "inactive") {
    if (!canEdit) return;
    setError(false);
    startTransition(async () => {
      const res = await setActivityAction(
        target,
        id,
        value === next ? "" : next,
      );
      if (res.error) setError(true);
      else router.refresh();
    });
  }

  const base =
    "px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60";
  return (
    <div
      className={cn(
        "inline-flex overflow-hidden rounded-lg border",
        error ? "border-negative" : "border-border",
      )}
    >
      <button
        type="button"
        disabled={!canEdit || pending}
        onClick={() => set("active")}
        className={cn(
          base,
          value === "active"
            ? "bg-positive text-white"
            : "text-positive hover:bg-positive/10",
        )}
      >
        Ativa
      </button>
      <button
        type="button"
        disabled={!canEdit || pending}
        onClick={() => set("inactive")}
        className={cn(
          base,
          "border-l border-border",
          value === "inactive"
            ? "bg-negative text-white"
            : "text-negative hover:bg-negative/10",
        )}
      >
        Desativa
      </button>
    </div>
  );
}
