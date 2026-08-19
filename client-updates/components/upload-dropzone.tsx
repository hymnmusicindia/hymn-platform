"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, LoaderCircle, UploadCloud } from "lucide-react";
import clsx from "clsx";

type UploadDropzoneProps = {
  accept: string;
  title: string;
  description: string;
  helperLines?: string[];
  fileName?: string;
  error?: string | null;
  children?: ReactNode;
  onSelect: (file: File) => Promise<void> | void;
};

export function UploadDropzone({ accept, title, description, helperLines = [], fileName, error, children, onSelect }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [success, setSuccess] = useState(false);

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
    setSuccess(false);
    setProgress(8);

    let active = true;
    const timer = window.setInterval(() => {
      if (!active) return;
      setProgress((current) => Math.min(current + 12, 88));
    }, 120);

    try {
      await onSelect(file);
      active = false;
      window.clearInterval(timer);
      setProgress(100);
      setProcessing(false);
      setSuccess(true);
      window.setTimeout(() => setSuccess(false), 1600);
    } catch (selectionError) {
      active = false;
      window.clearInterval(timer);
      setProcessing(false);
      setSuccess(false);
      setProgress(0);
      throw selectionError;
    }
  }

  return (
    <div className="grid gap-3">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
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
          setDragging(false);
          void stageFile(event.dataTransfer.files?.[0] ?? null);
        }}
        className={clsx(
          "pressable hover-lift rounded-[1.6rem] border border-dashed p-5 text-left outline-none transition duration-200",
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
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm uppercase tracking-[0.24em]" style={{ color: "var(--text-soft)" }}>
              {title}
            </p>
            <h3 className="mt-3 text-xl font-semibold" style={{ color: "var(--text)" }}>
              {description}
            </h3>
            <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
              Drag and drop here or click to browse.
            </p>
          </div>
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border transition" style={{ borderColor: dragging ? "var(--accent)" : "var(--border)", background: "var(--card)", boxShadow: dragging ? "0 0 28px rgba(89,223,224,0.22)" : "none", color: success ? "var(--success)" : "var(--accent)" }}>
            {processing ? <LoaderCircle className="h-6 w-6 animate-spin" /> : success ? <CheckCircle2 className="h-6 w-6" /> : <UploadCloud className="h-6 w-6" />}
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
              {processing ? `Preparing upload ${progress}%` : success ? "Ready for review" : `${progress}%`}
            </p>
          </div>
        ) : null}

        {children ? <div className="mt-4">{children}</div> : null}
      </div>

      {fileName ? (
        <div className="flex items-center justify-between rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}>
          <span className="truncate">{fileName}</span>
          <span style={{ color: "var(--text-soft)" }}>{success ? "Queued" : "Attached"}</span>
        </div>
      ) : null}

      {error ? <p className="inline-error">{error}</p> : null}
    </div>
  );
}

