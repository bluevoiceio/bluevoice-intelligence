"use client";

import { BandArc } from "@/components/intelligence/BandArc";
import { bandColor } from "@/components/intelligence/lens";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Narrative } from "@/lib/narrative";
import type { IntelligenceSummary } from "@/lib/intelligence";

export function Cover({
  narrative,
  summary,
  loading,
}: {
  narrative: Narrative | null;
  summary?: IntelligenceSummary;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-primary">The state of the book</p>
          {loading || !narrative ? (
            <Skeleton className="mt-3 h-9 w-80 max-w-full" />
          ) : (
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance">{narrative.thesis}</h1>
          )}
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground text-balance">
            {narrative?.verdict ?? "Loading the book…"}
          </p>
          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
            {(narrative?.coverStats ?? []).map((s) => (
              <div key={s.label}>
                <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
                <div className="text-[11px] text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-3">
          <BandArc bands={summary?.bands ?? { green: 0, yellow: 0, red: 0 }} total={summary?.total ?? 0} />
          <div className="flex gap-3 text-xs text-muted-foreground">
            {(["green", "yellow", "red"] as const).map((b) => (
              <span key={b} className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: bandColor(b).solid }} />
                <span className="tabular-nums">{summary ? summary.bands[b] : "—"}</span>
              </span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
