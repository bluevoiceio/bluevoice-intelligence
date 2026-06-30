"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fmt, fmtCompact, fmtPct } from "@/lib/format";
import { type AgencyHealth, driverFor } from "@/lib/health";
import { GRID_COLS, STATE_GRID, USPS_TO_STATE_NAME } from "@/lib/states";
import { cn } from "@/lib/utils";

import {
  deltaLabel,
  healthColor,
  scoreRamp,
  sparkEnd,
  sparkPath,
} from "./viz";

interface StateAgg {
  state: string;
  usps: string;
  volume: number;
  score: number; // volume-weighted mean of agency score
  atRisk: number; // # decliners
  count: number;
}

/** Perceived luminance of a #rrggbb color in [0,1] — picks readable tile text. */
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Allow CSS custom properties in an inline style object without `any`. */
type CSSVars = React.CSSProperties & Record<`--${string}`, string>;

// Sample points for the diverging legend swatch (red → amber → green).
const LEGEND_STOPS = [6, 24, 44, 58, 74, 92];

export function Cartogram({ rows }: { rows: AgencyHealth[] }) {
  const [selected, setSelected] = useState<string | null>(null);

  const aggregates = useMemo(() => {
    const acc = new Map<
      string,
      { vol: number; weighted: number; atRisk: number; count: number; usps: string }
    >();
    for (const r of rows) {
      const a =
        acc.get(r.state) ??
        { vol: 0, weighted: 0, atRisk: 0, count: 0, usps: r.usps };
      a.vol += r.current;
      a.weighted += r.score * r.current;
      a.atRisk += r.status === "decliner" ? 1 : 0;
      a.count += 1;
      acc.set(r.state, a);
    }
    const out = new Map<string, StateAgg>();
    for (const [state, a] of acc) {
      out.set(state, {
        state,
        usps: a.usps,
        volume: a.vol,
        score: a.vol > 0 ? Math.round(a.weighted / a.vol) : 0,
        atRisk: a.atRisk,
        count: a.count,
      });
    }
    return out;
  }, [rows]);

  // National rollup: most at-risk states first, then worst score.
  const ranked = useMemo(
    () =>
      [...aggregates.values()].sort(
        (a, b) => b.atRisk - a.atRisk || a.score - b.score,
      ),
    [aggregates],
  );

  const totals = useMemo(() => {
    let volume = 0;
    let atRiskAgencies = 0;
    for (const r of rows) {
      volume += r.current;
      if (r.status === "decliner") atRiskAgencies += 1;
    }
    return {
      volume,
      atRiskAgencies,
      atRiskStates: ranked.filter((s) => s.atRisk > 0).length,
      states: aggregates.size,
    };
  }, [rows, ranked, aggregates]);

  const selectedAgg = selected ? aggregates.get(selected) ?? null : null;
  const selectedRows = useMemo(
    () =>
      selected
        ? rows
            .filter((r) => r.state === selected)
            .sort((a, b) => a.score - b.score)
        : [],
    [rows, selected],
  );

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="flex min-h-[280px] flex-col items-center justify-center gap-2 text-center">
          <p className="text-sm font-medium">No agencies match the filters</p>
          <p className="text-sm text-muted-foreground">
            Clear a filter to light up the health map.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Pulse animation is gated behind prefers-reduced-motion: no-preference.
          Under reduced motion the static inline boxShadow ring remains. */}
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          @keyframes vc-pulse {
            0%, 100% { box-shadow: 0 0 0 1.5px var(--vc-glow), 0 0 10px 1px var(--vc-glow); }
            50%      { box-shadow: 0 0 0 2.5px var(--vc-glow), 0 0 22px 6px var(--vc-glow); }
          }
          .vc-atrisk { animation: vc-pulse 2.6s ease-in-out infinite; }
        }
      `}</style>

      {/* MAP — command center */}
      <Card className="overflow-hidden lg:col-span-2">
        <CardHeader>
          <CardTitle>National health map</CardTitle>
          <CardDescription>
            {fmt(totals.volume)} questions across {totals.states} states ·{" "}
            {totals.atRiskStates} glowing at-risk · tap a tile to drill in
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="grid min-h-[480px] gap-1.5"
            style={{
              gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
              gridAutoRows: "minmax(0, 1fr)",
            }}
          >
            {Object.entries(STATE_GRID).map(([usps, cell]) => {
              const name = USPS_TO_STATE_NAME[usps] ?? usps;
              const agg = aggregates.get(name);
              const has = !!agg && agg.volume > 0;
              const isSelected = selected === name;

              if (!has || !agg) {
                return (
                  <button
                    key={usps}
                    type="button"
                    disabled
                    aria-label={`${name} — no data`}
                    style={{
                      gridColumnStart: cell.col + 1,
                      gridRowStart: cell.row + 1,
                    }}
                    className="flex aspect-square cursor-default items-center justify-center rounded-lg bg-muted text-[0.625rem] font-semibold text-muted-foreground/60"
                  >
                    {usps}
                  </button>
                );
              }

              const fill = scoreRamp(agg.score);
              const darkText = luminance(fill) > 0.55;
              const atRisk = agg.atRisk > 0;
              const glow = healthColor(agg.score).glow;

              const style: CSSVars = {
                gridColumnStart: cell.col + 1,
                gridRowStart: cell.row + 1,
                backgroundColor: fill,
                "--vc-glow": glow,
                ...(atRisk
                  ? {
                      boxShadow: `0 0 0 1.5px ${glow}, 0 0 12px 2px ${glow}`,
                    }
                  : {}),
              };

              return (
                <button
                  key={usps}
                  type="button"
                  onClick={() => setSelected(isSelected ? null : name)}
                  aria-pressed={isSelected}
                  aria-label={`${name}: health ${agg.score} of 100, ${agg.count} ${
                    agg.count === 1 ? "agency" : "agencies"
                  }${atRisk ? `, ${agg.atRisk} at risk` : ""}`}
                  style={style}
                  className={cn(
                    "relative flex aspect-square items-center justify-center rounded-lg text-[0.7rem] font-bold transition-transform duration-200 hover:z-10 hover:scale-[1.08] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                    darkText ? "text-slate-900" : "text-white",
                    atRisk && "vc-atrisk",
                    isSelected && "scale-[1.08] ring-2 ring-foreground ring-offset-2 ring-offset-background",
                  )}
                >
                  {usps}
                  {atRisk && (
                    <span
                      aria-hidden
                      className="absolute right-0.5 top-0.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-background/90 px-1 text-[0.5rem] font-bold leading-none text-destructive ring-1 ring-destructive/40"
                    >
                      {agg.atRisk}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>At risk</span>
              <span
                className="h-2.5 w-32 rounded-full ring-1 ring-border"
                style={{
                  background: `linear-gradient(to right, ${LEGEND_STOPS.map(
                    scoreRamp,
                  ).join(", ")})`,
                }}
              />
              <span>Healthy</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-muted ring-1 ring-border" />
              No data
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-destructive">●</span>
              at-risk agencies (glowing)
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DRILL-DOWN / ROLLUP PANEL */}
      <Card className="lg:col-span-1">
        {selectedAgg ? (
          <>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {selectedAgg.state}
                    <ScoreChip score={selectedAgg.score} />
                  </CardTitle>
                  <CardDescription>
                    {selectedAgg.count}{" "}
                    {selectedAgg.count === 1 ? "agency" : "agencies"} ·{" "}
                    {fmtCompact(selectedAgg.volume)} questions
                    {selectedAgg.atRisk > 0 && (
                      <> · {selectedAgg.atRisk} at risk</>
                    )}
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected(null)}
                  className="-mr-2 shrink-0"
                >
                  Clear
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {selectedRows.map((row, i) => (
                <AgencyItem key={row.department} rank={i + 1} row={row} />
              ))}
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Where to look first</CardTitle>
              <CardDescription>
                {totals.atRiskAgencies} agencies trending toward churn across{" "}
                {totals.atRiskStates} states. Click a glowing tile to drill into
                its departments.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {ranked.slice(0, 7).map((s) => {
                const c = healthColor(s.score);
                return (
                  <button
                    key={s.state}
                    type="button"
                    onClick={() => setSelected(s.state)}
                    className="flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      className="flex size-7 shrink-0 items-center justify-center rounded-md text-[0.65rem] font-bold text-white"
                      style={{ backgroundColor: scoreRamp(s.score) }}
                    >
                      {s.usps}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {s.state}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {fmtCompact(s.volume)} questions · {s.count}{" "}
                        {s.count === 1 ? "agency" : "agencies"}
                      </span>
                    </span>
                    {s.atRisk > 0 ? (
                      <Badge variant="warning" className="shrink-0">
                        {s.atRisk} at risk
                      </Badge>
                    ) : (
                      <span
                        className="shrink-0 text-sm font-semibold tabular-nums"
                        style={{ color: c.solid }}
                      >
                        {s.score}
                      </span>
                    )}
                  </button>
                );
              })}
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}

function ScoreChip({ score }: { score: number }) {
  const c = healthColor(score);
  return (
    <span
      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums"
      style={{ backgroundColor: c.soft, color: c.solid }}
    >
      {score}
    </span>
  );
}

function AgencyItem({ rank, row }: { rank: number; row: AgencyHealth }) {
  const c = healthColor(row.score);
  const w = 64;
  const h = 22;
  const series = row.series ?? [];
  const hasSeries = series.length > 0;
  const end = sparkEnd(series, w, h);
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
      <span className="w-4 shrink-0 text-center text-xs font-semibold tabular-nums text-muted-foreground">
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{row.department}</span>
          <ScoreChip score={row.score} />
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {driverFor(row)}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {hasSeries ? (
          <svg
            width={w}
            height={h}
            viewBox={`0 0 ${w} ${h}`}
            className="overflow-visible"
            aria-hidden
          >
            <path
              d={sparkPath(series, w, h)}
              fill="none"
              stroke={c.solid}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx={end.x} cy={end.y} r={1.8} fill={c.solid} />
          </svg>
        ) : (
          <svg
            width={w}
            height={h}
            viewBox={`0 0 ${w} ${h}`}
            className="overflow-visible"
            aria-hidden
          >
            <line
              x1={0}
              y1={h / 2}
              x2={w}
              y2={h / 2}
              stroke="currentColor"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              strokeLinecap="round"
              className="text-muted-foreground/40"
            />
          </svg>
        )}
        <span
          className="text-xs font-semibold tabular-nums"
          style={{ color: c.solid }}
        >
          {deltaLabel(row.deltaPct, row.status)}
          {row.status !== "new" && row.breadth != null && (
            <span className="ml-1 font-normal text-muted-foreground">
              {fmtPct(row.breadth)} active
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
