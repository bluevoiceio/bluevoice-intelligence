"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  LayoutGrid,
  ListChecks,
  Map as MapIcon,
  ScatterChart,
  Sparkles,
  Table2,
} from "lucide-react";

import { CoverageNotice } from "@/components/CoverageNotice";
import { Cartogram } from "@/components/health/Cartogram";
import { CallList } from "@/components/health/CallList";
import { RiskQuadrant } from "@/components/health/RiskQuadrant";
import { Screener } from "@/components/health/Screener";
import { Treemap } from "@/components/health/Treemap";
import { useHealth } from "@/components/hooks";
import { Kpi } from "@/components/Kpi";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fmt, fmtCompact } from "@/lib/format";
import type { AgencyHealth, HealthResponse } from "@/lib/health";
import { cn } from "@/lib/utils";

export function filterAgencies(
  agencies: AgencyHealth[],
  state: string,
  status: string,
): AgencyHealth[] {
  return agencies.filter(
    (a) => (state === "all" || a.state === state) && (status === "all" || a.status === status),
  );
}

const TABS: {
  id: string;
  label: string;
  icon: typeof Table2;
  view: (props: { rows: AgencyHealth[] }) => React.ReactNode;
}[] = [
  { id: "screener", label: "Screener", icon: Table2, view: Screener },
  { id: "quadrant", label: "Risk Quadrant", icon: ScatterChart, view: RiskQuadrant },
  { id: "map", label: "Health Map", icon: MapIcon, view: Cartogram },
  { id: "treemap", label: "Book of Business", icon: LayoutGrid, view: Treemap },
  { id: "calllist", label: "Call List", icon: ListChecks, view: CallList },
];

export function HealthBoardView({
  data,
  loading,
  error,
  stateFilter,
  statusFilter,
  onStateChange,
  onStatusChange,
  headerExtra,
}: {
  data: HealthResponse | undefined;
  loading: boolean;
  error: Error | null;
  stateFilter: string;
  statusFilter: string;
  onStateChange: (v: string) => void;
  onStatusChange: (v: string) => void;
  headerExtra?: React.ReactNode;
}) {
  const [tab, setTab] = useState(TABS[0].id);

  const states = useMemo(() => {
    const set = new Set((data?.agencies ?? []).map((a) => a.state).filter((s) => s !== "(none)"));
    return [...set].sort();
  }, [data]);

  const rows = useMemo(
    () => filterAgencies(data?.agencies ?? [], stateFilter, statusFilter),
    [data, stateFilter, statusFilter],
  );

  const s = data?.summary;
  const delta = s ? s.totalCurrent - s.totalPrior : 0;
  const Active = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1400px] flex-col gap-5 px-4 py-5 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Activity className="size-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold leading-tight tracking-tight">Account Health</h1>
            <p className="text-xs text-muted-foreground">
              Blue Voice · agency renewal signals · last 30 days vs prior 30
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {headerExtra}
          <ThemeToggle />
        </div>
      </header>

      {error ? (
        <CoverageNotice variant="warning">
          Couldn&apos;t load health data: {error.message}
        </CoverageNotice>
      ) : null}

      {data ? (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.04] to-transparent">
          <CardContent className="flex items-start gap-2.5 p-4">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="text-sm leading-relaxed text-balance">{data.brief}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Questions · 30d" value={s ? fmt(s.totalCurrent) : "—"} loading={loading} />
        <Kpi
          label="Δ vs prior 30d"
          value={s ? `${delta < 0 ? "−" : "+"}${fmtCompact(Math.abs(delta))}` : "—"}
          loading={loading}
        />
        <Kpi label="Agencies at risk" value={s ? s.atRiskCount : "—"} loading={loading} />
        <Kpi
          label="Top market"
          value={s?.topStateShare[0] ? `${Math.round(s.topStateShare[0].pct)}%` : "—"}
          hint={s?.topStateShare[0]?.state}
          loading={loading}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={stateFilter} onValueChange={onStateChange}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="State" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All states</SelectItem>
            {states.map((st) => (
              <SelectItem key={st} value={st}>
                {st}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={onStatusChange}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="decliner">At risk</SelectItem>
            <SelectItem value="riser">Rising</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="stable">Stable</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Segmented tab bar — dependency-free, accessible */}
      <div
        role="tablist"
        aria-label="Account health views"
        className="flex gap-1 overflow-x-auto rounded-xl border bg-muted/50 p-1"
      >
        {TABS.map((t) => {
          const active = t.id === tab;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : (
        <div
          role="tabpanel"
          key={Active.id}
          className="motion-safe:animate-in motion-safe:fade-in-50 motion-safe:duration-300"
        >
          <Active.view rows={rows} />
        </div>
      )}
    </div>
  );
}

export function HealthBoard({ headerExtra }: { headerExtra?: React.ReactNode }) {
  const { data, isLoading, error } = useHealth();
  const [stateFilter, setStateFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  return (
    <HealthBoardView
      data={data}
      loading={isLoading}
      error={(error as Error) ?? null}
      stateFilter={stateFilter}
      statusFilter={statusFilter}
      onStateChange={setStateFilter}
      onStatusChange={setStatusFilter}
      headerExtra={headerExtra}
    />
  );
}
