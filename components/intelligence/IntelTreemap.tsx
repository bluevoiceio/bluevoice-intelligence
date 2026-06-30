"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { AccountIntelligence } from "@/lib/intelligence";
import { bandColor, compositeRamp } from "@/components/intelligence/lens";
import { Card, CardContent } from "@/components/ui/card";
import { fmtCompact } from "@/lib/format";

const TREEMAP_H = 520;
const STATE_INSET = 3;
const HEADER_H = 18;
const CELL_GAP = 1.4;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Tile<T> extends Rect {
  item: T;
}

/** Squarified treemap (Bruls/Huizing/van Wijk). Pass values descending. */
function squarify<T>(data: { item: T; value: number }[], rect: Rect): Tile<T>[] {
  const out: Tile<T>[] = [];
  const nodes = data.filter((d) => d.value > 0);
  const totalValue = nodes.reduce((s, d) => s + d.value, 0);
  if (totalValue <= 0 || rect.w <= 0 || rect.h <= 0) return out;
  const scale = (rect.w * rect.h) / totalValue;
  const areas = nodes.map((d) => ({ item: d.item, area: d.value * scale }));
  const worst = (row: { area: number }[], side: number, sum: number) => {
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

function relLuminance(hex: string): number {
  const h = hex.replace("#", "");
  const ch = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(ch(0)) + 0.7152 * lin(ch(2)) + 0.0722 * lin(ch(4));
}
function inkFor(hex: string): string {
  return relLuminance(hex) > 0.46 ? "#0b1220" : "#ffffff";
}

interface StateGroup {
  state: string;
  usps: string;
  value: number;
  atRisk: number;
  count: number;
  rows: AccountIntelligence[];
}

function groupByState(rows: AccountIntelligence[]): StateGroup[] {
  const map = new Map<string, StateGroup>();
  for (const r of rows) {
    let g = map.get(r.state);
    if (!g) {
      g = { state: r.state, usps: r.usps, value: 0, atRisk: 0, count: 0, rows: [] };
      map.set(r.state, g);
    }
    g.value += r.current;
    g.atRisk += r.band === "red" ? 1 : 0;
    g.count += 1;
    g.rows.push(r);
  }
  const groups = [...map.values()];
  for (const g of groups) g.rows.sort((a, b) => b.current - a.current);
  return groups.sort((a, b) => b.value - a.value);
}

interface Layout {
  headers: { key: string; usps: string; atRisk: number; count: number; rect: Rect }[];
  cells: Tile<AccountIntelligence>[];
}

function buildLayout(groups: StateGroup[], width: number): Layout {
  const headers: Layout["headers"] = [];
  const cells: Tile<AccountIntelligence>[] = [];
  if (width <= 0) return { headers, cells };
  const stateTiles = squarify(groups.map((g) => ({ item: g, value: g.value })), { x: 0, y: 0, w: width, h: TREEMAP_H });
  for (const st of stateTiles) {
    const rx = st.x + STATE_INSET;
    const ry = st.y + STATE_INSET;
    const rw = st.w - STATE_INSET * 2;
    const rh = st.h - STATE_INSET * 2;
    if (rw <= 0 || rh <= 0) continue;
    const headerH = rh > 56 && rw > 64 ? HEADER_H : 0;
    if (headerH > 0) {
      headers.push({ key: st.item.state, usps: st.item.usps, atRisk: st.item.atRisk, count: st.item.count, rect: { x: rx, y: ry, w: rw, h: headerH } });
    }
    const inner: Rect = { x: rx, y: ry + headerH, w: rw, h: rh - headerH };
    for (const t of squarify(st.item.rows.map((r) => ({ item: r, value: r.current })), inner)) cells.push(t);
  }
  return { headers, cells };
}

/**
 * Book of business — a squarified treemap where each cell is a department sized
 * by question volume and colored by composite health, clustered by state. Cool,
 * dense, non-chart: the whole book in one glance, at-risk cells lifted with glow.
 */
export function IntelTreemap({
  accounts,
  onSelect,
  onHover,
}: {
  accounts: AccountIntelligence[];
  onSelect?: (a: AccountIntelligence) => void;
  onHover?: (a: AccountIntelligence | null, e?: React.MouseEvent) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<AccountIntelligence | null>(null);

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

  const groups = useMemo(() => groupByState(accounts), [accounts]);
  const layout = useMemo(() => buildLayout(groups, width), [groups, width]);
  const red = bandColor("red");

  return (
    <Card className="overflow-hidden">
      <CardContent className="pt-6">
        <div
          ref={wrapRef}
          className="relative overflow-hidden rounded-lg border bg-card"
          style={{ height: TREEMAP_H }}
          onMouseLeave={() => {
            setHover(null);
            onHover?.(null);
          }}
        >
          {width <= 0 ? (
            <div className="h-full w-full animate-pulse bg-muted/40" />
          ) : (
            <>
              <svg width={width} height={TREEMAP_H} className="block">
                <defs>
                  <linearGradient id="vd-sheen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.2" />
                    <stop offset="42%" stopColor="#ffffff" stopOpacity="0.03" />
                    <stop offset="100%" stopColor="#000000" stopOpacity="0.18" />
                  </linearGradient>
                  <filter id="vd-glow" x="-30%" y="-30%" width="160%" height="160%">
                    <feDropShadow dx="0" dy="2" stdDeviation="6" floodColor={red.glow} floodOpacity="1" />
                  </filter>
                </defs>
                {layout.cells.map((t, idx) => {
                  const r = t.item;
                  const x = t.x + CELL_GAP / 2;
                  const y = t.y + CELL_GAP / 2;
                  const w = Math.max(0, t.w - CELL_GAP);
                  const h = Math.max(0, t.h - CELL_GAP);
                  if (w <= 0 || h <= 0) return null;
                  const fill = compositeRamp(r.composite);
                  const radius = Math.min(6, w / 4, h / 4);
                  const isHover = hover?.department === r.department && hover?.state === r.state;
                  const lifted = r.band === "red" || isHover;
                  return (
                    <g
                      key={`${r.state}-${r.department}-${idx}`}
                      filter={lifted ? "url(#vd-glow)" : undefined}
                      onMouseEnter={(e) => {
                        setHover(r);
                        onHover?.(r, e);
                      }}
                      onMouseMove={(e) => onHover?.(r, e)}
                      onClick={() => onSelect?.(r)}
                      style={{ cursor: "pointer" }}
                    >
                      <title>{`${r.department} — ${r.composite}/100 · ${fmtCompact(r.current)} questions`}</title>
                      <rect x={x} y={y} width={w} height={h} rx={radius} fill={fill} />
                      <rect x={x} y={y} width={w} height={h} rx={radius} fill="url(#vd-sheen)" />
                      <rect
                        x={x + 0.5}
                        y={y + 0.5}
                        width={Math.max(0, w - 1)}
                        height={Math.max(0, h - 1)}
                        rx={Math.max(0, radius - 0.5)}
                        fill="none"
                        stroke={isHover ? "#ffffff" : "rgba(255,255,255,0.14)"}
                        strokeWidth={isHover ? 2 : 1}
                      />
                    </g>
                  );
                })}
              </svg>

              <div className="pointer-events-none absolute inset-0">
                {layout.headers.map((hd) => (
                  <div
                    key={hd.key}
                    className="absolute flex items-center gap-1.5 overflow-hidden rounded-t-md bg-background/70 px-2 backdrop-blur-sm"
                    style={{ left: hd.rect.x, top: hd.rect.y, width: hd.rect.w, height: hd.rect.h }}
                  >
                    <span className="text-[11px] font-semibold tracking-wide text-foreground">{hd.usps}</span>
                    <span className="text-[10px] text-muted-foreground">{hd.count}</span>
                    {hd.atRisk > 0 ? (
                      <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: red.solid }}>
                        <span className="size-1.5 rounded-full" style={{ background: red.solid }} aria-hidden />
                        {hd.atRisk}
                      </span>
                    ) : null}
                  </div>
                ))}
                {layout.cells.map((t, idx) => {
                  const r = t.item;
                  const w = t.w - CELL_GAP;
                  const h = t.h - CELL_GAP;
                  if (w < 56 || h < 26) return null;
                  const showMeta = w >= 80 && h >= 46;
                  const ink = inkFor(compositeRamp(r.composite));
                  return (
                    <div
                      key={`${r.state}-${r.department}-label-${idx}`}
                      className="absolute flex flex-col justify-between overflow-hidden p-1.5"
                      style={{ left: t.x + CELL_GAP / 2, top: t.y + CELL_GAP / 2, width: Math.max(0, w), height: Math.max(0, h), color: ink }}
                    >
                      <span className="line-clamp-2 text-[11px] font-semibold leading-tight">{r.department}</span>
                      {showMeta ? (
                        <span className="flex items-baseline gap-1.5">
                          <span className="text-[13px] font-bold leading-none tabular-nums">{r.composite}</span>
                          <span className="text-[10px] font-medium leading-none opacity-80">{fmtCompact(r.current)} q</span>
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>

            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

