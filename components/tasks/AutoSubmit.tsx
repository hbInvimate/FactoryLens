"use client";
// A filter dropdown that applies as soon as it changes (the form is a plain GET form).
import { Select } from "@/components/ds";
import type { ReactNode } from "react";

export function AutoSubmitSelect({ name, value, label, children }: { name: string; value: string; label: string; children: ReactNode }) {
  return (
    <Select key={value} name={name} defaultValue={value} aria-label={label} onChange={(e) => e.currentTarget.form?.requestSubmit()} className="min-w-[170px]">
      {children}
    </Select>
  );
}