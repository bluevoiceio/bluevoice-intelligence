"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { scaleSqrt, scaleLinear } from "d3-scale";

import type { AgencyHealth } from "@/lib/health";
import { driverFor } from "@/lib/health";
import { healthColor, deltaLabel, STATUS_LABEL, clamp } from "./viz";
import { fmt, fmtCompact, fmtPct } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Fixed authoring canvas — the SVG scales to its container via preserveAspectRatio.
const VB_W = 1000;
const VB_H = 560;
const M = { top: 44, right: 52, bottom: 66, left: 78 };
const INNER_W = VB_W - M.left - M.right;
const INNER_H = VB_H - M.top - M.bottom;
const Y_DOMAIN = 60; // trend axis clamps to ±60%

// The at-risk glow is always red-band (decliners score low), so one filter suffices.
const RISK_GLOW = healthColor(20).glow;
const RISK_WASH = healthColor(20).soft;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

// Production deltaPct is null for sub-floor agencies — fall back to deltaAbs/prior
// (else 0) so every agency still plots on the trend axis.
function trendOf(row: AgencyHealth): number {
  return row.deltaPct ?? (row.prior > 0 ? (row.deltaAbs / row.prior) * 100 : 0);
}

interface Placed {
  row: AgencyHealth;
  cx: number;
  cy: number;
  r: number;
  i: number;
}

