"use client";

import { useCallback, useEffect, useState } from "react";
import { Grid3x3, Map, MapPin } from "lucide-react";
import { toast } from "sonner";

import { Controls } from "@/components/Controls";
import { CoverageNotice } from "@/components/CoverageNotice";
import { useGeo } from "@/components/hooks";
import { StateDrilldown } from "@/components/StateDrilldown";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TileGridMap } from "@/components/TileGridMap";
import { USMap } from "@/components/USMap";
import { USOverview } from "@/components/USOverview";
import { useFilters } from "@/components/use-filters";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { findEvent } from "@/lib/events";
import { fmt } from "@/lib/format";
import type { MapView } from "@/lib/query";
import { cn } from "@/lib/utils";

export function Explorer({ headerExtra }: { headerExtra?: React.ReactNode } = {}) {
  const { filters, update, hydrated } = useFilters();
  const [selected, setSelected] = useState<string | null>(null);

  const geo = useGeo(filters);

  // Changing the event resets the drill-down (the prior state may have no data
  // for the new event). Handled here, in the action path — not via an effect.
  const handleFilterChange = useCallback(
    <K extends keyof typeof filters>(key: K, value: (typeof filters)[K]) => {
      if (key === "event") setSelected(null);
      update(key, value);
    },
    [update],
  );

  const measureLabel = filters.metric === "uniques" ? "users" : "events";
  const selectedEvent = findEvent(filters.event);
  const eventLabel = selectedEvent?.label ?? filters.event;

  // Surface upstream/credential errors as a toast (in addition to inline UI).
  useEffect(() => {
    if (geo.error) toast.error(geo.error.message);
  }, [geo.error]);

  const lowCoverage =
    (selectedEvent && selectedEvent.coverage !== "full") ||
    geo.data?.lowCoverage;
  const untagged = geo.data?.untagged ?? 0;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1400px] flex-col gap-5 px-4 py-5 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <MapPin className="size-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold leading-tight tracking-tight">
              Geographic Explorer
            </h1>
            <p className="text-xs text-muted-foreground">
              Blue Voice · internal product analytics
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {headerExtra}
          <Badge variant="secondary" className="gap-1.5">
            <span className="size-1.5 rounded-full bg-muted-foreground" />
            Amplitude · Blue Voice App
          </Badge>
          <ThemeToggle />
        </div>
      </header>

      <Card>
        <CardContent className="p-4">
          <Controls filters={filters} update={handleFilterChange} />
        </CardContent>
      </Card>

      {geo.isError ? (
        <CoverageNotice variant="warning">
          Couldn’t load geographic data: {geo.error?.message}
        </CoverageNotice>
      ) : lowCoverage ? (
        <CoverageNotice variant="warning">
          <strong>{eventLabel}</strong> isn’t consistently tagged with{" "}
          <code>State</code> — the geographic view may be incomplete. Map-ready
          events (Questions Asked, Workspace Chats) give the most reliable
          picture.
        </CoverageNotice>
      ) : null}

      <div className="grid flex-1 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* Map */}
        <Card className="self-start">
          <CardContent className="p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <h2 className="text-sm font-medium text-muted-foreground">
                  {eventLabel} ·{" "}
                  {filters.metric === "uniques" ? "unique users" : "total events"}
                </h2>
                {geo.data ? (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    · {fmt(geo.data.total)} {measureLabel} ·{" "}
                    {geo.data.activeStates} states
                  </span>
                ) : null}
              </div>
              <ViewToggle
                value={filters.mapView}
                onChange={(v) => update("mapView", v)}
              />
            </div>
            {filters.mapView === "grid" ? (
              <TileGridMap
                byState={geo.data?.byState ?? {}}
                selected={selected}
                onSelect={setSelected}
                measureLabel={measureLabel}
                loading={geo.isLoading || !hydrated}
              />
            ) : (
              <USMap
                byState={geo.data?.byState ?? {}}
                selected={selected}
                onSelect={setSelected}
                measureLabel={measureLabel}
                loading={geo.isLoading || !hydrated}
              />
            )}
            {untagged > 0 ? (
              <CoverageNotice variant="info" className="mt-3">
                {fmt(untagged)} {measureLabel} had no <code>State</code> set and
                are excluded from the map.
              </CoverageNotice>
            ) : null}
          </CardContent>
        </Card>

        {/* Right panel */}
        <div className="min-w-0">
          {selected ? (
            <StateDrilldown
              state={selected}
              filters={filters}
              usTotal={geo.data?.total ?? 0}
              measureLabel={measureLabel}
              onBack={() => setSelected(null)}
            />
          ) : (
            <USOverview
              geo={geo.data}
              loading={geo.isLoading || !hydrated}
              measureLabel={measureLabel}
              onSelect={setSelected}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: MapView;
  onChange: (v: MapView) => void;
}) {
  const options: { id: MapView; icon: typeof Map; label: string }[] = [
    { id: "geo", icon: Map, label: "Map" },
    { id: "grid", icon: Grid3x3, label: "Grid" },
  ];
  return (
    <div className="inline-flex items-center rounded-lg border bg-muted/40 p-0.5">
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            aria-pressed={active}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
