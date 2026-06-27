"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { type AgencyHealth, driverFor } from "@/lib/health";
import { fmtCompact, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  type Band,
  bandOf,
  clamp,
  deltaLabel,
  healthColor,
  scoreRamp,
  STATUS_LABEL,
} from "./viz";

/* ------------------------------------------------------------------ *
 * Beeswarm geometry (viewBox units; SVG scales responsively to width) *
 * ------------------------------------------------------------------ */

const W = 1000;
const H = 220;
const PAD_X = 28;
const PLOT_W = W - 2 * PAD_X;
const CENTER_Y = 96;
const SWARM_TOP = 36;
const SWARM_BOT = 156;
const AXIS_Y = 186;
const R_MIN = 5;
const R_MAX = 16;
const DOT_GAP = 1.5;

const TICKS = [0, 45, 68, 100];

const xOf = (score: number): number =>
  PAD_X + (clamp(score, 0, 100) / 100) * PLOT_W;

interface SwarmDot {
  department: string;
  score: number;
  current: number;
  status: AgencyHealth["status"];
  x: number;
  y: number;
  r: number;
}

/** Greedy beeswarm: sort by x, nudge each dot off the centre line until it
 *  clears its already-placed neighbours. Deterministic for a given `rows`. */
function buildSwarm(rows: AgencyHealth[]): SwarmDot[] {
  if (rows.length === 0) return [];

  const sqrts = rows.map((r) => Math.sqrt(Math.max(r.current, 0)));
  const sMin = Math.min(...sqrts);
  const sMax = Math.max(...sqrts);
  const rOf = (current: number): number => {
    if (sMax === sMin) return (R_MIN + R_MAX) / 2;
    const t = (Math.sqrt(Math.max(current, 0)) - sMin) / (sMax - sMin);
    return R_MIN + t * (R_MAX - R_MIN);
  };

  const seeds = rows
    .map((r) => ({
      department: r.department,
      score: r.score,
      current: r.current,
      status: r.status,
      x: xOf(r.score),
      r: rOf(r.current),
    }))
    .sort((a, b) => a.x - b.x);

  const placed: SwarmDot[] = [];
  for (const d of seeds) {
    const neighbours = placed.filter(
      (p) => Math.abs(p.x - d.x) < p.r + d.r + DOT_GAP,
    );
    let y = CENTER_Y;
    if (neighbours.length) {
      const fits = (cand: number): boolean =>
        neighbours.every((p) => {
          const dist = Math.hypot(p.x - d.x, p.y - cand);
          return dist >= p.r + d.r + DOT_GAP;
        });
      outer: for (let k = 0; k < 240; k++) {
        for (const sign of k === 0 ? [1] : [1, -1]) {
          const cand = CENTER_Y + sign * k * 1.5;
          if (cand < SWARM_TOP || cand > SWARM_BOT) continue;
          if (fits(cand)) {
            y = cand;
            break outer;
          }
        }
      }
    }
    placed.push({ ...d, y });
  }
  return placed;
}

const BAND_WORD: Record<Band, string> = {
  red: "Critical",
  amber: "Watch",
  green: "Healthy",
};

function statusBadgeVariant(
  status: AgencyHealth["status"],
): "warning" | "success" | "secondary" {
  if (status === "decliner") return "warning";
  if (status === "riser") return "success";
  return "secondary";
}

/** Officers stat line: prefer the breadth-aware form, degrade gracefully. */
function officersStat(row: AgencyHealth): string {
  if (row.breadth != null) {
    return `${fmtPct(row.breadth)} active (${row.activeOfficers ?? "—"}/${row.provisionedOfficers ?? "—"})`;
  }
  if (row.activeOfficers != null) {
    return `${row.activeOfficers} active officers`;
  }
  return "—";
}

/* ----------------------------- Slopegraph ----------------------------- */

