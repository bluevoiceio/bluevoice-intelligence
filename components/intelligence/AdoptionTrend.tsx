"use client";

import { ACCENT, bandColor } from "@/components/intelligence/lens";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmt } from "@/lib/format";
import type { TrendPoint, TrendSeries } from "@/lib/amplitude-parse";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const W = 220;
const H = 72;
const PADX = 8;
const PADT = 10;
const PADB = 18;

function monthShort(m: string): string {
  const idx = Number(m.slice(5, 7)) - 1;
  return MONTHS[idx] ?? m;
}

function cleanName(event: string): string {
  return event.replace(/ (Sent|Successfully|Created)$/, "").replace(/ Filled$/, "");
}

/** Returns null when trend data is absent — a failed /api/trends never breaks
 *  the briefing. */
export function AdoptionTrend({ series }: { series?: TrendSeries[] }) {
  if (!series || series.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Premium adoption trend</CardTitle>
        <CardDescription>
          Each AI-differentiated feature over the last six months — the runway isn&apos;t static, and part of it is
          already lifting off. Hover a point for its month.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {series.map((s) => (
          <Sparkline key={s.event} name={cleanName(s.event)} points={s.points} />
        ))}
      </CardContent>
    </Card>
  );
}

function Sparkline({ name, points }: { name: string; points: TrendPoint[] }) {
  const vals = points.map((p) => p.value);
  const last = vals[vals.length - 1] ?? 0;
  const first = vals.find((v) => v > 0) ?? 0;
  const ratio = first > 0 ? last / first : 0;
  const rising = last > first;

  let tone: string;
  let badge: string;
  if (ratio >= 1.5) { tone = bandColor("green").solid; badge = `▲ ${Math.round(ratio)}× · breakout`; }
  else if (rising) { tone = ACCENT.signal; badge = "▲ climbing"; }
  else if (last < first) { tone = bandColor("red").solid; badge = "▼ slipping"; }
  else { tone = bandColor("yellow").solid; badge = "▬ flat"; }

  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const n = points.length;
  const xx = (i: number) => PADX + (n > 1 ? (i * (W - 2 * PADX)) / (n - 1) : 0);
  const yy = (v: number) => H - PADB - ((v - min) / span) * (H - PADT - PADB);
  const line = points.map((p, i) => `${i ? "L" : "M"}${xx(i).toFixed(1)},${yy(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${xx(n - 1).toFixed(1)},${H - PADB} L${xx(0).toFixed(1)},${H - PADB} Z`;

  return (
    <div className="rounded-lg border p-2.5">
      <div className="flex items-baseline justify-between gap-1">
        <span className="truncate text-[12px] font-medium">{name}</span>
        <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: tone }}>{fmt(last)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="mt-1 overflow-visible" role="img" aria-label={`${name} trend`}>
        <line x1={PADX} y1={H - PADB} x2={W - PADX} y2={H - PADB} stroke="currentColor" strokeOpacity={0.12} />
        <path d={area} fill={tone} fillOpacity={0.1} />
        <path d={line} fill="none" stroke={tone} strokeWidth={2} strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={p.month} cx={xx(i)} cy={yy(p.value)} r={2.4} fill={tone}>
            <title>{`${monthShort(p.month)}: ${fmt(p.value)}`}</title>
          </circle>
        ))}
        <text x={xx(0)} y={H - 5} textAnchor="start" fontSize={9} className="fill-muted-foreground">{monthShort(points[0]?.month ?? "")}</text>
        <text x={xx(n - 1)} y={H - 5} textAnchor="end" fontSize={9} className="fill-muted-foreground">{monthShort(points[n - 1]?.month ?? "")}</text>
      </svg>
      <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-wide" style={{ color: tone }}>{badge}</span>
    </div>
  );
}
