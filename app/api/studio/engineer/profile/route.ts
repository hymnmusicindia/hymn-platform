import { NextResponse } from "next/server";
import { requireStudioUser as requireUser } from "@/lib/studio-access";
import { prisma } from "@/lib/prisma";
import { studioError } from "@/lib/studio-errors";
import { studioProfileSchema } from "@/lib/studio-profile";

export async function PATCH(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  try {
    const { banner, instagram, youtube, works, experience, daws, ...fields } = studioProfileSchema.parse(await request.json());
    const portfolioPatch = { banner, ...(daws !== undefined ? { daws } : {}), ...(works !== undefined ? { works } : {}), ...(experience !== undefined ? { experience } : {}) };
    const profile = await prisma.engineerProfile.findFirst({ where: { contributorParty: { claimedByUserId: auth.user.id }, sellerState: "ACTIVE" }, select: { id: true } });
    if (!profile) return NextResponse.json({ error: "An active approved engineer profile is required." }, { status: 403 });
    // Merge only editable portfolio keys atomically so other profile settings survive.
    const changed = await prisma.$executeRaw`
      UPDATE engineer_profiles SET professional_name=${fields.professionalName}, bio=${fields.bio},
      profile_photo_url=${fields.profilePhotoUrl || null}, specialties=${fields.specialties}::text[], genres=${fields.genres}::text[],
      portfolio=(CASE WHEN jsonb_typeof(portfolio)='array' THEN jsonb_build_object('works', portfolio) ELSE COALESCE(portfolio, '{}'::jsonb) END) || ${JSON.stringify(portfolioPatch)}::jsonb || jsonb_build_object('socials',
        COALESCE(portfolio->'socials', '{}'::jsonb) || jsonb_build_object('instagram', ${instagram}::text, 'youtube', ${youtube}::text)),
      updated_at=NOW()
      WHERE id=${profile.id} AND seller_state='ACTIVE' AND contributor_party_id IN
        (SELECT id FROM contributor_parties WHERE claimed_by_user_id=${auth.user.id})`;
    if (!changed) return NextResponse.json({ error: "Your engineer profile is no longer available for editing." }, { status: 403 });
    return NextResponse.json({ success: true });
  } catch (error) { return NextResponse.json({ error: studioError(error) }, { status: 400 }); }
}
