"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";

const noopSubscribe = () => () => {};

/**
 * Toggles light ↔ dark (no system option). useSyncExternalStore detects
 * hydration (false on the server, true on the client) so the icon only reflects
 * the real theme after mount — without a setState-in-effect.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const isDark = mounted && resolvedTheme === "dark";
  const next = isDark ? "light" : "dark";
  // Before mount the resolved theme is unknown; render the light-mode icon to
  // match the server paint and avoid a hydration mismatch.
  const Icon = isDark ? Moon : Sun;

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={mounted ? `Switch to ${next} mode` : "Toggle theme"}
      title={mounted ? (isDark ? "Dark mode" : "Light mode") : "Toggle theme"}
      className={cn(
        "flex size-9 items-center justify-center rounded-lg border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}
