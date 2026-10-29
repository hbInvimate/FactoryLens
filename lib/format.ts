/** 0:42, 41:20, 1:02:03. Shared by server and client code. */
export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

/** The Duration column: "04:07", or "1:02:03" over an hour. */
export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Duration column text: "–" when the check never started (or has no recorded time), "Left at 04:07" when left. */
export function durationText(status: string | null, seconds: number | null | undefined): string {
  if (status === null || seconds === null || seconds === undefined) return "–";
  return status === "left" ? `Left at ${fmtDuration(seconds)}` : fmtDuration(seconds);
}
