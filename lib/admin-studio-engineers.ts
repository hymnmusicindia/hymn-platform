import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const csvList = z.array(z.string().trim().min(1).max(80)).min(1).max(20);

export const studioEngineerInputSchema = z.object({
  userId: z.number().int().positive(),
  professionalName: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens only."),
  profilePhotoUrl: z.string().trim().max(1000).nullable().optional(),
  bio: z.string().trim().min(20).max(2000),
  specialties: csvList,
  genres: csvList,
  availability: z.enum(["AVAILABLE", "UNAVAILABLE"]),
  maxActiveOrders: z.number().int().min(1).max(50),
  verificationState: z.enum(["UNVERIFIED", "VERIFIED"]),
  sellerState: z.enum(["ACTIVE", "PAUSED"]),
  payoutState: z.enum(["NOT_CONFIGURED", "PENDING", "READY"]),
  listing: z.object({
    title: z.string().trim().min(3).max(160),
    description: z.string().trim().min(20).max(2000),
    standardPrice: z.number().finite().min(0).max(1_000_000),
    beatCustomerPrice: z.number().finite().min(0).max(1_000_000).nullable(),
    includedRevisions: z.number().int().min(0).max(20),
    additionalRevisionPrice: z.number().finite().min(0).max(1_000_000),
    turnaroundDays: z.number().int().min(1).max(90),
    sourceRequirements: csvList,
    deliverables: csvList,
    instantAccept: z.boolean(),
    active: z.boolean(),
    paused: z.boolean(),
  }).refine(value => value.beatCustomerPrice === null || value.beatCustomerPrice <= value.standardPrice, {
    message: "Beat-customer price cannot exceed the standard price.",
    path: ["beatCustomerPrice"],
  }),
}).superRefine((value, context) => {
  if (value.listing.active && !value.listing.paused && (value.verificationState !== "VERIFIED" || value.sellerState !== "ACTIVE" || value.availability !== "AVAILABLE")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["listing", "active"], message: "A live listing requires a verified, active, and available engineer." });
  }
});

export type StudioEngineerInput = z.infer<typeof studioEngineerInputSchema>;

const snapshot = (input: StudioEngineerInput) => ({
  userId: input.userId,
  professionalName: input.professionalName,
  slug: input.slug,
  availability: input.availability,
  verificationState: input.verificationState,
  sellerState: input.sellerState,
  payoutState: input.payoutState,
  listingActive: input.listing.active,
  listingPaused: input.listing.paused,
  standardPrice: input.listing.standardPrice,
  beatCustomerPrice: input.listing.beatCustomerPrice,
});

