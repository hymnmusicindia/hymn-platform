import { z } from 'zod';
import { requireUser } from '@/lib/access';
import { payoutVerification, savePayoutVerification } from '@/lib/payout/verification';
const input = z.object({ documentType: z.enum(['government_id', 'passport', 'driving_licence', 'business_registration']), identityAssetId: z.number().int().positive().nullable().optional(), beneficiaryAssetId: z.number().int().positive().nullable().optional(), submit: z.boolean().default(false), consent: z.boolean().default(false) }).strict();
export async function GET() { const auth = await requireUser(); if ('error' in auth) return auth.error; return Response.json(await payoutVerification(auth.user.id), { headers: { 'Cache-Control': 'private, no-store' } }); }
export async function POST(request: Request) {
  const auth = await requireUser(); if ('error' in auth) return auth.error;
  try { return Response.json(await savePayoutVerification(auth.user.id, input.parse(await request.json())), { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch (error) { return Response.json({ error: error instanceof z.ZodError ? 'Check your document selections.' : error instanceof Error ? error.message : 'Could not save verification.' }, { status: 400 }); }
}
