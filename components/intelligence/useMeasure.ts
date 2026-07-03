"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Track an element's rendered pixel width for responsive, full-width SVG charts.
 * Mirrors the inline ResizeObserver pattern in IntelTreemap, shared so every
 * bespoke chart resizes identically. Returns a ref to attach and the live width.
 */
export function useMeasure<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, width };
}
