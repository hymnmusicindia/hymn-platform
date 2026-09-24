import { PrismaClient } from "@prisma/client";
import { sampleBeats } from "../lib/site";
import { syncProducerProfiles } from "../lib/db";

const prisma = new PrismaClient();

const defaultCoupons = [
  {
    id: 1,
    code: "HYMN20",
    discountType: "percentage" as const,
    discountValue: 20,
    perUserLimit: 1,
    active: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 2,
    code: "WELCOME10",
    discountType: "percentage" as const,
    discountValue: 10,
    perUserLimit: 1,
    active: true,
    createdAt: new Date().toISOString()
  }
];

const defaultProducerProfiles: any[] = [];

async function main() {
  console.log("Starting DB seed...");

  // We need an admin user to own generic beats
  let adminUser = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!adminUser) {
    adminUser = await prisma.user.findFirst();
  }

  if (!adminUser) {
    console.error("No users found. Please sign up at least one user before seeding.");
    process.exit(1);
  }

  // Seed Coupons (Idempotent using Upsert)
  for (const c of defaultCoupons) {
    await prisma.coupon.upsert({
      where: { code: c.code },
      update: {}, // Don't overwrite if it exists
      create: {
        code: c.code,
        discountPercentage: c.discountValue,
        maxUses: null,
        active: c.active,
        expiresAt: null,
        createdAt: new Date(c.createdAt)
      }
    });
  }
  console.log("Seeded Coupons.");

  // Seed Producer Profiles (Idempotent)
  for (const p of defaultProducerProfiles) {
    let pUser = await prisma.user.findUnique({ where: { googleId: `dummy-${p.slug}` } });
    if (!pUser) {
      pUser = await prisma.user.create({
        data: {
          googleId: `dummy-${p.slug}`,
          name: p.name,
          email: `${p.slug}@example.com`,
          role: "PRODUCER",
          onboardingDone: true
        }
      });
    }

    await prisma.producerProfile.upsert({
      where: { slug: p.slug },
      update: {}, // Preserve any manual changes
      create: {
        userId: pUser.id,
        slug: p.slug,
        displayName: p.name,
        bio: p.description,
        specialty: p.specialty,
        active: p.active,
        sortOrder: p.sortOrder,
        createdAt: new Date(p.createdAt),
        updatedAt: new Date(p.updatedAt)
      }
    });
  }
  console.log("Seeded Producer Profiles.");

  // Seed Beats (Idempotent by checking if they exist already based on title/producerId combo)
  for (const b of sampleBeats) {
    const existingBeat = await prisma.beat.findFirst({
      where: {
        title: b.title,
        userId: adminUser.id
      }
    });

    if (!existingBeat) {
      const audioUpload = await prisma.upload.create({
        data: {
          userId: adminUser.id,
          kind: "AUDIO",
          storageKey: `seeds/${b.id}-audio`,
          fileName: "audio.mp3",
          mimeType: "audio/mpeg",
          sizeBytes: 1000,
          publicUrl: b.audioPreviewUrl
        }
      });
      const artworkUpload = b.artworkUrl ? await prisma.upload.create({
        data: {
          userId: adminUser.id,
          kind: "ARTWORK",
          storageKey: `seeds/${b.id}-artwork`,
          fileName: "artwork.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 1000,
          publicUrl: b.artworkUrl
        }
      }) : null;

      await prisma.beat.create({
        data: {
          userId: adminUser.id,
          title: b.title,
          bpm: b.bpm,
          genre: b.genre,
          mood: b.mood,
          keySignature: "C Minor", // Default fallback
          priceCents: b.price * 100, // Price is in dollars in sampleBeats
          enabled: true,
          audioUploadId: audioUpload.id,
          artworkUploadId: artworkUpload ? artworkUpload.id : null,
          createdAt: new Date()
        }
      });
    }
  }
  console.log("Seeded Beats.");

  // Synchronize existing producers who lack a profile
  const syncedCount = await syncProducerProfiles();
  if (syncedCount > 0) {
    console.log(`Synchronized ${syncedCount} existing PRODUCER users without profiles.`);
  }

  // Real, configurable Studio supply. Ratings and completed-order counts remain
  // empty until actual marketplace activity creates them.
  const studioParty = await prisma.contributorParty.upsert({
    where: { claimedByUserId: adminUser.id },
    create: { publicId: "HYM_STUDIO_ENGINEER_PRIMARY", professionalName: adminUser.name, displayName: adminUser.name, claimedByUserId: adminUser.id, createdByUserId: adminUser.id, identityState: "CLAIMED" },
    update: {},
  });
  const engineer = await prisma.engineerProfile.upsert({
    where: { contributorPartyId: studioParty.id },
    create: { contributorPartyId: studioParty.id, slug: "hymn-studio-engineer", professionalName: studioParty.professionalName, bio: "A HYMN Studio engineer focused on clear vocals, musical low end, and streaming-ready masters.", specialties: ["Mixing", "Mastering", "Vocal production"], genres: ["Hip-Hop", "Trap", "R&B", "Pop"], availability: "AVAILABLE", maxActiveOrders: 3, verificationState: "VERIFIED", sellerState: "ACTIVE" },
    update: {},
  });
  await prisma.studioServiceListing.upsert({
    where: { publicId: "00000000-0000-4000-8000-000000000101" },
    create: { publicId: "00000000-0000-4000-8000-000000000101", engineerProfileId: engineer.id, title: "Professional Mixing & Mastering", description: "A complete mix and master for one song, including vocal balance, dynamics, spatial processing, tonal correction, and a release-ready master.", standardPrice: 1999, beatCustomerPrice: 1499, includedRevisions: 2, additionalRevisionPrice: 399, turnaroundDays: 5, acceptedGenres: ["Hip-Hop", "Trap", "R&B", "Pop"], sourceRequirements: { required: ["Consolidated stems or multitracks", "Rough reference mix", "Tempo and sample rate"], preferred: ["24-bit WAV files", "Dry and wet vocal references"] }, deliverables: { files: ["24-bit WAV master", "320 kbps MP3", "Instrumental when applicable"] }, instantAccept: false, active: true, paused: false },
    update: {},
  });
  console.log("Seeded Studio engineer and Mixing & Mastering listing.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
