"use client";
import { useRef, useState } from "react";
import { Plus, UploadCloud } from "lucide-react";

export function AudioBatchDrop({ compact, disabled, onFiles }: {
  compact: boolean; disabled: boolean; onFiles: (files: FileList) => void;
}) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  return <label className={`release-batch-upload${compact ? " is-add-row" : " is-initial-drop"}${over ? " is-drag-over" : ""}`} aria-disabled={disabled || undefined}
    onDragEnter={event => { if (!event.dataTransfer.types.includes("Files")) return; event.preventDefault(); depth.current++; if (!disabled) setOver(true); }}
    onDragOver={event => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = disabled ? "none" : "copy"; } }}
    onDragLeave={() => { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setOver(false); }}
    onDrop={event => { event.preventDefault(); event.stopPropagation(); depth.current = 0; setOver(false); if (!disabled && event.dataTransfer.files.length) onFiles(event.dataTransfer.files); }}>
    {compact ? <Plus aria-hidden="true" /> : <UploadCloud aria-hidden="true" />}
    <span><strong>{over ? "Drop to add tracks" : compact ? "Add more tracks" : "Drop your audio masters here"}</strong><small>{compact ? "Browse or drop more WAV / MP3 files" : "WAV or MP3 · Drop multiple files, or click to browse"}</small></span>
    <input type="file" aria-label={compact ? "Add more audio tracks" : "Upload audio tracks"} accept="audio/wav,audio/x-wav,audio/mpeg,.wav,.mp3" multiple disabled={disabled} onChange={event => { if (event.currentTarget.files?.length) onFiles(event.currentTarget.files); event.currentTarget.value = ""; }} />
  </label>;
}
