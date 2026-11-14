import { prisma } from '@/lib/prisma';
import type { CalculatorPolicy } from '@/lib/referral-calculator';
import { getSession } from '@/lib/session';
import { partnershipMinimumPayout } from '@/lib/partnerships';
import { REFERRAL_MINIMUM_PAYOUT_MINOR } from '@/lib/referral-commission-policy';
export const runtime = 'nodejs';
export async function GET() {
  try {
    const program = await prisma.referralProgram.findUnique({ where: { id: 1 }, select: { effectiveAt: true, networkEffectiveAt: true, netRevenueEffectiveAt: true, netNetworkEffectiveAt: true } });
    const now = Date.now();
    const net = !!program?.netRevenueEffectiveAt && program.netRevenueEffectiveAt.getTime() <= now;
    const policy: CalculatorPolicy = { enabled: !!program && program.effectiveAt.getTime() <= now, mode: net ? 'net' : 'legacy', rateBps: 200, networkEnabled: net ? !!program?.netNetworkEffectiveAt && program.netNetworkEffectiveAt.getTime() <= now : !!program?.networkEffectiveAt && program.networkEffectiveAt.getTime() <= now };
    const session=await getSession();
    policy.minimumPayoutMinor=session?await partnershipMinimumPayout(prisma,session.sub):REFERRAL_MINIMUM_PAYOUT_MINOR;
    return Response.json({ policy }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return Response.json({ error: 'Programme details are temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
