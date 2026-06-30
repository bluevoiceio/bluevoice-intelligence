"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { driverFor, type AgencyHealth } from "@/lib/health";
import { fmt, fmtCompact, fmtPct } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { deltaLabel, healthColor, scoreRamp, STATUS_LABEL, statusColor } from "./viz";

const TREEMAP_H = 520;
const STATE_INSET = 3; // gap between state clusters (shows card bg as a seam)
const HEADER_H = 18; // state label band
const CELL_GAP = 1.4; // gap between agency cells

// --- geometry ---------------------------------------------------------------

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Tile<T> extends Rect {
  item: T;
}

/**
 * Squarified treemap (Bruls/Huizing/van Wijk). Lays `data` into `rect`, biasing
 * tiles toward square aspect ratios. Order matters — pass values descending.
 */
function squarify<T>(data: { item: T; value: number }[], rect: Rect): Tile<T>[] {
  const out: Tile<T>[] = [];
  const nodes = data.filter((d) => d.value > 0);
  const totalValue = nodes.reduce((s, d) => s + d.value, 0);
  if (totalValue <= 0 || rect.w <= 0 || rect.h <= 0) return out;

  const scale = (rect.w * rect.h) / totalValue;
  const areas = nodes.map((d) => ({ item: d.item, area: d.value * scale }));

  const worst = (row: { area: number }[], side: number, sum: number): number => {
    let max = -Infinity;
    let min = Infinity;
    for (const r of row) {
      if (r.area > max) max = r.area;
      if (r.area < min) min = r.area;
    }
    const s2 = sum * sum;
    const side2 = side * side;
    return Math.max((side2 * max) / s2, s2 / (side2 * min));
  };

  let { x, y, w, h } = rect;
  let i = 0;
  while (i < areas.length) {
    const side = Math.min(w, h);
    const row = [areas[i]];
    let sum = areas[i].area;
    let k = i + 1;
    while (k < areas.length) {
      const nextSum = sum + areas[k].area;
      if (worst([...row, areas[k]], side, nextSum) <= worst(row, side, sum)) {
        row.push(areas[k]);
        sum = nextSum;
        k++;
      } else break;
    }
    const thickness = sum / side;
    if (w <= h) {
      let cx = x;
      for (const node of row) {
        const len = node.area / thickness;
        out.push({ item: node.item, x: cx, y, w: len, h: thickness });
        cx += len;
      }
      y += thickness;
      h -= thickness;
    } else {
      let cy = y;
      for (const node of row) {
        const len = node.area / thickness;
        out.push({ item: node.item, x, y: cy, w: thickness, h: len });
        cy += len;
      }
      x += thickness;
      w -= thickness;
    }
    i = k;
  }
  return out;
}

// --- color helpers ----------------------------------------------------------

function relLuminance(hex: string): number {
  const h = hex.replace("#", "");
  const ch = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(ch(0)) + 0.7152 * lin(ch(2)) + 0.0722 * lin(ch(4));
}

/** White vs near-black ink chosen by fill luminance, so labels stay legible. */
function inkFor(hex: string): string {
  return relLuminance(hex) > 0.46 ? "#0b1220" : "#ffffff";
}

// --- grouping ---------------------------------------------------------------

interface StateGroup {
  state: string;
  usps: string;
  value: number;
  score: number;
  atRisk: number;
  count: number;
  rows: AgencyHealth[];
}

function groupByState(rows: AgencyHealth[]): StateGroup[] {
  const map = new Map<string, StateGroup>();
  for (const r of rows) {
    let g = map.get(r.state);
    if (!g) {
      g = { state: r.state, usps: r.usps, value: 0, score: 0, atRisk: 0, count: 0, rows: [] };
      map.set(r.state, g);
    }
    g.value += r.current;
    g.score += r.score * r.current; // volume-weighted accumulator
    g.atRisk += r.status === "decliner" ? 1 : 0;
    g.count += 1;
    g.rows.push(r);
  }
  const groups = [...map.values()];
  for (const g of groups) {
    g.score = g.value > 0 ? Math.round(g.score / g.value) : 0;
    g.rows.sort((a, b) => b.current - a.current);
  }
  return groups.sort((a, b) => b.value - a.value);
}

