"use client";

import { useMemo } from "react";

import type { AccountIntelligence } from "@/lib/intelligence";
import { LensGlyph } from "@/components/intelligence/LensGlyph";
import { bandColor } from "@/components/intelligence/lens";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtCompact } from "@/lib/format";

const N = 6;

/**
 * Biggest movers — the book in motion. Two ranked columns (gaining / sliding vs
 * the prior window, by question volume) where each row is a live account: its
 * health glyph, a swing bar scaled to the largest move on screen, prior→current
 * volume, and the shared hover card on hover.
 */
export function MoversSlope({
  accounts,
  onHover,
}: {
  accounts: AccountIntelligence[];
  onHover?: (a: AccountIntelligence | null, e?: React.MouseEvent) => void;
}) {
  const { risers, fallers, max } = useMemo(() => {
    const withDelta = accounts.filter(
      (a): a is AccountIntelligence & { deltaPct: number } => a.deltaPct != null,
    );
    const risers = withDelta.filter((a) => a.deltaPct > 0).sort((x, y) => y.deltaPct - x.deltaPct).slice(0, N);
    const fallers = withDelta.filter((a) => a.deltaPct < 0).sort((x, y) => x.deltaPct - y.deltaPct).slice(0, N);
    const max = Math.max(1, ...risers.map((a) => a.deltaPct), ...fallers.map((a) => Math.abs(a.deltaPct)));
    return { risers, fallers, max };
  }, [accounts]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Biggest movers</CardTitle>
        <CardDescription>
          Departments gaining and sliding versus the prior window, by question volume. Hover any row for its signature.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-x-10 gap-y-3 sm:grid-cols-2">
        <MoverColumn title="Gaining" dir="up" rows={risers} max={max} onHover={onHover} />
        <MoverColumn title="Sliding" dir="down" rows={fallers} max={max} onHover={onHover} />
      </CardContent>
    </Card>
  );
}

function MoverColumn({
  title,
  dir,
  rows,
  max,
  onHover,
}: {
  title: string;
  dir: "up" | "down";
  rows: AccountIntelligence[];
  max: number;
  onHover?: (a: AccountIntelligence | null, e?: React.MouseEvent) => void;
}) {
  const color = bandColor(dir === "up" ? "green" : "red").solid;
  return (
    <div className="flex flex-col gap-1">
      <div className="mb-1 flex items-center gap-1.5 border-b pb-1.5">
        <span aria-hidden style={{ color }}>{dir === "up" ? "▲" : "▼"}</span>
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color }}>{title}</span>
      </div>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">None this window.</p>
      ) : (
        rows.map((a) => {
          const d = a.deltaPct ?? 0;
          const frac = Math.abs(d) / max;
          const delta = Math.round(d);
          return (
            <button
              key={`${a.usps}-${a.department}`}
              type="button"
              onMouseEnter={(e) => onHover?.(a, e)}
              onMouseMove={(e) => onHover?.(a, e)}
              onMouseLeave={() => onHover?.(null)}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-accent"
            >
              <LensGlyph lenses={a.lenses} band={a.band} size={28} className="shrink-0" />
              <span className="min-w-0">
                <span className="flex items-baseline gap-1.5">
                  <span className="truncate text-[13px] font-medium">{a.department}</span>
                  <span className="shrink-0 font-mono text-[9px] text-muted-foreground">{a.usps}</span>
                </span>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full" style={{ width: `${Math.max(frac * 100, 4)}%`, background: color }} />
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <span className="text-sm font-semibold tabular-nums" style={{ color }}>
                  {delta > 0 ? "+" : "−"}{Math.abs(delta)}%
                </span>
                <span className="font-mono text-[9px] text-muted-foreground">
                  {fmtCompact(a.prior)}→{fmtCompact(a.current)}
                </span>
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}
