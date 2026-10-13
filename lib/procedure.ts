// "Part does not fit": the hole check procedure (holes H5 to H8 example), five screens.
// The app tracks the procedure. It never chooses the correction and never reads a reading.

export type SeenBy = "Camera" | "Reminder" | "Tablet" | "Voice" | "Engineer";
export type HandoffItem = "marks" | "photo" | "sheet" | "handed_over";

export interface ProcItem {
  key: string;
  text: string;
  sub?: string;
  seen: SeenBy;
  /** Ticking this item also records a handoff item. */
  handoff?: HandoffItem;
}

export interface ProcSection {
  id: string;
  title: string;
  phase: string;
  items: ProcItem[];
}

export const PROC_SECTIONS: ProcSection[] = [
  {
    id: "A", title: "A. Spot it and pause", phase: "Spot it and pause",
    items: [
      { key: "A1", text: "Don't force the pin", seen: "Camera" },
      { key: "A2", text: "Keep the part clamped, do not unclamp", seen: "Camera" },
      { key: "A3", text: "Re-confirm seating: pads A1 to A3, pins A4 and A5", sub: "If any fail, this is the seating branch. Stop and escalate.", seen: "Camera" },
      { key: "A4", text: "Retry the same hole once, clean pin, enter straight", sub: "One retry only.", seen: "Camera" },
    ],
  },
  {
    id: "B", title: "B. Rule out the cheap causes", phase: "Rule out the cheap causes",
    items: [
      { key: "B1", text: "Check pin: right size, clean, in calibration. Try it on the master part", seen: "Camera" },
      { key: "B2", text: "Part temperature: let a warm part settle", seen: "Reminder" },
      { key: "B3", text: "Fixture near the failing holes: dirt, wear, locators, bushings", seen: "Camera" },
      { key: "B4", text: "Look inside the holes with a light for a burr or dross", sub: "A burr is a laser-settings issue. Follow that branch instead.", seen: "Camera" },
    ],
  },
  {
    id: "C", title: "C. Find the pattern", phase: "Find the pattern",
    items: [
      { key: "C1", text: "Finish the full check. Do not stop at the first failure", seen: "Camera" },
      { key: "C2", text: "Compare the neighbours: do other features fail?", seen: "Reminder" },
      { key: "C3", text: "Measure each failing hole with the approved method", seen: "Tablet" },
      { key: "C4", text: "Read the pattern: same direction, same amount, rest passing?", sub: "The process engineer decides the cause and the fix.", seen: "Reminder" },
    ],
  },
  {
    id: "D", title: "D. Contain", phase: "Contain",
    items: [
      { key: "D1", text: "Tell the laser operator to hold this program", seen: "Voice" },
      { key: "D2", text: "Quarantine the parts cut since the last good check and tag them", sub: "Tag: hold, first-off failed, and the hole IDs", seen: "Camera" },
      { key: "D3", text: "Call the process engineer and the shift supervisor", seen: "Reminder" },
      { key: "D4", text: "Log the hold on the tablet", seen: "Tablet" },
    ],
  },
  {
    id: "E", title: "E. Mark and hand off", phase: "Mark and hand off",
    items: [
      { key: "E1", text: "Mark each hole: cross at actual, cross at target, arrow, ID", seen: "Camera", handoff: "marks" },
      { key: "E2", text: "Photograph each marked hole close up, then one wide shot", seen: "Camera", handoff: "photo" },
      { key: "E3", text: "Fill in the handoff sheet on the tablet", sub: "Feature, nominal, measured, deviation, tolerance, result", seen: "Tablet", handoff: "sheet" },
      { key: "E4", text: "Hand over in person: part, sheet, photos. Say what you ruled out", seen: "Reminder", handoff: "handed_over" },
      { key: "E5", text: "Stay with the part. Do not unclamp until the engineer agrees", seen: "Camera" },
    ],
  },
  {
    id: "F", title: "F. While the process engineer corrects", phase: "Wait for the engineer",
    items: [
      { key: "F1", text: "The process engineer is correcting the program", sub: "Compare with the drawing, one change to the holes as a group, new revision, dry run, trial part", seen: "Engineer" },
      { key: "F2", text: "You: keep the fixture clean and the gauges ready. Do not edit the program", seen: "Reminder" },
      { key: "F3", text: "When the trial part arrives, log revision, time and laser", seen: "Tablet" },
    ],
  },
  {
    id: "G", title: "G. Re-check the trial part", phase: "Re-check the trial part",
    items: [
      { key: "G1", text: "Log the program revision, time and laser", seen: "Tablet" },
      { key: "G2", text: "Seat and clamp exactly as in the standard check", seen: "Camera" },
      { key: "G3", text: "Check A1 to A5 first", seen: "Camera" },
      { key: "G4", text: "Check the failing holes next", sub: "Then the full 50 points. A full check after a change is a suggestion. Confirm the plant rule.", seen: "Camera" },
      { key: "G5", text: "Check the remaining points", seen: "Camera" },
      { key: "G6", text: "Decide, using the outcomes on the right", seen: "Tablet" },
    ],
  },
  {
    id: "H", title: "H. Release and close", phase: "Release and close",
    items: [
      { key: "H1", text: "All 50 points in tolerance on the trial part", seen: "Tablet" },
      { key: "H2", text: "Sign off the first-off on the tablet", seen: "Tablet" },
      { key: "H3", text: "Release the cell under the plant rule", seen: "Reminder" },
      { key: "H4", text: "Check the held parts at the failing holes with the check pin and sort them", sub: "Scrap, sort or concession is decided by quality and the customer, not by the Quality Technician.", seen: "Camera" },
      { key: "H5", text: "Increase checking on the next few parts, at the plant discretion", seen: "Reminder" },
      { key: "H6", text: "Close the record: what changed, why, who approved, revision, trial results, part count, time", seen: "Tablet" },
    ],
  },
];

/** The five screens and the sections each one shows. */
export const PROC_SCREENS: { title: string; sections: string[] }[] = [
  { title: "Spot it and pause, rule out the cheap causes", sections: ["A", "B"] },
  { title: "Find the pattern and contain", sections: ["C", "D"] },
  { title: "Mark, hand off and wait", sections: ["E", "F"] },
  { title: "Re-check the trial part", sections: ["G"] },
  { title: "Release and close", sections: ["H"] },
];

export const MAX_TRIALS = 2; // an assumed limit

export type TrialOutcome = "pass" | "better" | "no_better";

export const TRIAL_OUTCOMES: { id: TrialOutcome; title: string; next: string; tone: "ok" | "warn" | "bad" }[] = [
  { id: "pass", title: "All in tolerance", next: "Go to release and close", tone: "ok" },
  { id: "better", title: "Better but still out", next: "Back to the engineer with the new numbers", tone: "warn" },
  { id: "no_better", title: "No better, or other features moved", next: "Stop and escalate for root cause", tone: "bad" },
];

export function section(id: string): ProcSection {
  const s = PROC_SECTIONS.find((x) => x.id === id);
  if (!s) throw new Error(`No section ${id}`);
  return s;
}
