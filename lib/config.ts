// Plant settings the dashboard uses. Change them here, in this one file.

/** A hold waiting longer than this shows red on the dashboard (amber before). */
export const HOLD_WARN_MINUTES = 30;

/**
 * Check time is active time only. A gap longer than this with no activity on the check (no step change, recorded
 * value, button press or voice command) is not counted, and the check screen pauses itself after it.
 */
export const IDLE_PAUSE_MINUTES = 10;

/**
 * The plant's time zone (IANA name). Shifts and days are always worked out in this zone, never in UTC.
 * Assumed: set to the plant's real zone, for example "Europe/Berlin" or "America/Detroit".
 */
export const PLANT_TIME_ZONE = "Asia/Kolkata";

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

// ---------- SOP management: the one-click flow (docs/sop-management/one-click-flow.md) ----------

/** A Quality Technician is a candidate when at least this many of their newest completed checks in a row... */
export const CANDIDATE_MIN_CHECKS = 5;

/** ...are each faster than the station median check CT by at least this much, with first-time correct not below the station's. */
export const CANDIDATE_MIN_IMPROVEMENT_PERCENT = 5;

/** A step counts as faster (and gets a TIME suggestion) when it beats the target, or the station median when no target is set, by this much... */
export const STEP_CHANGE_MIN_PERCENT = 5;

/** ...and by at least this many seconds... */
export const STEP_CHANGE_MIN_SECONDS = 3;

/** ...in at least this share of the candidate's checks. The same share decides an ORDER suggestion. */
export const STEP_CHANGE_SHARE_PERCENT = 80;

/** A suggested step CT is the candidate's median step time rounded UP to the next multiple of this many seconds. */
export const CT_ROUND_UP_SECONDS = 5;

/** A suggested CT faster than this share of all completed checks at the station gets "Check it is realistic." */
export const REALISTIC_FASTER_THAN_PERCENT = 90;

// ---------- Measurements (spoken or typed at steps 7 to 10) ----------

/** The unit every recorded value is in. The app records values; it never judges tolerance or pass/fail. */
export const MEASUREMENT_UNIT = "mm";

/** "Fill demo values" at steps 7 to 10, for demos and training. When false the button is hidden and the server refuses demo values. */
export const DEMO_FILL_ENABLED = true;

/** Invented values: the nominal per feature (by the first letter of the point id), plus or minus DEMO_FILL_SPREAD. Never a measurement. */
export const DEMO_FILL_NOMINALS: Record<"H" | "S" | "N" | "T" | "F", number> = { H: 8.0, S: 6.2, N: 3.1, T: 0.4, F: 1.2 };
export const DEMO_FILL_SPREAD = 0.05;

/**
 * SOP tolerance per feature (by the first letter of the point id): nominal ± tol, in mm. Placeholders until the SOP
 * carries real tolerances. The Measurements page colours values with them: green inside, amber within
 * NEAR_LIMIT_SHARE of the tolerance from a limit, red outside. The check screen still never judges a value.
 */
export const MEASUREMENT_TOLERANCES: Record<"H" | "S" | "N" | "T" | "F", { nominal: number; tol: number }> = {
  H: { nominal: 8.0, tol: 0.05 },
  S: { nominal: 6.2, tol: 0.05 },
  N: { nominal: 3.1, tol: 0.05 },
  T: { nominal: 0.4, tol: 0.05 },
  F: { nominal: 1.2, tol: 0.05 },
};
export const NEAR_LIMIT_SHARE = 0.3;
