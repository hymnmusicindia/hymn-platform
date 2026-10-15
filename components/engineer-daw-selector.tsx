"use client";
import { useState } from "react";
import { ENGINEER_DAWS } from "@/lib/engineer-daws";

export function EngineerDawSelector({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const [other, setOther] = useState("");
  return <fieldset className="my-6 min-w-0"><legend className="text-sm font-semibold">DAWs you use</legend><p className="mb-3 mt-2 text-xs text-[var(--text-muted)]">Select the digital audio workstations you use for client projects. You can choose up to 12.</p><div className="grid gap-2 sm:grid-cols-2">{[...ENGINEER_DAWS, ...value.filter(item => !(ENGINEER_DAWS as readonly string[]).includes(item))].map(daw => <label key={daw} className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] p-3 text-sm"><input type="checkbox" checked={value.includes(daw)} disabled={!value.includes(daw) && value.length >= 12} onChange={event => onChange(event.target.checked ? [...value, daw] : value.filter(item => item !== daw))}/>{daw}</label>)}</div><label className="mt-3 block text-xs">Other DAW<input className="field mt-2 w-full" value={other} maxLength={80} placeholder="Enter another DAW" onChange={event => setOther(event.target.value)}/></label><button type="button" className="btn-outline mt-2" disabled={other.trim().length < 2 || value.length >= 12} onClick={() => { const daw = other.trim(); if (!value.some(item => item.toLowerCase() === daw.toLowerCase())) onChange([...value, daw]); setOther(""); }}>Add DAW</button></fieldset>;
}
