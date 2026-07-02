"use client";

import { useMemo, useState } from "react";

import { useIntelligence, useTrends } from "@/components/hooks";
import { AccountHoverCard } from "@/components/intelligence/AccountHoverCard";
import { Cover } from "@/components/intelligence/Cover";
import { IntelMap } from "@/components/intelligence/IntelMap";
import { IntelTreemap } from "@/components/intelligence/IntelTreemap";
import { ConcentrationCurve } from "@/components/intelligence/ConcentrationCurve";
import { MomentumLedger } from "@/components/intelligence/MomentumLedger";
import { MoversSlope } from "@/components/intelligence/MoversSlope";
import { HealthDistribution } from "@/components/intelligence/HealthDistribution";
import { RealizationGap } from "@/components/intelligence/RealizationGap";
import { AdoptionTrend } from "@/components/intelligence/AdoptionTrend";
import { WhitespaceMatrix } from "@/components/intelligence/WhitespaceMatrix";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { buildNarrative } from "@/lib/narrative";
import type { AccountIntelligence } from "@/lib/intelligence";
import { cn } from "@/lib/utils";

const WINDOW_OPTIONS = [30, 90] as const;
type WindowDays = (typeof WINDOW_OPTIONS)[number];

export function IntelConsole() {
  const [windowDays, setWindowDays] = useState<WindowDays>(30);
  const { data, isLoading, error } = useIntelligence(windowDays);
  const { data: trends } = useTrends();

  const [hover, setHover] = useState<{ a: AccountIntelligence; x: number; y: number } | null>(null);
  const onHover = (a: AccountIntelligence | null, e?: { clientX: number; clientY: number }) =>
    setHover(a && e ? { a, x: e.clientX, y: e.clientY } : null);

  const accounts = useMemo(() => data?.accounts ?? [], [data]);
  const narrative = useMemo(() => (data ? buildNarrative(data, trends?.series) : null), [data, trends]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1400px] flex-col gap-8 px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <WindowToggle value={windowDays} onChange={setWindowDays} />
        <ThemeToggle />
      </header>

      {error ? (
        <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Couldn&apos;t load intelligence: {(error as Error).message}
        </Card>
      ) : null}

      <Cover narrative={narrative} summary={data?.summary} loading={isLoading} />

      <Act n="01" title="Where we stand" caption={narrative?.act1 ?? "Loading…"}>
        {isLoading ? (
          <Skeleton className="h-[460px] w-full rounded-xl" />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 lg:flex-row">
              <div className="flex-[1.2]">
                <IntelMap accounts={accounts} onHover={onHover} />
              </div>
              <ConcentrationCurve accounts={accounts} />
            </div>
            <IntelTreemap accounts={accounts} onHover={onHover} />
          </div>
        )}
      </Act>

      <Act n="02" title="Which way we're moving" caption={narrative?.act2 ?? ""}>
        {isLoading ? (
          <Skeleton className="h-[220px] w-full rounded-xl" />
        ) : (
          <div className="flex flex-col gap-4 lg:flex-row">
            <MomentumLedger accounts={accounts} />
            <MoversSlope movers={narrative?.movers ?? { risers: [], fallers: [] }} />
            <HealthDistribution accounts={accounts} />
          </div>
        )}
      </Act>

      <Act n="03" title="Where the upside is" caption={narrative?.act3 ?? ""}>
        {isLoading ? (
          <Skeleton className="h-[360px] w-full rounded-xl" />
        ) : (
          <div className="flex flex-col gap-4 lg:flex-row">
            <RealizationGap totals={data?.featureTotals} />
            <WhitespaceMatrix accounts={accounts} unavailable={data?.unavailablePillars ?? []} onHover={onHover} />
            <AdoptionTrend series={trends?.series} />
          </div>
        )}
      </Act>

      {hover ? <AccountHoverCard account={hover.a} x={hover.x} y={hover.y} /> : null}
    </div>
  );
}

function Act({ n, title, caption, children }: { n: string; title: string; caption: string; children: React.ReactNode }) {
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

function WindowToggle({ value, onChange }: { value: WindowDays; onChange: (w: WindowDays) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-border/60 bg-muted/40 p-0.5">
      {WINDOW_OPTIONS.map((w) => (
        <button
          key={w}
          type="button"
          onClick={() => onChange(w)}
          aria-pressed={value === w}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium tabular-nums transition-colors",
            value === w ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {w}d
        </button>
      ))}
    </div>
  );
}
