import { NextResponse } from 'next/server';
import { getAdminAccessForPage } from '@/lib/access';
import { adminModuleAllowed } from '@/lib/admin-workspace-navigation';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const admin = await getAdminAccessForPage();
  if (!admin?.permissions.length) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  const permissions = admin.permissions;
  const counts: Record<string, number> = {};
  await Promise.all([
    (async () => { if (adminModuleAllowed('releases', permissions)) counts.releases = await prisma.release.count({ where: { archivedAt: null, status: { in: ['SUBMITTED', 'IN_QC_QUEUE', 'RESUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'DELIVERY_FAILED'] } } }); })(),
    (async () => { if (adminModuleAllowed('delivery', permissions)) counts.delivery = await prisma.release.count({ where: { archivedAt: null, status: { in: ['DELIVERY_FAILED', 'DISTRIBUTOR_CHANGES_REQUIRED'] } } }); })(),
    (async () => { if (adminModuleAllowed('updates', permissions)) counts.updates = await prisma.releaseChangeRequest.count({ where: { status: { in: ['submitted', 'under_review', 'information_required', 'approved', 'processing_manually', 'submitted_to_partner', 'failed'] }, ...(permissions.includes('updates.review') && permissions.includes('takedowns.review') ? {} : permissions.includes('takedowns.review') ? { requestType: 'takedown' } : { requestType: { not: 'takedown' } }) } }); })(),
    (async () => { if (adminModuleAllowed('manual-catalogue', permissions)) counts['manual-catalogue'] = await prisma.release.count({ where: { archivedAt: null, releaseSource: 'ADMIN_MANUAL', ownerUserId: null } }); })(),
    (async () => { if (adminModuleAllowed('fraud', permissions)) counts.fraud = await prisma.fraudAlert.count({ where: { status: { in: ['new', 'investigating', 'open'] } } }); })()
  ]);
  return NextResponse.json({ counts }, { headers: { 'Cache-Control': 'private, no-store' } });
}
