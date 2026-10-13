import { STATUS_LABEL, type SessionStatus } from "@/lib/check/types";
import { Chip } from "./ui";

const TONE: Record<SessionStatus, "green" | "amber" | "red" | "blue" | "gray"> = {
  running: "blue",
  paused: "gray",
  on_hold: "amber",
  stopped: "amber",
  complete: "green",
  part_held: "red",
  left: "gray",
  scrapped: "red",
  rework: "amber",
  concession: "amber",
};

export function StatusChip({ status }: { status: SessionStatus }) {
  return <Chip tone={TONE[status] ?? "gray"}>{STATUS_LABEL[status] ?? status}</Chip>;
}
