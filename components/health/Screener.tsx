"use client";

import * as React from "react";
import { Minus, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fmt, fmtPct } from "@/lib/format";

import type { AgencyHealth } from "@/lib/health";
import { driverFor } from "@/lib/health";
import {
  clamp,
  deltaLabel,
  healthColor,
  scoreRamp,
  sparkArea,
  sparkEnd,
  sparkPath,
  STATUS_LABEL,
} from "./viz";

/**
 * Health Screener — a Bloomberg-terminal-grade triage table.
 *
 * Rows arrive pre-sorted worst-first, every cell is a micro-visualization (score
 * ring, sparkline, breadth bullet, quality heat dot), and red-band rows carry a
 * soft health tint + left accent so the eye lands on the call-list first. All
 * chrome uses CSS tokens so light and dark both work; the only saturated color
 * comes from viz hexes. Enrichment fields are optional in production, so each
 * micro-viz degrades to a muted fallback when its signal is absent.
 */

// Entrance + reduced-motion gate, scoped to this component via [data-sc-row].
const MOTION_CSS = `
@media (prefers-reduced-motion: no-preference) {
  @keyframes scRowIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  [data-sc-row] { animation: scRowIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }
}
`;

const LEGEND: ReadonlyArray<{ label: string; score: number; hint: string }> = [
  { label: "At risk", score: 30, hint: "score < 45" },
  { label: "Watch", score: 56, hint: "45–67" },
  { label: "Healthy", score: 85, hint: "68+" },
];

