"use client";

import { useQuery } from "@tanstack/react-query";

import { buildApiQuery, fetchJson, type Filters } from "@/lib/query";
import type {
  BreakdownResponse,
  GeoResponse,
  TrendResponse,
} from "@/lib/types";

/** Shared query string for a given filter set. */
function qs(filters: Filters): string {
  return buildApiQuery(filters);
}

export function useGeo(filters: Filters) {
  const query = qs(filters);
  return useQuery({
    queryKey: ["geo", query],
    queryFn: () => fetchJson<GeoResponse>(`/api/geo?${query}`),
  });
}

function useStateBreakdown(
  kind: "departments" | "device" | "role",
  state: string | null,
  filters: Filters,
) {
  const query = qs(filters);
  return useQuery({
    queryKey: [kind, state, query],
    enabled: !!state,
    queryFn: () =>
      fetchJson<BreakdownResponse>(
        `/api/state/${encodeURIComponent(state!)}/${kind}?${query}`,
      ),
  });
}

export const useDepartments = (state: string | null, f: Filters) =>
  useStateBreakdown("departments", state, f);
export const useDevice = (state: string | null, f: Filters) =>
  useStateBreakdown("device", state, f);
export const useRole = (state: string | null, f: Filters) =>
  useStateBreakdown("role", state, f);

export function useTrend(state: string | null, filters: Filters) {
  const query = qs(filters);
  return useQuery({
    queryKey: ["trend", state, query],
    enabled: !!state,
    queryFn: () =>
      fetchJson<TrendResponse>(
        `/api/state/${encodeURIComponent(state!)}/trend?${query}`,
      ),
  });
}
