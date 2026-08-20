"use client";

import { useState } from "react";
import clsx from "clsx";
import { MessageCircle, Sparkles, X } from "lucide-react";

interface FloatingAssistantProps {
  context: string;
  suggestions: Array<{ label: string; description: string }>;
}

export function FloatingAssistant({ context, suggestions }: FloatingAssistantProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-5 right-5 z-[75]">
      {open ? (
        <div className="mb-3 w-[min(92vw,340px)] rounded-[1.6rem] border p-4 shadow-2xl" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--bg-elevated) 96%, transparent)" }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em]" style={{ color: "var(--text-soft)" }}>{context}</p>
              <h3 className="mt-2 text-lg font-semibold" style={{ color: "var(--text)" }}>Need a hand?</h3>
            </div>
            <button type="button" className="rounded-full border p-1.5" style={{ borderColor: "var(--border)" }} onClick={() => setOpen(false)} aria-label="Close assistant">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 grid gap-2">
            {suggestions.map((item) => (
              <button key={item.label} type="button" className="rounded-2xl border px-3 py-3 text-left text-sm hover:bg-[var(--card-strong)]" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                <span className="font-semibold" style={{ color: "var(--text)" }}>{item.label}</span>
                <span className="mt-1 block text-xs" style={{ color: "var(--text-soft)" }}>{item.description}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={clsx("flex h-14 w-14 items-center justify-center rounded-full border shadow-2xl transition hover:scale-105", open ? "bg-[var(--card-strong)]" : "bg-[var(--accent)]")}
        style={{ borderColor: "var(--border)", color: open ? "var(--text)" : "var(--accent-foreground)" }}
        aria-label="Open assistant"
      >
        {open ? <Sparkles className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>
    </div>
  );
}
