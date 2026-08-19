"use client";

import { CheckCircle2, ImagePlus, LoaderCircle } from "lucide-react";
import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

type ArtworkSquareDropzoneProps = {
  previewUrl?: string | null;
  fileName?: string;
  fileType?: string;
  dimensions?: string | null;
  error?: string | null;
  onSelect: (file: File) => Promise<void> | void;
};

export function ArtworkSquareDropzone({ previewUrl, fileName, fileType, dimensions, error, onSelect }: ArtworkSquareDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [success, setSuccess] = useState(false);
  const suppressNextClickRef = useRef(false);

  useEffect(() => {
    if (!error) return;
    setProcessing(false);
    setProgress(0);
    setSuccess(false);
  }, [error]);

  async function stageFile(file: File | null) {
    if (!file) return;

    setProcessing(true);
    setSuccess(false);
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
      setSuccess(true);
      window.setTimeout(() => setSuccess(false), 1500);
    } catch (selectionError) {
      active = false;
      window.clearInterval(timer);
      setProcessing(false);
      setProgress(0);
      setSuccess(false);
      throw selectionError;
    }
  }

  return (
    <div className="grid gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(event) => {
          void stageFile(event.target.files?.[0] ?? null);
          event.currentTarget.value = "";
        }}
      />

      <button
        type="button"
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
          "pressable relative aspect-square w-full overflow-hidden rounded-[1.25rem] border border-dashed p-4 text-left",
          dragging ? "scale-[1.01]" : ""
        )}
        style={{
          borderColor: error ? "var(--danger)" : dragging ? "var(--accent)" : "var(--border)",
          background: previewUrl ? "var(--card)" : "var(--bg-soft)",
          boxShadow: dragging ? "var(--shadow-soft)" : undefined
        }}
      >
        {previewUrl ? <img src={previewUrl} alt="Artwork preview" className="absolute inset-0 h-full w-full object-cover" /> : null}
        <div className="absolute inset-0" style={{ background: previewUrl ? "linear-gradient(180deg, transparent 42%, rgba(0,0,0,0.58) 100%)" : "transparent" }} />

        <div className="relative flex h-full flex-col justify-between">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full border" style={{ borderColor: previewUrl ? "rgba(255,255,255,0.24)" : "var(--border)", background: previewUrl ? "rgba(0,0,0,0.28)" : "var(--card)" }}>
            {processing ? <LoaderCircle className="h-5 w-5 animate-spin" /> : success ? <CheckCircle2 className="h-5 w-5" /> : <ImagePlus className="h-5 w-5" />}
          </div>

          <div>
            <p className="text-base font-semibold" style={{ color: previewUrl ? "#ffffff" : "var(--text)" }}>Drop square cover artwork</p>
            <p className="mt-1 text-sm" style={{ color: previewUrl ? "rgba(255,255,255,0.78)" : "var(--text-soft)" }}>or click to upload</p>
            <p className="mt-3 text-xs uppercase tracking-[0.18em]" style={{ color: previewUrl ? "rgba(255,255,255,0.65)" : "var(--text-soft)" }}>JPG / PNG · square 3000 x 3000 recommended</p>
            {fileName ? <p className="mt-3 text-sm" style={{ color: previewUrl ? "#ffffff" : "var(--text)" }}>{fileName}</p> : null}
          </div>
        </div>
      </button>

      {previewUrl && fileName ? (
        <div className="rounded-xl border px-3 py-2.5 text-xs" style={{ borderColor: "rgba(34,197,94,0.35)", background: "rgba(34,197,94,0.09)", color: "var(--text)" }}>
          <div className="flex items-center justify-between gap-3">
            <span className="truncate font-medium">{fileName}</span>
            <span style={{ color: "#86efac" }}>Passed</span>
          </div>
          <p className="mt-1" style={{ color: "var(--text-soft)" }}>{[dimensions, fileType].filter(Boolean).join(" • ")}</p>
        </div>
      ) : null}

      {processing || progress === 100 ? (
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
