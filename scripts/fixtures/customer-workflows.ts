import { prisma } from '../../lib/prisma';

export async function seedCustomerWorkflows(customerId: number, beatId: number, engineerId: number, draftId: number) {
  if (process.env.DATABASE_URL !== 'postgresql://fixture:fixture@127.0.0.1:55481/customer_fixture') throw Error('Local customer fixture required.');
  const listing = await prisma.studioServiceListing.findFirstOrThrow({ where: { engineerProfileId: engineerId }, include: { engineerProfile: true } });
  const beat = await prisma.beat.findUniqueOrThrow({ where: { id: beatId }, select: { userId: true } });
  const preview = await prisma.upload.create({ data: { userId: beat.userId, kind: 'SAMPLE', storageKey: 'customer-fixture-preview.wav', fileName: 'preview.wav', mimeType: 'audio/wav', sizeBytes: 2116844, publicUrl: 'https://media.audit.fixture.invalid/preview.wav' } });
  await prisma.beat.update({ where: { id: beatId }, data: { previewUploadId: preview.id } });
  const checkout = await prisma.checkoutOrder.create({ data: { userId: customerId, originalPrice: 1500, finalAmount: 1500, razorpayOrderId: 'order_customer_fixture', paymentStatus: 'paid', fulfilledAt: new Date(), items: { create: { beatId, licenseType: 'wav', price: 1500 } } }, include: { items: true } });
  const purchase = await prisma.beatPurchase.create({ data: { userId: customerId, beatId, licenseType: 'wav', checkoutOrderItemId: checkout.items[0].id, hasAccess: true, releaseId: draftId, licenseTermsSnapshot: { version: '2026-10-05', licenseType: 'wav', price: 1500, currency: 'INR', buyer: { legalName: 'Customer Audit Artist', artistName: 'Customer Audit Artist' }, producer: { creditedName: 'Audit Producer' }, beat: { title: 'Midnight Drive' }, rights: { includesWav: true, commercialUse: true, monetizationAllowed: true, creditRequired: true, contentIdPolicy: 'NOT_ALLOWED' } } } });
  const order = await prisma.studioServiceOrder.create({ data: { customerId, engineerPartyId: listing.engineerProfile.contributorPartyId, engineerProfileId: engineerId, serviceListingId: listing.id, serviceType: 'MIX_MASTER', projectTitle: 'Midnight Sessions Mix', basePrice: 1999, finalPrice: 1999, includedRevisions: 2, additionalRevisionPrice: 399, turnaroundDays: 4, commissionRate: .2, engineerShareRate: .8, status: 'IN_PROGRESS', paymentStatus: 'PAID', termsVersion: 'customer-fixture', termsAcceptedAt: new Date() } });
  return { purchaseId: purchase.id, studioOrderPublicId: order.publicId, listingPublicId: listing.publicId };
}
