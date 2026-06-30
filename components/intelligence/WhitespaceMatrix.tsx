"use client";

import { useMemo } from "react";

import type { AccountIntelligence } from "@/lib/intelligence";
import { PILLAR_KEYS, PILLAR_LABELS, SIGNAL } from "@/components/intelligence/lens";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The expansion lens. Top: a ring gauge per pillar showing what share of the
 * book has adopted it (Forms & Workspace are the whitespace). Bottom: the
 * account × pillar heatmap — lit = adopted, muted = the cross-sell target.
 */
export function WhitespaceMatrix({
  accounts,
  unavailable = [],
  onSelect,
  onHover,
}: {
  accounts: AccountIntelligence[];
  unavailable?: string[];
  onSelect?: (a: AccountIntelligence) => void;
  onHover?: (a: AccountIntelligence | null, e?: React.MouseEvent) => void;
}) {
  const withPillars = accounts.filter((a) => a.pillars);

  const adoption = useMemo(
    () =>
      PILLAR_KEYS.map((k, i) => ({
        key: k,
        label: PILLAR_LABELS[i],
        // null = couldn't measure (fetch failed) → render "—", never a false 0%.
        pct: unavailable.includes(k)
          ? null
          : withPillars.length
            ? withPillars.filter((a) => (a.pillars?.[k] ?? 0) > 0).length / withPillars.length
            : 0,
      })),
    [withPillars, unavailable],
  );

  const rows = useMemo(
    () => [...withPillars].sort((a, b) => (b.pillars!.ask ?? 0) - (a.pillars!.ask ?? 0)).slice(0, 12),
    [withPillars],
  );

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 p-6">
        {/* ring gauges */}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {adoption.map((p) => (
            <Ring key={p.key} label={p.label} pct={p.pct} />
          ))}
        </div>

        {/* account × pillar heatmap */}
        <div className="overflow-hidden rounded-lg border">
          <div className="grid grid-cols-[1fr_repeat(5,2.1rem)] items-center gap-px bg-border">
            <div className="bg-card px-2 py-1.5">
              <span className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">top accounts</span>
            </div>
            {PILLAR_LABELS.map((p) => (
              <div key={p} className="grid place-items-center bg-card py-1.5">
                <span className="font-mono text-[9px] text-muted-foreground">{p.slice(0, 4)}</span>
              </div>
            ))}
            {rows.map((a) => (
              <Row key={`${a.usps}-${a.department}`} a={a} onSelect={onSelect} onHover={onHover} />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Ring({ label, pct }: { label: string; pct: number | null }) {
  const size = 72;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const filled = (pct ?? 0) * circ;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-muted" strokeWidth={stroke} />
          {pct != null ? (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={SIGNAL}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${filled.toFixed(2)} ${(circ - filled).toFixed(2)}`}
            />
          ) : null}
        </svg>
        <span
          className={cn(
            "absolute inset-0 grid place-items-center text-sm font-semibold tabular-nums",
            pct == null && "text-muted-foreground",
          )}
        >
          {pct == null ? "—" : `${Math.round(pct * 100)}%`}
        </span>
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function Row({
  a,
  onSelect,
  onHover,
}: {
  a: AccountIntelligence;
  onSelect?: (a: AccountIntelligence) => void;
  onHover?: (a: AccountIntelligence | null, e?: React.MouseEvent) => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={() => onSelect?.(a)}
        onMouseEnter={(e) => onHover?.(a, e)}
        onMouseMove={(e) => onHover?.(a, e)}
        onMouseLeave={() => onHover?.(null)}
        className="flex items-center gap-1.5 truncate bg-card px-2 py-1.5 text-left hover:bg-muted/60"
      >
        <span className="font-mono text-[9px] text-muted-foreground">{a.usps}</span>
        <span className="truncate text-[11px] text-muted-foreground">{a.department}</span>
      </button>
      {PILLAR_KEYS.map((k) => {
        const used = (a.pillars?.[k] ?? 0) > 0;
        return (
          <div key={k} className="grid place-items-center bg-card py-1.5">
            <span className={cn("size-3 rounded-[3px]", used ? "" : "bg-muted")} style={used ? { background: SIGNAL } : undefined} />
          </div>
        );
      })}
    </>
  );
}