// --- layout ------------------------------------------------------------------

interface Layout {
  headers: { key: string; usps: string; atRisk: number; count: number; rect: Rect }[];
  cells: Tile<AgencyHealth>[];
}

function buildLayout(groups: StateGroup[], width: number): Layout {
  const headers: Layout["headers"] = [];
  const cells: Tile<AgencyHealth>[] = [];
  if (width <= 0) return { headers, cells };

  const stateTiles = squarify(
    groups.map((g) => ({ item: g, value: g.value })),
    { x: 0, y: 0, w: width, h: TREEMAP_H },
  );

  for (const st of stateTiles) {
    const rx = st.x + STATE_INSET;
    const ry = st.y + STATE_INSET;
    const rw = st.w - STATE_INSET * 2;
    const rh = st.h - STATE_INSET * 2;
    if (rw <= 0 || rh <= 0) continue;

    const headerH = rh > 56 && rw > 64 ? HEADER_H : 0;
    if (headerH > 0) {
      headers.push({
        key: st.item.state,
        usps: st.item.usps,
        atRisk: st.item.atRisk,
        count: st.item.count,
        rect: { x: rx, y: ry, w: rw, h: headerH },
      });
    }
    const inner: Rect = { x: rx, y: ry + headerH, w: rw, h: rh - headerH };
    for (const t of squarify(st.item.rows.map((r) => ({ item: r, value: r.current })), inner)) {
      cells.push(t);
    }
  }
  return { headers, cells };
}

// --- component ---------------------------------------------------------------

