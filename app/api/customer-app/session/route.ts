import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/access';
import { getUserEntitlements } from '@/lib/entitlements';
import { getSubscriptionByUserId } from '@/lib/db';
import { distributionPlanCards } from '@/lib/distribution-plans';
import { getMusicAppRelease } from '@/lib/music-app-release';
export const dynamic = 'force-dynamic';
export async function GET() {
  const auth = await requireUser(); if ('error' in auth) return auth.error;
  const [entitlements, subscription, release] = await Promise.all([getUserEntitlements(auth.user.id), getSubscriptionByUserId(auth.user.id), getMusicAppRelease()]);
  return NextResponse.json({ user: { id: auth.user.id, name: auth.user.name, email: auth.user.email, role: auth.user.role, avatar: auth.user.avatarUrl }, entitlements, subscription, plans: distributionPlanCards, app: { minimumVersionCode: 1, latestVersionCode: release?.versionCode ?? 1, downloadPage: '/music/app' } }, { headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
}