export function Screener({ rows }: { rows: AgencyHealth[] }) {
  if (rows.length === 0) {
    return (
      <Card className="border-border/60">
        <CardContent className="flex min-h-48 flex-col items-center justify-center gap-2 text-center">
          <ShieldAlert className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium text-foreground">No agencies match these filters</p>
          <p className="text-xs text-muted-foreground">
            Clear a filter to repopulate the screener.
          </p>
        </CardContent>
      </Card>
    );
  }

  const atRisk = rows.filter((r) => healthColor(r.score).band === "red").length;

  return (
    <Card className="overflow-hidden border-border/60 shadow-sm">
      <style dangerouslySetInnerHTML={{ __html: MOTION_CSS }} />

      {/* Toolbar: count + legend, gentle gradient wash */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border/60 bg-gradient-to-r from-muted/50 via-muted/20 to-transparent px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {fmt(rows.length)}
          </span>
          <span className="text-sm text-muted-foreground">
            agencies · sorted by health, worst first
          </span>
          {atRisk > 0 && (
            <span
              className="ml-1 inline-flex items-center gap-1 text-xs font-medium tabular-nums"
              style={{ color: healthColor(20).solid }}
            >
              <ShieldAlert className="size-3.5" aria-hidden />
              {fmt(atRisk)} at risk
            </span>
          )}
        </div>
        <ul className="flex items-center gap-3.5" aria-label="Health bands">
          {LEGEND.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-full"
                style={{
                  backgroundColor: healthColor(l.score).solid,
                  boxShadow: `0 0 6px ${healthColor(l.score).glow}`,
                }}
                aria-hidden
              />
              <span className="text-xs font-medium text-foreground">{l.label}</span>
              <span className="text-[10px] tabular-nums text-muted-foreground">{l.hint}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Agency health screener: rank, health score, 90-day usage trend, officer breadth,
            answer-quality friction, and the leading driver per agency.
          </caption>
          <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
            <tr className="bg-gradient-to-b from-muted/40 to-transparent text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Th className="w-12 pl-4 text-center">#</Th>
              <Th className="min-w-52">Agency</Th>
              <Th className="w-20 text-center">Health</Th>
              <Th className="w-44">90d Trend</Th>
              <Th className="w-48">Officer breadth</Th>
              <Th className="w-24 text-center">Quality</Th>
              <Th className="min-w-56 pr-4">Driver</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <ScreenerRow key={`${row.state}:${row.department}`} row={row} rank={i + 1} index={i} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th scope="col" className={cn("px-3 py-2.5 font-medium", className)}>
      {children}
    </th>
  );
}

function ScreenerRow({ row, rank, index }: { row: AgencyHealth; rank: number; index: number }) {
  const color = healthColor(row.score);
  const isRed = color.band === "red";

  const rowStyle: React.CSSProperties = {
    animationDelay: `${Math.min(index, 20) * 40}ms`,
    ...(isRed
      ? { backgroundColor: color.soft, boxShadow: `inset 3px 0 0 0 ${color.solid}` }
      : null),
  };

  return (
    <tr
      data-sc-row
      style={rowStyle}
      className={cn(
        "border-b border-border/50 align-middle transition-colors duration-150 last:border-0",
        !isRed && "motion-safe:hover:bg-muted/40",
      )}
    >
      {/* 1 — Rank + agency + state chip */}
      <td className="py-3 pl-4 text-center">
        <span className="text-xs font-medium tabular-nums text-muted-foreground">{rank}</span>
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{row.department}</span>
          <Badge
            variant="outline"
            className="h-5 border-border/70 px-1.5 font-mono text-[10px] tracking-wide text-muted-foreground"
          >
            {row.usps}
          </Badge>
        </div>
        <StatusTag row={row} color={color} />
      </td>

      {/* 2 — Health score ring */}
      <td className="px-3 py-3">
        <div className="flex justify-center">
          <HealthRing score={row.score} color={color} />
        </div>
      </td>

      {/* 3 — 90d trend sparkline + delta */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-2.5">
          <Sparkline row={row} color={color} />
          <TrendDelta row={row} />
        </div>
      </td>

      {/* 4 — Officer breadth bullet */}
      <td className="px-3 py-3">
        <BreadthBullet row={row} />
      </td>

      {/* 5 — Answer-quality heat dot */}
      <td className="px-3 py-3">
        <QualityCell row={row} />
      </td>

      {/* 6 — Driver sentence */}
      <td className="px-3 py-3 pr-4">
        <span className="text-[13px] leading-snug text-muted-foreground">{driverFor(row)}</span>
      </td>
    </tr>
  );
}

function StatusTag({
  row,
  color,
}: {
  row: AgencyHealth;
  color: ReturnType<typeof healthColor>;
}) {
  return (
    <div className="mt-1 flex items-center gap-1.5">
      <span className="size-1.5 rounded-full" style={{ backgroundColor: color.solid }} aria-hidden />
      <span className="text-[11px] font-medium tracking-wide" style={{ color: color.solid }}>
        {STATUS_LABEL[row.status]}
      </span>
    </div>
  );
}

function HealthRing({
  score,
  color,
}: {
  score: number;
  color: ReturnType<typeof healthColor>;
}) {
  const size = 38;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const filled = (clamp(score, 0, 100) / 100) * circ;
  const center = size / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Health score ${score} of 100`}
    >
      <circle cx={center} cy={center} r={r} fill="none" stroke={color.soft} strokeWidth={stroke} />
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke={color.solid}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${filled.toFixed(2)} ${(circ - filled).toFixed(2)}`}
        transform={`rotate(-90 ${center} ${center})`}
        style={{ filter: `drop-shadow(0 0 3px ${color.glow})` }}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-foreground font-semibold tabular-nums"
        fontSize={12}
      >
        {score}
      </text>
    </svg>
  );
}

function Sparkline({
  row,
  color,
}: {
  row: AgencyHealth;
  color: ReturnType<typeof healthColor>;
}) {
  const w = 116;
  const h = 34;
  const pad = 4;
  const gradId = React.useId();
  const series = row.series ?? [];

  // Graceful fallback when there's no weekly trend: a flat hairline + muted dash,
  // so the cell keeps its rhythm instead of collapsing.
  if (series.length === 0) {
    return (
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        className="shrink-0 overflow-visible"
        role="img"
        aria-label="No trend data available"
      >
        <line
          x1={pad}
          y1={h / 2}
          x2={w - pad}
          y2={h / 2}
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="3 4"
          className="text-muted-foreground/50"
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-muted-foreground"
          fontSize={11}
        >
          —
        </text>
      </svg>
    );
  }

  const d = sparkPath(series, w, h, pad);
  const area = sparkArea(series, w, h, pad);
  const end = sparkEnd(series, w, h, pad);

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="shrink-0 overflow-visible"
      role="img"
      aria-label="90-day weekly question volume trend"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color.solid} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color.solid} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path
        d={d}
        fill="none"
        stroke={color.solid}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={end.x}
        cy={end.y}
        r={2.6}
        fill={color.solid}
        style={{ filter: `drop-shadow(0 0 4px ${color.glow})` }}
      />
    </svg>
  );
}

