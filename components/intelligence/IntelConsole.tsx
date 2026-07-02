"use client";

import { useMemo, useState } from "react";

import { useIntelligence } from "@/components/hooks";
import { AccountHoverCard } from "@/components/intelligence/AccountHoverCard";
import { BandArc } from "@/components/intelligence/BandArc";
import { IntelMap } from "@/components/intelligence/IntelMap";
import { IntelTreemap } from "@/components/intelligence/IntelTreemap";
import { WhitespaceMatrix } from "@/components/intelligence/WhitespaceMatrix";
import {
    bandColor,
    compositeRamp,
    PILLAR_COUNT,
    PILLAR_KEYS,
    PILLAR_LABELS,
} from "@/components/intelligence/lens";
import { Kpi } from "@/components/Kpi";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AccountIntelligence } from "@/lib/intelligence";
import { fmt, fmtCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Preset comparison windows (days) — kept in sync with the route's WINDOW_DAYS. */
const WINDOW_OPTIONS = [30, 90] as const;
type WindowDays = (typeof WINDOW_OPTIONS)[number];

export function IntelConsole() {
  const [windowDays, setWindowDays] = useState<WindowDays>(30);
  const { data, isLoading, error } = useIntelligence(windowDays);

  const [hover, setHover] = useState<{ a: AccountIntelligence; x: number; y: number } | null>(null);

  const accounts = useMemo(() => data?.accounts ?? [], [data]);
  const onHover = (a: AccountIntelligence | null, e?: { clientX: number; clientY: number }) =>
    setHover(a && e ? { a, x: e.clientX, y: e.clientY } : null);

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

    // book-wide momentum & volume — deltaPct is null for sub-floor accounts, so
    // they count as neither gaining nor declining.
    const trendingUp = accounts.filter((a) => a.deltaPct != null && a.deltaPct > 0).length;
    const trendingDown = accounts.filter((a) => a.deltaPct != null && a.deltaPct < 0).length;
    const totalQuestions = accounts.reduce((s, a) => s + a.current, 0);
    // book-wide volume change vs the prior (equal-length) window.
    const totalPrior = accounts.reduce((s, a) => s + a.prior, 0);
    const volumeDeltaPct = totalPrior ? (totalQuestions - totalPrior) / totalPrior : null;

    return {
      total, red, avgPillars, expansionReady, median, topRisk, lowest,
      trendingUp, trendingDown, totalQuestions, volumeDeltaPct,
    };
  }, [data, accounts]);

  // Window-aware copy so "Trend" / "vs prior" always name the actual period.
  const periodLabel = windowDays === 30 ? "month-over-month" : "quarter-over-quarter";

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

      {/* 01 — STATE OF THE BOOK */}
      <Section
        n="01"
        title="The state of the book"
        caption={
          story
            ? `${fmt(story.red)} of ${fmt(story.total)} departments are at risk and the median scores ${story.median}/100`
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
            <Kpi label="Avg features" loading={isLoading} value={story ? story.avgPillars.toFixed(1) : "—"} hint={`of ${PILLAR_COUNT} · how much they use`} />
            <Kpi label="Ask-only" loading={isLoading} value={story ? story.expansionReady : "—"} hint="≤1 feature · upsell room" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Kpi
              label="Trending up"
              loading={isLoading}
              value={<Accent color={bandColor("green").solid}>{story ? fmt(story.trendingUp) : "—"}</Accent>}
              hint={`gaining ${periodLabel}`}
            />
            <Kpi
              label="Trending down"
              loading={isLoading}
              value={<Accent color={bandColor("red").solid}>{story ? fmt(story.trendingDown) : "—"}</Accent>}
              hint={`declining ${periodLabel}`}
            />
            <Kpi
              label="Total questions"
              loading={isLoading}
              value={story ? fmtCompact(story.totalQuestions) : "—"}
              hint={`last ${windowDays} days`}
            />
            <Kpi
              label="Volume vs prior"
              loading={isLoading}
              value={
                story && story.volumeDeltaPct != null ? (
                  <Accent color={story.volumeDeltaPct >= 0 ? bandColor("green").solid : bandColor("red").solid}>
                    {`${story.volumeDeltaPct >= 0 ? "+" : ""}${Math.round(story.volumeDeltaPct * 100)}%`}
                  </Accent>
                ) : (
                  "—"
                )
              }
              hint={`vs prior ${windowDays} days`}
            />
          </div>
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
            <IntelMap accounts={accounts} onHover={onHover} />
            <IntelTreemap accounts={accounts} onHover={onHover} />
          </div>
        )}
      </Section>

      {/* 03 — THE EXPANSION WHITESPACE */}
      <Section
        n="03"
        title="The expansion whitespace"
        caption={
          story?.lowest
            ? `${story.lowest.label} is live in just ${Math.round(story.lowest.pct * 100)}% of the book — the clearest cross-sell path. Muted cells below are the targets.`
            : "Feature adoption across the book — the unused features are the opportunity."
        }
      >
        {isLoading ? (
          <Skeleton className="h-[360px] w-full rounded-xl" />
        ) : (
          <WhitespaceMatrix accounts={accounts} unavailable={data?.unavailablePillars ?? []} onHover={onHover} />
        )}
      </Section>

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

/** Segmented control selecting the trailing comparison window the whole board
 *  runs on. Doubles as the board's window label. */
function WindowToggle({
  value,
  onChange,
}: {
  value: WindowDays;
  onChange: (w: WindowDays) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex rounded-lg border border-border/60 bg-muted/40 p-0.5">
        {WINDOW_OPTIONS.map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => onChange(w)}
            aria-pressed={value === w}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium tabular-nums transition-colors",
              value === w
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {w}d
          </button>
        ))}
      </div>
    </div>
  );
}

