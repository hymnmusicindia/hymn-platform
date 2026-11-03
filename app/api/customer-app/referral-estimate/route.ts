import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { referralScenario } from '@/lib/referral-calculator';
import { referralJson } from '@/lib/referral-request';
import { isSameAppOrigin } from '@/lib/request-origin';
const schema = z.object({ friends: z.number().int().min(0).max(1000), branching: z.number().int().min(0).max(5), purchases: z.array(z.object({ id: z.string().max(40), category: z.enum(['one_time','half_yearly','yearly','yearly_plus','beats','studio']), quantity: z.number().int().min(0).max(100), baseMinor: z.number().int().min(0).max(10000000) })).max(10) }).strict();
export async function POST(request: Request) {
  if (!isSameAppOrigin(request)) return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 });
  try {
    const input = schema.parse(await referralJson(request, 8192));
    const p = await prisma.referralProgram.findUnique({ where: { id: 1 }, select: { effectiveAt: true, networkEffectiveAt: true, netRevenueEffectiveAt: true, netNetworkEffectiveAt: true } });
    const now = Date.now(), net = Boolean(p?.netRevenueEffectiveAt && p.netRevenueEffectiveAt.getTime() <= now);
    const policy = { enabled: Boolean(p && p.effectiveAt.getTime() <= now), mode: net ? 'net' as const : 'legacy' as const, rateBps: 200, networkEnabled: net ? Boolean(p?.netNetworkEffectiveAt && p.netNetworkEffectiveAt.getTime() <= now) : Boolean(p?.networkEffectiveAt && p.networkEffectiveAt.getTime() <= now) };
    return NextResponse.json({ policy, scenario: referralScenario(input.friends, input.branching, input.purchases, policy) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Check your scenario and try again.' }, { status: 400 }); }
}
