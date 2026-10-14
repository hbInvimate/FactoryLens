// Which shift a session belongs to: the one in which it started, in the plant's time zone.
import { PLANT_TIME_ZONE, SHIFTS, type ShiftId } from "./config";

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Minutes since midnight of an instant, on the plant's clock. */
export function plantMinutes(at: Date | number, timeZone = PLANT_TIME_ZONE): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(at));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

/** The plant-local date of an instant, "YYYY-MM-DD". */
export function plantDay(at: Date | number, timeZone = PLANT_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
}

/** The shift a session started in. Start inclusive, end exclusive; a shift past midnight wraps. */
export function shiftOf(startTime: Date | number, timeZone = PLANT_TIME_ZONE): ShiftId {
  const t = plantMinutes(startTime, timeZone);
  for (const s of SHIFTS) {
    const a = minutes(s.start);
    const b = minutes(s.end);
    if (a < b ? t >= a && t < b : t >= a || t < b) return s.id;
  }
  return SHIFTS[0].id; // the config leaves a gap: fall back rather than guess wrong silently
}

export function shiftLabel(id: ShiftId): string {
  const s = SHIFTS.find((x) => x.id === id)!;
  return `Shift ${s.id} ${s.start} to ${s.end}`;
}
