"use client";

import { useMemo, useState } from "react";

import type { AccountIntelligence, Band } from "@/lib/intelligence";
import { LensGlyph } from "@/components/intelligence/LensGlyph";
import { bandColor, compositeRamp } from "@/components/intelligence/lens";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtCompact } from "@/lib/format";
import { GRID_COLS, STATE_GRID, USPS_TO_STATE_NAME } from "@/lib/states";
import { cn } from "@/lib/utils";

function bandOfScore(score: number): Band {
  if (score >= 75) return "green";
  if (score >= 40) return "yellow";
  return "red";
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  return (
    (0.2126 * parseInt(h.slice(0, 2), 16) +
      0.7152 * parseInt(h.slice(2, 4), 16) +
      0.0722 * parseInt(h.slice(4, 6), 16)) /
    255
  );
}

type CSSVars = React.CSSProperties & Record<`--${string}`, string>;

interface StateAgg {
  state: string;
  usps: string;
  volume: number;
  score: number;
  atRisk: number;
  count: number;
}

const LEGEND_STOPS = [10, 30, 45, 58, 74, 92];

/**
 * National intelligence map — a tile-grid cartogram colored by each state's
 * composite health (volume-weighted), with at-risk states glowing. Click a tile
 * to drill into its departments; click a department to focus it.
 */
