"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/lib/query";
import type { IntelligenceResponse } from "@/lib/intelligence";

export function useIntelligence() {
  return useQuery({
    queryKey: ["intelligence"],
    queryFn: () => fetchJson<IntelligenceResponse>(`/api/intelligence?hideTest=1`),
  });
}