export function RiskQuadrant({ rows }: { rows: AgencyHealth[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(VB_W);
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const model = useMemo(() => {
    if (rows.length === 0) return null;
    const maxCurrent = Math.max(...rows.map((r) => r.current), 1);
    const x = scaleSqrt().domain([0, maxCurrent]).range([M.left, M.left + INNER_W]);
    const y = scaleLinear().domain([-Y_DOMAIN, Y_DOMAIN]).range([M.top + INNER_H, M.top]);
    const r = scaleSqrt().domain([0, maxCurrent]).range([8, 40]);
    const medX = x(median(rows.map((d) => d.current)));

    // Draw biggest bubbles first so small ones sit on top and stay clickable.
    const placed: Placed[] = rows
      .map((row, i) => ({
        row,
        cx: x(row.current),
        cy: y(clamp(trendOf(row), -Y_DOMAIN, Y_DOMAIN)),
        r: r(row.current),
        i,
      }))
      .sort((a, b) => b.r - a.r);

    // Label the most consequential at-risk agencies (biggest declining volume).
    const labelled = new Set(
      rows
        .filter((d) => d.status === "decliner")
        .sort((a, b) => b.current - a.current)
        .slice(0, 4)
        .map((d) => d.department),
    );

    const xTicks = x.ticks(5).filter((t) => t > 0);
    return { x, y, r, medX, placed, labelled, xTicks };
  }, [rows]);

  if (rows.length === 0 || !model) {
    return (
      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Risk quadrant</CardTitle>
        </CardHeader>
        <CardContent className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          No agencies in range yet — once usage data lands, at-risk accounts will surface here.
        </CardContent>
      </Card>
    );
  }

  const { x, y, medX, placed, labelled, xTicks } = model;
  const scaleF = width / VB_W;
  const svgH = VB_H * scaleF;
  const activeKey = pinned ?? hovered;
  const active = placed.find((p) => p.row.department === activeKey) ?? null;

  const yTicks = [-60, -30, 0, 30, 60];
  const yZero = y(0);

  // Floating detail-card position (px), clamped inside the container.
  let cardLeft = 0;
  let cardTop = 0;
  if (active) {
    const px = active.cx * scaleF;
    const py = active.cy * scaleF;
    const cardW = 264;
    cardLeft = clamp(px + active.r * scaleF + 14, 8, Math.max(8, width - cardW - 8));
    cardTop = clamp(py - 30, 8, Math.max(8, svgH - 150));
  }

  return (
    <Card className="overflow-hidden bg-card">
      <style>{vbKeyframes}</style>
      <CardHeader className="gap-1">
        <CardTitle>Risk quadrant — who to call this week</CardTitle>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-end gap-1">
              <span className="inline-block size-1.5 rounded-full bg-muted-foreground/70" />
              <span className="inline-block size-2.5 rounded-full bg-muted-foreground/70" />
              <span className="inline-block size-3.5 rounded-full bg-muted-foreground/70" />
            </span>
            Bubble size = question volume
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex overflow-hidden rounded-full">
              <span className="inline-block size-3" style={{ backgroundColor: healthColor(20).solid }} />
              <span className="inline-block size-3" style={{ backgroundColor: healthColor(58).solid }} />
              <span className="inline-block size-3" style={{ backgroundColor: healthColor(82).solid }} />
            </span>
            Color = health
          </span>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div ref={wrapRef} className="relative w-full">
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            width="100%"
            height={svgH}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Scatter of agencies by question volume and month-over-month trend"
            onClick={() => setPinned(null)}
          >
            <defs>
              <radialGradient id="rq-depth" cx="46%" cy="36%" r="78%">
                <stop offset="0%" stopColor="currentColor" stopOpacity={0.06} />
                <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
              </radialGradient>
              <filter id="rq-glow" x="-60%" y="-60%" width="220%" height="220%">
                <feDropShadow dx="0" dy="0" stdDeviation="9" floodColor={RISK_GLOW} floodOpacity="1" />
              </filter>
            </defs>

            {/* Depth wash + gridlines (chrome = foreground token via currentColor). */}
            <g className="text-foreground">
              <rect
                x={M.left}
                y={M.top}
                width={INNER_W}
                height={INNER_H}
                rx={10}
                fill="url(#rq-depth)"
              />
              {yTicks.map((t) => (
                <line
                  key={`gy-${t}`}
                  x1={M.left}
                  x2={M.left + INNER_W}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="currentColor"
                  strokeOpacity={t === 0 ? 0 : 0.06}
                />
              ))}
              {xTicks.map((t) => (
                <line
                  key={`gx-${t}`}
                  x1={x(t)}
                  x2={x(t)}
                  y1={M.top}
                  y2={M.top + INNER_H}
                  stroke="currentColor"
                  strokeOpacity={0.05}
                />
              ))}
            </g>

            {/* "CALL TODAY" wash — big & declining quadrant (bottom-right). */}
            <rect
              x={medX}
              y={yZero}
              width={M.left + INNER_W - medX}
              height={M.top + INNER_H - yZero}
              fill={RISK_WASH}
            />

            {/* Quadrant reference lines. */}
            <line
              x1={M.left}
              x2={M.left + INNER_W}
              y1={yZero}
              y2={yZero}
              stroke={healthColor(20).solid}
              strokeOpacity={0.45}
              strokeDasharray="2 5"
            />
            <line
              x1={medX}
              x2={medX}
              y1={M.top}
              y2={M.top + INNER_H}
              className="text-muted-foreground"
              stroke="currentColor"
              strokeOpacity={0.25}
              strokeDasharray="2 5"
            />

            {/* Quadrant corner labels. */}
            <g className="text-muted-foreground" fill="currentColor" fontSize={12} fontWeight={500}>
              <text x={M.left + 6} y={M.top + 16} opacity={0.6}>
                Rising &amp; small
              </text>
              <text x={M.left + INNER_W - 6} y={M.top + 16} textAnchor="end" opacity={0.6}>
                Rising &amp; big
              </text>
              <text x={M.left + 6} y={M.top + INNER_H - 8} opacity={0.55}>
                Small &amp; declining
              </text>
            </g>
            <text
              x={M.left + INNER_W - 8}
              y={M.top + INNER_H - 10}
              textAnchor="end"
              fontSize={13}
              fontWeight={700}
              letterSpacing={0.3}
              fill={healthColor(20).solid}
            >
              BIG &amp; DECLINING — CALL TODAY
            </text>

            {/* Axis ticks + titles. */}
            <g className="text-muted-foreground" fill="currentColor" fontSize={11}>
              {yTicks.map((t) => (
                <text key={`yt-${t}`} x={M.left - 10} y={y(t) + 3.5} textAnchor="end">
                  {t === 0 ? "0" : `${t > 0 ? "+" : "−"}${Math.abs(t)}%`}
                </text>
              ))}
              {xTicks.map((t) => (
                <text key={`xt-${t}`} x={x(t)} y={M.top + INNER_H + 18} textAnchor="middle">
                  {fmtCompact(t)}
                </text>
              ))}
            </g>
            <g className="text-muted-foreground" fill="currentColor" fontSize={12} fontWeight={600}>
              <text x={M.left + INNER_W / 2} y={VB_H - 16} textAnchor="middle">
                Question volume (30d)
              </text>
              <text
                x={18}
                y={M.top + INNER_H / 2}
                textAnchor="middle"
                transform={`rotate(-90 18 ${M.top + INNER_H / 2})`}
              >
                Month-over-month trend
              </text>
            </g>

            {/* Bubbles. */}
            {placed.map((p) => {
              const hc = healthColor(p.row.score);
              const isRisk = p.row.status === "decliner";
              const isActive = p.row.department === activeKey;
              return (
                <g
                  key={p.row.department}
                  className="rq-bubble"
                  onMouseEnter={() => setHovered(p.row.department)}
                  onMouseLeave={() => setHovered((h) => (h === p.row.department ? null : h))}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPinned((cur) => (cur === p.row.department ? null : p.row.department));
                  }}
                  style={{ cursor: "pointer", animationDelay: `${Math.min(p.i, 24) * 28}ms` }}
                >
                  <circle
                    cx={p.cx}
                    cy={p.cy}
                    r={p.r}
                    fill={hc.solid}
                    fillOpacity={isActive ? 0.95 : 0.85}
                    stroke={hc.solid}
                    strokeOpacity={isActive ? 0.9 : 0.35}
                    strokeWidth={isActive ? 2 : 1}
                    filter={isRisk ? "url(#rq-glow)" : undefined}
                  />
                  {labelled.has(p.row.department) && (
                    <text
                      x={p.cx}
                      y={p.cy - p.r - 6}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight={600}
                      fill={hc.solid}
                    >
                      {p.row.department}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {active && <DetailCard row={active.row} left={cardLeft} top={cardTop} />}
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Hover or tap a bubble for the account story. The red corner is where revenue is leaking — big agencies whose
          monthly question volume is falling.
        </p>
      </CardContent>
    </Card>
  );
}

function DetailCard({ row, left, top }: { row: AgencyHealth; left: number; top: number }) {
  const hc = healthColor(row.score);
  const breadthValue =
    row.breadth != null
      ? `${row.activeOfficers ?? "—"}/${row.provisionedOfficers ?? "—"} · ${fmtPct(row.breadth)}`
      : row.activeOfficers != null
        ? `${row.activeOfficers} active`
        : "—";
  return (
    <div
      className="pointer-events-none absolute z-10 w-[264px] motion-safe:transition-[left,top] motion-safe:duration-150"
      style={{ left, top }}
    >
      <Card className="border bg-card shadow-xl">
        <CardContent className="space-y-2.5 p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">{row.department}</div>
              <div className="text-xs text-muted-foreground">
                {row.usps} · {STATUS_LABEL[row.status]}
              </div>
            </div>
            <span
              className="shrink-0 rounded-md border px-1.5 py-0.5 text-xs font-semibold tabular-nums"
              style={{ color: hc.solid, backgroundColor: hc.soft, borderColor: hc.glow }}
            >
              {row.score}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <Stat label="This month" value={fmt(row.current)} />
            <Stat label="Prior month" value={fmt(row.prior)} />
            <Stat
              label="MoM trend"
              value={deltaLabel(row.deltaPct, row.status)}
              valueStyle={{ color: hc.solid }}
            />
            <Stat label="Seat breadth" value={breadthValue} />
          </div>

          <p className="border-t border-border pt-2 text-xs font-medium text-foreground">
            {driverFor(row)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  valueStyle,
}: {
  label: string;
  value: string;
  valueStyle?: React.CSSProperties;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("truncate font-semibold tabular-nums text-foreground")} style={valueStyle}>
        {value}
      </div>
    </div>
  );
}

const vbKeyframes = `
@media (prefers-reduced-motion: no-preference) {
  .rq-bubble {
    transform-box: fill-box;
    transform-origin: center;
    animation: rqBubbleIn 460ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  @keyframes rqBubbleIn {
    0% { opacity: 0; transform: scale(0.3); }
    100% { opacity: 1; transform: scale(1); }
  }
}
`;
