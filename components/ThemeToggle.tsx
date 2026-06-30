"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";

const noopSubscribe = () => () => {};

/**
 * Cycles light → dark → system. Uses useSyncExternalStore to detect hydration
 * (false on the server, true on the client) so the icon only reflects the real
 * theme after mount — without a setState-in-effect.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const order = ["light", "dark", "system"] as const;
  const current = (theme as (typeof order)[number]) ?? "system";
  const next = order[(order.indexOf(current) + 1) % order.length];

  // Before mount, render exactly what the server emits (theme is unknown there,
  // so it resolves to "system"). Gating the icon AND the label/title on `mounted`
  // keeps the first client paint identical to the server — no hydration mismatch.
  const displayCurrent = mounted ? current : "system";
  const displayNext = mounted ? next : "light";

  const Icon = !mounted
    ? Sun
    : current === "dark"
      ? Moon
      : current === "system"
        ? Monitor
        : Sun;

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${displayCurrent}. Switch to ${displayNext}.`}
      title={`Theme: ${displayCurrent}`}
      className={cn(
        "flex size-9 items-center justify-center rounded-lg border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}
