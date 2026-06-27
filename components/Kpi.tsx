import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function Kpi({
  label,
  value,
  hint,
  loading,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  loading?: boolean;
  className?: string;
}) {
  return (
    <Card className={cn("p-4", className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-24" />
      ) : (
        <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-balance">
          {value}
        </p>
      )}
      {hint && !loading ? (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </Card>
  );
}
