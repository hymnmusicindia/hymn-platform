"use client";

import { UploadCloud } from "lucide-react";
import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

type ArtworkSquareDropzoneProps = {
  previewUrl?: string | null;
  fileName?: string;
  fileType?: string;
  dimensions?: string | null;
  error?: string | null;
  minimalFeedback?: boolean;
  onSelect: (file: File) => Promise<void> | void;
};

export function ArtworkSquareDropzone({ previewUrl, fileName, fileType, dimensions, error, minimalFeedback = false, onSelect }: ArtworkSquareDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const suppressNextClickRef = useRef(false);

  useEffect(() => {
    if (!error) return;
    setProcessing(false);
    setProgress(0);
  }, [error]);

  async function stageFile(file: File | null) {
    if (!file) return;

    setProcessing(true);
    setProgress(10);

    let active = true;
    const timer = window.setInterval(() => {
      if (!active) return;
      setProgress((current) => Math.min(current + 14, 90));
    }, 110);

    try {
      await onSelect(file);
      active = false;
      window.clearInterval(timer);
      setProgress(100);
      setProcessing(false);
    } catch (selectionError) {
      active = false;
      window.clearInterval(timer);
      setProcessing(false);
      setProgress(0);
      throw selectionError;
    }
  }

  return (
    <div className="grid gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,.jpg,.jpeg"
        className="hidden"
        onChange={(event) => {
          void stageFile(event.target.files?.[0] ?? null);
          event.currentTarget.value = "";
        }}
      />

      <button
        type="button"
        aria-label={previewUrl ? "Replace cover artwork" : "Upload cover artwork"}
        onClick={(event) => {
          if (suppressNextClickRef.current) {
            event.preventDefault();
            suppressNextClickRef.current = false;
            return;
          }
          inputRef.current?.click();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          suppressNextClickRef.current = true;
          setDragging(false);
          void stageFile(event.dataTransfer.files?.[0] ?? null);
          window.setTimeout(() => {
            suppressNextClickRef.current = false;
          }, 350);
        }}
        className={clsx(
          "pressable group relative aspect-square w-full overflow-hidden rounded-xl border text-left transition duration-300",
          dragging ? "scale-[1.01]" : ""
        )}
        style={{
          borderColor: error ? "var(--danger)" : dragging ? "var(--accent)" : "color-mix(in srgb, var(--accent) 30%, var(--border))",
          borderStyle: previewUrl ? "solid" : "dashed",
          background: previewUrl ? "var(--card)" : "linear-gradient(145deg, color-mix(in srgb, var(--accent) 5%, var(--card)), var(--card))",
          boxShadow: dragging ? "0 16px 44px color-mix(in srgb, var(--accent) 12%, transparent)" : "none"
        }}
      >
        {previewUrl ? <img src={previewUrl} alt="Artwork preview" decoding="async" className="absolute inset-0 h-full w-full object-cover" /> : null}
        <div className="absolute inset-0 transition-colors duration-300 group-hover:bg-white/[.025]" />
        {!previewUrl || processing ? <div className="relative grid h-full place-items-center">
          <UploadCloud className="h-8 w-8 text-[var(--text-muted)] transition-[transform,color,filter] duration-300 group-hover:scale-105 group-hover:text-[var(--text)] group-hover:drop-shadow-[0_0_14px_rgba(255,255,255,.2)]" aria-hidden="true" />
        </div> : null}
      </button>

      {!minimalFeedback && previewUrl && fileName ? (
        <div className="rounded-xl border px-3 py-2.5 text-xs" style={{ borderColor: "rgba(34,197,94,0.35)", background: "rgba(34,197,94,0.09)", color: "var(--text)" }}>
          <div className="flex items-center justify-between gap-3">
            <span className="truncate font-medium">{fileName}</span>
            <span style={{ color: "#86efac" }}>Passed</span>
          </div>
          <p className="mt-1" style={{ color: "var(--text-soft)" }}>{[dimensions, fileType].filter(Boolean).join(" • ")}</p>
        </div>
      ) : null}

      {!minimalFeedback && (processing || progress === 100) ? (
        <div className="rounded-full border p-1" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
          <div className={clsx("h-2 rounded-full", processing ? "shimmer-track" : "")} style={{ width: `${progress}%`, background: processing ? undefined : "var(--accent)" }} />
        </div>
      ) : null}

      {error ? <p className="inline-error">{error}</p> : null}
    </div>
  );
}

// vercel trigger
// vercel trigger 6
// vercel trigger 7

// vercel trigger 12
