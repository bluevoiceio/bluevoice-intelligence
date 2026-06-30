"use client";

import { recommend, type AccountIntelligence } from "@/lib/intelligence";
import { LensGlyph } from "@/components/intelligence/LensGlyph";
import {
  bandColor,
  deltaPctLabel,
  LENSES,
  lensLabelAnchor,
  PILLAR_KEYS,
  PILLAR_LABELS,
} from "@/components/intelligence/lens";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

const BAND_BADGE = { red: "warning", yellow: "warning", green: "success" } as const;

export function AccountFocus({ account }: { account: AccountIntelligence | null }) {
  if (!account) {
    return (
      <Card className="grid min-h-[300px] place-items-center p-6 text-sm text-muted-foreground">
        Select an account anywhere to read its signature.
      </Card>
    );
  }
  const c = bandColor(account.band);

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
        {/* radial signature with value labels at each spoke */}
        <div className="relative mx-auto shrink-0 text-muted-foreground" style={{ width: 168, height: 168 }}>
          <LensGlyph lenses={account.lenses} band={account.band} size={168} />
          {LENSES.map((l) => {
            const v = account.lenses[l.key];
            return (
              <span
                key={l.key}
                className="absolute flex flex-col items-center font-mono text-[10px] leading-tight -translate-x-1/2 -translate-y-1/2"
                style={lensLabelAnchor(l.angle, 0.5)}
              >
                <span className="text-muted-foreground">{l.short}</span>
                <span className="text-xs font-semibold tabular-nums" style={{ color: v == null ? undefined : l.accent }}>
                  {v == null ? "—" : v}
                </span>
              </span>
            );
          })}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-[10px]">{account.usps}</Badge>
            <Badge variant={BAND_BADGE[account.band]}>{c.label}</Badge>
          </div>
          <h3 className="mt-2 truncate text-2xl font-semibold tracking-tight" title={account.department}>
            {account.department}
          </h3>
          <div className="mt-1.5 flex items-end gap-2.5">
            <span className="text-5xl font-semibold leading-none tabular-nums" style={{ color: c.solid }}>
              {account.composite}
            </span>
            <span className="pb-1 text-xs text-muted-foreground">/100 health</span>
            <span
              className="ml-auto pb-1 font-mono text-xs"
              style={{ color: account.status === "decliner" ? c.solid : undefined }}
            >
              {deltaPctLabel(account)} MoM
            </span>
          </div>
          {(() => {
            // Why the score is what it is: the weakest present lens drags it
            // down, the strongest holds it up — named in plain English.
            const present = LENSES.map((l) => ({ l, v: account.lenses[l.key] })).filter(
              (x): x is { l: (typeof LENSES)[number]; v: number } => x.v != null,
            );
            if (present.length < 2) return null;
            const sorted = [...present].sort((a, b) => a.v - b.v);
            const drag = sorted[0];
            const lift = sorted[sorted.length - 1];
            return (
              <p className="mt-2 text-xs leading-snug text-muted-foreground">
                Held back by <span style={{ color: drag.l.accent }}>{drag.l.label}</span> ({drag.v}); strongest on{" "}
                <span style={{ color: lift.l.accent }}>{lift.l.label}</span> ({lift.v}).
              </p>
            );
          })()}
          {(() => {
            const rec = recommend(account);
            return (
              <div className="mt-3 rounded-lg border border-border/70 bg-muted/30 p-3">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Next play</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <p className="mt-1 text-sm font-semibold tracking-tight" style={{ color: c.solid }}>
                  {rec.play}
                </p>
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{rec.detail}</p>
              </div>
            );
          })()}

          {account.lenses.realization != null ? (
            <div className="mt-3">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Upside</span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-sm font-medium text-foreground">Value delivered</span>
                <span className="text-sm font-semibold tabular-nums" style={{ color: "#ec4899" }}>{account.lenses.realization}</span>
                <span className="text-xs text-muted-foreground">/ 100</span>
              </div>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground/80">
                Outcomes shipped vs peers — expansion potential, not part of the health score.
              </p>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
            <span className="mr-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">features</span>
            {PILLAR_KEYS.map((k, i) => {
              const used = (account.pillars?.[k] ?? 0) > 0;
              return (
                <span
                  key={k}
                  className={cn(
                    "rounded-md border px-2 py-1 font-mono text-[11px]",
                    used ? "border-primary/40 bg-primary/10 text-foreground" : "border-border bg-muted/40 text-muted-foreground/60",
                  )}
                >
                  {PILLAR_LABELS[i]}
                  {used && account.pillars ? <span className="ml-1.5 opacity-70">{fmt(account.pillars[k])}</span> : null}
                </span>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
