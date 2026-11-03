import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/access';
import { prisma } from '@/lib/prisma';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const auth = await requireUser(); if ('error' in auth) return auth.error;
  const before = Number(new URL(request.url).searchParams.get('before'));
  const orders = await prisma.studioServiceOrder.findMany({ where: { customerId: auth.user.id, ...(Number.isSafeInteger(before) && before > 0 ? { id: { lt: before } } : {}) }, orderBy: { id: 'desc' }, take: 31, select: { id: true, publicId: true, projectTitle: true, status: true, finalPrice: true, createdAt: true, engineerProfile: { select: { professionalName: true } } } });
  return NextResponse.json({ orders: orders.slice(0, 30), nextCursor: orders.length > 30 ? orders[29].id : null }, { headers: { 'Cache-Control': 'private, no-store' } });
}
