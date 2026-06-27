import type { EventOption } from "@/lib/types";

/**
 * Canonical list of selectable product events (spec §5).
 *
 * `coverage` reflects the verified State-tagging reliability (spec §4):
 *  - "full"    → map-ready, surfaced by default
 *  - "partial" → State exists on some events; show a coverage warning
 *  - "none"    → effectively untagged; only shown behind "show all events"
 */
export const EVENTS: EventOption[] = [
  { value: "New Question Asked", label: "Questions Asked", coverage: "full" },
  { value: "Workspace Chat Sent", label: "Workspace Chats", coverage: "full" },
  { value: "PDF Loaded", label: "PDFs Opened", coverage: "partial" },
  { value: "Follow Up Question Asked", label: "Follow-up Questions", coverage: "partial" },
  { value: "Document Viewed", label: "Documents Viewed", coverage: "partial" },
  { value: "File Opened", label: "Files Opened", coverage: "partial" },
  { value: "Card Upvoted", label: "Cards Upvoted", coverage: "partial" },
  { value: "Card Downvoted", label: "Cards Downvoted", coverage: "partial" },
  { value: "AI Forms Filled Successfully", label: "AI Forms Filled", coverage: "none" },
  { value: "Successful LogIn", label: "Logins", coverage: "none" },
];

/** The default event the Explorer opens on (spec §4.1). */
export const DEFAULT_EVENT = "New Question Asked";

export function findEvent(value: string): EventOption | undefined {
  return EVENTS.find((e) => e.value === value);
}

export const MAP_READY_EVENTS = EVENTS.filter((e) => e.coverage === "full");
