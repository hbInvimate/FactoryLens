// Seams for what is out of scope in version 1. Nothing here talks to a real system yet.
import type { Deviation } from "@/lib/check/types";

/**
 * Version 1 catches mistakes from what the Quality Technician taps (lib/check/reducer.ts).
 * A video model will later watch the fixture and report the same observations:
 * "point X confirmed at step N", "clamp X closed". Each observation becomes an action
 * in the session log, so the same skip and order rules raise the same deviations.
 */
export interface Observation {
  step: number;
  point: string;
  at: number;
  confidence: number;
}

export interface DeviationSource {
  /** Starts watching a session. Returns a function that stops it. */
  watch(sessionId: string, onObservation: (o: Observation) => void): () => void;
}

/** Version 1: taps are the only source. */
export const tapOnlySource: DeviationSource = {
  watch: () => () => {},
};

/** Calls are reminders until the plant call or andon system is linked. */
export interface CallService {
  readonly linked: boolean;
  call(who: string, context: { sessionId: string; issue: string }): Promise<void>;
}

export const reminderOnlyCalls: CallService = {
  linked: false,
  call: async () => {},
};

/** Clips are placeholders until video capture exists. */
export interface ClipStore {
  readonly available: boolean;
  clipFor(sessionId: string, deviation: Deviation): string | null;
}

export const placeholderClips: ClipStore = {
  available: false,
  clipFor: () => null,
};
