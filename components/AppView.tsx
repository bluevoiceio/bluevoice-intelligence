"use client";

import { useState } from "react";

import { Explorer } from "@/components/Explorer";
import { HealthBoard } from "@/components/HealthBoard";
import { ViewSwitcher, type AppViewId } from "@/components/ViewSwitcher";

export function AppView() {
  const [view, setView] = useState<AppViewId>("health");
  const switcher = <ViewSwitcher value={view} onChange={setView} />;

  return view === "health" ? (
    <HealthBoard headerExtra={switcher} />
  ) : (
    <Explorer headerExtra={switcher} />
  );
}
