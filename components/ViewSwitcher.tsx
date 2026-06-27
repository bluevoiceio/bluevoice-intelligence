"use client";

import { LayoutDashboard, Map } from "lucide-react";

import { cn } from "@/lib/utils";

export type AppViewId = "health" | "explorer";

export function ViewSwitcher({
  value,
  onChange,
}: {
  value: AppViewId;
  onChange: (v: AppViewId) => void;
}) {
  const options: { id: AppViewId; icon: typeof Map; label: string }[] = [
    { id: "health", icon: LayoutDashboard, label: "Health" },
    { id: "explorer", icon: Map, label: "Explorer" },
  ];
  return (
    <div className="inline-flex items-center rounded-lg border bg-muted/40 p-0.5">
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            aria-pressed={active}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