function SlopeGraph({
  prior,
  current,
  deltaPct,
  status,
}: {
  prior: number;
  current: number;
  deltaPct: number | null;
  status: AgencyHealth["status"];
}) {
  const w = 144;
  const h = 64;
  const lx = 30;
  const rx = 114;
  const topY = 12;
  const botY = 40;

  const minV = Math.min(prior, current);
  const maxV = Math.max(prior, current);
  const span = maxV - minV || 1;
  const y = (v: number): number => botY - ((v - minV) / span) * (botY - topY);

  const up = current >= prior;
  const color = healthColor(up ? 80 : 20).solid;
  const yp = y(prior);
  const yc = y(current);

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-16 w-full"
      role="img"
      aria-label={`Prior ${fmtCompact(prior)}, now ${fmtCompact(current)}, ${deltaLabel(deltaPct, status)}`}
    >
      <line
        x1={lx}
        y1={topY - 4}
        x2={lx}
        y2={botY + 4}
        className="stroke-border"
        strokeWidth={1}
      />
      <line
        x1={rx}
        y1={topY - 4}
        x2={rx}
        y2={botY + 4}
        className="stroke-border"
        strokeWidth={1}
      />
      <line
        x1={lx}
        y1={yp}
        x2={rx}
        y2={yc}
        stroke={color}
        strokeWidth={2.25}
        strokeLinecap="round"
      />
      <circle cx={lx} cy={yp} r={3.25} fill={color} />
      <circle cx={rx} cy={yc} r={3.75} fill={color} />

      <text
        x={lx}
        y={yp - 6}
        textAnchor="middle"
        className="fill-foreground text-[9px] tabular-nums"
      >
        {fmtCompact(prior)}
      </text>
      <text
        x={rx}
        y={yc - 6}
        textAnchor="middle"
        className="text-[9px] font-semibold tabular-nums"
        fill={color}
      >
        {fmtCompact(current)}
      </text>

      <text
        x={lx}
        y={botY + 16}
        textAnchor="middle"
        className="fill-muted-foreground text-[8px] uppercase tracking-wide"
      >
        prior
      </text>
      <text
        x={rx}
        y={botY + 16}
        textAnchor="middle"
        className="fill-muted-foreground text-[8px] uppercase tracking-wide"
      >
        now
      </text>
      <text
        x={(lx + rx) / 2}
        y={botY + 16}
        textAnchor="middle"
        className="text-[9px] font-semibold tabular-nums"
        fill={color}
      >
        {deltaLabel(deltaPct, status)}
      </text>
    </svg>
  );
}

/* ------------------------------- Stat -------------------------------- */

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

/* ------------------------------ CallList ----------------------------- */

