import 'server-only';
import { prisma } from '@/lib/prisma';

export const AUDIO_LIBRARY_STORAGE_LIMITS = {
  free: 300 * 1024 * 1024,
  half_yearly: 500 * 1024 * 1024,
  yearly: 1024 * 1024 * 1024,
  yearly_plus: 10 * 1024 * 1024 * 1024,
} as const;

export function audioLibraryLimitForPlan(plan: string | null | undefined, active: boolean) {
  if (!active) return AUDIO_LIBRARY_STORAGE_LIMITS.free;
  const key = String(plan || '').trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
  if (key === 'half_yearly' || key === 'halfyearly' || key === '6_months') return AUDIO_LIBRARY_STORAGE_LIMITS.half_yearly;
  if (key === 'yearly_plus' || key === 'yearlyplus' || key === 'elite') return AUDIO_LIBRARY_STORAGE_LIMITS.yearly_plus;
  if (key === 'yearly' || key === 'annual') return AUDIO_LIBRARY_STORAGE_LIMITS.yearly;
  return AUDIO_LIBRARY_STORAGE_LIMITS.free;
}

export async function getAudioLibraryStorage(userId: number) {
  const [subscription, total] = await Promise.all([
    prisma.subscription.findUnique({ where: { userId }, select: { plan: true, status: true, expiryDate: true, currentPeriodEnd: true } }),
    prisma.storedAsset.aggregate({ where: { ownerUserId: userId, assetType: 'private_audio_master', uploadStatus: 'ready', deletedAt: null, category: 'TRACK_AUDIO_MASTER' }, _sum: { byteSize: true } }),
  ]);
  const expiresAt = Math.max(...[subscription?.expiryDate, subscription?.currentPeriodEnd].map(value => value?.getTime() || 0));
  const active = Boolean(subscription && subscription.status.toLowerCase() === 'active' && expiresAt > Date.now());
  const limitBytes = audioLibraryLimitForPlan(subscription?.plan, active);
  const usedBytes = total._sum.byteSize || 0;
  return { usedBytes, limitBytes, percent: Math.min(100, Math.round((usedBytes / limitBytes) * 100)), plan: active ? subscription?.plan || null : null, remainingBytes: Math.max(0, limitBytes - usedBytes) };
}
