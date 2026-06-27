"use client";

import { useCallback, useSyncExternalStore } from "react";

import { DEFAULT_EVENT } from "@/lib/events";
import { DEFAULT_FILTERS, type Filters } from "@/lib/query";

const STORAGE_KEY = "bv-geo-filters";

const INITIAL: Filters = { event: DEFAULT_EVENT, ...DEFAULT_FILTERS };

function loadFromStorage(): Filters {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL;
    // Merge to tolerate older shapes / newly added keys.
    return { ...INITIAL, ...(JSON.parse(raw) as Partial<Filters>) };
  } catch {
    return INITIAL;
  }
}

/*
 * A tiny module-level store backed by localStorage, consumed via
 * useSyncExternalStore. This serves INITIAL during SSR and the persisted
 * value on the client without a hydration-mismatch warning and without a
 * setState-in-effect (which React's compiler lint now forbids).
 */
let state: Filters = INITIAL;
if (typeof window !== "undefined") {
  state = loadFromStorage();
}

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): Filters {
  return state;
}

function getServerSnapshot(): Filters {
  return INITIAL;
}

function setState(next: Filters) {
  state = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable (private mode) — keep in-memory only
  }
  listeners.forEach((l) => l());
}

/** True only after the client has hydrated (canonical useHydrated trick). */
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

export function useFilters() {
  const filters = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hydrated = useHydrated();

  const update = useCallback(
    <K extends keyof Filters>(key: K, value: Filters[K]) => {
      setState({ ...state, [key]: value });
    },
    [],
  );

  return { filters, update, hydrated };
}
