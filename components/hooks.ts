"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/lib/query";
import type { IntelligenceResponse } from "@/lib/intelligence";
import type { TrendsResponse } from "@/lib/amplitude-parse";

export function useIntelligence(windowDays = 30) {
  return useQuery({
    queryKey: ["intelligence", windowDays],
    queryFn: () =>
      fetchJson<IntelligenceResponse>(`/api/intelligence?hideTest=1&window=${windowDays}`),
  });
}

export function useTrends() {
  return useQuery({
    queryKey: ["trends"],
    queryFn: () => fetchJson<TrendsResponse>("/api/trends"),
  });
}
