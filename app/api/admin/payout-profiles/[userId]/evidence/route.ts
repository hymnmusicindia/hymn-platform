import { requireAdminPermission } from '@/lib/access';
import { payoutVerification } from '@/lib/payout/verification';
export async function GET(_request: Request, context: { params: Promise<{ userId: string }> }) {
  const admin = await requireAdminPermission('kyc.review'); if ('error' in admin) return admin.error;
  const id = Number((await context.params).userId); if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: 'Invalid account.' }, { status: 400 });
  return Response.json(await payoutVerification(id), { headers: { 'Cache-Control': 'private, no-store' } });
}
