"use client";

import { FormEvent, useState, useTransition } from "react";
import { Beat, Order } from "@/lib/types";

export function AdminOpsPanel({ initialBeats, initialOrders }: { initialBeats: Beat[]; initialOrders: Order[] }) {
  const [beats, setBeats] = useState(initialBeats);
  const [orders] = useState(initialOrders);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [audioFormat, setAudioFormat] = useState<"MP3" | "WAV">("MP3");

  function handleBeatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    
    const file = formData.get("file") as File;
    if (file && file.name) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (audioFormat === "MP3" && ext !== "mp3") {
        setFeedback("Please upload an MP3 file, or change the format selector to WAV.");
        return;
      }
      if (audioFormat === "WAV" && ext !== "wav") {
        setFeedback("Please upload a WAV file, or change the format selector to MP3.");
        return;
      }
    }
    
    setFeedback(null);

    startTransition(async () => {
      const response = await fetch("/api/admin/beats", {
        method: "POST",
        body: formData
      });
      const data = await response.json();
      if (!response.ok) {
        setFeedback(data.error || "Could not create beat.");
        return;
      }
      setBeats((items) => [data.beat, ...items]);
      setFeedback(`Beat created: ${data.beat.title}`);
      form.reset();
    });
  }

  function toggleBeat(beat: Beat) {
    startTransition(async () => {
      const response = await fetch(`/api/admin/beats/${beat.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !beat.enabled })
      });
      if (!response.ok) return;
      setBeats((items) => items.map((item) => (item.id === beat.id ? { ...item, enabled: !item.enabled } : item)));
    });
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[0.95fr,1.05fr]">
      <section className="rounded-[2rem] border border-border bg-white/5 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-white">Manage Beats</h2>
            <p className="mt-2 text-sm text-white/60">Upload previews, deliverables, pricing, and toggle storefront visibility.</p>
          </div>
        </div>
        <form onSubmit={handleBeatSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
          <input name="title" required className="field" placeholder="Beat title" />
          <input name="bpm" required type="number" min="1" className="field" placeholder="BPM" />
          <input name="genre" required className="field" placeholder="Genre" />
          <input name="mood" required className="field" placeholder="Mood" />
          <input name="price" required type="number" min="1" className="field" placeholder="Price" />
          <input name="producerId" required type="number" min="1" className="field" placeholder="Producer user ID" aria-label="Producer user ID" />
          
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm text-white/65">Audio Format</label>
            <select value={audioFormat} onChange={(e) => setAudioFormat(e.target.value as "MP3" | "WAV")} className="field file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink">
              <option value="MP3">MP3</option>
              <option value="WAV">WAV</option>
            </select>
            <p className="mt-2 text-xs text-white/50">
              {audioFormat === "MP3" ? "Smaller file size, faster upload, suitable for most artists." : "Lossless quality, larger file size, preferred for professional recording and mixing."}
            </p>
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm text-white/65">Beat File Upload</label>
            <input name="file" required type="file" accept={audioFormat === "MP3" ? ".mp3,audio/mpeg" : ".wav,audio/wav"} className="field file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink" />
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm text-white/65">Artwork Upload</label>
            <input name="artwork" type="file" accept="image/jpeg,image/png,image/webp" className="field file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink" />
          </div>
          <div className="md:col-span-2 flex items-center justify-between gap-4">
            <button type="submit" disabled={isPending} className="rounded-full bg-cyan px-5 py-3 text-sm font-semibold text-ink">
              {isPending ? "Uploading..." : "Create beat"}
            </button>
            {feedback ? <p className="text-sm text-white">{feedback}</p> : null}
          </div>
        </form>

        <div className="mt-8 space-y-3">
          {beats.map((beat) => (
            <div key={beat.id} className="rounded-2xl border border-border bg-black/20 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-semibold text-white">{beat.title}</p>
                  <p className="text-sm text-white/55">{beat.genre} / {beat.bpm} BPM / Rs {beat.price}</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleBeat(beat)}
                  disabled={isPending}
                  className={`rounded-full px-4 py-2 text-xs uppercase tracking-[0.22em] ${
                    beat.enabled ? "bg-cyan text-ink" : "border border-border bg-transparent text-white/70"
                  }`}
                >
                  {beat.enabled ? "Enabled" : "Disabled"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-border bg-white/5 p-6">
        <h2 className="text-2xl font-semibold text-white">Orders</h2>
        <p className="mt-2 text-sm text-white/60">Track payment state and purchased licenses from verified checkout activity.</p>
        <div className="mt-6 space-y-4">
          {orders.length === 0 ? <p className="text-sm text-white/55">No orders captured yet.</p> : null}
          {orders.map((order) => (
            <div key={order.id} className="rounded-2xl border border-border bg-black/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-semibold text-white">Order #{order.id}</p>
                <span className="rounded-full border border-border px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-cyan">
                  {order.paymentStatus}
                </span>
              </div>
              <p className="mt-2 text-sm text-white/55">User #{order.userId} / {order.razorpayOrderId}</p>
              <div className="mt-4 space-y-2">
                {order.items.map((item, index) => (
                  <div key={`${order.id}-${item.beatId}-${index}`} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm text-white/75">
                    <span>Beat #{item.beatId} / {item.licenseType}</span>
                    <span>Rs {item.price}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// vercel trigger 3
