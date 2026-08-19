import { NextResponse } from 'next/server';
import { requireAdminPermission } from '@/lib/access';
import { saveDraftDistributionRelease } from '@/lib/distribution-db';
import { prisma } from '@/lib/prisma';

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Debug route disabled in production." }, { status: 404 });
  }

  const admin = await requireAdminPermission("system.manage");
  if ("error" in admin) return admin.error;

  try {
    const payload = {
      releaseTitle: "JSON Metadata Validation Release",
      artistName: "Schema Auditor",
      primaryGenre: "Electronic",
      monetisationAccepted: true,
      youtubeContentIdEnabled: false,
      platforms: ["Spotify", "Apple Music"],
      tracks: [
        {
          trackTitle: "Persistence Check",
          primaryArtist: "Schema Auditor",
          bpm: 128,
          isrc: "US-12345"
        }
      ]
    };
    
    const release = await saveDraftDistributionRelease({ userId: "sub" in admin ? admin.sub : 1, metadata: payload as any });
    
    if (!release || !release.id) {
      return NextResponse.json({ error: "Failed to create release" }, { status: 500 });
    }
    
    const dbRelease = await prisma.release.findUnique({ where: { id: release.id }, include: { tracks: true } });
    
    return NextResponse.json({
      success: true,
      returnedRelease: release,
      dbRelease
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}

// vercel trigger
// vercel trigger 9
