"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import type { ProducerProfile, Release, SiteSettings } from "@/lib/types";

function imageSrc(value?: string | null) {
  return value || "/uploads/releases/artwork/d8b919d9-33cb-4caa-8d02-ff3efd37d39c.jpeg";
}

export function AdminContentManager({
  initialProducerProfiles,
  initialReleases,
  initialSiteSettings
}: {
  initialProducerProfiles: ProducerProfile[];
  initialReleases: Release[];
  initialSiteSettings: SiteSettings;
}) {
  const [producerProfiles, setProducerProfiles] = useState(initialProducerProfiles);
  const [siteSettings, setSiteSettings] = useState(initialSiteSettings);
  const [releaseSearch, setReleaseSearch] = useState("");
  const [selectedReleaseIds, setSelectedReleaseIds] = useState<number[]>(initialSiteSettings.homeFeaturedReleaseIds ?? []);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeProducerCount = useMemo(() => producerProfiles.filter((profile) => profile.active).length, [producerProfiles]);
  const selectableReleases = useMemo(() => {
    const needle = releaseSearch.trim().toLowerCase();
    return initialReleases
      .filter((release) => Boolean(release.artworkUrl))
      .filter((release) => {
        if (!needle) return true;
        return [release.releaseTitle, release.trackName, release.artistName, release.releaseType, release.status, String(release.id)]
          .some((value) => String(value ?? "").toLowerCase().includes(needle));
      })
      .slice(0, 60);
  }, [initialReleases, releaseSearch]);

  function submitHeroImage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setFeedback(null);

    startTransition(async () => {
      const response = await fetch("/api/admin/site-settings", { method: "PATCH", body: formData });
      const data = await response.json();
      if (!response.ok) {
        setFeedback(data.error || "Could not update hero image.");
        return;
      }
      setSiteSettings(data.siteSettings);
      setFeedback("Homepage hero image updated.");
      event.currentTarget.reset();
    });
  }

  function submitFeaturedReleases(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData();
    formData.set("homeHeroImageUrl", siteSettings.homeHeroImageUrl ?? "");
    formData.set("homeFeaturedReleaseIds", JSON.stringify(selectedReleaseIds.slice(0, 12)));
    setFeedback(null);

    startTransition(async () => {
      const response = await fetch("/api/admin/site-settings", { method: "PATCH", body: formData });
      const data = await response.json();
      if (!response.ok) {
        setFeedback(data.error || "Could not update featured releases.");
        return;
      }
      setSiteSettings(data.siteSettings);
      setSelectedReleaseIds(data.siteSettings.homeFeaturedReleaseIds ?? []);
      setFeedback("Homepage release showcase updated.");
    });
  }

  function toggleFeaturedRelease(releaseId: number) {
    setSelectedReleaseIds((ids) => {
      if (ids.includes(releaseId)) return ids.filter((id) => id !== releaseId);
      return [...ids, releaseId].slice(0, 12);
    });
  }

  function createProducer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setFeedback(null);

    startTransition(async () => {
      const response = await fetch("/api/admin/producer-profiles", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) {
        setFeedback(data.error || "Could not create producer.");
        return;
      }
      setProducerProfiles((items) => [...items, data.producerProfile].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)));
      setFeedback(`Producer added: ${data.producerProfile.name}`);
      event.currentTarget.reset();
    });
  }

  function updateProducer(id: number, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setFeedback(null);

    startTransition(async () => {
      const response = await fetch(`/api/admin/producer-profiles/${id}`, { method: "PATCH", body: formData });
      const data = await response.json();
      if (!response.ok) {
        setFeedback(data.error || "Could not update producer.");
        return;
      }
      setProducerProfiles((items) => items.map((item) => (item.id === id ? data.producerProfile : item)).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)));
      setFeedback(`Producer updated: ${data.producerProfile.name}`);
    });
  }

  function deleteProducer(id: number) {
    setFeedback(null);
    startTransition(async () => {
      const response = await fetch(`/api/admin/producer-profiles/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        setFeedback(data.error || "Could not delete producer.");
        return;
      }
      setProducerProfiles((items) => items.filter((item) => item.id !== id));
      setFeedback("Producer removed.");
    });
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[0.95fr,1.05fr]">
      <section className="surface-card fade-up">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>Homepage hero image</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Upload the image that appears in the main hero on the public homepage.</p>
          </div>
        </div>
        <div className="mt-5 overflow-hidden rounded-[1.5rem] border" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
          <img src={imageSrc(siteSettings.homeHeroImageUrl)} alt="Homepage hero preview" loading="lazy" decoding="async" className="h-64 w-full object-cover" />
        </div>
        <form onSubmit={submitHeroImage} className="mt-5 grid gap-4">
          <input name="homeHeroImage" type="file" accept="image/*" className="field" />
          <input name="homeHeroImageUrl" className="field" placeholder="Or paste an image URL" defaultValue={siteSettings.homeHeroImageUrl ?? ""} />
          <button type="submit" disabled={isPending} className="btn-primary pressable w-fit">
            {isPending ? "Saving..." : "Update hero image"}
          </button>
        </form>
      </section>

      <section className="surface-card fade-up xl:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>Homepage release showcase</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Pick releases from the HYMN database for the BeatStars-style homepage artwork wall. Selected order follows the order you click them.</p>
          </div>
          <div className="rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em]" style={{ borderColor: "var(--border)", color: "var(--text-soft)" }}>
            {selectedReleaseIds.length}/12 selected
          </div>
        </div>

        <form onSubmit={submitFeaturedReleases} className="mt-6 grid gap-4">
          <input className="field" value={releaseSearch} onChange={(event) => setReleaseSearch(event.target.value)} placeholder="Search release, artist, status, or ID" />
          <div className="grid max-h-[520px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
            {selectableReleases.map((release) => {
              const checked = selectedReleaseIds.includes(release.id);
              return (
                <label key={release.id} className="group grid cursor-pointer grid-cols-[74px,1fr] gap-3 rounded-2xl border p-3 transition" style={{ borderColor: checked ? "var(--accent)" : "var(--border)", background: checked ? "color-mix(in srgb, var(--accent) 12%, var(--bg-soft))" : "var(--bg-soft)" }}>
                  <img src={release.artworkUrl} alt={`${release.releaseTitle || release.trackName} artwork`} loading="lazy" decoding="async" className="aspect-square rounded-xl object-cover" />
                  <span className="min-w-0">
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold" style={{ color: "var(--text)" }}>{release.releaseTitle || release.trackName}</span>
                        <span className="mt-1 block truncate text-xs" style={{ color: "var(--text-soft)" }}>{release.artistName} · #{release.id}</span>
                      </span>
                      <input type="checkbox" checked={checked} onChange={() => toggleFeaturedRelease(release.id)} className="mt-1 h-4 w-4 shrink-0" />
                    </span>
                    <span className="mt-3 inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ borderColor: "var(--border)", color: "var(--text-soft)" }}>{release.status}</span>
                  </span>
                </label>
              );
            })}
            {selectableReleases.length === 0 ? <p className="rounded-2xl border p-5 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>No releases with artwork match this search.</p> : null}
          </div>
          <button type="submit" disabled={isPending} className="btn-primary pressable w-fit">
            {isPending ? "Saving..." : "Save homepage releases"}
          </button>
        </form>
      </section>

      <section className="surface-card fade-up">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>Producer profiles</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Add, edit, or remove producer cards. This controls the beatstore hero carousel and producer pages.</p>
          </div>
          <div className="rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em]" style={{ borderColor: "var(--border)", color: "var(--text-soft)" }}>
            {activeProducerCount} active
          </div>
        </div>

        <form onSubmit={createProducer} className="mt-6 grid gap-4 rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <input name="name" className="field" placeholder="Producer name" required />
            <input name="specialty" className="field" placeholder="Specialty" required />
          </div>
          <textarea name="description" className="field min-h-28" placeholder="Description" required />
          <div className="grid gap-4 sm:grid-cols-2">
            <input name="sortOrder" type="number" min="0" className="field" placeholder="Sort order" defaultValue={producerProfiles.length + 1} />
            <label className="flex items-center gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <input name="active" type="checkbox" defaultChecked className="h-4 w-4" />
              <span className="text-sm" style={{ color: "var(--text)" }}>Active</span>
            </label>
          </div>
          <input name="image" type="file" accept="image/*" className="field" />
          <button type="submit" disabled={isPending} className="btn-primary pressable w-fit">
            {isPending ? "Saving..." : "Add producer"}
          </button>
        </form>

        <div className="mt-6 grid gap-4">
          {producerProfiles.map((profile) => (
            <form key={profile.id} onSubmit={(event) => updateProducer(profile.id, event)} className="rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
              <div className="grid gap-4 lg:grid-cols-[160px,1fr]">
                <div className="overflow-hidden rounded-[1.2rem] border" style={{ borderColor: "var(--border)" }}>
                  <img src={imageSrc(profile.imageUrl)} alt={profile.name} loading="lazy" decoding="async" className="h-40 w-full object-cover" />
                </div>
                <div className="grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input name="name" className="field" defaultValue={profile.name} required />
                    <input name="specialty" className="field" defaultValue={profile.specialty} required />
                  </div>
                  <textarea name="description" className="field min-h-24" defaultValue={profile.description} required />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <input name="sortOrder" type="number" min="0" className="field" defaultValue={profile.sortOrder} />
                    <label className="flex items-center gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                      <input name="active" type="checkbox" defaultChecked={profile.active} className="h-4 w-4" />
                      <span className="text-sm" style={{ color: "var(--text)" }}>Active</span>
                    </label>
                    <input name="image" type="file" accept="image/*" className="field" />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button type="submit" disabled={isPending} className="btn-primary pressable">Save changes</button>
                    <button type="button" disabled={isPending} onClick={() => deleteProducer(profile.id)} className="btn-outline pressable">Delete</button>
                  </div>
                </div>
              </div>
            </form>
          ))}
          {producerProfiles.length === 0 ? <p className="text-sm" style={{ color: "var(--text-soft)" }}>No producer profiles yet.</p> : null}
        </div>
      </section>

      {feedback ? <p className="text-sm xl:col-span-2" style={{ color: "var(--text)" }}>{feedback}</p> : null}
    </div>
  );
}

// vercel trigger 12
