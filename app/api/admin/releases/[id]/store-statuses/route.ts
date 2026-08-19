import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access";
import { getAdminStoreStatusData, getDetailedReleaseById, STORE_DENIAL_REASONS, STORE_STATUSES, updateStoreStatuses } from "@/lib/distribution-db";

export const runtime = "nodejs";

const KNOWN_PLATFORMS = ["Spotify", "Apple Music", "YouTube Music", "Amazon Music", "JioSaavn", "Wynk", "Gaana", "Deezer", "Tidal", "Pandora", "Audiomack", "iHeartRadio", "Anghami", "Napster", "Facebook & Instagram", "Instagram / Facebook", "TikTok", "Audible Magic Identification", "Gracenote"];

function cleanText(value: unknown, max = 1000) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, max) : null;
}

async function resolveRelease(id: string) {
  const releaseId = Number(id);
  if (!Number.isInteger(releaseId) || releaseId <= 0) return { error: "Valid release id is required.", status: 400 } as const;
  const release = await getDetailedReleaseById(releaseId);
  if (!release) return { error: "Release not found.", status: 404 } as const;
  return { releaseId, release };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if ("error" in admin) return admin.error;
  const resolved = await resolveRelease((await params).id);
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  return NextResponse.json(await getAdminStoreStatusData(resolved.releaseId));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if ("error" in admin) return admin.error;
  const resolved = await resolveRelease((await params).id);
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.stores) || body.stores.length === 0) return NextResponse.json({ error: "At least one changed store is required." }, { status: 400 });

  const allowedPlatforms = new Set([...KNOWN_PLATFORMS, ...(resolved.release.platforms ?? [])]);
  const stores = [];
  for (const raw of body.stores) {
    const platform = cleanText(raw?.platform, 100);
    const status = cleanText(raw?.status, 40);
    const reason = cleanText(raw?.reason, 180);
    if (!platform || !allowedPlatforms.has(platform)) return NextResponse.json({ error: `Unsupported platform: ${platform || "unknown"}.` }, { status: 400 });
    if (!status || !STORE_STATUSES.includes(status as any)) return NextResponse.json({ error: `Invalid status for ${platform}.` }, { status: 400 });
    if ((status === "Denied" || status === "Content ID Denied") && (!reason || !STORE_DENIAL_REASONS.includes(reason as any))) return NextResponse.json({ error: `Select a denial reason for ${platform}.` }, { status: 400 });
    stores.push({ platform, status: status as any, reason: status.includes("Denied") ? reason : null, userFacingNote: cleanText(raw.userFacingNote), internalNote: cleanText(raw.internalNote) });
  }

  const actorId = "sub" in admin ? admin.sub : 0;
  const actorLabel = "email" in admin ? admin.email : "username" in admin ? admin.username : "Admin";
  const result = await updateStoreStatuses({ releaseId: resolved.releaseId, adminId: actorId, adminLabel: actorLabel, stores });
  return NextResponse.json(result);
}
