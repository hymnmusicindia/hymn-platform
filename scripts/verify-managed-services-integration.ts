import assert from "node:assert/strict";
import { createManagedServiceRequest, updateManagedServiceRequest } from "../lib/managed-services";
import { prisma } from "../lib/prisma";

async function main() {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({ data: { googleId: `service-user-${stamp}`, name: "Service User", email: `service-user-${stamp}@example.test` } });
  const other = await prisma.user.create({ data: { googleId: `service-other-${stamp}`, name: "Other User", email: `service-other-${stamp}@example.test` } });
  const admin = await prisma.user.create({ data: { googleId: `service-admin-${stamp}`, name: "Service Admin", email: `service-admin-${stamp}@example.test`, role: "ADMIN" } });
  const release = await prisma.release.create({ data: { userId: user.id, title: "Managed Service Fixture", artistName: user.name, genre: "Test", releaseDate: new Date(), releaseType: "single", tracks: { create: { title: "Fixture Track", primaryArtist: user.name, trackNumber: 1 } } }, include: { tracks: true } });
  const asset = await prisma.storedAsset.create({ data: { ownerUserId: user.id, releaseId: release.id, assetType: "private_ownership_proof", storageProvider: "fixture", objectKey: `fixture/${stamp}`, originalFilename: "rights.pdf", safeFilename: "rights.pdf", mimeType: "application/pdf", byteSize: 12, checksum: stamp, accessClassification: "private" } });
  const foreignAsset = await prisma.storedAsset.create({ data: { ownerUserId: other.id, releaseId: release.id, assetType: "private_ownership_proof", storageProvider: "fixture", objectKey: `fixture/foreign-${stamp}`, originalFilename: "foreign.pdf", safeFilename: "foreign.pdf", mimeType: "application/pdf", byteSize: 12, checksum: `foreign-${stamp}`, accessClassification: "private" } });
  const cidAnswers = { ownershipType: "master and composition", exclusiveRights: true, samplesOrLoops: false, widelyLicensedLoops: false, nonExclusiveBeat: false, beatLicenseType: "exclusive original", coverRecording: false, coverRightsConfirmed: false, publicDomain: false, sufficientOriginality: true, enrolledElsewhere: false, conflictingClaims: false, genericAudio: false, territory: "worldwide", excludedChannels: [] };
  await assert.rejects(() => createManagedServiceRequest({ userId: user.id, releaseId: release.id, serviceType: "YOUTUBE_CONTENT_ID", answers: cidAnswers, requestKey: `foreign-${stamp}`, documentAssetIds: [foreignAsset.id] }), /do not belong/);
  const request = await createManagedServiceRequest({ userId: user.id, releaseId: release.id, serviceType: "YOUTUBE_CONTENT_ID", answers: cidAnswers, requestKey: `cid-${stamp}`, declarations: { rightsAccuracyConfirmed: true }, documentAssetIds: [asset.id] });
  assert.equal(await prisma.managedServiceDocument.count({ where: { requestId: request.id, assetId: asset.id } }), 1);
  const duplicate = await createManagedServiceRequest({ userId: user.id, releaseId: release.id, serviceType: "YOUTUBE_CONTENT_ID", answers: cidAnswers, requestKey: `cid-${stamp}` }); assert.equal(duplicate.id, request.id);
  await assert.rejects(() => updateManagedServiceRequest({ id: request.id, status: "completed", userVisibleUpdate: "Done", actorId: admin.id }), /Illegal/);
  await updateManagedServiceRequest({ id: request.id, status: "eligibility_review", userVisibleUpdate: "Eligibility review started.", actorId: admin.id });
  await updateManagedServiceRequest({ id: request.id, status: "approved", userVisibleUpdate: "Eligibility evidence approved.", actorId: admin.id });
  await updateManagedServiceRequest({ id: request.id, status: "processing_manually", userVisibleUpdate: "HYMN is preparing the partner submission.", actorId: admin.id });
  await assert.rejects(() => updateManagedServiceRequest({ id: request.id, status: "submitted_to_partner", userVisibleUpdate: "Submitted.", actorId: admin.id }), /Partner reference/);
  await updateManagedServiceRequest({ id: request.id, status: "submitted_to_partner", userVisibleUpdate: "Submitted to the partner for review.", externalReference: `PARTNER-${stamp}`, actorId: admin.id, providerStatuses: [{ provider: "YouTube", status: "submitted", reference: `PARTNER-${stamp}` }] });
  const completed = await updateManagedServiceRequest({ id: request.id, status: "completed", userVisibleUpdate: "Partner confirmed completion.", externalReference: `PARTNER-${stamp}`, actorId: admin.id }); assert.equal(completed.status, "completed");
  assert.equal(await prisma.auditLog.count({ where: { entity: "managed_service_request", entityId: String(request.id) } }), 6);
  assert.equal(await prisma.managedServiceProviderStatus.count({ where: { requestId: request.id, provider: "YouTube", status: "submitted" } }), 1);
  const crbt = await createManagedServiceRequest({ userId: user.id, releaseId: release.id, trackId: release.tracks[0].id, serviceType: "CRBT_CALLER_TUNE", provider: "Airtel", requestKey: `crbt-${stamp}`, answers: { telecomProviders: ["Airtel", "Jio"], startPointSeconds: 15, language: "Hindi", releaseStatus: "released", isrc: "INS182600001", upc: "8901234567890", rightsConfirmed: true, desiredCallerTuneTitle: "Fixture Track", existingProviderReferences: [] } });
  const oac = await createManagedServiceRequest({ userId: user.id, releaseId: release.id, serviceType: "YOUTUBE_OAC", requestKey: `oac-${stamp}`, answers: { artistName: user.name, artistChannelUrl: "https://www.youtube.com/@fixtureartist", topicChannelUrl: "", distributedReleaseLinks: ["https://music.youtube.com/watch?v=fixture"], channelOwnershipConfirmed: true, existingOacStatus: "not requested", supportingEvidence: "Artist controls the channel." } });
  await updateManagedServiceRequest({ id: crbt.id, status: "eligibility_review", userVisibleUpdate: "Review started.", actorId: admin.id });
  await updateManagedServiceRequest({ id: crbt.id, status: "information_required", userVisibleUpdate: "Provide the telecom availability screenshot.", actorId: admin.id });
  await updateManagedServiceRequest({ id: crbt.id, status: "eligibility_review", userVisibleUpdate: "Additional evidence received.", actorId: admin.id });
  await updateManagedServiceRequest({ id: crbt.id, status: "rejected", userVisibleUpdate: "The selected provider does not currently accept this catalogue.", actorId: admin.id });
  await updateManagedServiceRequest({ id: oac.id, status: "eligibility_review", userVisibleUpdate: "Channel review started.", actorId: admin.id });
  await updateManagedServiceRequest({ id: oac.id, status: "approved", userVisibleUpdate: "Channel evidence approved.", actorId: admin.id });
  await updateManagedServiceRequest({ id: oac.id, status: "processing_manually", userVisibleUpdate: "HYMN is preparing the manual partner request.", actorId: admin.id });
  await updateManagedServiceRequest({ id: oac.id, status: "failed", userVisibleUpdate: "Partner submission is temporarily unavailable.", actorId: admin.id });
  assert.equal(crbt.serviceType, "CRBT_CALLER_TUNE"); assert.equal(oac.serviceType, "YOUTUBE_OAC");
  console.log("Managed-service ownership, detailed CRBT/OAC/Content-ID eligibility, private documents, idempotent retry, provider status, legal workflow, and partner-reference verification passed.");
}
main().finally(() => prisma.$disconnect());
// vercel trigger 9
