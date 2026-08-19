import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { getDireNoteConfig } from "@/lib/direnote/direnote-config";
import { submitToDireNote } from "@/lib/direnote/direnote-client";
import { prisma } from "@/lib/prisma";
import { isPostgresPrisma } from "@/lib/distribution-db";

export const runtime = "nodejs";

function status() {
  const config = getDireNoteConfig();
  return { endpointConfigured: Boolean(config.endpoint), pinConfigured: Boolean(config.pin), clientIdConfigured: Boolean(config.clientId), configReady: config.isConfigured };
}

async function lastTest() {
  if (!isPostgresPrisma()) return null;
  const log = await prisma.direNoteLog.findFirst({ where: { action: "test_payload" }, orderBy: { createdAt: "desc" } });
  return log ? { success: log.success, httpStatus: log.httpStatus, response: log.responseJson ?? log.responseRaw ?? log.errorMessage, createdAt: log.createdAt } : null;
}

export async function GET() {
  const admin = await requireAdminPermission("system.manage"); if ("error" in admin) return admin.error;
  return NextResponse.json({ ...status(), lastTest: await lastTest() });
}

export async function POST() {
  const admin = await requireAdminPermission("system.manage"); if ("error" in admin) return admin.error;
  const now = new Date(); const releaseDate = new Date(now); releaseDate.setUTCDate(releaseDate.getUTCDate() + 5);
  const year = now.getUTCFullYear();
  const payload = {
    albumname: "Dummy API Release", typeOfRelease: "Single", albumGenre: "Pop", albumSubgenre: "Indie Pop", albumLanguage: "English",
    contenttype: "Original/Exclusive Licensed", trackReleaseDate: releaseDate.toISOString().slice(0, 10), labelName: "DireNote Test Label",
    cLine: `${year} DireNote Test Label`, pLine: `${year} DireNote Test Label`, cover_art_url: "https://picsum.photos/3000",
    artists: [{ name: "John Smith", spotify_url: "", instagram_url: "https://instagram.com/johnsmithmusic" }], featuring_artists: [],
    tracks: [{ trackName: "Dummy API Release", trackVersion: "", audio_url: "https://samplelib.com/lib/preview/wav/sample-3s.wav", explicitLyrics: "No", previewStart: "30", previouslyReleased: "No", producers: ["DireNote Studio"], songwriters: [{ name: "John Smith", ipi: "" }], composers: [{ name: "John Smith", ipi: "" }] }]
  };
  const result = await submitToDireNote(payload);
  if (isPostgresPrisma()) await prisma.direNoteLog.create({ data: { action: "test_payload", httpStatus: result.httpStatus, success: result.success, requestPayloadRedacted: payload as any, responseRaw: result.raw ?? null, responseJson: result.data as any, errorMessage: result.error ?? null, createdByAdminId: Number((admin as any).sub) || null } });
  return NextResponse.json({ ...status(), result: { success: result.success, httpStatus: result.httpStatus, response: result.data ?? null, error: result.error ?? null }, lastTest: await lastTest() }, { status: result.success ? 200 : 502 });
}

// vercel trigger 9
