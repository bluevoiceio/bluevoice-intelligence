"use client";

import { useState } from "react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EVENTS } from "@/lib/events";
import type { Filters } from "@/lib/query";
import { cn } from "@/lib/utils";

interface ControlsProps {
  filters: Filters;
  update: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const mapReady = EVENTS.filter((e) => e.coverage === "full");
const otherEvents = EVENTS.filter((e) => e.coverage !== "full");

export function Controls({ filters, update }: ControlsProps) {
  const [showAll, setShowAll] = useState(
    () => EVENTS.find((e) => e.value === filters.event)?.coverage !== "full",
  );

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Event">
        <Select value={filters.event} onValueChange={(v) => update("event", v)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Map-ready</SelectLabel>
              {mapReady.map((e) => (
                <SelectItem key={e.value} value={e.value}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectGroup>
            {showAll && (
              <SelectGroup>
                <SelectLabel>Limited / partial coverage</SelectLabel>
                {otherEvents.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Measure">
        <Select
          value={filters.metric}
          onValueChange={(v) => update("metric", v as Filters["metric"])}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="totals">Total events</SelectItem>
            <SelectItem value="uniques">Unique users</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field label="Time range">
        <Select
          value={filters.range}
          onValueChange={(v) => update("range", v as Filters["range"])}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="6mo">Last 6 months</SelectItem>
            <SelectItem value="12mo">Last 12 months</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field label="Environment">
        <Select
          value={filters.env}
          onValueChange={(v) => update("env", v as Filters["env"])}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Prod">Production</SelectItem>
            <SelectItem value="All">All</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field label="Role">
        <Select
          value={filters.role}
          onValueChange={(v) => update("role", v as Filters["role"])}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="officer">Officer</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="superadmin">Superadmin</SelectItem>
            <SelectItem value="guest">Guest</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field label="Device">
        <Select
          value={filters.device}
          onValueChange={(v) => update("device", v as Filters["device"])}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All devices</SelectItem>
            <SelectItem value="iPhone">iPhone</SelectItem>
            <SelectItem value="iPad">iPad</SelectItem>
            <SelectItem value="Android">Android</SelectItem>
            <SelectItem value="Browser">Browser</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <div className="flex flex-col gap-2 pb-1">
        <Toggle
          checked={filters.hideTest}
          onChange={(v) => update("hideTest", v)}
          label="Hide test/demo depts"
        />
        <Toggle
          checked={showAll}
          onChange={setShowAll}
          label="Show all events"
        />
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-muted-foreground">
      <span
        className={cn(
          "relative h-4 w-7 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted-foreground/30",
        )}
        onClick={() => onChange(!checked)}
      >
        <span
          className={cn(
            "absolute top-0.5 size-3 rounded-full bg-white transition-transform",
            checked ? "translate-x-3.5" : "translate-x-0.5",
          )}
        />
      </span>
      {label}
    </label>
  );
}
