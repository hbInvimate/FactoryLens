"use client";
import { PLANT_TIME_ZONE } from "@/lib/config";

/**
 * Shows a time in the plant's time zone (lib/config.ts PLANT_TIME_ZONE). Fixed zone and locale, so the server (UTC)
 * and the browser render the same text.
 */
export function LocalTime({ iso, timeOnly = false, dateOnly = false }: { iso: string; timeOnly?: boolean; dateOnly?: boolean }) {
  const d = new Date(iso);
  const text = timeOnly
    ? d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: PLANT_TIME_ZONE })
    : dateOnly
      ? d.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: PLANT_TIME_ZONE })
      : d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: PLANT_TIME_ZONE });
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {text}
    </time>
  );
}
