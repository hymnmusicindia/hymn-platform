import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/access';
import { policyDocuments } from '@/lib/policy-content';
import { getPolicyAgreementStatus } from '@/lib/policy-agreement';
export const dynamic = 'force-dynamic';
export async function GET() {
  const auth = await requireUser(); if ('error' in auth) return auth.error;
  return NextResponse.json({ ...await getPolicyAgreementStatus(auth.user.id), documents: policyDocuments }, { headers: { 'Cache-Control': 'private, no-store' } });
}