export function CallList({ rows }: { rows: AgencyHealth[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const swarm = useMemo(() => buildSwarm(rows), [rows]);
  const active = hovered ?? selected;
  const activeDot = useMemo(
    () => swarm.find((d) => d.department === active) ?? null,
    [swarm, active],
  );

  if (rows.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex h-48 flex-col items-center justify-center gap-1 text-center">
          <p className="text-sm font-medium text-foreground">No agencies</p>
          <p className="text-xs text-muted-foreground">
            Adjust the filters to populate the triage call-list.
          </p>
        </CardContent>
      </Card>
    );
  }

  const toggle = (dept: string) =>
    setSelected((cur) => (cur === dept ? null : dept));

  return (
    <div className="flex flex-col gap-6">
      {/* ---------------------------- Beeswarm strip --------------------------- */}
      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-end justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Where every account sits</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Each dot is an agency on the health axis · size ∝ current volume ·
              hover to find its card
            </p>
          </div>
          <div className="text-right">
            {activeDot ? (
              <>
                <p className="text-sm font-semibold text-foreground">
                  {activeDot.department}
                </p>
                <p
                  className="text-xs font-medium tabular-nums"
                  style={{ color: healthColor(activeDot.score).solid }}
                >
                  {activeDot.score} · {STATUS_LABEL[activeDot.status]}
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                {rows.length} agencies
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full"
            role="img"
            aria-label="Beeswarm of agency health scores from at risk to healthy"
          >
            {/* band zones */}
            {(
              [
                { from: 0, to: 45, score: 22 },
                { from: 45, to: 68, score: 56 },
                { from: 68, to: 100, score: 84 },
              ] as const
            ).map((z) => (
              <rect
                key={z.from}
                x={xOf(z.from)}
                y={SWARM_TOP - 12}
                width={xOf(z.to) - xOf(z.from)}
                height={SWARM_BOT - SWARM_TOP + 24}
                fill={healthColor(z.score).soft}
              />
            ))}

            {/* tick separators + labels */}
            {TICKS.map((t) => (
              <g key={t}>
                <line
                  x1={xOf(t)}
                  y1={SWARM_TOP - 12}
                  x2={xOf(t)}
                  y2={AXIS_Y - 14}
                  className="stroke-border"
                  strokeWidth={1}
                  strokeDasharray="2 4"
                />
                <text
                  x={xOf(t)}
                  y={AXIS_Y}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[12px] tabular-nums"
                >
                  {t}
                </text>
              </g>
            ))}
            <text
              x={xOf(0)}
              y={AXIS_Y + 18}
              textAnchor="start"
              className="fill-muted-foreground text-[11px] uppercase tracking-widest"
            >
              At risk
            </text>
            <text
              x={xOf(100)}
              y={AXIS_Y + 18}
              textAnchor="end"
              className="fill-muted-foreground text-[11px] uppercase tracking-widest"
            >
              Healthy
            </text>

            {/* dots */}
            {swarm.map((d) => {
              const isActive = d.department === active;
              const glow = d.status === "decliner" || bandOf(d.score) === "red";
              return (
                <circle
                  key={d.department}
                  cx={d.x}
                  cy={d.y}
                  r={d.r}
                  fill={scoreRamp(d.score)}
                  stroke={isActive ? "var(--background)" : "transparent"}
                  strokeWidth={isActive ? 2.5 : 0}
                  opacity={active && !isActive ? 0.42 : 1}
                  className="cursor-pointer transition-opacity duration-200"
                  style={
                    glow
                      ? { filter: `drop-shadow(0 0 5px ${healthColor(d.score).glow})` }
                      : undefined
                  }
                  onMouseEnter={() => setHovered(d.department)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => toggle(d.department)}
                >
                  <title>{`${d.department} · ${d.score}/100`}</title>
                </circle>
              );
            })}

            {/* active label callout */}
            {activeDot ? (
              <g pointerEvents="none">
                <line
                  x1={activeDot.x}
                  y1={activeDot.y - activeDot.r}
                  x2={activeDot.x}
                  y2={SWARM_TOP - 18}
                  stroke={healthColor(activeDot.score).solid}
                  strokeWidth={1}
                />
                <text
                  x={clamp(activeDot.x, PAD_X + 40, W - PAD_X - 40)}
                  y={SWARM_TOP - 22}
                  textAnchor="middle"
                  className="fill-foreground text-[13px] font-semibold"
                >
                  {activeDot.department}
                </text>
              </g>
            ) : null}
          </svg>
        </CardContent>
      </Card>

      {/* ----------------------------- Call cards ---------------------------- */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((r, i) => {
          const hc = healthColor(r.score);
          const isSel = r.department === selected;
          const isActive = r.department === active;
          const rank = i + 1;
          const priority = i < 3;
          return (
            <Card
              key={r.department}
              onMouseEnter={() => setHovered(r.department)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => toggle(r.department)}
              className={cn(
                "relative cursor-pointer overflow-hidden transition-shadow",
                "motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-1 hover:shadow-lg",
                isActive && "shadow-md",
              )}
              style={
                isSel
                  ? { outline: `2px solid ${hc.solid}`, outlineOffset: 2 }
                  : undefined
              }
            >
              {/* health accent bar */}
              <div
                className="absolute inset-x-0 top-0 h-1"
                style={{ background: hc.solid }}
              />

              {priority ? (
                <span
                  className="absolute right-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ background: hc.soft, color: hc.solid }}
                >
                  Priority
                </span>
              ) : null}

              <CardHeader className="space-y-0 pb-3 pt-5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-sm font-semibold tabular-nums text-muted-foreground">
                    #{rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate text-base leading-tight">
                      {r.department}
                    </CardTitle>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="tabular-nums">
                        {r.usps}
                      </Badge>
                      <Badge variant={statusBadgeVariant(r.status)}>
                        {STATUS_LABEL[r.status]}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* score + slopegraph row */}
                <div className="flex items-end justify-between gap-4">
                  <div className="flex items-baseline gap-1">
                    <span
                      className="text-3xl font-semibold tabular-nums leading-none"
                      style={{ color: hc.solid }}
                    >
                      {r.score}
                    </span>
                    <span className="text-xs text-muted-foreground">/100</span>
                    <span
                      className="ml-1.5 text-xs font-medium"
                      style={{ color: hc.solid }}
                    >
                      {BAND_WORD[hc.band]}
                    </span>
                  </div>
                  <div className="w-36 shrink-0">
                    <SlopeGraph
                      prior={r.prior}
                      current={r.current}
                      deltaPct={r.deltaPct}
                      status={r.status}
                    />
                  </div>
                </div>

                {/* driver one-liner */}
                <p
                  className="border-l-2 pl-3 text-sm font-medium leading-snug text-foreground"
                  style={{ borderColor: hc.solid }}
                >
                  {driverFor(r)}
                </p>

                {/* stats */}
                <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
                  <Stat label="Officers" value={officersStat(r)} />
                  <Stat
                    label="Quality"
                    value={r.betterAnswerRate != null ? fmtPct(r.betterAnswerRate) : "—"}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
