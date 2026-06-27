"use client";

import { useMemo } from "react";
import { useTheme } from "next-themes";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { Tooltip } from "react-tooltip";

import { Skeleton } from "@/components/ui/skeleton";
import { fmt } from "@/lib/format";
import { makeColorScale, mapPalette, type MapPalette } from "@/lib/states";

const GEO_URL = "/states-10m.json";
const TOOLTIP_ID = "bv-map-tip";

interface USMapProps {
  byState: Record<string, number>;
  selected: string | null;
  onSelect: (name: string) => void;
  measureLabel: string;
  loading?: boolean;
}

export function USMap({
  byState,
  selected,
  onSelect,
  measureLabel,
  loading,
}: USMapProps) {
  const { resolvedTheme } = useTheme();
  const palette = mapPalette(resolvedTheme === "dark");

  const max = useMemo(
    () => Object.values(byState).reduce((m, v) => Math.max(m, v), 0),
    [byState],
  );
  const colorFor = useMemo(() => makeColorScale(max, palette), [max, palette]);

  if (loading) {
    return <Skeleton className="aspect-[1.6/1] w-full rounded-xl" />;
  }

  return (
    <div className="w-full">
      <ComposableMap
        projection="geoAlbersUsa"
        projectionConfig={{ scale: 1000 }}
        width={800}
        height={500}
        style={{ width: "100%", height: "auto" }}
        aria-label="United States choropleth of product usage by state"
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const name: string = geo.properties.name;
              const value = byState[name] ?? 0;
              const isSelected = selected === name;
              const tip =
                value > 0
                  ? `${name} — ${fmt(value)} ${measureLabel}`
                  : `${name} — no data`;
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  onClick={() => onSelect(name)}
                  data-tooltip-id={TOOLTIP_ID}
                  data-tooltip-content={tip}
                  tabIndex={-1}
                  style={{
                    default: {
                      fill: value > 0 ? colorFor(value) : palette.empty,
                      stroke: "var(--card)",
                      strokeWidth: isSelected ? 1.75 : 0.5,
                      outline: "none",
                      cursor: "pointer",
                    },
                    hover: {
                      fill: palette.hover,
                      stroke: "var(--card)",
                      strokeWidth: 0.75,
                      outline: "none",
                      cursor: "pointer",
                    },
                    pressed: {
                      fill: palette.hover,
                      stroke: "var(--card)",
                      strokeWidth: 1,
                      outline: "none",
                    },
                  }}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>

      <Tooltip id={TOOLTIP_ID} className="!rounded-md !bg-primary !px-2 !py-1 !text-xs" />

      <Legend max={max} palette={palette} />
    </div>
  );
}

function Legend({ max, palette }: { max: number; palette: MapPalette }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        <span>0</span>
        <span
          className="h-2.5 w-32 rounded-full"
          style={{
            background: `linear-gradient(to right, ${palette.low}, ${palette.high})`,
          }}
        />
        <span className="tabular-nums">{fmt(max)}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className="size-3 rounded-sm border"
          style={{ background: palette.empty }}
        />
        No data
      </div>
      <span className="text-muted-foreground/70">
        Shaded by √ scale · click a state to drill in
      </span>
    </div>
  );
}
