"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, LoaderCircle, Replace, Trash2, X } from "lucide-react";

export function ReleaseTrackActions({ name, index, count, disabled, orderLocked, replace, move, remove }: {
  name: string; index: number; count: number; disabled: boolean; orderLocked: boolean;
  replace: (file: File, signal: AbortSignal, progress: (loaded: number, total: number) => void) => Promise<void>;
  move: (direction: -1 | 1) => void;
  remove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null), controller = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(0), [error, setError] = useState("");
  useEffect(() => () => controller.current?.abort(), []);
  async function choose(file: File) {
    if (controller.current || disabled) return;
    const request = new AbortController(); controller.current = request;
    setBusy(true); setProgress(0); setError("");
    try {
      await replace(file, request.signal, (loaded, total) => setProgress(Math.min(99, Math.round(loaded / Math.max(1, total) * 100))));
    } catch (cause) {
      setError(request.signal.aborted ? "Replacement cancelled. Your original master is still attached." : `${cause instanceof Error ? cause.message : "Replacement failed."} Your original master is still attached.`);
    } finally { controller.current = null; setBusy(false); }
  }
  return <div className="release-master-tools">
    <input ref={input} type="file" className="sr-only" aria-label={`Choose replacement audio for ${name}`} accept="audio/wav,audio/x-wav,audio/mpeg,.wav,.mp3" disabled={disabled || busy} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void choose(file); }}/>
    <div className="release-master-buttons">
      {busy ? <><span role="status" className="release-master-replacing"><LoaderCircle size={15} className="animate-spin"/>Replacing {progress}%</span><button type="button" onClick={() => controller.current?.abort()} aria-label={`Cancel replacement for ${name}`}><X size={15}/>Cancel</button></> : <button type="button" disabled={disabled} onClick={() => input.current?.click()} aria-label={`Replace audio for ${name}`}><Replace size={15}/>Replace audio</button>}
      {!orderLocked && count > 1 && <div className="release-master-order" role="group" aria-label={`Reorder ${name}`}><button type="button" disabled={disabled || busy || index === 0} onClick={() => move(-1)} aria-label={`Move ${name} up`} title="Move up"><ArrowUp size={15}/></button><button type="button" disabled={disabled || busy || index === count - 1} onClick={() => move(1)} aria-label={`Move ${name} down`} title="Move down"><ArrowDown size={15}/></button></div>}
      {!orderLocked && <button type="button" className="release-master-remove" disabled={disabled || busy} onClick={remove} aria-label={`Remove ${name}`} title="Remove track"><Trash2 size={15}/></button>}
    </div>
    {busy && <progress className="release-master-progress" value={progress} max={100} aria-label={`Replacement progress for ${name}`}/>}
    {error && <p role="alert" className="release-master-error">{error}</p>}
  </div>;
}
