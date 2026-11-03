import { prisma } from '@/lib/prisma';
import { artistProfileLimitForPlan } from '@/lib/artist-profile-limits';
import { labelExtrasForAmount } from '@/lib/label-artist-pricing';

/** Audit-backed exceptional grants remain distinct from paid recurring plan slots. */
export async function subscriptionArtistCapacity(subscription: { id: number; plan: string; planVersionId?: number | null }, now = new Date(), db = prisma) {
  const base = artistProfileLimitForPlan(subscription.plan);
  if (!['yearly_plus', 'elite'].includes(subscription.plan)) return base;
  const [version, grants] = await Promise.all([
    subscription.planVersionId ? db.subscriptionPlanVersion.findUnique({ where: { id: subscription.planVersionId } }) : null,
    db.auditLog.findMany({ where: { entity: 'subscription_artist_grant', entityId: String(subscription.id), action: 'ARTIST_SLOTS_GRANTED' }, select: { metadata: true } })
  ]);
  const paid = version?.product === 'yearly_plus' ? labelExtrasForAmount(version.amount) : 0;
  let bonus = 0;
  for (const grant of grants) {
    const data = grant.metadata as { slots?: number; validUntil?: string; revoked?: boolean } | null;
    if (!data || data.revoked || !Number.isSafeInteger(data.slots) || data.slots! < 1 || data.slots! > 500) continue;
    if (data.validUntil && !(Date.parse(data.validUntil) > now.getTime())) continue;
    bonus += data.slots!;
  }
  return base + paid + bonus;
}