function TrendDelta({ row }: { row: AgencyHealth }) {
  // Chevron direction follows the absolute swing; "new" agencies stay neutral.
  const dir: "up" | "down" | "flat" =
    row.status === "new" ? "flat" : row.deltaAbs > 0 ? "up" : row.deltaAbs < 0 ? "down" : "flat";
  const Icon = dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : Minus;
  const colorStyle =
    dir === "up"
      ? { color: healthColor(85).solid }
      : dir === "down"
        ? { color: healthColor(20).solid }
        : undefined;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums",
        !colorStyle && "text-muted-foreground",
      )}
      style={colorStyle}
    >
      <Icon className="size-3.5" aria-hidden />
      {deltaLabel(row.deltaPct, row.status)}
    </span>
  );
}

function BreadthBullet({ row }: { row: AgencyHealth }) {
  // Full ratio bar when both active + provisioned seats are known.
  if (row.breadth != null) {
    const pct = clamp(row.breadth, 0, 1);
    const color = healthColor(pct * 100);
    const width = `${Math.max(pct * 100, 3).toFixed(1)}%`;
    const active = row.activeOfficers ?? "—";
    const provisioned = row.provisionedOfficers ?? "—";

    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="tabular-nums text-foreground">
            {active}
            <span className="text-muted-foreground">/{provisioned}</span>
          </span>
          <span className="tabular-nums font-medium" style={{ color: color.solid }}>
            {fmtPct(row.breadth)}
          </span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={`${active} of ${provisioned} seats active`}
        >
          <div
            className="h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500"
            style={{ width, backgroundColor: color.solid, boxShadow: `0 0 6px ${color.glow}` }}
          />
        </div>
      </div>
    );
  }

  // Only the active count is known — show it plainly, no ratio bar.
  if (row.activeOfficers != null) {
    return (
      <span className="text-xs tabular-nums text-foreground">
        {fmt(row.activeOfficers)} <span className="text-muted-foreground">active</span>
      </span>
    );
  }

  // No officer signal at all.
  return <span className="text-xs text-muted-foreground">—</span>;
}

function QualityCell({ row }: { row: AgencyHealth }) {
  if (row.betterAnswerRate == null) {
    return (
      <div className="flex items-center justify-center">
        <span className="text-xs text-muted-foreground">—</span>
      </div>
    );
  }

  // Higher Better-Answer rate = worse quality → redder. Map onto the score ramp.
  const quality = (1 - clamp(row.betterAnswerRate / 0.09, 0, 1)) * 100;
  const hex = scoreRamp(quality);

  return (
    <div className="flex items-center justify-center gap-1.5">
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: hex, boxShadow: `0 0 6px ${hex}88` }}
        aria-hidden
      />
      <span
        className="text-xs tabular-nums text-foreground"
        title="Better-Answer rate (higher = weaker answers)"
      >
        {fmtPct(row.betterAnswerRate)}
      </span>
    </div>
  );
}
