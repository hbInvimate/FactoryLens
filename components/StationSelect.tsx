"use client";
// "Cell and fixture" on the start form: a list of stations, with "Add a station".
import { useEffect, useState } from "react";
import { SESSION_DEFAULTS } from "@/lib/sop";
import { Btn } from "./ui";

const CACHE = "fl.stations";
const ADD = "__add__";

function cached(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(CACHE) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function remember(list: string[]) {
  try {
    window.localStorage.setItem(CACHE, JSON.stringify(list));
  } catch {
    // the list is fetched again next time
  }
}

const merge = (...lists: string[][]) => [...new Set(lists.flat())].sort((a, b) => a.localeCompare(b));

export function StationSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [stations, setStations] = useState<string[]>([SESSION_DEFAULTS.fixture]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Works offline too: the last list seen on this device, then the server's.
    const local = cached();
    let alive = true;
    fetch("/api/stations", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { stations: string[] }) => {
        if (!alive) return;
        const list = merge([SESSION_DEFAULTS.fixture], local, d.stations);
        remember(list);
        setStations(list);
      })
      .catch(() => alive && setStations(merge([SESSION_DEFAULTS.fixture], local)));
    return () => {
      alive = false;
    };
  }, []);

  const add = async () => {
    const n = name.trim().replace(/\s+/g, " ");
    if (n.length < 2) {
      setError("Type the station name, for example Laser cell 4 · FX-015.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/stations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: n }),
      });
      const body = (await res.json().catch(() => ({}))) as { name?: string; error?: string };
      if (!res.ok || !body.name) throw new Error(body.error || "The station could not be saved.");
      const list = merge(stations, [body.name]);
      remember(list);
      setStations(list);
      onChange(body.name);
      setAdding(false);
      setName("");
    } catch (e) {
      setError(`${(e as Error).message} Check the connection, then tap Add again.`);
    } finally {
      setBusy(false);
    }
  };

  const options = merge(stations, value ? [value] : []);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="station" className="text-[17px] text-muted">
        Cell and fixture
      </label>
      <select
        id="station"
        value={adding ? ADD : value}
        onChange={(e) => {
          if (e.target.value === ADD) {
            setAdding(true);
            setError(null);
          } else {
            setAdding(false);
            onChange(e.target.value);
          }
        }}
        className="tap rounded-[var(--fl-radius-md)] border border-line-strong bg-surface px-4 text-[22px] text-ink"
      >
        {options.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
        <option value={ADD}>Add a station…</option>
      </select>
      {adding && (
        <div className="flex flex-wrap items-end gap-3 rounded-[var(--fl-radius-md)] border border-line-strong bg-surface p-3">
          <label className="flex min-w-[280px] flex-1 flex-col gap-1.5">
            <span className="text-base text-muted">New station: cell and fixture</span>
            <input
              autoFocus
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void add();
                }
              }}
              className="tap rounded-[var(--fl-radius-md)] border border-line-strong bg-surface px-4 text-[20px] text-ink"
            />
          </label>
          <Btn variant="primary" disabled={busy} onClick={() => void add()}>
            {busy ? "Adding…" : "Add"}
          </Btn>
          <Btn
            onClick={() => {
              setAdding(false);
              setError(null);
            }}
          >
            Cancel
          </Btn>
          {error && (
            <p role="alert" className="w-full text-[17px] text-red-ink">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
