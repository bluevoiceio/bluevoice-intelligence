"use client";

import { useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useDepartments, useDevice, useRole, useTrend } from "@/components/hooks";
import { Kpi } from "@/components/Kpi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmt, fmtCompact, fmtDateShort, fmtPct } from "@/lib/format";
import type { Filters } from "@/lib/query";
import { uspsFor } from "@/lib/states";
import type { GroupTotal } from "@/lib/types";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

interface StateDrilldownProps {
  state: string;
  filters: Filters;
  usTotal: number;
  measureLabel: string;
  onBack: () => void;
}

export function StateDrilldown({
  state,
  filters,
  usTotal,
  measureLabel,
  onBack,
}: StateDrilldownProps) {
  const departments = useDepartments(state, filters);
  const device = useDevice(state, filters);
  const role = useRole(state, filters);
  const trend = useTrend(state, filters);

  const stateTotal = trend.data?.total ?? departments.data?.total ?? 0;
  const share = usTotal > 0 ? stateTotal / usTotal : 0;
  const deptCount = departments.data?.groups.length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
            <ArrowLeft /> Back to U.S.
          </Button>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-balance">
            {state}{" "}
            <span className="text-base font-normal text-muted-foreground">
              ({uspsFor(state) ?? "—"})
            </span>
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Kpi
          label={`State ${measureLabel}`}
          value={fmt(stateTotal)}
          loading={trend.isLoading}
        />
        <Kpi
          label="Departments"
          value={deptCount}
          loading={departments.isLoading}
        />
        <Kpi
          label="Share of U.S."
          value={fmtPct(share)}
          loading={trend.isLoading}
        />
      </div>

      <TrendCard
        loading={trend.isLoading}
        error={trend.error}
        labels={trend.data?.labels ?? []}
        values={trend.data?.values ?? []}
        measureLabel={measureLabel}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <DonutCard
          title="By device"
          loading={device.isLoading}
          error={device.error}
          groups={device.data?.groups ?? []}
        />
        <RoleCard
          loading={role.isLoading}
          error={role.error}
          groups={role.data?.groups ?? []}
          measureLabel={measureLabel}
        />
      </div>

      <DepartmentsCard
        loading={departments.isLoading}
        error={departments.error}
        groups={departments.data?.groups ?? []}
        measureLabel={measureLabel}
      />
    </div>
  );
}

function ErrorRow({ error }: { error: Error | null }) {
  if (!error) return null;
  return (
    <p className="py-8 text-center text-sm text-destructive">{error.message}</p>
  );
}

function TrendCard({
  loading,
  error,
  labels,
  values,
  measureLabel,
}: {
  loading: boolean;
  error: Error | null;
  labels: string[];
  values: number[];
  measureLabel: string;
}) {
  const data = useMemo(
    () => labels.map((date, i) => ({ date, value: values[i] ?? 0 })),
    [labels, values],
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily trend</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[220px] w-full" />
        ) : error ? (
          <ErrorRow error={error} />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data} margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
              <XAxis
                dataKey="date"
                tickFormatter={fmtDateShort}
                tickLine={false}
                axisLine={false}
                minTickGap={32}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              />
              <YAxis
                tickFormatter={fmtCompact}
                tickLine={false}
                axisLine={false}
                width={36}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              />
              <Tooltip
                formatter={(v) => [fmt(Number(v)), measureLabel]}
                labelFormatter={(l) => fmtDateShort(String(l))}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--chart-2)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function DonutCard({
  title,
  loading,
  error,
  groups,
}: {
  title: string;
  loading: boolean;
  error: Error | null;
  groups: GroupTotal[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[200px] w-full" />
        ) : error ? (
          <ErrorRow error={error} />
        ) : groups.length === 0 ? (
          <EmptyHint />
        ) : (
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="60%" height={180}>
              <PieChart>
                <Pie
                  data={groups}
                  dataKey="total"
                  nameKey="key"
                  innerRadius={42}
                  outerRadius={72}
                  paddingAngle={2}
                  stroke="var(--background)"
                >
                  {groups.map((g, i) => (
                    <Cell key={g.key} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v, n) => [fmt(Number(v)), String(n)]}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <ul className="flex flex-col gap-1.5 text-xs">
              {groups.map((g, i) => (
                <li key={g.key} className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-sm"
                    style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                  />
                  <span className="text-muted-foreground">{g.key}</span>
                  <span className="ml-auto font-medium tabular-nums">
                    {fmtCompact(g.total)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RoleCard({
  loading,
  error,
  groups,
  measureLabel,
}: {
  loading: boolean;
  error: Error | null;
  groups: GroupTotal[];
  measureLabel: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>By role</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[200px] w-full" />
        ) : error ? (
          <ErrorRow error={error} />
        ) : groups.length === 0 ? (
          <EmptyHint />
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart
              data={groups}
              layout="vertical"
              margin={{ left: 8, right: 28, top: 4, bottom: 4 }}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="key"
                width={76}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)" }}
                formatter={(v) => [fmt(Number(v)), measureLabel]}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  fontSize: 12,
                }}
              />
              <Bar dataKey="total" radius={[4, 4, 4, 4]} fill="var(--chart-2)" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function DepartmentsCard({
  loading,
  error,
  groups,
  measureLabel,
}: {
  loading: boolean;
  error: Error | null;
  groups: GroupTotal[];
  measureLabel: string;
}) {
  const max = groups.reduce((m, g) => Math.max(m, g.total), 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Departments</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[260px] w-full" />
        ) : error ? (
          <ErrorRow error={error} />
        ) : groups.length === 0 ? (
          <EmptyHint />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Department</TableHead>
                <TableHead className="w-[42%]">Share</TableHead>
                <TableHead className="text-right">{measureLabel}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g, i) => (
                <TableRow key={g.key}>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {i + 1}
                  </TableCell>
                  <TableCell className="font-medium">{g.key}</TableCell>
                  <TableCell>
                    <span className="block h-2 w-full rounded-full bg-muted">
                      <span
                        className="block h-2 rounded-full bg-chart-2"
                        style={{ width: `${max > 0 ? (g.total / max) * 100 : 0}%` }}
                      />
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmt(g.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyHint() {
  return (
    <p className="py-10 text-center text-sm text-muted-foreground">
      No data for this breakdown.
    </p>
  );
}
