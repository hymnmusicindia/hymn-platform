export type ProducerSetupProfile = { displayName?: string | null; avatarUrl?: string | null; coverPhotoUrl?: string | null; status?: string | null; active?: boolean };
export type ProducerSetupBeat = { status?: string | null; enabled?: boolean };

/** Derived from saved records: enrollment alone must not unlock a business dashboard. */
export function producerSetup(profile: ProducerSetupProfile | null | undefined, beats: ProducerSetupBeat[]) {
  const missing = [
    !profile?.displayName?.trim() || profile.displayName.trim().length < 2 ? "Producer name" : null,
    !profile?.avatarUrl ? "Profile image" : null,
    !profile?.coverPhotoUrl ? "Cover image" : null,
  ].filter((value): value is string => Boolean(value));
  const restricted = ["suspended", "disabled"].includes(profile?.status ?? "") || (profile?.active === false && profile.status !== "pending_setup");
  const storefrontReady = missing.length === 0 && !restricted;
  const uploaded = beats.some(beat => ["PENDING_REVIEW", "CHANGES_REQUESTED", "PUBLISHED", "EXCLUSIVE_RESERVED", "EXCLUSIVELY_SOLD"].includes(beat.status ?? "") || (!beat.status && beat.enabled));
  return { missing, restricted, storefrontReady, uploaded, complete: storefrontReady && uploaded, completedSteps: Number(storefrontReady) + Number(uploaded) };
}

export function producerSetupTab(requested: string, setup: ReturnType<typeof producerSetup>) {
  if (setup.complete) return requested;
  if (["overview", "profile", "settings", "messages"].includes(requested)) return requested;
  if (["catalog", "manage"].includes(requested)) return "catalog";
  if (requested === "upload") return setup.storefrontReady ? "upload" : "profile";
  return "overview";
}
