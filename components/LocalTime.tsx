"use client";

/** Shows a time in the viewer's own time zone. */
export function LocalTime({ iso, timeOnly = false }: { iso: string; timeOnly?: boolean }) {
  const d = new Date(iso);
  const text = timeOnly
    ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {text}
    </time>
  );
}
