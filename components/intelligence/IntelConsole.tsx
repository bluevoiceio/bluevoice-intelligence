"use client";

import { useMemo, useState } from "react";
import { Radar } from "lucide-react";

import { useIntelligence } from "@/components/hooks";
import { AccountHoverCard } from "@/components/intelligence/AccountHoverCard";
import { BandArc } from "@/components/intelligence/BandArc";
import { Constellation } from "@/components/intelligence/Constellation";
import { IntelMap } from "@/components/intelligence/IntelMap";
import { IntelTreemap } from "@/components/intelligence/IntelTreemap";
import { LensGlyph } from "@/components/intelligence/LensGlyph";
import { LensQuadrant } from "@/components/intelligence/LensQuadrant";
import { WhitespaceMatrix } from "@/components/intelligence/WhitespaceMatrix";
import {
  bandColor,
  compositeRamp,
  LENSES,
  PILLAR_COUNT,
  PILLAR_KEYS,
  PILLAR_LABELS,
  type LensKey,
} from "@/components/intelligence/lens";
import { Kpi } from "@/components/Kpi";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AccountIntelligence } from "@/lib/intelligence";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

export function IntelConsole() {
  const { data, isLoading, error } = useIntelligence();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const [hover, setHover] = useState<{ a: AccountIntelligence; x: number; y: number } | null>(null);

  const accounts = useMemo(() => data?.accounts ?? [], [data]);
  const keyOf = (a: AccountIntelligence) => `${a.usps}|${a.department}`;
  const selected = accounts.find((a) => keyOf(a) === selectedKey) ?? null;
  const select = (a: AccountIntelligence) => setSelectedKey(keyOf(a));
  const onHover = (a: AccountIntelligence | null, e?: { clientX: number; clientY: number }) =>
    setHover(a && e ? { a, x: e.clientX, y: e.clientY } : null);
  const activeKey = hover ? keyOf(hover.a) : selected ? keyOf(selected) : null;

  const story = useMemo(() => {
    if (!data) return null;
    const total = data.summary.total;
    const red = data.summary.bands.red;
    const withPillars = accounts.filter((a) => a.pillars);
    const avgPillars = withPillars.length ? withPillars.reduce((s, a) => s + a.pillarsUsed, 0) / withPillars.length : 0;
    const expansionReady = withPillars.filter((a) => a.pillarsUsed <= 1).length;
    const sorted = accounts.map((a) => a.composite).sort((x, y) => x - y);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;

    // top at-risk state
    const byState = new Map<string, number>();
    for (const a of accounts) if (a.band === "red") byState.set(a.state, (byState.get(a.state) ?? 0) + 1);
    const topRisk = [...byState.entries()].sort((x, y) => y[1] - x[1])[0];

    // lowest-adopted pillar — only among pillars we could actually measure.
    const unavail = new Set(data.unavailablePillars ?? []);
    const adoption = PILLAR_KEYS.map((k, i) => ({
      key: k,
      label: PILLAR_LABELS[i],
      pct: withPillars.length ? withPillars.filter((a) => (a.pillars?.[k] ?? 0) > 0).length / withPillars.length : 0,
    })).filter((p) => !unavail.has(p.key));
    const lowest = [...adoption].sort((x, y) => x.pct - y.pct)[0];

    const lowBreadthPct = withPillars.length
      ? Math.round((withPillars.filter((a) => a.pillarsUsed <= 1).length / withPillars.length) * 100)
      : 0;

    return { total, red, avgPillars, expansionReady, median, topRisk, lowest, lowBreadthPct };
  }, [data, accounts]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1400px] flex-col gap-8 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Radar className="size-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold leading-tight tracking-tight">Account Intelligence</h1>
            <p className="text-xs text-muted-foreground">
              Four signals — momentum, trust, breadth, activation — fused into one health score for every department.
            </p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      {error ? (
        <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Couldn&apos;t load intelligence: {(error as Error).message}
        </Card>
      ) : null}

      {/* 01 — STATE OF THE BOOK */}
      <Section
        n="01"
        title="The state of the book"
        caption={
          story
            ? `${fmt(story.red)} of ${fmt(story.total)} departments are at risk and the median scores ${story.median}/100 — a book that mostly sits on watch.`
            : "Loading the book…"
        }
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_1.05fr_1.05fr]">
          <Card>
            <CardContent className="flex items-center gap-5 p-5">
              <BandArc bands={data?.summary.bands ?? { green: 0, yellow: 0, red: 0 }} total={data?.summary.total ?? 0} />
              <div className="flex flex-col gap-2.5">
                {(["green", "yellow", "red"] as const).map((b) => {
                  const c = bandColor(b);
                  return (
                    <div key={b} className="flex items-center gap-2.5">
                      <span className="size-2.5 rounded-full" style={{ background: c.solid }} />
                      <span className="text-xl font-semibold tabular-nums">{data ? data.summary.bands[b] : "—"}</span>
                      <span className="text-xs text-muted-foreground">{c.label}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Kpi label="At risk" loading={isLoading} value={<Accent color="#e5484d">{story ? story.red : "—"}</Accent>} hint="composite < 40" />
            <Kpi label="Median health" loading={isLoading} value={<Accent color={story ? compositeRamp(story.median) : undefined}>{story ? story.median : "—"}</Accent>} hint="whole book" />
            <Kpi label="Avg pillars" loading={isLoading} value={story ? story.avgPillars.toFixed(1) : "—"} hint={`of ${PILLAR_COUNT} · adoption depth`} />
            <Kpi label="Ask-only" loading={isLoading} value={story ? story.expansionReady : "—"} hint="≤1 pillar · whitespace" />
          </div>

          <GlyphLegend />
        </div>
      </Section>

      {/* 02 — WHERE RISK & VOLUME CONCENTRATE */}
      <Section
        n="02"
        title="Where risk & volume concentrate"
        caption={
          story?.topRisk
            ? `Risk concentrates in ${story.topRisk[0]} (${story.topRisk[1]} at-risk); the treemap shows volume pooling in a handful of large departments.`
            : "Geography by composite health, then the whole book sized by volume."
        }
      >
        {isLoading ? (
          <Skeleton className="h-[460px] w-full rounded-xl" />
        ) : (
          <div className="flex flex-col gap-4">
            <IntelMap accounts={accounts} onSelectAccount={select} onHover={onHover} />
            <IntelTreemap accounts={accounts} onSelect={select} onHover={onHover} />
          </div>
        )}
      </Section>

      {/* 03 — THE STRATEGIC MAP */}
      <Section
        n="03"
        title="The strategic map"
        caption={
          story
            ? `${story.lowBreadthPct}% of accounts are low-breadth — broadening adoption is the biggest lever. Rescue the bottom-left corner; expand the champions.`
            : "Breadth versus momentum — where each account sits, and the play."
        }
      >
        {isLoading ? (
          <Skeleton className="h-[480px] w-full rounded-xl" />
        ) : (
          <Card>
            <CardContent className="pt-6">
              <LensQuadrant accounts={accounts} activeKey={activeKey} onSelect={select} onHover={onHover} />
            </CardContent>
          </Card>
        )}
      </Section>

      {/* 04 — THE SPREAD */}
      <Section
        n="04"
        title="The spread"
        caption="Every account on the composite axis, sized by question volume — a red tail to call, a thin green head to learn from."
      >
        {isLoading ? (
          <Skeleton className="h-[360px] w-full rounded-xl" />
        ) : (
          <Constellation accounts={accounts} activeKey={activeKey} onSelect={select} onHover={onHover} />
        )}
      </Section>

      {/* 05 — THE EXPANSION WHITESPACE */}
      <Section
        n="05"
        title="The expansion whitespace"
        caption={
          story?.lowest
            ? `${story.lowest.label} is live in just ${Math.round(story.lowest.pct * 100)}% of the book — the clearest cross-sell path. Muted cells below are the targets.`
            : "Pillar adoption across the book — the unused pillars are the opportunity."
        }
      >
        {isLoading ? (
          <Skeleton className="h-[360px] w-full rounded-xl" />
        ) : (
          <WhitespaceMatrix accounts={accounts} unavailable={data?.unavailablePillars ?? []} onSelect={select} onHover={onHover} />
        )}
      </Section>

      <footer className="pb-4 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        Blue Voice · {data ? fmt(data.summary.total) : "—"} departments · momentum · trust · breadth · activation
      </footer>

      {hover ? <AccountHoverCard account={hover.a} x={hover.x} y={hover.y} /> : null}
    </div>
  );
}

// ── pieces ────────────────────────────────────────────────────────────────

function Section({
  n,
  title,
  caption,
  children,
}: {
  n: string;
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-xs text-muted-foreground/70">{n}</span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="max-w-3xl text-sm text-muted-foreground text-balance">{caption}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Accent({ color, children }: { color?: string; children: React.ReactNode }) {
  return <span style={{ color }}>{children}</span>;
}

function GlyphLegend() {
  const sample = { momentum: 82, trust: 64, breadth: 40, activation: null };
  const pos: Record<LensKey, string> = {
    momentum: "left-1/2 -top-1 -translate-x-1/2",
    trust: "top-1/2 -right-2 -translate-y-1/2",
    breadth: "left-1/2 -bottom-1 -translate-x-1/2",
    activation: "top-1/2 -left-2 -translate-y-1/2",
  };
  return (
    <Card>
      <CardContent className="flex items-center gap-5 p-5">
        <div className="relative shrink-0 text-muted-foreground" style={{ width: 96, height: 96 }}>
          <LensGlyph lenses={sample} band="yellow" size={96} />
          {LENSES.map((l) => (
            <span key={l.key} className={cn("absolute font-mono text-[8px]", pos[l.key])} style={{ color: l.accent }}>
              {l.short}
            </span>
          ))}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight">Reading a signature</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Each account is a four-spoke glyph — longer spoke, stronger lens; color is the composite verdict; a dashed stub means no signal.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            {LENSES.map((l) => (
              <div key={l.key} className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: l.accent }} />
                <span className="text-[11px] text-muted-foreground">{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
