import 'server-only';
import { Prisma } from '@prisma/client';
import { appointStudioEngineer } from './admin-studio-engineers';
import { engineerSlug } from './engineer-applications';
import { portfolioDaws } from './engineer-daws';

/** A pending decision and its business changes commit together. Callers own authorisation. */
export async function reviewCreatorApplication(tx: Prisma.TransactionClient, input: { kind: 'producer' | 'engineer'; id: number; decision: 'APPROVE' | 'REJECT'; note: string; actorId: number; expectedUpdatedAt: Date; requestId: string }) {
  const { kind, id, actorId, note, decision } = input;
  const table = kind === 'producer' ? Prisma.sql`producer_applications` : Prisma.sql`engineer_applications`;
  await tx.$queryRaw(Prisma.sql`SELECT id FROM ${table} WHERE id = ${id} FOR UPDATE`);
  const application = kind === 'producer'
    ? await tx.producerApplication.findUnique({ where: { id }, include: { user: true } })
    : await tx.engineerApplication.findUnique({ where: { id }, include: { user: true } });
  if (!application) throw Error('Application not found.');
  if (application.userId === actorId) throw Error('You cannot review your own application.');
  if (application.status !== 'PENDING' || application.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) throw Error('This application changed or was already reviewed. Refresh before deciding.');
  if (application.user.status !== 'ACTIVE') throw Error('The applicant account is not active.');
  const approved = decision === 'APPROVE', status = approved ? 'APPROVED' : 'REJECTED';
  let profileId: number | null = null;
  if (kind === 'producer') {
    // A producer application never demotes an existing platform administrator.
    if (approved && application.user.role !== 'ADMIN') await tx.user.update({ where: { id: application.userId }, data: { role: 'PRODUCER', onboardingDone: true } });
    await tx.producerApplication.update({ where: { id }, data: { status, internalNotes: note, reviewedAt: new Date(), reviewedById: actorId } });
  } else {
    const engineer = await tx.engineerApplication.findUniqueOrThrow({ where: { id } });
    if (approved) {
      const extras = engineer.profileExtras as { photo?: string; banner?: string; works?: { title: string; url: string; role?: string }[] } | null;
      const existing = await tx.engineerProfile.findFirst({ where: { contributorParty: { claimedByUserId: engineer.userId } }, select: { id: true } });
      const profile = existing ?? await appointStudioEngineer({
        userId: engineer.userId, professionalName: engineer.professionalName, slug: engineerSlug(engineer.professionalName, engineer.userId), profilePhotoUrl: extras?.photo || application.user.avatar, bio: engineer.bio, specialties: engineer.specialties, genres: engineer.genres,
        socialLinks: { instagram: engineer.instagramUrl, youtube: null }, portfolioItems: extras?.works?.length ? extras.works : [{ title: 'Featured work', url: engineer.portfolioUrl }], availability: 'AVAILABLE', maxActiveOrders: 3, verificationState: 'VERIFIED', sellerState: 'ACTIVE', payoutState: 'NOT_CONFIGURED',
        listing: { title: `${engineer.professionalName} · Mix & Master`, description: engineer.bio, standardPrice: Number(engineer.startingPrice), beatCustomerPrice: null, includedRevisions: 2, additionalRevisionPrice: 399, turnaroundDays: engineer.turnaroundDays, sourceRequirements: ['Consolidated stems or multitracks', 'Rough reference mix', 'Tempo and sample rate'], deliverables: ['24-bit WAV master', '320 kbps MP3'], instantAccept: false, active: true, paused: false },
      }, actorId, input.requestId, tx);
      profileId = profile.id;
      // Preserve an existing public profile: this decision is not permission to overwrite it.
      if (!existing) await tx.engineerProfile.update({ where: { id: profile.id }, data: { portfolio: { socials: { instagram: engineer.instagramUrl }, works: extras?.works?.length ? extras.works : [{ title: 'Featured work', url: engineer.portfolioUrl }], banner: extras?.banner || '', daws: portfolioDaws(extras) } } });
    }
    await tx.engineerApplication.update({ where: { id }, data: { status, reviewNote: note, reviewedAt: new Date(), reviewedById: actorId } });
  }
  const href = kind === 'producer' ? approved ? '/producer/dashboard' : '/producer-onboarding' : approved ? '/studio/engineer' : '/studio/apply';
  const title = approved ? kind === 'producer' ? 'Your HYMN producer access is approved' : 'Welcome to HYMN Studio' : `Your ${kind} application needs an update`;
  const body = approved ? kind === 'producer' ? 'Your producer dashboard is unlocked. Read your review notes and prepare your beat listings.' : 'Your engineer application is approved. Open your workspace to review your profile and service listing.' : note;
  const eventKey = `creator-application:${kind}:${id}:${input.expectedUpdatedAt.toISOString()}:${status}`;
  await tx.notification.upsert({ where: { eventKey }, create: { userId: application.userId, title, body, href, actionLabel: approved ? 'Open workspace' : 'Review application', eventKey, metadata: { reviewNote: note } }, update: {} });
  await tx.auditLog.create({ data: { actorId, action: `${kind.toUpperCase()}_APPLICATION_${status}`, entity: `${kind}_applications`, entityId: String(id), metadata: { reviewNote: note }, requestId: input.requestId } });
  return { status, profileId, email: { userId: application.userId, to: application.user.email, name: application.user.name, title, body: `${body}\n\nReview notes: ${note}`, href, eventKey: `${eventKey}:email` } };
}
