import {exclusiveBeatEligible,exclusiveBeatRestriction} from "./beat-rights-policy";
import { beatBuyerDetailsSchema } from "./beat-buyer-details";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeBeatLicenseType } from "@/lib/beat-store";
import type { Order } from "@/lib/types";
import { BEAT_LICENCE_VERSION, beatUsageRights, licenceClauses } from './beat-licence-terms';

// Freeze only the identities and legal terms needed for this order alongside
// inventory reservations. Hydrate the remaining UI/file details after committing.
export async function persistCheckoutOrder(input: Omit<Order, "id" | "createdAt" | "buyerName" | "buyerEmail">) {
  const details=input.buyerDetails?beatBuyerDetailsSchema.parse(input.buyerDetails):null;
  return prisma.$transaction(async tx => {
    const beatIds = [...new Set(input.items.map(item => item.beatId))];
    await tx.beat.updateMany({ where: { id: { in: beatIds }, status: "EXCLUSIVE_RESERVED", exclusiveReservationExpiresAt: { lt: new Date() } }, data: { status: "PUBLISHED", exclusiveReservedByUserId: null, exclusiveReservationOrderId: null, exclusiveReservationExpiresAt: null } });
    const beats = await tx.beat.findMany({ where: { id: { in: beatIds }, enabled: true }, include: { producerParty:true,user:{select:{name:true}} } });
    const buyer = await tx.user.findUniqueOrThrow({where:{id:input.userId},include:{artistCards:{where:{archivedAt:null},orderBy:[{isPrimary:'desc'},{createdAt:'asc'}],take:1}}});
    if (beats.length !== beatIds.length) throw new Error("One or more selected beats are unavailable.");
    const sampleEvidence=await tx.storedAsset.findMany({where:{entityType:"BEAT",entityId:{in:beatIds.map(String)},category:"BEAT_SAMPLE_LICENSE",assetType:"private_ownership_proof",deletedAt:null,mimeType:"application/pdf"},select:{id:true,entityId:true,ownerUserId:true}});
    const now = new Date();
    const reservationExpiresAt = new Date(now.getTime() + 15 * 60 * 1000);
    for (const item of input.items) {
      const beat = beats.find((entry) => entry.id === item.beatId);
      if (!beat) throw new Error("One or more selected beats are unavailable.");
      if(beat.sampleDeclaration==="CONTAINS_UNCONTROLLED_SAMPLES")throw Error("Sample clearance must be resolved before purchase.");
      if(beat.sampleDeclaration==="LICENSED_SAMPLES"&&!sampleEvidence.some(a=>a.entityId===String(beat.id)&&a.ownerUserId===beat.userId))throw Error("The producer sample agreement is not ready. Please try again after review.");
      if (normalizeBeatLicenseType(item.licenseType) === "exclusive") {
        if(!exclusiveBeatEligible(beat))throw new Error(exclusiveBeatRestriction);
        const reserved = await tx.beat.updateMany({
          where: { id: beat.id, enabled: true, OR: [{ status: "PUBLISHED" }, { status: "EXCLUSIVE_RESERVED", exclusiveReservationExpiresAt: { lt: now } }] },
          data: { status: "EXCLUSIVE_RESERVED", exclusiveReservedByUserId: input.userId, exclusiveReservationOrderId: input.razorpayOrderId, exclusiveReservationExpiresAt: reservationExpiresAt }
        });
        if (reserved.count !== 1) throw new Error("This beat is no longer available for exclusive licensing.");
        await tx.auditLog.create({ data: { actorId: input.userId, actorRole: "customer", action: "BEAT_EXCLUSIVE_RESERVED", entity: "beat", entityId: String(beat.id), newValue: { status: "EXCLUSIVE_RESERVED", expiresAt: reservationExpiresAt }, metadata: { razorpayOrderId: input.razorpayOrderId } } });
      } else if (beat.status !== "PUBLISHED") {
        throw new Error("This beat is temporarily unavailable for licensing.");
      }
    }
    const order = await tx.checkoutOrder.create({
      data: {
        userId: input.userId,
        productId: input.productId ?? "beatstore",
        originalPrice: new Prisma.Decimal(input.originalPrice ?? input.amount),
        discountApplied: new Prisma.Decimal(input.discountApplied ?? 0),
        referralCreditsUsed: input.referralCreditsUsed ?? 0,
        finalAmount: new Prisma.Decimal(input.finalAmount ?? input.amount),
        couponCode: input.couponCode ?? null,
        razorpayOrderId: input.razorpayOrderId,
        paymentStatus: input.paymentStatus,
        currency: "INR",
        items: { create: input.items.map(item => {
          const beat=beats.find(b=>b.id===item.beatId)!;
          const type=normalizeBeatLicenseType(item.licenseType),exclusive=type==='exclusive';
          const producer=beat.producerParty?.professionalName||beat.user.name;
          const rights=exclusive?{commercialUse:true,exclusiveUse:true,copyrightAssigned:beat.exclusiveLegalMode==='RIGHTS_ASSIGNMENT',contentIdPolicy:beat.sampleDeclaration==='NO_UNCONTROLLED_SAMPLES'?'ALLOWED':'NOT_ALLOWED',includesWav:true,includesStems:true}:{...beatUsageRights(beat),includesMp3:type==='mp3',includesWav:type==='wav',includesStems:type==='stems'};
          return { beatId: item.beatId, licenseType: type, price: new Prisma.Decimal(item.price), licenseUrl: item.licenseUrl ?? null, licenseTermsSnapshot:{sampleEvidenceIds:sampleEvidence.filter(a=>a.entityId===String(beat.id)&&a.ownerUserId===beat.userId).map(a=>a.id),version:BEAT_LICENCE_VERSION,licenseType:type,legalMode:exclusive?beat.exclusiveLegalMode:'NON_EXCLUSIVE_LICENSE',beat:{id:beat.id,title:beat.title},buyer:{id:buyer.id,legalName:details?.legalName||buyer.name,artistName:details?.artistName||'',email:buyer.email,...(details?{phone:details.phone,acceptedTermsAt:now.toISOString()}: {})},producer:{partyId:beat.producerParty?.publicId??null,creditedName:producer,legalName:beat.producerParty?.legalName??null},purchaseDate:now.toISOString(),price:item.price,currency:'INR',existingGeneralLicenses:beat.generalLicensesSold,rights,clauses:licenceClauses(exclusive,producer,rights)} };
        }) }
      },
      select: { id: true }
    });
    return order.id;
  }, { maxWait: 5000, timeout: 20000 });
}
