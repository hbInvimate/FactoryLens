// Plant settings the dashboard uses. Change them here, in this one file.

/** A hold waiting longer than this shows red on the dashboard (amber before). */
export const HOLD_WARN_MINUTES = 30;

/**
 * The plant's time zone (IANA name). Shifts and days are always worked out in this zone, never in UTC.
 * Assumed: set to the plant's real zone, for example "Europe/Berlin" or "America/Detroit".
 */
export const PLANT_TIME_ZONE = "America/Los_Angeles";

export type ShiftId = "A" | "B" | "C";

/**
 * Shifts (assumed, editable). "HH:MM" in plant time. A shift may run past midnight (C).
 * A session belongs to the shift in which it STARTED.
 */
export const SHIFTS: { id: ShiftId; start: string; end: string }[] = [
  { id: "A", start: "06:00", end: "14:00" },
  { id: "B", start: "14:00", end: "22:00" },
  { id: "C", start: "22:00", end: "06:00" },
];

/** While fewer real sessions than this exist, the dashboard includes sample data by default. */
export const SAMPLE_DEFAULT_BELOW = 10;

// ---------- SOP management (docs/sop-management) ----------

/** Evidence for a new step CT: at least this many completed real sessions with the step correct first time... */
export const MIN_EVIDENCE_SESSIONS = 5;

/** ...from at least this many different shifts. The Quality Engineer may override both with a written reason. */
export const MIN_EVIDENCE_SHIFTS = 2;

/** When true, a different Quality Engineer or an admin must approve a revision before it can be activated. */
export const REQUIRE_SECOND_APPROVAL = false;

/** When true, the evidence table shows the Quality Technician label of each session. Off: date, shift and times only. */
export const SHOW_TECHNICIAN_IN_EVIDENCE = false;
