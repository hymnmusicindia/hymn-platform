import { PrismaClient } from "@prisma/client";
import { createCipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { mergedIdentityHash } from "@/lib/merged-account-identity";

type Reference = { table_name: string; column_name: string };
type Count = Reference & { source_count: number; target_count: number };
const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
const allowedTargetTables = new Set(["audit_logs", "sessions", "user_handles", "user_handle_reservations"]);
const allowedNonForeignKeys = new Set(["acquisition_events.user_id", "contributor_name_history.changed_by_user_id", "track_contributions.created_by_user_id"]);

export async function mergeApprovedAccounts(db: PrismaClient, input: { sourceId: number; targetId: number; sourceEmail: string; targetEmail: string }, apply = false) {
  assert.notEqual(input.sourceId, input.targetId);
  const sourceEmail = input.sourceEmail.trim().toLowerCase(); const targetEmail = input.targetEmail.trim().toLowerCase();
  assert.match(sourceEmail, /^[^\s@]+@[^\s@]+$/); assert.match(targetEmail, /^[^\s@]+@[^\s@]+$/);
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422070, ${input.sourceId}::integer)`;
    for (const email of [sourceEmail, targetEmail].sort()) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`account-identity:${email}`}))`;
    await tx.$queryRaw`SELECT id FROM users WHERE id IN (${input.sourceId},${input.targetId}) ORDER BY id FOR UPDATE`;
    const source = await tx.user.findUniqueOrThrow({ where: { id: input.sourceId } });
    const target = await tx.user.findUniqueOrThrow({ where: { id: input.targetId } });
    assert.equal(source.email, sourceEmail); assert.equal(target.email, targetEmail);
    assert.equal(source.status, "ACTIVE"); assert.equal(target.status, "ACTIVE");
    assert.equal(source.role, target.role); assert.equal(source.role, "CUSTOMER", "This scoped merge does not merge privileged accounts.");
    assert.equal(await tx.auditLog.count({ where: { action: "ACCOUNT_MERGED", entityId: String(source.id) } }), 0, "Merge already exists");
    const foreignKeys = await tx.$queryRaw<Reference[]>`SELECT c.relname AS table_name,a.attname AS column_name FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=k.conkey[1] WHERE k.confrelid='public.users'::regclass AND k.contype='f' AND n.nspname='public'`;
    const loose = await tx.$queryRaw<Reference[]>`SELECT c.table_name,c.column_name FROM information_schema.columns c WHERE c.table_schema='public' AND c.data_type IN ('integer','bigint') AND c.column_name ~ '(user|owner|customer|actor|buyer|recipient).*id$' AND NOT EXISTS(SELECT 1 FROM information_schema.key_column_usage k JOIN information_schema.table_constraints t ON t.constraint_name=k.constraint_name AND t.table_schema=k.table_schema WHERE t.constraint_type='FOREIGN KEY' AND k.table_schema=c.table_schema AND k.table_name=c.table_name AND k.column_name=c.column_name)`;
    const references = [...foreignKeys, ...loose];
    const countSql = references.map(r => `SELECT '${r.table_name}' AS table_name,'${r.column_name}' AS column_name,count(*) FILTER(WHERE ${quote(r.column_name)}=$1)::int AS source_count,count(*) FILTER(WHERE ${quote(r.column_name)}=$2)::int AS target_count FROM ${quote(r.table_name)} WHERE ${quote(r.column_name)} IN ($1,$2)`).join(" UNION ALL ");
    const before = (await tx.$queryRawUnsafe<Count[]>(countSql, source.id, target.id)).filter(row => row.source_count || row.target_count);
    for (const row of before) {
      if (row.target_count && !allowedTargetTables.has(row.table_name)) throw new Error(`Target account has existing ${row.table_name} records. Resolve this conflict before merging.`);
      if (row.source_count && loose.some(r => r.table_name === row.table_name && r.column_name === row.column_name) && !allowedNonForeignKeys.has(`${row.table_name}.${row.column_name}`)) throw new Error(`Unreviewed non-FK ownership column: ${row.table_name}.${row.column_name}`);
    }
    const subscription = await tx.subscription.findUnique({ where: { userId: source.id } });
    const releases = await tx.release.findMany({ where: { userId: source.id }, select: { id: true, title: true, upc: true, status: true, tracks: { select: { id: true, isrc: true } } }, orderBy: { id: "asc" } });
    const handle = await tx.userHandle.findUnique({ where: { userId: source.id } });
    const auditRows = await tx.$queryRaw<Array<{ id: number; payload: string }>>`SELECT id,to_jsonb(a)::text AS payload FROM audit_logs a WHERE actor_id IN (${source.id},${target.id}) ORDER BY id`;
    const digest = (rows: unknown) => createHash("sha256").update(JSON.stringify(rows)).digest("hex");
    const protectedDigest = digest(auditRows);
    // Scan stored text/JSON columns, including provider snapshots and email logs.
    const textColumns = await tx.$queryRaw<Array<Reference & { udt_name: string }>>`SELECT table_name,column_name,udt_name FROM information_schema.columns WHERE table_schema='public' AND data_type IN ('text','character varying','json','jsonb','ARRAY')`;
    const emailSql = textColumns.map(c => `SELECT '${c.table_name}' AS table_name,'${c.column_name}' AS column_name,count(*)::int AS count FROM ${quote(c.table_name)} WHERE ${quote(c.column_name)}::text ILIKE $1`).join(" UNION ALL ");
    const emailRows = (await tx.$queryRawUnsafe<Array<Reference & { count: number }>>(emailSql, `%${sourceEmail}%`)).filter(row => row.count);
    const allowedEmailColumns = new Set(["users.email", "email_logs.to_email", "distribution_submission_attempts.payload_redacted", "direnote_logs.request_payload_redacted"]);
    for (const row of emailRows) assert.ok(allowedEmailColumns.has(`${row.table_name}.${row.column_name}`), `Unexpected email occurrence: ${row.table_name}.${row.column_name}; review before mutation`);
    for (const table of ["email_logs", "distribution_submission_attempts", "direnote_logs"]) {
      const column = table === "email_logs" ? "to_email" : table === "distribution_submission_attempts" ? "payload_redacted" : "request_payload_redacted";
      const ownerCheck = table === "email_logs" ? "t.user_id" : "r.user_id";
      const join = table === "email_logs" ? "" : "JOIN releases r ON r.id=t.release_id";
      const rows = await tx.$queryRawUnsafe<Array<{ count: number }>>(`SELECT count(*)::int AS count FROM ${quote(table)} t ${join} WHERE t.${quote(column)}::text ILIKE $1 AND ${ownerCheck} IS DISTINCT FROM $2`, `%${sourceEmail}%`, source.id);
      assert.equal(rows[0].count, 0, "Email occurrence belongs to another account");
    }
    const summary = { sourceId: source.id, targetId: target.id, releases: releases.length, subscription: subscription ? { id: subscription.id, plan: subscription.plan, status: subscription.status, expiryDate: subscription.expiryDate, releasesUsed: subscription.releasesUsed, releaseLimit: subscription.releaseLimit } : null, referralCredits: source.referralCredits + target.referralCredits, preservedHandle: handle?.tag, references: before, emailOccurrences: emailRows, protectedAuditCount: auditRows.length };
    if (!apply) return { ...summary, applied: false };

    // Encrypted rollback evidence stays outside the repository; never write plaintext credentials.
    const secret = process.env.ACCOUNT_MERGE_BACKUP_KEY || process.env.PAYOUT_ENCRYPTION_KEY || process.env.JWT_SECRET;
    assert.ok(secret && secret.length >= 24, "A strong existing backup/encryption secret is required");
    const snapshots: Record<string, unknown> = { source, target, summary, auditRows };
    for (const row of before) if (row.table_name !== "audit_logs") snapshots[`${row.table_name}.${row.column_name}`] = await tx.$queryRawUnsafe(`SELECT to_jsonb(t) AS data FROM ${quote(row.table_name)} t WHERE ${quote(row.column_name)} IN ($1,$2)`, source.id, target.id);
    for (const row of emailRows) snapshots[`email:${row.table_name}.${row.column_name}`] = await tx.$queryRawUnsafe(`SELECT to_jsonb(t) AS data FROM ${quote(row.table_name)} t WHERE ${quote(row.column_name)}::text ILIKE $1`, `%${sourceEmail}%`);
    const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(snapshots)), cipher.final()]);
    const backup = path.join(mkdtempSync(path.join(os.tmpdir(), "hymn-account-merge-")), `merge-${source.id}-to-${target.id}.enc`);
    writeFileSync(backup, Buffer.concat([Buffer.from("HYMN-MERGE-V1\n"), iv, cipher.getAuthTag(), encrypted]), { flag: "wx", mode: 0o600 });

    const now = new Date();
    await tx.session.updateMany({ where: { userId: { in: [source.id, target.id] } }, data: { revokedAt: now } });
    if (handle) { await tx.userHandle.deleteMany({ where: { userId: target.id } }); await tx.userHandle.update({ where: { userId: source.id }, data: { userId: target.id } }); }
    const moved: Record<string, number> = {};
    for (const row of before) {
      if (!row.source_count || ["audit_logs", "user_handles"].includes(row.table_name)) continue;
      moved[`${row.table_name}.${row.column_name}`] = await tx.$executeRawUnsafe(`UPDATE ${quote(row.table_name)} SET ${quote(row.column_name)}=$2 WHERE ${quote(row.column_name)}=$1`, source.id, target.id);
    }
    const userColumns = await tx.$queryRaw<Array<{ column_name: string }>>`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users' ORDER BY ordinal_position`;
    const identity = new Set(["id", "email", "google_id", "password_hash", "referral_code", "referral_credits", "status", "status_reason", "status_changed_at", "deletion_scheduled_at", "appeal_requested_at", "appeal_message", "updated_at"]);
    const profile = userColumns.map(c => c.column_name).filter(c => !identity.has(c));
    await tx.$executeRawUnsafe(`UPDATE users d SET (${profile.map(quote).join(",")})=(SELECT ${profile.map(quote).join(",")} FROM users WHERE id=$1) WHERE d.id=$2`, source.id, target.id);
    // Release the source's unique referral code before assigning it to the active account.
    await tx.user.update({ where: { id: source.id }, data: { referralCode: null } });
    await tx.user.update({ where: { id: target.id }, data: { referralCode: source.referralCode || target.referralCode, referralCredits: source.referralCredits + target.referralCredits, passwordHash: target.passwordHash || source.passwordHash, firstPaymentRewarded: source.firstPaymentRewarded || target.firstPaymentRewarded, updatedAt: now } });
    const reset = userColumns.map(c => c.column_name).filter(c => !["id", "created_at", "email", "google_id", "name", "status", "status_reason", "updated_at", "status_changed_at", "presence_status"].includes(c));
    await tx.$executeRawUnsafe(`UPDATE users SET ${reset.map(c => `${quote(c)}=DEFAULT`).join(",")},email=$2,google_id=$3,name='Merged account',status='BANNED',status_reason='ACCOUNT_MERGED',status_changed_at=NOW(),updated_at=NOW(),presence_status='invisible' WHERE id=$1`, source.id, `merged-${source.id}@privacy.invalid`, `merged-${source.id}-${randomUUID()}`);
    // Historical sent-recipient/provider evidence is anonymised, not relabelled as
    // if those historical requests had actually used the new email address.
    const pattern = sourceEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const row of emailRows) if (row.table_name !== "users") {
      const column = textColumns.find(c => c.table_name === row.table_name && c.column_name === row.column_name)!;
      const cast = column.udt_name === "jsonb" ? "jsonb" : column.udt_name === "json" ? "json" : "text";
      const replacement = row.table_name === "email_logs" ? `CASE WHEN status IN ('failed','queued') THEN $3 ELSE $2 END` : "$2";
      const parameters = row.table_name === "email_logs" ? [pattern, `merged-${source.id}@privacy.invalid`, targetEmail, `%${sourceEmail}%`] : [pattern, `merged-${source.id}@privacy.invalid`, `%${sourceEmail}%`];
      await tx.$executeRawUnsafe(`UPDATE ${quote(row.table_name)} SET ${quote(row.column_name)}=regexp_replace(${quote(row.column_name)}::text,$1,${replacement},'gi')::${cast} WHERE ${quote(row.column_name)}::text ILIKE $${parameters.length}`, ...parameters);
    }
    const after = await tx.$queryRawUnsafe<Count[]>(countSql, source.id, target.id);
    assert.ok(after.every(r => r.table_name === "audit_logs" || r.source_count === 0), "Source account still owns operational records");
    for (const row of before) if (!["audit_logs", "user_handles"].includes(row.table_name)) assert.equal(after.find(r => r.table_name === row.table_name && r.column_name === row.column_name)?.target_count, row.source_count + row.target_count, `Count mismatch: ${row.table_name}.${row.column_name}`);
    const migratedReleases = await tx.release.findMany({ where: { userId: target.id }, select: { id: true, title: true, upc: true, status: true, tracks: { select: { id: true, isrc: true } } }, orderBy: { id: "asc" } });
    assert.deepEqual(migratedReleases, releases, "Release/track identity changed");
    if (subscription) assert.deepEqual(await tx.subscription.findUnique({ where: { userId: target.id } }), { ...subscription, userId: target.id }, "Subscription or billing details changed");
    const preserved = await tx.$queryRawUnsafe<Array<{ id: number; payload: string }>>(`SELECT id,to_jsonb(a)::text AS payload FROM audit_logs a WHERE id=ANY($1::int[]) ORDER BY id`, auditRows.map(r => r.id));
    assert.equal(digest(preserved), protectedDigest, "Protected audit history changed");
    const remaining = (await tx.$queryRawUnsafe<Array<Reference & { count: number }>>(emailSql, `%${sourceEmail}%`)).filter(r => r.count);
    assert.equal(remaining.length, 0, "The retired email still occurs in stored records");
    assert.equal(await tx.session.count({ where: { userId: { in: [source.id, target.id] }, revokedAt: null } }), 0);
    await tx.auditLog.create({ data: { actorType: "system", actorId: target.id, action: "ACCOUNT_MERGED", entity: "users", entityId: String(source.id), metadata: { sourceId: source.id, targetId: target.id, sourceEmailHash: mergedIdentityHash(sourceEmail), sourceGoogleIdHash: mergedIdentityHash(source.googleId), protectedAuditDigest: protectedDigest, moved, subscriptionId: subscription?.id ?? null, releaseIds: releases.map(r => r.id), previousTargetHandleReserved: true } } });
    return { ...summary, moved, applied: true, retiredStatus: "BANNED", remainingEmailOccurrences: 0, backup };
  }, { timeout: 180000, maxWait: 10000, isolationLevel: "Serializable" });
}
