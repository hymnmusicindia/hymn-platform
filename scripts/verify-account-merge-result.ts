import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { createDecipheriv, createHash } from "node:crypto";
import assert from "node:assert/strict";
Object.assign(process.env, parse(readFileSync(".env.hostinger")));
async function main() {
  const file = process.argv[process.argv.indexOf("--backup") + 1]; assert.ok(file && file.endsWith(".enc"));
  const bytes = readFileSync(file); const header = Buffer.from("HYMN-MERGE-V1\n"); assert.ok(bytes.subarray(0, header.length).equals(header));
  const secret = process.env.ACCOUNT_MERGE_BACKUP_KEY || process.env.PAYOUT_ENCRYPTION_KEY || process.env.JWT_SECRET; assert.ok(secret);
  const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), bytes.subarray(header.length, header.length + 12));
  decipher.setAuthTag(bytes.subarray(header.length + 12, header.length + 28));
  const snapshot = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(header.length + 28)), decipher.final()]).toString());
  const { PrismaClient } = await import("@prisma/client"); const db = new PrismaClient();
  const { assertProductionDatabaseReady } = await import("../lib/production-database-safety"); await assertProductionDatabaseReady(db);
  const quote = (s: string) => '"' + s.replaceAll('"', '""') + '"';
  try {
    const source = await db.user.findUniqueOrThrow({ where: { id: snapshot.source.id } }); const target = await db.user.findUniqueOrThrow({ where: { id: snapshot.target.id } });
    assert.equal(source.status, "BANNED"); assert.equal(source.statusReason, "ACCOUNT_MERGED"); assert.equal(source.name, "Merged account"); assert.equal(source.passwordHash, null); assert.equal(source.mobile, null); assert.equal(source.dateOfBirth, null); assert.equal(source.referralCredits, 0);
    assert.equal(target.email, snapshot.target.email); assert.equal(target.googleId, snapshot.target.googleId); assert.equal(target.status, "ACTIVE"); assert.equal(target.referralCredits, snapshot.source.referralCredits + snapshot.target.referralCredits);
    assert.equal(target.passwordHash, snapshot.target.passwordHash || snapshot.source.passwordHash);
    for (const row of snapshot.summary.references) if (row.table_name !== "audit_logs") {
      const [count] = await db.$queryRawUnsafe<Array<{ count: number }>>(`SELECT count(*)::int AS count FROM ${quote(row.table_name)} WHERE ${quote(row.column_name)}=$1`, source.id); assert.equal(count.count, 0, `Remaining source ownership: ${row.table_name}.${row.column_name}`);
    }
    const [subscription] = await db.$queryRaw<Array<{ data: Record<string, unknown> }>>`SELECT to_jsonb(s) AS data FROM subscriptions s WHERE user_id=${target.id}`;
    assert.deepEqual(subscription.data, { ...snapshot["subscriptions.user_id"][0].data, user_id: target.id });
    const originalSessions = snapshot["sessions.user_id"].map((row: { data: { id: number } }) => row.data.id);
    assert.equal(await db.session.count({ where: { id: { in: originalSessions }, revokedAt: null } }), 0);
    const assets = await db.storedAsset.findMany({ where: { ownerUserId: target.id } });
    for (const row of snapshot["stored_assets.owner_user_id"]) { const asset = assets.find(asset => asset.id === row.data.id); assert.ok(asset); assert.equal(asset.objectKey, row.data.object_key); assert.equal(asset.checksum, row.data.checksum); assert.equal(asset.byteSize, row.data.byte_size); }
    const releases = await db.release.findMany({ where: { userId: target.id }, select: { id: true, title: true, upc: true, status: true } });
    for (const row of snapshot["releases.user_id"]) { const release = releases.find(release => release.id === row.data.id); assert.ok(release); assert.equal(release.title, row.data.title); assert.equal(release.upc, row.data.upc_code); }
    const preserved = await db.$queryRawUnsafe(`SELECT id,to_jsonb(a)::text AS payload FROM audit_logs a WHERE id=ANY($1::int[]) ORDER BY id`, snapshot.auditRows.map((row: { id: number }) => row.id));
    assert.equal(createHash("sha256").update(JSON.stringify(preserved)).digest("hex"), createHash("sha256").update(JSON.stringify(snapshot.auditRows)).digest("hex"));
    const columns = await db.$queryRaw<Array<{ table_name: string; column_name: string }>>`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND data_type IN ('text','character varying','json','jsonb','ARRAY')`;
    const scan = columns.map(c => `SELECT count(*)::int AS count FROM ${quote(c.table_name)} WHERE ${quote(c.column_name)}::text ILIKE $1`).join(" UNION ALL ");
    const mentions = await db.$queryRawUnsafe<Array<{ count: number }>>(scan, `%${snapshot.source.email}%`); assert.ok(mentions.every(row => row.count === 0));
    const { assertNotMergedIdentity } = await import("../lib/merged-account-identity");
    await assert.rejects(assertNotMergedIdentity({ email: snapshot.source.email }, db), /no longer available/);
    await assert.rejects(assertNotMergedIdentity({ email: "unrelated@example.invalid", googleId: snapshot.source.googleId }, db), /no longer available/);
    await assertNotMergedIdentity({ email: target.email, googleId: target.googleId }, db);
    const response = await fetch("https://hymnmusic.fun/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://hymnmusic.fun" }, body: JSON.stringify({ email: snapshot.source.email, password: "migration-check-not-a-real-password" }), signal: AbortSignal.timeout(20000) });
    const body = await response.json(); assert.equal(response.status, 400); assert.match(body.error, /no longer available/);
    console.log(JSON.stringify({ verified: true, destination: target.email, releases: releases.length, assets: assets.length, subscription: snapshot.summary.subscription, credits: target.referralCredits, preservedAuditRows: snapshot.auditRows.length, originalSessionsRevoked: originalSessions.length, retiredEmailOccurrences: 0, retiredGoogleBlocked: true, liveRetiredLoginBlocked: true, destinationGoogleIdentityUnchanged: true }, null, 2));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Merge verification failed"); process.exitCode = 1; });
