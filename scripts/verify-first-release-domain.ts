import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { getFirstReleaseEligibility, reserveFirstRelease, releaseFirstReleaseReservation } from "../lib/first-release-promotion";
import jwt from "jsonwebtoken";

export async function verifyFirstReleaseDomain() {
  assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/fixture:fixture@127\.0\.0\.1:55439\//);
  const offer = await prisma.promotion.findUniqueOrThrow({ where: { code: "FIRST_RELEASE_FREE" } });
  const accounts = await Promise.all(["left", "right"].map(name => prisma.user.create({ data: { googleId: `offer-cap-${name}`, name, email: `offer-cap-${name}@example.test`, role: "CUSTOMER", status: "ACTIVE" } })));
  const quote = { originalAmount: 99, discountAmount: 99, finalAmount: 0 };
  try {
    const existing = await prisma.promotionRedemption.count({ where: { promotionId: offer.id } });
    await prisma.promotion.update({ where: { id: offer.id }, data: { maxRedemptions: existing + 1 } });
    const reservations = await Promise.allSettled(accounts.map(account => reserveFirstRelease({ userId: account.id, ...quote })));
    assert.equal(reservations.filter(result => result.status === "fulfilled").length, 1, "A campaign with one remaining place cannot reserve it twice.");
    await prisma.promotionRedemption.deleteMany({ where: { userId: { in: accounts.map(account => account.id) } } });
    await prisma.promotion.update({ where: { id: offer.id }, data: { maxRedemptions: null } });
    const reservation = await reserveFirstRelease({ userId: accounts[0].id, ...quote });
    assert.equal((await getFirstReleaseEligibility(accounts[0].id)).reason, "reserved");
    await prisma.promotionRedemption.update({ where: { id: reservation.id }, data: { updatedAt: new Date(Date.now() - 31 * 60_000) } });
    assert.equal((await getFirstReleaseEligibility(accounts[0].id)).eligible, true);
    const recovered = await reserveFirstRelease({ userId: accounts[0].id, ...quote });
    assert.notEqual(recovered.id, reservation.id);
    await releaseFirstReleaseReservation(recovered.id);
    await prisma.release.create({ data: { userId: accounts[0].id, title: "Deleted unfinished draft", artistName: "Fixture", genre: "Pop", releaseType: "single", releaseDate: new Date(), status: "ARCHIVED", paymentStatus: "pending", archivedAt: new Date(), metadata: {} } });
    assert.equal((await getFirstReleaseEligibility(accounts[0].id)).eligible, true, "Deleting an unfinished draft does not consume the offer.");
    await prisma.release.create({ data: { userId: accounts[1].id, title: "Reopened submitted release", artistName: "Fixture", genre: "Pop", releaseType: "single", releaseDate: new Date(), status: "DRAFT", paymentStatus: "paid", metadata: { submittedAt: new Date().toISOString() } } });
    assert.equal((await getFirstReleaseEligibility(accounts[1].id)).reason, "release_already_submitted", "Reopening a submitted paid release cannot reset first-release eligibility.");
    const eligibilityResponse = await fetch("http://127.0.0.1:55441/api/promotions/first-release", { headers: { "x-forwarded-proto": "https", Cookie: `hymn_session=${jwt.sign({ sub: accounts[1].id, email: accounts[1].email, name: accounts[1].name, role: "customer" }, process.env.JWT_SECRET!, { expiresIn: "1h" })}` } });
    assert.equal((await eligibilityResponse.json()).reason, "release_already_submitted");
    await prisma.promotion.update({ where: { id: offer.id }, data: { active: false } });
    assert.equal((await getFirstReleaseEligibility(accounts[0].id)).reason, "promotion_inactive");
    await assert.rejects(reserveFirstRelease({ userId: accounts[0].id, ...quote }), /not available/);
    console.log("First-release database tests passed: cross-account capacity race, stale reservation recovery, abandoned draft eligibility and campaign deactivation.");
  } finally {
    await prisma.promotion.update({ where: { id: offer.id }, data: { active: offer.active, maxRedemptions: offer.maxRedemptions } });
  }
}
