"use client";

import { useState, useTransition } from "react";
import { Release, ReleaseStatus } from "@/lib/types";

const statuses: ReleaseStatus[] = ["submitted", "under_review", "approved", "rejected", "sent", "live"];

export function AdminReleaseBoard({ initialReleases }: { initialReleases: Release[] }) {
  const [releases, setReleases] = useState(initialReleases);
  const [isPending, startTransition] = useTransition();

  function updateStatus(id: number, status: ReleaseStatus) {
    startTransition(async () => {
      const response = await fetch(`/api/admin/update-status/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note: `Status set to ${status}` })
      });
      if (!response.ok) return;
      setReleases((items) => items.map((item) => (item.id === id ? { ...item, status } : item)));
    });
  }

  return (
    <div className="grid gap-4">
      {releases.map((release) => (
        <div key={release.id} className="rounded-[2rem] border border-white/10 bg-white/5 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-lg font-semibold text-white">{release.trackName}</p>
              <p className="text-sm text-white/55">{release.artistName} / {release.releaseType.toUpperCase()} / {release.releaseDate}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {statuses.map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={isPending}
                  onClick={() => updateStatus(release.id, status)}
                  className={`rounded-full px-4 py-2 text-xs uppercase tracking-[0.2em] transition ${
                    release.status === status ? "bg-cyan text-ink" : "border border-white/10 bg-black/20 text-white/65"
                  }`}
                >
                  {status.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

