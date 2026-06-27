"use client";

import { useMemo } from "react";
import { useTheme } from "next-themes";
import { Tooltip } from "react-tooltip";

import { Skeleton } from "@/components/ui/skeleton";
import { fmt } from "@/lib/format";
import {
  GRID_COLS,
  makeColorScale,
  mapPalette,
  STATE_GRID,
  USPS_TO_STATE_NAME,
} from "@/lib/states";
import { cn } from "@/lib/utils";

const TOOLTIP_ID = "bv-grid-tip";

/** Perceived luminance of a #rrggbb color in [0,1] — picks readable text. */
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

interface TileGridMapProps {
  byState: Record<string, number>;
  selected: string | null;
  onSelect: (name: string) => void;
  measureLabel: string;
  loading?: boolean;
}

export function TileGridMap({
  byState,
  selected,
  onSelect,
  measureLabel,
  loading,
}: TileGridMapProps) {
  const { resolvedTheme } = useTheme();
  const palette = mapPalette(resolvedTheme === "dark");

  const max = useMemo(
    () => Object.values(byState).reduce((m, v) => Math.max(m, v), 0),
    [byState],
  );
  const colorFor = useMemo(() => makeColorScale(max, palette), [max, palette]);

  if (loading) {
    return <Skeleton className="aspect-[1.45/1] w-full rounded-xl" />;
  }

  return (
    <div className="w-full">
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))` }}
      >
        {Object.entries(STATE_GRID).map(([usps, cell]) => {
          const name = USPS_TO_STATE_NAME[usps] ?? usps;
          const value = byState[name] ?? 0;
          const has = value > 0;
          const isSelected = selected === name;
          const fill = has ? colorFor(value) : palette.empty;
          // Pick text color from the tile's own luminance (theme-agnostic).
          const darkText = luminance(fill) > 0.55;
          const tip = has
            ? `${name} — ${fmt(value)} ${measureLabel}`
            : `${name} — no data`;

          return (
            <button
              key={usps}
              type="button"
              onClick={() => onSelect(name)}
              data-tooltip-id={TOOLTIP_ID}
              data-tooltip-content={tip}
              aria-label={tip}
              style={{
                gridColumnStart: cell.col + 1,
                gridRowStart: cell.row + 1,
                backgroundColor: fill,
              }}
              className={cn(
                "flex aspect-square items-center justify-center rounded-lg border border-transparent text-xs font-semibold transition-all hover:z-10 hover:scale-[1.06] hover:ring-2 hover:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                has
                  ? darkText
                    ? "text-slate-900"
                    : "text-white"
                  : "text-muted-foreground/60",
                isSelected && "ring-2 ring-ring ring-offset-1",
              )}
            >
              {usps}
            </button>
          );
        })}
      </div>

      <Tooltip
        id={TOOLTIP_ID}
        className="!rounded-md !bg-primary !px-2 !py-1 !text-xs"
      />

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>Low</span>
          <span
            className="h-2.5 w-32 rounded-full"
            style={{
              background: `linear-gradient(to right, ${palette.low}, ${palette.high})`,
            }}
          />
          <span>High</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="size-3 rounded-sm border"
            style={{ background: palette.empty }}
          />
          No data
        </div>
      </div>
    </div>
  );
}
