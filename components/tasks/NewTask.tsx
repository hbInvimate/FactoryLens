"use client";
// "+ New Task": one first-off check to do. A Quality Technician's task is their own; an admin picks who does it.
import { useRouter } from "next/navigation";
import { useLayoutEffect, useState, type FormEvent } from "react";
import { Modal } from "@/components/check/Dialogs";
import { Button, Field, Input, Select } from "@/components/ds";
import { StationSelect } from "@/components/StationSelect";
import { SESSION_DEFAULTS } from "@/lib/sop";

export function NewTask({ assignees }: { /** Only for an admin: the Quality Technicians to pick from. */ assignees: { id: string; name: string }[] | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [part, setPart] = useState(SESSION_DEFAULTS.part);
  const [station, setStation] = useState(SESSION_DEFAULTS.fixture);
  const [priority, setPriority] = useState("medium");
  const [assignedTo, setAssignedTo] = useState(assignees?.[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useLayoutEffect(
    () => () => {
      setOpen(false);
      setBusy(false);
      setError(null);
    },
    [],
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, part, station, priority, ...(assignees ? { assignedTo } : {}) }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || `The task was not saved (${res.status}).`);
      setOpen(false);
      setTitle("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message === "Failed to fetch" ? "The connection dropped. Try again." : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        + New Task
      </Button>
      {open && (
        <Modal title="New task" onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field label="Task (optional)" htmlFor="task-title" hint="Left empty: First-off check: and the part.">
              <Input id="task-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Part" htmlFor="task-part">
              <Input id="task-part" value={part} maxLength={120} required onChange={(e) => setPart(e.target.value)} />
            </Field>
            <StationSelect value={station} onChange={setStation} />
            <Field label="Priority" htmlFor="task-priority">
              <Select id="task-priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </Select>
            </Field>
            {assignees && (
              <Field label="Quality Technician" htmlFor="task-assignee">
                <Select id="task-assignee" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} required>
                  {assignees.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {error && (
              <p role="alert" className="text-[16px] text-red-ink">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? "Saving…" : "Create task"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}