"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/** Current time, ticking. Starts at 0 on the server so the first render matches. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const t = setInterval(tick, intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

const VOICE_KEY = "fl.voice";

/**
 * Guidance is spoken, never drawn on the lens. Off by default.
 * Uses the browser's text-to-speech; the glasses will play the same lines later.
 */
const voiceListeners = new Set<() => void>();
let voiceMemory: boolean | null = null;

function readVoice(): boolean {
  if (voiceMemory !== null) return voiceMemory;
  try {
    return window.localStorage.getItem(VOICE_KEY) === "on";
  } catch {
    return false;
  }
}

function subscribeVoice(cb: () => void) {
  voiceListeners.add(cb);
  return () => voiceListeners.delete(cb);
}

export function useSpeech() {
  const enabled = useSyncExternalStore(subscribeVoice, readVoice, () => false);
  const supported = useSyncExternalStore(subscribeVoice, () => "speechSynthesis" in window, () => false);

  const toggle = useCallback(() => {
    const next = !readVoice();
    voiceMemory = next;
    try {
      window.localStorage.setItem(VOICE_KEY, next ? "on" : "off");
    } catch {
      // not remembered after a reload, still works now
    }
    if (!next && "speechSynthesis" in window) window.speechSynthesis.cancel();
    voiceListeners.forEach((l) => l());
  }, []);

  const say = useCallback(
    (text: string) => {
      if (!enabled || !text || !("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    },
    [enabled],
  );

  return { enabled, supported, toggle, say };
}

export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}
