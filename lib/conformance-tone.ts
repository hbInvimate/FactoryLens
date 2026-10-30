// Text colour for a conformance or right-first-time percent: green 90 and up, amber 75 to 89, red below 75.
// A plain module, so server pages and browser components can both use it.
export const confTone = (p: number | null) => (p === null ? "text-muted" : p >= 90 ? "text-primary-ink" : p >= 75 ? "text-amber-ink" : "text-red-ink");
