import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class names with correct conflict resolution.
 * Mirrors the `cn()` helper used across bluevoice-admin-app.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
