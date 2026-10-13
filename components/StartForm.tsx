"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import { reduce } from "@/lib/check/reducer";
import { STATUS_LABEL, type SessionMeta, type SessionStatus } from "@/lib/check/types";
import { getActiveId, readLocal } from "@/lib/client/local";
import { createLocalSession } from "@/lib/client/useCheckSession";
import { SESSION_DEFAULTS, STEP_COUNT } from "@/lib/sop";
import { Btn, Chip, Panel } from "./ui";

interface Active {
  meta: SessionMeta;
  status: SessionStatus;
  step: number;
}

const noSubscribe = () => () => {};

/** The check in progress on this device, if it has not ended. */
function findActive(id: string | null): Active | null {
  const local = id ? readLocal(id) : null;
  if (!local) return null;
  const s = reduce(local.actions, local.meta.createdAt);
  if (s.status === "complete" || s.status === "part_held") return null;
  return { meta: local.meta, status: s.status, step: Math.min(s.current, STEP_COUNT) };
}

function Field({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="text-[17px] text-muted">{label}</span>
      <input
        id={id}
        value={value}
        maxLength={120}
        required
        onChange={(e) => onChange(e.target.value)}
        className="tap rounded-xl border-2 border-line2 bg-deep px-4 text-[22px] text-ink"
      />
    </label>
  );
}

export function StartForm() {
  const router = useRouter();
  const [part, setPart] = useState(SESSION_DEFAULTS.part);
  const [fixture, setFixture] = useState(SESSION_DEFAULTS.fixture);
  const [operator, setOperator] = useState(SESSION_DEFAULTS.operator);
  const [starting, setStarting] = useState(false);
  const activeId = useSyncExternalStore(noSubscribe, getActiveId, () => null);
  const active = useMemo(() => findActive(activeId), [activeId]);

  const start = (e: FormEvent) => {
    e.preventDefault();
    if (!part.trim() || !fixture.trim() || !operator.trim()) return;
    setStarting(true);
    const id = createLocalSession({ part: part.trim(), sop: SESSION_DEFAULTS.sop, fixture: fixture.trim(), operator: operator.trim() });
    router.push(`/check/${id}`);
  };

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6">
      {active && (
        <Panel title="A check is in progress on this device">
          <p className="text-[18px] text-soft">
            {active.meta.part} · {active.meta.fixture} · {active.meta.operator}. Step {active.step} of 12.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Chip tone={active.status === "running" ? "green" : "amber"}>{STATUS_LABEL[active.status]}</Chip>
            <span className="flex-1" />
            <Link
              href={`/check/${active.meta.id}`}
              className="tap inline-flex items-center rounded-xl border-2 border-blue bg-blue px-6 text-[20px] font-semibold text-blue-ink"
            >
              Resume the check
            </Link>
          </div>
        </Panel>
      )}

      <Panel title="Start a first-off check">
        <form onSubmit={start} className="flex flex-col gap-5">
          <p className="text-[17px] text-soft">
            SOP: {SESSION_DEFAULTS.sop}, 12 steps. The app follows the procedure only. Every reading goes on the tablet.
          </p>
          <Field id="part" label="Part" value={part} onChange={setPart} />
          <Field id="fixture" label="Cell and fixture" value={fixture} onChange={setFixture} />
          <Field id="operator" label="Quality Technician" value={operator} onChange={setOperator} />
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Btn type="submit" variant="success" disabled={starting} className="px-10">
              {starting ? "Starting…" : "Start the check"}
            </Btn>
            <span className="flex-1" />
            <Link href="/sessions" className="tap inline-flex items-center rounded-xl border-2 border-edge px-6 text-[20px] font-semibold">
              Session history
            </Link>
          </div>
        </form>
      </Panel>
    </div>
  );
}
