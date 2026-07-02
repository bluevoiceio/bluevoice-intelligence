"use client";

import { useMemo } from "react";

import { ACCENT, bandColor } from "@/components/intelligence/lens";
import { Card, CardContent } from "@/components/ui/card";
import { fmt } from "@/lib/format";
import type { AccountIntelligence } from "@/lib/intelligence";

export function MomentumLedger({ accounts }: { accounts: AccountIntelligence[] }) {
  const counts = useMemo(() => {
    const c = { riser: 0, decliner: 0, new: 0, stable: 0 };
    for (const a of accounts) c[a.status] += 1;
    return c;
  }, [accounts]);

  const rows = [
    { label: "Gaining", value: counts.riser, color: bandColor("green").solid },
    { label: "Sliding", value: counts.decliner, color: bandColor("red").solid },
    { label: "New", value: counts.new, color: ACCENT.signal },
    { label: "Steady", value: counts.stable, color: "var(--muted-foreground)" },
  ];

  return (
    <Card className="flex-1">
      <CardContent className="p-4">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Momentum ledger</p>
        <div className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-2.5">
              <span className="size-2.5 rounded-full" style={{ background: r.color }} />
              <span className="text-xl font-semibold tabular-nums">{fmt(r.value)}</span>
              <span className="text-xs text-muted-foreground">{r.label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
