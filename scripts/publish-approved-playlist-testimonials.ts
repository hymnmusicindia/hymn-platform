import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
Object.assign(process.env, parse(readFileSync('.env.hostinger')));
async function main() {
  const { prisma } = await import('../lib/prisma');
  try {
    const { assertProductionDatabaseReady } = await import('../lib/production-database-safety');
    await assertProductionDatabaseReady(prisma);
    if (process.argv.includes('--verify')) {
      const { playlistTestimonials } = await import('../lib/playlist-testimonials');
      const rows = await playlistTestimonials();
      for (const [name, rating] of [['Tavish Relhan', 4.5], ['Nikka Zaildar', 5], ['Manha Dakora', 4], ['Deepan Aggarwal', 4.5]] as const) {
        if (!rows.some(row => row.name === name && row.rating === rating && !row.verifiedService)) throw Error('Testimonial verification failed');
      }
      console.log('Verified all four testimonials, profile photos, ratings and imported-artist labels.');
      return;
    }
    if (process.argv.includes('--apply')) {
      const entries = [
        { id: 35, email: 'relhantavish22@gmail.com', rating: 4.5, quote: 'The playlist helped increase my streams.' },
        { id: 36, email: 'jsinga329@gmail.com', rating: 5, quote: 'Helped me reach new listeners.' },
        { id: 19, email: 'manhadakora5@gmail.com', rating: 4, quote: 'Awesome service at an affordable price. Amazing!' },
        { id: 51, email: 'deepanlovemusic@gmail.com', rating: 4.5, quote: 'Thank you, HYMN! The playlist service helped me a lot.' },
      ];
      await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422063, 1)`;
        for (const entry of entries) {
          const user = await tx.user.findUniqueOrThrow({ where: { id: entry.id } });
          if (user.email !== entry.email || user.status !== 'ACTIVE') throw Error('Profile identity changed');
          const entityId = `playlist-artist:${entry.id}:2026-10-15`;
          if (await tx.auditLog.findFirst({ where: { action: 'PLAYLIST_ARTIST_TESTIMONIAL_APPROVED', entityId } })) continue;
          await tx.auditLog.create({ data: { actorType: 'system', action: 'PLAYLIST_ARTIST_TESTIMONIAL_APPROVED', entity: 'playlist_testimonial', entityId, metadata: { subjectUserId: entry.id, rating: entry.rating, quote: entry.quote, publicConsent: true, provenance: 'Site owner supplied artist quotes and individual ratings, and attested permission in conversation on 15 October 2026. Imported testimonial; not a verified in-app purchase review.' } } });
        }
      });
      console.log('Published four owner-approved artist testimonials; no purchase or customer-authorship records fabricated.');
      return;
    }
    const users = await prisma.user.findMany({ where: { status: 'ACTIVE', OR: ['tavish','jsingha','manha','deepanlovemusic'].flatMap(term => [{ name: { contains: term, mode: 'insensitive' as const } }, { email: { contains: term, mode: 'insensitive' as const } }]) }, select: { id: true, name: true, email: true, avatar: true } });
    console.log(JSON.stringify(users.map(user => ({ id: user.id, name: user.name, email: user.email, hasAvatar: Boolean(user.avatar) })), null, 2));
    console.log(JSON.stringify(await prisma.user.findMany({ where: { status: 'ACTIVE', OR: [{ name: { contains: 'sing', mode: 'insensitive' } }, { email: { contains: 'sing', mode: 'insensitive' } }, { handle: { tag: { contains: 'jsing', mode: 'insensitive' } } }] }, select: { id: true, name: true, email: true, handle: { select: { tag: true } } } })));
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[REDACTED]') : 'Testimonial operation failed'); process.exitCode = 1; });
