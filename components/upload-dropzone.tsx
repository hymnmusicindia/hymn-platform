"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, LoaderCircle, RotateCcw, UploadCloud, X } from "lucide-react";
import clsx from "clsx";

type UploadDropzoneProps = {
  accept: string;
  title: string;
  description: string;
  helperLines?: string[];
  fileName?: string;
  fileFormat?: string;
  fileSize?: string;
  error?: string | null;
  iconOnly?: boolean;
  compact?: boolean;
  ctaLabel?: string;
  splitLayout?: boolean;
  children?: ReactNode;
  onSelect: (file: File, controls: { signal: AbortSignal; reportProgress: (loaded: number, total: number) => void }) => Promise<void> | void;
};

export function UploadDropzone({ accept, title, description, helperLines = [], fileName, fileFormat, fileSize, error, iconOnly = false, compact = false, ctaLabel, splitLayout = false, children, onSelect }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [success, setSuccess] = useState(false);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState(0);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const suppressNextClickRef = useRef(false);

  useEffect(() => {
    if (error) {
      setProcessing(false);
      setSuccess(false);
      setProgress(0);
    }
  }, [error]);

  async function stageFile(file: File | null) {
    if (!file) return;

    setProcessing(true);
    setSelectionError(null);
    setLastFile(file);
    setSuccess(false);
    setProgress(8);

    const controller = new AbortController();
    abortRef.current = controller;
    const startedAt = Date.now();

    try {
      await onSelect(file, { signal: controller.signal, reportProgress: (loaded, total) => {
        const seconds = Math.max((Date.now() - startedAt) / 1000, 0.1);
        const bytesPerSecond = loaded / seconds;
        setProgress(Math.max(1, Math.min(99, Math.round((loaded / Math.max(total, 1)) * 100))));
        setSpeed(bytesPerSecond);
        setEta(bytesPerSecond > 0 ? Math.max(0, (total - loaded) / bytesPerSecond) : 0);
      } });
      setProgress(100);
      setProcessing(false);
      setSuccess(true);
      window.setTimeout(() => setSuccess(false), 1600);
    } catch (selectionError) {
      setProcessing(false);
      setSuccess(false);
      setProgress(0);
      if (!(selectionError instanceof DOMException && selectionError.name === "AbortError")) {
        setSelectionError(selectionError instanceof Error ? selectionError.message : "This file could not be uploaded.");
      }
    }
  }

  return (
    <div className={clsx("grid gap-3", iconOnly && "audio-upload-control", compact && "is-compact")}>
      <div
        role="button"
        tabIndex={0}
        onClick={(event) => {
          if (suppressNextClickRef.current) {
            event.preventDefault();
            suppressNextClickRef.current = false;
            return;
          }
          inputRef.current?.click();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
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
          "pressable hover-lift rounded-[1.25rem] border border-dashed p-4 text-left outline-none transition duration-200",
          iconOnly ? "upload-dropzone-icon-only" : "",
          dragging ? "pulse-glow" : "",
          error ? "field-shake" : ""
        )}
        style={
          error
            ? { borderColor: "var(--danger)", background: "var(--danger-soft)" }
            : dragging
              ? { borderColor: "var(--accent)", background: "linear-gradient(180deg, rgba(89,223,224,0.13), rgba(89,223,224,0.055))" }
              : {
                  borderColor: "var(--border)",
                  background: "linear-gradient(150deg, rgba(255,255,255,0.035), transparent 40%), var(--bg-soft)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.035)"
                }
        }
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(event) => {
            void stageFile(event.target.files?.[0] ?? null);
            event.currentTarget.value = "";
          }}
        />
        {iconOnly ? (
          <div className={clsx("flex flex-col items-center justify-center gap-2", compact ? "min-h-20" : "min-h-28")} aria-label={`${fileName ? "Replace the track" : description}. Drag and drop or choose a file.`}>
            <span className="inline-flex h-10 w-10 items-center justify-center text-[var(--text)]">
              {processing ? <LoaderCircle className="h-6 w-6 animate-spin" /> : success ? <CheckCircle2 className="h-6 w-6 text-[var(--success)]" /> : <UploadCloud className="h-6 w-6" />}
            </span>
            <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>{ctaLabel || (fileName ? "Replace the track" : "Upload your track")}</span>
            {fileName && compact ? <span className="max-w-full truncate px-2 text-[10px]" style={{ color: "var(--text-soft)" }}>{fileName}</span> : null}
          </div>
        ) : splitLayout ? (
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr),9rem] md:items-center">
            <div className="pointer-events-none">
              <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--text-soft)" }}>{title}</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-[-0.025em] md:text-3xl" style={{ color: "var(--text)" }}>{description}</h3>
            </div>
            <div className="license-drop-target flex aspect-square min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed" style={{ borderColor: dragging ? "var(--accent)" : "var(--border)", background: "var(--bg-soft)", color: success ? "var(--success)" : "var(--text)" }}>
              {processing ? <LoaderCircle className="h-6 w-6 animate-spin" /> : success ? <CheckCircle2 className="h-6 w-6" /> : <UploadCloud className="h-6 w-6" />}
              <span className="text-xs font-semibold">Drop PDF</span>
            </div>
          </div>
        ) : <>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>
              {title}
            </p>
            <h3 className="mt-2 text-base font-semibold" style={{ color: "var(--text)" }}>
              {description}
            </h3>
          </div>
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl border transition" style={{ borderColor: dragging ? "var(--accent)" : "var(--border)", background: "var(--card)", boxShadow: dragging ? "0 0 28px rgba(89,223,224,0.22)" : "none", color: success ? "var(--success)" : "var(--accent)" }}>
            {processing ? <LoaderCircle className="h-5 w-5 animate-spin" /> : success ? <CheckCircle2 className="h-5 w-5" /> : <UploadCloud className="h-5 w-5" />}
          </div>
        </div>

        {helperLines.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {helperLines.map((line) => (
              <span key={line} className="rounded-full border px-3 py-1 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-soft)" }}>
                {line}
              </span>
            ))}
          </div>
        ) : null}

        {processing || progress === 100 ? (
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className={clsx("h-full rounded-full", processing ? "shimmer-track" : "")} style={{ width: `${progress}%`, background: processing ? undefined : "var(--accent)" }} />
            </div>
            <p className="mt-2 text-xs" style={{ color: "var(--text-soft)" }}>
              {processing ? `Uploading ${progress}%${speed ? ` · ${(speed / 1024 / 1024).toFixed(1)} MB/s · ${Math.ceil(eta)}s left` : ""}` : success ? "Uploaded and attached" : `${progress}%`}
            </p>
            {processing ? <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs" style={{ color: "var(--danger)" }} onClick={(event) => { event.stopPropagation(); abortRef.current?.abort(); }}><X className="h-3.5 w-3.5" />Cancel</button> : null}
            {!processing && progress === 0 && lastFile ? <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs" style={{ color: "var(--accent)" }} onClick={(event) => { event.stopPropagation(); void stageFile(lastFile); }}><RotateCcw className="h-3.5 w-3.5" />Retry</button> : null}
          </div>
        ) : null}

        {children ? <div className="mt-4">{children}</div> : null}
        </>}
      </div>

      {fileName && !iconOnly ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-xs" style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}>
          <span className="min-w-0">
            <span className="block truncate font-medium">{fileName}</span>
            <span className="mt-0.5 block truncate" style={{ color: "var(--text-soft)" }}>{[fileFormat, fileSize].filter(Boolean).join(" • ") || "Audio attached"}</span>
          </span>
          <span style={{ color: "var(--text-soft)" }}>{success ? "Queued" : "Attached"}</span>
        </div>
      ) : null}

      {error || selectionError ? <p className="text-xs font-medium leading-5 text-red-500">{error || selectionError}</p> : null}
    </div>
  );
}


// vercel trigger

// vercel trigger 12
