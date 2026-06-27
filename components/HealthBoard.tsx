"use client";

import { useMemo, useState } from "react";
import { TrendingDown, TrendingUp, Sparkles } from "lucide-react";

import { CoverageNotice } from "@/components/CoverageNotice";
import { useHealth } from "@/components/hooks";
import { Kpi } from "@/components/Kpi";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmt } from "@/lib/format";
import type { AgencyHealth, HealthResponse, HealthStatus } from "@/lib/health";

export function filterAgencies(
  agencies: AgencyHealth[],
  state: string,
  status: string,
): AgencyHealth[] {
  return agencies.filter(
    (a) => (state === "all" || a.state === state) && (status === "all" || a.status === status),
  );
}

const STATUS_META: Record<
  HealthStatus,
  { label: string; variant: "warning" | "success" | "secondary" | "default" }
> = {
  decliner: { label: "At risk", variant: "warning" },
  riser: { label: "Rising", variant: "success" },
  new: { label: "New", variant: "secondary" },
  stable: { label: "Stable", variant: "secondary" },
};

function deltaText(a: AgencyHealth): string {
  if (a.status === "new") return "new";
  if (a.deltaPct == null) return "—"; // em dash: sub-floor, percentage not meaningful
  const r = Math.round(a.deltaPct);
  return `${r < 0 ? "−" : "+"}${Math.abs(r)}%`;
}

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

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1400px] flex-col gap-5 px-4 py-5 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <TrendingDown className="size-5" />
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
        <CoverageNotice variant="warning">Couldn&apos;t load health data: {error.message}</CoverageNotice>
      ) : null}

      {data ? (
        <Card>
          <CardContent className="flex items-start gap-2.5 p-4">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-sm leading-relaxed text-balance">{data.brief}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Questions · 30d" value={s ? fmt(s.totalCurrent) : "—"} loading={loading} />
        <Kpi
          label="Δ vs prior 30d"
          value={s ? `${delta < 0 ? "−" : "+"}${fmt(Math.abs(delta))}` : "—"}
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
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agency</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="text-right">30d</TableHead>
                  <TableHead className="text-right">Prior</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((a) => {
                  const meta = STATUS_META[a.status];
                  return (
                    <TableRow key={`${a.state}:${a.department}`}>
                      <TableCell className="font-medium">{a.department}</TableCell>
                      <TableCell className="text-muted-foreground">{a.state}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(a.current)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {fmt(a.prior)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{deltaText(a)}</TableCell>
                      <TableCell>
                        <Badge variant={meta.variant} className="gap-1">
                          {a.status === "riser" ? <TrendingUp className="size-3" /> : null}
                          {a.status === "decliner" ? <TrendingDown className="size-3" /> : null}
                          {meta.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      No agencies match this filter.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
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
