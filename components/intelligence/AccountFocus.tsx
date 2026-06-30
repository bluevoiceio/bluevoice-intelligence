"use client";

import type { AccountIntelligence } from "@/lib/intelligence";
import { LensGlyph } from "@/components/intelligence/LensGlyph";
import {
  bandColor,
  deltaPctLabel,
  LENSES,
  type LensKey,
  PILLAR_COUNT,
  PILLAR_KEYS,
  PILLAR_LABELS,
} from "@/components/intelligence/lens";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

const BAND_BADGE = { red: "warning", yellow: "warning", green: "success" } as const;

// Where each lens value label sits around the glyph (spoke directions).
const LABEL_POS: Record<LensKey, string> = {
  momentum: "left-1/2 -top-2 -translate-x-1/2",
  trust: "top-1/2 -right-3 -translate-y-1/2",
  breadth: "left-1/2 -bottom-2 -translate-x-1/2",
  activation: "top-1/2 -left-3 -translate-y-1/2",
};

function readFor(a: AccountIntelligence): string {
  const present = LENSES.map((l) => ({ l, v: a.lenses[l.key] })).filter(
    (x): x is { l: (typeof LENSES)[number]; v: number } => x.v != null,
  );
  if (a.status === "new") return "Newly activated — nurture to first value.";
  const weakest = present.sort((x, y) => x.v - y.v)[0];
  if (!weakest || weakest.v >= 70) {
    return a.pillarsUsed >= 4 ? "Healthy across the board — an expansion proof point." : "Healthy, but whitespace remains in unused pillars.";
  }
  switch (weakest.l.key) {
    case "momentum":
      return "Usage is sliding month-over-month — the at-risk signal.";
    case "trust":
      return "Answer quality is slipping — friction and re-asks rising.";
    case "breadth":
      return `Only ${a.pillarsUsed} of ${PILLAR_COUNT} pillars in use — clear expansion whitespace.`;
    default:
      return "Slow time-to-value for newly onboarded officers.";
  }
}

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
                className={cn("absolute flex flex-col items-center font-mono text-[10px] leading-tight", LABEL_POS[l.key])}
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
            <span className="pb-1 text-xs text-muted-foreground">/100 composite</span>
            <span
              className="ml-auto pb-1 font-mono text-xs"
              style={{ color: account.status === "decliner" ? c.solid : undefined }}
            >
              {deltaPctLabel(account)} MoM
            </span>
          </div>
          <p className="mt-2 text-sm leading-snug text-muted-foreground">{readFor(account)}</p>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
            <span className="mr-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">pillars</span>
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