export async function appointStudioEngineer(input: StudioEngineerInput, actorId: number | null, requestId: string) {
  return prisma.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { id: input.userId }, select: { id: true, name: true, status: true } });
    if (!user) throw new Error("Selected user does not exist.");
    if (user.status !== "ACTIVE") throw new Error("Only an active user can be appointed as an engineer.");

    let party = await tx.contributorParty.findUnique({ where: { claimedByUserId: user.id }, include: { engineerProfile: true } });
    if (party?.engineerProfile) throw new Error("This user already has an engineer profile. Edit the existing profile instead.");
    if (!party) {
      party = await tx.contributorParty.create({
        data: {
          publicId: crypto.randomUUID(),
          professionalName: input.professionalName,
          displayName: input.professionalName,
          claimedByUserId: user.id,
          createdByUserId: actorId,
          identityState: "CLAIMED",
        },
        include: { engineerProfile: true },
      });
    } else if (party.mergedIntoId) {
      throw new Error("The selected user’s contributor identity has been merged and cannot receive an engineer profile.");
    }

    const profile = await tx.engineerProfile.create({
      data: {
        contributorPartyId: party.id,
        slug: input.slug,
        professionalName: input.professionalName,
        profilePhotoUrl: input.profilePhotoUrl || null,
        bio: input.bio,
        specialties: input.specialties,
        genres: input.genres,
        availability: input.availability,
        maxActiveOrders: input.maxActiveOrders,
        verificationState: input.verificationState,
        sellerState: input.sellerState,
        payoutState: input.payoutState,
        listings: { create: {
          title: input.listing.title,
          description: input.listing.description,
          standardPrice: input.listing.standardPrice,
          beatCustomerPrice: input.listing.beatCustomerPrice,
          includedRevisions: input.listing.includedRevisions,
          additionalRevisionPrice: input.listing.additionalRevisionPrice,
          turnaroundDays: input.listing.turnaroundDays,
          acceptedGenres: input.genres,
          sourceRequirements: { required: input.listing.sourceRequirements } as Prisma.InputJsonObject,
          deliverables: { files: input.listing.deliverables } as Prisma.InputJsonObject,
          instantAccept: input.listing.instantAccept,
          active: input.listing.active,
          paused: input.listing.paused,
        } },
      },
      include: { listings: true },
    });

    await tx.contributorParty.update({ where: { id: party.id }, data: { professionalName: input.professionalName, displayName: input.professionalName } });
    await tx.notification.upsert({
      where: { eventKey: `studio:engineer-appointed:${profile.id}` },
      create: { userId: user.id, title: "Your Studio engineer workspace is ready", body: "HYMN operations appointed you as a Studio engineer.", href: "/studio/engineer", actionLabel: "Open workspace", eventKey: `studio:engineer-appointed:${profile.id}` },
      update: {},
    });
    await tx.auditLog.create({ data: { actorId, actorType: "admin", actorRole: "services_manager", action: "STUDIO_ENGINEER_APPOINTED", entity: "engineer_profile", entityId: String(profile.id), requestId, newValue: snapshot(input) } });
    return profile;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 10_000 });
}

export async function updateStudioEngineer(profileId: number, input: StudioEngineerInput, actorId: number | null, requestId: string) {
  return prisma.$transaction(async tx => {
    const current = await tx.engineerProfile.findUnique({ where: { id: profileId }, include: { contributorParty: true, listings: { orderBy: { createdAt: "asc" } } } });
    if (!current) throw new Error("Engineer profile not found.");
    if (current.contributorParty.claimedByUserId !== input.userId) throw new Error("An engineer profile cannot be reassigned to another user.");
    const primaryListing = current.listings[0];
    if (!primaryListing) throw new Error("Engineer service listing is missing.");

    const profile = await tx.engineerProfile.update({
      where: { id: profileId },
      data: {
        slug: input.slug,
        professionalName: input.professionalName,
        profilePhotoUrl: input.profilePhotoUrl || null,
        bio: input.bio,
        specialties: input.specialties,
        genres: input.genres,
        availability: input.availability,
        maxActiveOrders: input.maxActiveOrders,
        verificationState: input.verificationState,
        sellerState: input.sellerState,
        payoutState: input.payoutState,
      },
    });
    await tx.contributorParty.update({ where: { id: current.contributorPartyId }, data: { professionalName: input.professionalName, displayName: input.professionalName } });
    await tx.studioServiceListing.update({ where: { id: primaryListing.id }, data: {
      title: input.listing.title,
      description: input.listing.description,
      standardPrice: input.listing.standardPrice,
      beatCustomerPrice: input.listing.beatCustomerPrice,
      includedRevisions: input.listing.includedRevisions,
      additionalRevisionPrice: input.listing.additionalRevisionPrice,
      turnaroundDays: input.listing.turnaroundDays,
      acceptedGenres: input.genres,
      sourceRequirements: { required: input.listing.sourceRequirements } as Prisma.InputJsonObject,
      deliverables: { files: input.listing.deliverables } as Prisma.InputJsonObject,
      instantAccept: input.listing.instantAccept,
      active: input.listing.active,
      paused: input.listing.paused,
    } });
    await tx.auditLog.create({ data: { actorId, actorType: "admin", actorRole: "services_manager", action: "STUDIO_ENGINEER_UPDATED", entity: "engineer_profile", entityId: String(profile.id), requestId, previousValue: { professionalName: current.professionalName, slug: current.slug, availability: current.availability, verificationState: current.verificationState, sellerState: current.sellerState, listingActive: primaryListing.active, listingPaused: primaryListing.paused }, newValue: snapshot(input) } });
    return profile;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 10_000 });
}
