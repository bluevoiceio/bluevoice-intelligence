"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Kpi } from "@/components/Kpi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fmt, fmtCompact } from "@/lib/format";
import { uspsFor } from "@/lib/states";
import type { GeoResponse } from "@/lib/types";

interface USOverviewProps {
  geo: GeoResponse | undefined;
  loading: boolean;
  measureLabel: string;
  onSelect: (name: string) => void;
}

export function USOverview({
  geo,
  loading,
  measureLabel,
  onSelect,
}: USOverviewProps) {
  const top = useMemo(() => {
    if (!geo) return [];
    return Object.entries(geo.byState)
      .map(([name, value]) => ({ name, usps: uspsFor(name) ?? name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [geo]);

  const topState = top[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <Kpi
          label={`Total ${measureLabel}`}
          value={geo ? fmt(geo.total) : "—"}
          loading={loading}
        />
        <Kpi
          label="Active states"
          value={geo ? geo.activeStates : "—"}
          loading={loading}
        />
        <Kpi
          label="Top state"
          value={topState ? topState.usps : "—"}
          hint={topState ? `${fmt(topState.value)} ${measureLabel}` : undefined}
          loading={loading}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top 10 states</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[320px] w-full" />
          ) : top.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No geographic data for this selection.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={top}
                layout="vertical"
                margin={{ left: 8, right: 36, top: 4, bottom: 4 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="usps"
                  width={36}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)" }}
                  formatter={(v) => [fmt(Number(v)), measureLabel]}
                  labelFormatter={(_, p) =>
                    (p?.[0]?.payload as { name?: string })?.name ?? ""
                  }
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="value"
                  radius={[4, 4, 4, 4]}
                  label={{
                    position: "right",
                    formatter: (v: unknown) => fmtCompact(Number(v)),
                    fontSize: 11,
                    fill: "var(--muted-foreground)",
                  }}
                  onClick={(d: { name?: string }) => d?.name && onSelect(d.name)}
                  cursor="pointer"
                >
                  {top.map((entry) => (
                    <Cell key={entry.name} fill="var(--chart-2)" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Click a state on the map or a bar to drill in.
      </p>
    </div>
  );
}
