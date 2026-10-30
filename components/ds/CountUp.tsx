"use client";
// Metric and KPI numbers count up from the old value to the new one in 600 ms (from 0 when the page opens).
// Only whole numbers move ("6 / 12", "92%", "17"); times ("41:20", "1:02:03") and words stay as they are.
// prefers-reduced-motion: the value just changes.
import { useEffect, useRef, useState } from "react";

const DURATION_MS = 600;

/** cubic-bezier(.22, 1, .36, 1), the easing used across the check screen. */
function ease(x: number): number {
  const [x1, y1, x2, y2] = [0.22, 1, 0.36, 1];
  const bx = (t: number) => 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t * t * (1 - t) + t ** 3;
  const by = (t: number) => 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t * t * (1 - t) + t ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (bx(mid) < x) lo = mid;
    else hi = mid;
  }
  return by((lo + hi) / 2);
}

const numbers = (s: string) => (s.match(/\d+/g) ?? []).map(Number);
const fill = (s: string, values: number[]) => {
  let i = 0;
  return s.replace(/\d+/g, () => String(Math.round(values[i++] ?? 0)));
};
/** Whole numbers only: not a time, not a decimal. */
const counts = (s: string) => /\d/.test(s) && !s.includes(":") && !/\d[.,]\d/.test(s);

export function CountUp({ text }: { text: string }) {
  const live = counts(text);
  const [shown, setShown] = useState(() => (live ? fill(text, numbers(text).map(() => 0)) : text));
  const from = useRef<number[] | null>(null);

  useEffect(() => {
    if (!live) return;
    const to = numbers(text);
    const start = from.current?.length === to.length ? from.current : to.map(() => 0);
    from.current = to;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = reduce ? 1 : Math.min(1, (now - t0) / DURATION_MS);
      const e = ease(p);
      setShown(fill(text, to.map((v, i) => start[i] + (v - start[i]) * e)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, live]);

  return <>{live ? shown : text}</>;
}
