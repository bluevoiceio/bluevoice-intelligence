"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/lib/query";
import type { IntelligenceResponse } from "@/lib/intelligence";

export function useIntelligence(windowDays = 30) {
  return useQuery({
    queryKey: ["intelligence", windowDays],
    queryFn: () =>
      fetchJson<IntelligenceResponse>(`/api/intelligence?hideTest=1&window=${windowDays}`),
  });
}