export function Treemap({ rows }: { rows: AgencyHealth[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<AgencyHealth | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [animate, setAnimate] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      if ("matchMedia" in window) {
        setAnimate(window.matchMedia("(prefers-reduced-motion: no-preference)").matches);
      }
      setMounted(true);
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  const groups = useMemo(() => groupByState(rows), [rows]);
  const layout = useMemo(() => buildLayout(groups, width), [groups, width]);

  const stats = useMemo(() => {
    const total = rows.reduce((s, r) => s + r.current, 0);
    const atRiskVol = rows
      .filter((r) => r.status === "decliner")
      .reduce((s, r) => s + r.current, 0);
    return {
      total,
      atRiskVol,
      atRiskShare: total > 0 ? atRiskVol / total : 0,
      atRiskCount: rows.filter((r) => r.status === "decliner").length,
      agencies: rows.length,
    };
  }, [rows]);

  const red = statusColor("decliner").solid;
  const legendSamples = [8, 30, 45, 56, 68, 88];
  const legendGradient = `linear-gradient(90deg, ${legendSamples
    .map((s, i) => `${scoreRamp(s)} ${(i / (legendSamples.length - 1)) * 100}%`)
    .join(", ")})`;

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-64 flex-col items-center justify-center gap-1 text-center">
          <p className="text-sm font-medium">No agencies match these filters</p>
          <p className="text-xs text-muted-foreground">
            Clear a filter to see the book of business.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* TOP STRIP — the headline */}
      <Card className="overflow-hidden">
        <CardContent className="flex flex-wrap items-stretch gap-x-8 gap-y-4 p-5">
          <div className="min-w-[140px]">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Total questions · 30d
            </p>
            <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
              {fmt(stats.total)}
            </p>
          </div>

          <div
            className="min-w-[180px] rounded-lg px-4 py-2"
            style={{ background: statusColor("decliner").soft }}
          >
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: red }}>
              % of book at risk
            </p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums tracking-tight" style={{ color: red }}>
                {fmtPct(stats.atRiskShare)}
              </span>
              <span className="text-xs text-muted-foreground">
                {fmtCompact(stats.atRiskVol)} q · {stats.atRiskCount} agencies
              </span>
            </p>
          </div>

          <div className="min-w-[110px]">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Agencies
            </p>
            <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
              {stats.agencies}
            </p>
          </div>

          {/* LEGEND */}
          <div className="ml-auto flex min-w-[200px] flex-col justify-center gap-1.5">
            <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
              <span>At risk</span>
              <span>Healthy</span>
            </div>
            <div
              className="h-2.5 w-full rounded-full ring-1 ring-border ring-inset"
              style={{ background: legendGradient }}
            />
            <p className="text-[10px] leading-tight text-muted-foreground">
              area = questions (30d) · color = health
            </p>
          </div>
        </CardContent>
      </Card>

      {/* TREEMAP */}
      <div
        ref={wrapRef}
        className="relative overflow-hidden rounded-xl border bg-card"
        style={{ height: TREEMAP_H }}
        onMouseMove={(e) => {
          const el = wrapRef.current;
          if (!el) return;
          const r = el.getBoundingClientRect();
          setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
        }}
        onMouseLeave={() => setHover(null)}
      >
        {width <= 0 ? (
          <div className="h-full w-full animate-pulse bg-muted/40" />
        ) : (
          <>
            <svg
              width={width}
              height={TREEMAP_H}
              className="block"
              style={{
                opacity: animate ? (mounted ? 1 : 0) : 1,
                transform: animate ? (mounted ? "none" : "scale(0.985)") : "none",
                transformOrigin: "center",
                transition: animate ? "opacity 480ms ease, transform 480ms ease" : undefined,
              }}
            >
              <defs>
                <linearGradient id="vd-sheen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
                  <stop offset="42%" stopColor="#ffffff" stopOpacity="0.03" />
                  <stop offset="100%" stopColor="#000000" stopOpacity="0.20" />
                </linearGradient>
                <filter id="vd-glow" x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow
                    dx="0"
                    dy="2"
                    stdDeviation="6"
                    floodColor={statusColor("decliner").glow}
                    floodOpacity="1"
                  />
                </filter>
              </defs>

              {layout.cells.map((t, idx) => {
                const r = t.item;
                const x = t.x + CELL_GAP / 2;
                const y = t.y + CELL_GAP / 2;
                const w = Math.max(0, t.w - CELL_GAP);
                const h = Math.max(0, t.h - CELL_GAP);
                if (w <= 0 || h <= 0) return null;
                const fill = scoreRamp(r.score);
                const radius = Math.min(6, w / 4, h / 4);
                const isHover = hover?.department === r.department && hover?.state === r.state;
                const lifted = r.status === "decliner" || isHover;
                return (
                  <g
                    key={`${r.state}-${r.department}-${idx}`}
                    filter={lifted ? "url(#vd-glow)" : undefined}
                    onMouseEnter={() => setHover(r)}
                    style={{ cursor: "pointer" }}
                  >
                    <title>{`${r.department} — score ${r.score} · ${fmtCompact(r.current)} questions`}</title>
                    <rect x={x} y={y} width={w} height={h} rx={radius} fill={fill} />
                    <rect
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      rx={radius}
                      fill="url(#vd-sheen)"
                      style={{
                        transition: animate ? "opacity 180ms ease" : undefined,
                      }}
                    />
                    <rect
                      x={x + 0.5}
                      y={y + 0.5}
                      width={Math.max(0, w - 1)}
                      height={Math.max(0, h - 1)}
                      rx={Math.max(0, radius - 0.5)}
                      fill="none"
                      stroke={isHover ? "#ffffff" : "rgba(255,255,255,0.14)"}
                      strokeOpacity={isHover ? 0.9 : 1}
                      strokeWidth={isHover ? 2 : 1}
                    />
                  </g>
                );
              })}
            </svg>

            {/* HTML overlay: state headers + agency labels (token-styled, crisp) */}
            <div className="pointer-events-none absolute inset-0">
              {layout.headers.map((hd) => (
                <div
                  key={hd.key}
                  className="absolute flex items-center gap-1.5 overflow-hidden rounded-t-md bg-background/70 px-2 backdrop-blur-sm"
                  style={{ left: hd.rect.x, top: hd.rect.y, width: hd.rect.w, height: hd.rect.h }}
                >
                  <span className="text-[11px] font-semibold tracking-wide text-foreground">
                    {hd.usps}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{hd.count}</span>
                  {hd.atRisk > 0 && (
                    <span
                      className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium"
                      style={{ color: red }}
                    >
                      <span
                        className="size-1.5 rounded-full"
                        style={{ background: red }}
                        aria-hidden
                      />
                      {hd.atRisk}
                    </span>
                  )}
                </div>
              ))}

              {layout.cells.map((t, idx) => {
                const r = t.item;
                const w = t.w - CELL_GAP;
                const h = t.h - CELL_GAP;
                const showName = w >= 56 && h >= 26;
                const showMeta = w >= 80 && h >= 46;
                if (!showName) return null;
                const ink = inkFor(scoreRamp(r.score));
                return (
                  <div
                    key={`${r.state}-${r.department}-label-${idx}`}
                    className="absolute flex flex-col justify-between overflow-hidden p-1.5"
                    style={{
                      left: t.x + CELL_GAP / 2,
                      top: t.y + CELL_GAP / 2,
                      width: Math.max(0, w),
                      height: Math.max(0, h),
                      color: ink,
                    }}
                  >
                    <span className="text-[11px] font-semibold leading-tight line-clamp-2">
                      {r.department}
                    </span>
                    {showMeta && (
                      <span className="flex items-baseline gap-1.5">
                        <span className="text-[13px] font-bold tabular-nums leading-none">
                          {fmtCompact(r.current)}
                        </span>
                        <span className="text-[10px] font-medium leading-none opacity-80">
                          {deltaLabel(r.deltaPct, r.status)}
                        </span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* HOVER DETAIL CARD */}
            {hover && <DetailCard row={hover} pos={pos} width={width} />}
          </>
        )}
      </div>
    </div>
  );
}

// --- hover detail ------------------------------------------------------------

function DetailCard({
  row,
  pos,
  width,
}: {
  row: AgencyHealth;
  pos: { x: number; y: number };
  width: number;
}) {
  const CARD_W = 256;
  const left = Math.min(Math.max(8, pos.x + 16), Math.max(8, width - CARD_W - 8));
  const top = Math.min(Math.max(8, pos.y + 16), TREEMAP_H - 168);
  const hc = healthColor(row.score);
  const breadthValue =
    row.breadth != null
      ? `${row.activeOfficers ?? "—"}/${row.provisionedOfficers ?? "—"}`
      : row.activeOfficers != null
        ? `${row.activeOfficers} active`
        : "—";
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-lg border bg-popover/95 p-3 shadow-lg backdrop-blur-sm"
      style={{ left, top, width: CARD_W }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-popover-foreground">{row.department}</p>
          <p className="text-xs text-muted-foreground">
            {row.usps} · {STATUS_LABEL[row.status]}
          </p>
        </div>
        <Badge
          className="shrink-0 border-transparent tabular-nums"
          style={{ background: hc.soft, color: hc.solid }}
        >
          {row.score}
        </Badge>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <Metric label="Questions 30d" value={fmt(row.current)} />
        <Metric
          label="vs prior"
          value={`${fmt(row.prior)}`}
          accent={
            <span
              className="text-[11px] font-semibold"
              style={{ color: row.status === "decliner" ? statusColor("decliner").solid : hc.solid }}
            >
              {deltaLabel(row.deltaPct, row.status)}
            </span>
          }
        />
        <Metric
          label="Officer breadth"
          value={breadthValue}
          accent={
            row.breadth != null ? (
              <span className="text-[11px] text-muted-foreground">{fmtPct(row.breadth)}</span>
            ) : undefined
          }
        />
      </div>

      <p
        className={cn(
          "mt-3 rounded-md px-2 py-1.5 text-[11px] font-medium leading-snug",
        )}
        style={{ background: hc.soft, color: hc.solid }}
      >
        {driverFor(row)}
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="flex items-baseline gap-1.5">
        <span className="font-semibold tabular-nums text-popover-foreground">{value}</span>
        {accent}
      </p>
    </div>
  );
}
