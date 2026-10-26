import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { prisma } from "../lib/prisma";

async function main() {
  assert.match(process.env.DATABASE_URL || "", /127\.0\.0\.1:55452\/referral_fixture/);
  const jobs = await prisma.referralMailJob.findMany({ where: { user: { email: { startsWith: "network" } } }, orderBy: { id: "asc" } });
  assert.equal(jobs.length, 16);
  await prisma.referralMailJob.updateMany({ where: { id: { notIn: jobs.map(job => job.id) } }, data: { status: "CANCELLED" } });
  await prisma.referralMailJob.updateMany({ where: { id: { in: jobs.map(job => job.id) } }, data: { status: "PENDING", attempts: 0, availableAt: new Date(Date.now() - 1000), lockedAt: null } });
  const fixture = { fail: true, sent: [] as string[] };
  (globalThis as typeof globalThis & { __referralSMTP: typeof fixture }).__referralSMTP = fixture;
  const output = resolve(".cache/referral-mail-mock.cjs");
  await build({ entryPoints: ["lib/referral-mail.ts"], outfile: output, bundle: true, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "smtp-fixture", setup(builder) {
    builder.onResolve({ filter: /^(@\/lib\/email\/email-client|server-only)$/ }, args => ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path === "server-only" ? "" : `export const getEmailConfig=()=>({enabled:true,from:'HYMN <no-reply@fixture.invalid>'});export const getEmailClient=()=>({emails:{send:async(input)=>{const fixture=globalThis.__referralSMTP;if(fixture.fail)throw new Error('Fixture SMTP outage');fixture.sent.push(input.to);return {data:{id:'fixture-message'},error:null}}}});`, loader: "js" }));
  } }] });
  const worker = createRequire(import.meta.url)(output) as { deliverReferralMail(deadline?: number): Promise<{ sent: number }> };
  await worker.deliverReferralMail();
  assert.equal(fixture.sent.length, 0);
  assert.equal(await prisma.referralMailJob.count({ where: { id: { in: jobs.map(job => job.id) }, status: "PENDING", attempts: 1 } }), 16, `SMTP failures remain retryable: ${JSON.stringify(await prisma.referralMailJob.findMany({where:{id:{in:jobs.map(job=>job.id)}},take:2,select:{status:true,attempts:true,availableAt:true,lockedAt:true}}))}`);
  fixture.fail = false;
  await prisma.referralMailJob.updateMany({ where: { id: { in: jobs.map(job => job.id) } }, data: { availableAt: new Date(Date.now() - 1000) } });
  await Promise.all([worker.deliverReferralMail(), worker.deliverReferralMail()]);
  assert.equal(fixture.sent.length, 16, "Concurrent workers lease each email once.");
  assert.equal(await prisma.referralMailJob.count({ where: { id: { in: jobs.map(job => job.id) }, status: "SENT" } }), 16);
  assert.equal(await prisma.emailLog.count({ where: { eventKey: { in: jobs.map(job => job.eventKey) }, status: "sent" } }), 16);
  await worker.deliverReferralMail(); assert.equal(fixture.sent.length, 16, "Completed jobs do not resend on cron replay.");
  await prisma.referralMailJob.update({ where: { id: jobs[0].id }, data: { status: "SENDING", lockedAt: new Date(Date.now() - 360000) } });
  await worker.deliverReferralMail(); assert.equal(fixture.sent.length, 16, "An uncertain crashed SMTP send is not blindly replayed.");
  assert.equal((await prisma.referralMailJob.findUniqueOrThrow({where:{id:jobs[0].id}})).status,"REVIEW");
  console.log("PASS transactional referral email outbox, SMTP outage/backoff, concurrent leases, delivery logs, replay and crashed-worker recovery; transport was mocked, no real emails.");
}
main().finally(() => prisma.$disconnect());
