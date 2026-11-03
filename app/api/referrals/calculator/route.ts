import { prisma } from '@/lib/prisma';
import type { CalculatorPolicy } from '@/lib/referral-calculator';
export const runtime = 'nodejs';
export async function GET() {
  try {
    const program = await prisma.referralProgram.findUnique({ where: { id: 1 }, select: { effectiveAt: true, networkEffectiveAt: true, netRevenueEffectiveAt: true, netNetworkEffectiveAt: true } });
    const now = Date.now();
    const net = !!program?.netRevenueEffectiveAt && program.netRevenueEffectiveAt.getTime() <= now;
    const policy: CalculatorPolicy = { enabled: !!program && program.effectiveAt.getTime() <= now, mode: net ? 'net' : 'legacy', rateBps: 200, networkEnabled: net ? !!program?.netNetworkEffectiveAt && program.netNetworkEffectiveAt.getTime() <= now : !!program?.networkEffectiveAt && program.networkEffectiveAt.getTime() <= now };
    return Response.json({ policy }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return Response.json({ error: 'Programme details are temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
