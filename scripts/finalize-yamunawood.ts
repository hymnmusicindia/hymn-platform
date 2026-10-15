import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
Object.assign(process.env, parse(readFileSync('.env.hostinger')));
async function main() {
  const { prisma } = await import('../lib/prisma');
  try {
    const release = await prisma.release.findUniqueOrThrow({ where: { id: 81 }, select: { title: true, status: true, upc: true, direNoteStatus: true, direNoteLastSyncedAt: true, userId: true, tracks: { orderBy: { trackNumber: 'asc' }, select: { title: true, isrc: true } }, distributionSubmissions: { where: { isCurrent: true }, select: { id: true, state: true, upc: true, providerStatus: true } } } });
    console.log(JSON.stringify({ verified: release }, null, 2));
    if (release.upc !== '3473620319017' || release.status !== 'DISTRIBUTOR_PROCESSING' || release.distributionSubmissions.length !== 1 || release.distributionSubmissions[0].state !== 'submitted') throw Error('Reconciliation not complete');
    const { sendTransactionalEmail } = await import('../lib/email/send-transactional-email');
    const message = 'Hi Deepit,\n\nYAMUNAWOOD has been successfully delivered to DireNote and is now under review. HYMN has been updated, and future status updates will be synchronized from DireNote.\n\nAlbum UPC: 3473620319017\n\nWe will notify you when the review status changes.\n\nHYMN Music';
    console.log(JSON.stringify({ email: await sendTransactionalEmail({ to: 'deepitkamboj09@gmail.com', userId: release.userId, subject: 'YAMUNAWOOD has been delivered and is under review', template: 'release_dashboard_under_review', text: message, html: `<div style="font-family:Arial,sans-serif;white-space:pre-line">${message}</div>`, eventKey: 'direnote:dashboard:81:3473620319017:under-review-email' + (process.argv.includes('--smtp-retry') ? ':smtp-retry' : ''), entityType: 'release', entityId: 81 }) }));
    console.log(JSON.stringify({ artists: await prisma.artistCard.findMany({ where: { userId: release.userId }, select: { artistName: true, direNoteArtistId: true } }), notification: await prisma.notification.findUnique({ where: { eventKey: 'direnote:dashboard:81:3473620319017:under-review' }, select: { id: true, title: true } }) }, null, 2));
  } finally { await prisma.$disconnect(); }
}
main().catch(() => { console.error('Verification/notification failed; credentials omitted.'); process.exitCode = 1; });
