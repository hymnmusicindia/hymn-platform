"use client";

import { useState } from "react";
import { SuccessState } from "@/components/release-form-support";
import type { Release } from "@/lib/types";

const sampleRelease: Release = {
  id: 1001,
  userId: 1,
  artistName: "HYMN Artist",
  trackName: "Midnight Motion",
  releaseTitle: "Midnight Motion",
  releaseType: "single",
  audioUrl: "",
  artworkUrl: "/assets/playlist-images/1.png",
  releaseDate: "2026-08-28",
  primaryGenre: "Alternative",
  language: "English",
  platforms: ["Spotify", "Apple Music", "YouTube Music"],
  status: "under_review",
  createdAt: new Date().toISOString(),
};

export function ReleaseSubmittedPreview() {
  const [isResubmission, setIsResubmission] = useState(false);

  return (
    <div className="grid gap-5">
      <div className="surface-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <p className="eyebrow">Preview controls</p>
          <h1 className="mt-1 text-xl font-semibold" style={{ color: "var(--text)" }}>Release submission confirmation</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>Switch between the two states shown after submitting a release.</p>
        </div>
        <div className="inline-flex rounded-full border p-1" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
          <button type="button" onClick={() => setIsResubmission(false)} className={`release-preview-toggle ${!isResubmission ? "is-active" : ""}`}>New release</button>
          <button type="button" onClick={() => setIsResubmission(true)} className={`release-preview-toggle ${isResubmission ? "is-active" : ""}`}>Resubmission</button>
        </div>
      </div>

      <SuccessState
        release={{ ...sampleRelease, status: isResubmission ? "resubmitted" : "under_review" }}
        onReset={() => setIsResubmission((current) => !current)}
        resetLabel={isResubmission ? "Preview new submission" : "Preview resubmission"}
      />
    </div>
  );
}