export function IntelMap({
  accounts,
  onSelectAccount,
  onHover,
}: {
  accounts: AccountIntelligence[];
  onSelectAccount?: (a: AccountIntelligence) => void;
  onHover?: (a: AccountIntelligence | null, e?: React.MouseEvent) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const aggregates = useMemo(() => {
    const acc = new Map<string, { vol: number; weighted: number; flat: number; atRisk: number; count: number; usps: string }>();
    for (const r of accounts) {
      const a = acc.get(r.state) ?? { vol: 0, weighted: 0, flat: 0, atRisk: 0, count: 0, usps: r.usps };
      a.vol += r.current;
      a.weighted += r.composite * r.current;
      a.flat += r.composite;
      a.atRisk += r.band === "red" ? 1 : 0;
      a.count += 1;
      acc.set(r.state, a);
    }
    const out = new Map<string, StateAgg>();
    for (const [state, a] of acc) {
      out.set(state, {
        state,
        usps: a.usps,
        volume: a.vol,
        score: Math.round(a.vol > 0 ? a.weighted / a.vol : a.flat / a.count),
        atRisk: a.atRisk,
        count: a.count,
      });
    }
    return out;
  }, [accounts]);

  const ranked = useMemo(
    () => [...aggregates.values()].sort((a, b) => b.atRisk - a.atRisk || a.score - b.score),
    [aggregates],
  );
  const atRiskStates = ranked.filter((s) => s.atRisk > 0).length;

  const selectedRows = useMemo(
    () => (selected ? accounts.filter((r) => r.state === selected).sort((a, b) => a.composite - b.composite) : []),
    [accounts, selected],
  );
  const selectedAgg = selected ? aggregates.get(selected) ?? null : null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          @keyframes ic-pulse {
            0%,100% { box-shadow: 0 0 0 1.5px var(--ic-glow), 0 0 9px 1px var(--ic-glow); }
            50%     { box-shadow: 0 0 0 2px var(--ic-glow), 0 0 18px 4px var(--ic-glow); }
          }
          .ic-atrisk { animation: ic-pulse 2.8s ease-in-out infinite; }
        }
      `}</style>

      <Card className="overflow-hidden lg:col-span-2">
        <CardHeader>
          <CardTitle>National signal map</CardTitle>
          <CardDescription>
            Composite health by state · {atRiskStates} states with at-risk accounts glowing · tap a tile to drill in
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="grid min-h-[460px] gap-1.5"
            style={{ gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`, gridAutoRows: "minmax(0, 1fr)" }}
          >
            {Object.entries(STATE_GRID).map(([usps, cell]) => {
              const name = USPS_TO_STATE_NAME[usps] ?? usps;
              const agg = aggregates.get(name);
              const place = { gridColumnStart: cell.col + 1, gridRowStart: cell.row + 1 };
              if (!agg) {
                return (
                  <button
                    key={usps}
                    type="button"
                    disabled
                    aria-label={`${name} — no data`}
                    style={place}
                    className="flex aspect-square cursor-default items-center justify-center rounded-lg bg-muted text-[0.625rem] font-semibold text-muted-foreground/60"
                  >
                    {usps}
                  </button>
                );
              }
              const fill = compositeRamp(agg.score);
              const glow = bandColor(bandOfScore(agg.score)).glow;
              const atRisk = agg.atRisk > 0;
              const isSelected = selected === name;
              const style: CSSVars = {
                ...place,
                backgroundColor: fill,
                "--ic-glow": glow,
                ...(atRisk ? { boxShadow: `0 0 0 1.5px ${glow}, 0 0 10px 2px ${glow}` } : {}),
              };
              return (
                <button
                  key={usps}
                  type="button"
                  onClick={() => setSelected(isSelected ? null : name)}
                  aria-pressed={isSelected}
                  aria-label={`${name}: composite ${agg.score}, ${agg.count} accounts${atRisk ? `, ${agg.atRisk} at risk` : ""}`}
                  style={style}
                  className={cn(
                    "relative flex aspect-square items-center justify-center rounded-lg text-[0.7rem] font-bold transition-transform duration-200 hover:z-10 hover:scale-[1.08] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    luminance(fill) > 0.55 ? "text-slate-900" : "text-white",
                    atRisk && "ic-atrisk",
                    isSelected && "scale-[1.08] ring-2 ring-foreground ring-offset-2 ring-offset-background",
                  )}
                >
                  {usps}
                  {atRisk ? (
                    <span
                      aria-hidden
                      className="absolute right-0.5 top-0.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-background/90 px-1 text-[0.5rem] font-bold leading-none text-destructive ring-1 ring-destructive/40"
                    >
                      {agg.atRisk}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>At risk</span>
              <span
                className="h-2.5 w-32 rounded-full ring-1 ring-border"
                style={{ background: `linear-gradient(to right, ${LEGEND_STOPS.map(compositeRamp).join(", ")})` }}
              />
              <span>Healthy</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-muted ring-1 ring-border" /> No data
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-destructive">●</span> at-risk accounts (glowing)
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-1">
        {selectedAgg ? (
          <>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle>{selectedAgg.state}</CardTitle>
                  <CardDescription>
                    {selectedAgg.count} {selectedAgg.count === 1 ? "account" : "accounts"} · {fmtCompact(selectedAgg.volume)} questions
                    {selectedAgg.atRisk > 0 ? <> · {selectedAgg.atRisk} at risk</> : null}
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelected(null)} className="-mr-2 shrink-0">
                  Clear
                </Button>
              </div>
            </CardHeader>
            <CardContent className="max-h-[420px] space-y-2 overflow-y-auto">
              {selectedRows.map((row) => (
                <button
                  key={row.department}
                  type="button"
                  onClick={() => onSelectAccount?.(row)}
                  onMouseEnter={(e) => onHover?.(row, e)}
                  onMouseMove={(e) => onHover?.(row, e)}
                  onMouseLeave={() => onHover?.(null)}
                  className="flex w-full items-center gap-2.5 rounded-lg border bg-card px-2.5 py-1.5 text-left transition-colors hover:bg-accent"
                >
                  <LensGlyph lenses={row.lenses} band={row.band} size={30} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.department}</span>
                  <span className="text-sm font-semibold tabular-nums" style={{ color: bandColor(row.band).solid }}>
                    {row.composite}
                  </span>
                </button>
              ))}
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Where to look first</CardTitle>
              <CardDescription>States ranked by at-risk accounts. Click a glowing tile to drill in.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {ranked.slice(0, 7).map((s) => (
                <button
                  key={s.state}
                  type="button"
                  onClick={() => setSelected(s.state)}
                  className="flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:bg-accent"
                >
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-[0.65rem] font-bold text-white"
                    style={{ backgroundColor: compositeRamp(s.score) }}
                  >
                    {s.usps}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{s.state}</span>
                    <span className="block text-xs text-muted-foreground">
                      {fmtCompact(s.volume)} questions · {s.count} {s.count === 1 ? "account" : "accounts"}
                    </span>
                  </span>
                  {s.atRisk > 0 ? (
                    <Badge variant="warning" className="shrink-0">
                      {s.atRisk} at risk
                    </Badge>
                  ) : (
                    <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: bandColor(bandOfScore(s.score)).solid }}>
                      {s.score}
                    </span>
                  )}
                </button>
              ))}
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
