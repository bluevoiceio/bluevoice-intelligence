"use client";

import { useMemo, useState } from "react";

import { ACCENT, bandColor } from "@/components/intelligence/lens";
import { ChartTooltip, type Tip } from "@/components/intelligence/ChartTooltip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmt } from "@/lib/format";
import type { AccountIntelligence } from "@/lib/intelligence";

export function MomentumLedger({ accounts }: { accounts: AccountIntelligence[] }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const { segments, total, volumeDeltaPct } = useMemo(() => {
    const c = { riser: 0, decliner: 0, new: 0, stable: 0 };
    let cur = 0;
    let prior = 0;
    for (const a of accounts) {
      c[a.status] += 1;
      cur += a.current;
      prior += a.prior;
    }
    const segments = [
      { key: "riser", label: "Gaining", value: c.riser, color: bandColor("green").solid },
      { key: "new", label: "New", value: c.new, color: ACCENT.signal },
      { key: "stable", label: "Steady", value: c.stable, color: "var(--muted-foreground)" },
      { key: "decliner", label: "Sliding", value: c.decliner, color: bandColor("red").solid },
    ];
    return { segments, total: accounts.length || 1, volumeDeltaPct: prior > 0 ? (cur - prior) / prior : null };
  }, [accounts]);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Momentum ledger</CardTitle>
          <CardDescription>How the whole book moved this window — the share of departments gaining, holding, and sliding. Hover a band for its count.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* 100% stacked proportion bar */}
          <div className="flex h-7 w-full overflow-hidden rounded-md" role="img" aria-label="Momentum distribution" onMouseLeave={() => setTip(null)}>
            {segments.map((s) => {
              const pct = (s.value / total) * 100;
              if (pct <= 0) return null;
              return (
                <div
                  key={s.key}
                  className="flex cursor-default items-center justify-center text-[10px] font-semibold text-white/90 transition-opacity hover:opacity-90"
                  style={{ width: `${pct}%`, background: s.color }}
                  onMouseMove={(e) => setTip({
                    x: e.clientX,
                    y: e.clientY,
                    content: (
                      <div>
                        <div className="font-semibold">{s.label}</div>
                        <div className="tabular-nums">{fmt(s.value)} of {fmt(total)} departments · {Math.round(pct)}%</div>
                      </div>
                    ),
                  })}
                >
                  {pct > 7 ? s.value : ""}
                </div>
              );
            })}
          </div>

          {/* legend + counts */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            {segments.map((s) => (
              <div key={s.key} className="flex items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="text-xl font-semibold tabular-nums">{fmt(s.value)}</span>
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
            ))}
          </div>

          {volumeDeltaPct != null ? (
            <p className="border-t pt-3 text-sm text-muted-foreground">
              Book-wide question volume{" "}
              <span className="font-semibold tabular-nums" style={{ color: bandColor(volumeDeltaPct >= 0 ? "green" : "red").solid }}>
                {volumeDeltaPct >= 0 ? "+" : "−"}{Math.round(Math.abs(volumeDeltaPct) * 100)}%
              </span>{" "}
              versus the prior window.
            </p>
          ) : null}
        </CardContent>
      </Card>
      <ChartTooltip tip={tip} />
    </>
  );
}
