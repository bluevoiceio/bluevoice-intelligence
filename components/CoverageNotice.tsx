import { Info, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Inline coverage notice (spec §4). Two flavors:
 *  - "warning" → the selected event isn't reliably State-tagged.
 *  - "info"    → a footnote, e.g. count of untagged events.
 */
export function CoverageNotice({
  variant = "warning",
  children,
  className,
}: {
  variant?: "warning" | "info";
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = variant === "warning" ? TriangleAlert : Info;
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
        variant === "warning"
          ? "border-warning/30 bg-warning/10 text-warning"
          : "border-border bg-muted/50 text-muted-foreground",
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <p className="text-pretty">{children}</p>
    </div>
  );
}
