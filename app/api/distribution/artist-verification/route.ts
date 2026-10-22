import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/access';
import { requireCurrentPolicyAcceptance } from '@/lib/policy-agreement';
import { approveReleaseArtistProfiles, ArtistVerificationError, getArtistVerification } from '@/lib/release-artist-verification';

const link = z.string().trim().max(500);
const schema = z.object({
  action: z.enum(['prepare', 'approve']), releaseId: z.number().int().positive(),
  artistCardIds: z.array(z.number().int().positive()).min(1).max(100),
  approvals: z.array(z.object({ artistCardId: z.number().int().positive(), fingerprint: z.string().length(64), spotifyUrl: link, appleUrl: link.nullable().optional(), youtubeUrl: link.nullable().optional(), instagramUrl: link.nullable().optional(), openedSpotifyUrl: link, approved: z.literal(true) })).max(100).optional()
});
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const auth = await requireUser(); if ('error' in auth) return auth.error;
  const policy = await requireCurrentPolicyAcceptance(auth.user.id); if (policy) return policy;
  try {
    const body = schema.parse(await request.json());
    const ids = [...new Set(body.artistCardIds)];
    if (body.action === 'approve') {
      if (!body.approvals?.length) return NextResponse.json({ error: 'Confirm the artist profiles before continuing.' }, { status: 400 });
      await approveReleaseArtistProfiles(auth.user.id, body.releaseId, ids, body.approvals);
    }
    return NextResponse.json(await getArtistVerification(auth.user.id, body.releaseId, ids), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof ArtistVerificationError ? error.message : error instanceof z.ZodError ? 'Check the profile links and approval details.' : 'Could not verify artist profiles. Please retry.' }, { status: error instanceof ArtistVerificationError ? 409 : error instanceof z.ZodError ? 400 : 500 });
  }
}
