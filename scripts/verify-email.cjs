const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function load(file, mocks = {}, env = {}) {
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const context = { exports: {}, Buffer, console, process: { env }, require: name => {
    if (name === "server-only") return {};
    assert.ok(name in mocks, `Unexpected dependency ${name}`);
    return mocks[name];
  } };
  vm.runInNewContext(output, context);
  return context.exports;
}
async function main() {
  let options, sent;
  const env = { EMAIL_ENABLED: "true", EMAIL_PROVIDER: "smtp", SMTP_USER: "sender@example.com", SMTP_APP_PASSWORD: "abcd efgh ijkl mnop" };
  const client = load("lib/email/email-client.ts", {
    nodemailer: { createTransport: config => { options = config; return { sendMail: async input => { sent = input; return { accepted: [input.to], messageId: "smtp-test" }; } }; } },
    "@/lib/public-app-url": { getPublicAppUrl: () => "https://example.com" }
  }, env);
  const input = { from: "sender@example.com", to: "buyer@example.com", subject: "Test", html: "<p>Test</p>", text: "Test", attachments: [{ filename: "beat.mp3", content: Buffer.from("music"), contentType: "audio/mpeg" }] };
  assert.equal((await client.getEmailClient().emails.send(input)).data.id, "smtp-test");
  assert.equal(options.secure, true);
  assert.equal(options.requireTLS, true);
  assert.equal(options.auth.pass, "abcdefghijklmnop");
  assert.equal(sent.attachments[0].content.toString(), "music");
  env.SMTP_PORT = "587";
  await client.getEmailClient().emails.send(input);
  assert.equal(options.secure, false);
  assert.equal(options.requireTLS, true);
  env.EMAIL_ENABLED = "false";
  assert.equal(client.getEmailClient(), null);

  const templates = load("lib/email/email-templates.ts", { "@/lib/public-app-url": { getPublicAppUrl: () => "https://example.com" } });
  const html = templates.emailLayout({ title: "<script>bad</script>", body: "A & B", ctaLabel: "Open", ctaUrl: "https://example.com/?a=1&b=2", timelineStep: 2, sections: [{ title: "What next?", body: "Wait for us." }] });
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("A &amp; B"));
  assert.ok(html.includes('role="presentation"'));
  assert.ok(html.includes("https://example.com/assets/hymnlogowhite.png"));
  assert.ok(html.includes("What next?"));

  let purchase = { user: { email: "buyer@example.com" }, licenseType: "mp3", licenseAsset: { id: 1, byteSize: 3 }, beat: { deliverableAsset: { id: 2, byteSize: 4, mimeType: "audio/wav" } } };
  let reads = 0;
  const attachment = load("lib/email/purchase-attachments.ts", {
    "@/lib/prisma": { prisma: { beatPurchase: { findFirst: async query => { assert.equal(query.where.hasAccess, true); assert.equal(query.where.userId, 7); return purchase; } } } },
    "@/lib/private-storage": { localPrivateStorage: { createAuthorizedRead: async ({ assetId, requesterUserId, isAdmin }) => { assert.equal(requesterUserId, 7); assert.equal(isAdmin, false); reads++; return { bytes: Buffer.from("123"), fileName: String(assetId), mimeType: "application/octet-stream" }; } } }
  });
  assert.equal((await attachment.purchaseAttachments(8, 7, "other@example.com")).length, 0);
  assert.equal(reads, 0);
  assert.equal((await attachment.purchaseAttachments(8, 7, "buyer@example.com")).length, 1);
  purchase.licenseType = "wav";
  assert.equal((await attachment.purchaseAttachments(8, 7, "buyer@example.com")).length, 2);
  purchase.beat.deliverableAsset.byteSize = 11 * 1024 * 1024;
  assert.equal((await attachment.purchaseAttachments(8, 7, "buyer@example.com")).length, 1);
  purchase = null;
  assert.equal((await attachment.purchaseAttachments(8, 7, "buyer@example.com")).length, 0);
  const logs = new Map();
  let sends = 0;
  let fail = false;
  const sender = load("lib/email/send-transactional-email.ts", {
    zod: require("zod"),
    "@/lib/prisma": { prisma: { emailLog: {
      findUnique: async ({ where }) => logs.get(where.eventKey),
      create: async ({ data }) => { const row = { ...data, id: logs.size + 1 }; logs.set(data.eventKey, row); return row; },
      update: async ({ where, data }) => { const row = [...logs.values()].find(log => log.id === where.id); Object.assign(row, data); return row; }
    } } },
    "@/lib/email/email-client": { getEmailConfig: () => ({ enabled: true, provider: "smtp", from: input.from }), getEmailClient: () => ({ emails: { send: async () => { sends++; if (fail) throw Error("Provider unavailable"); return { data: { id: "sent" }, error: null }; } } }) },
    "@/lib/email/purchase-attachments": { purchaseAttachments: async () => [] }
  });
  const event = { ...input, template: "test", eventKey: "unique" };
  assert.equal((await sender.sendTransactionalEmail(event)).status, "sent");
  assert.equal((await sender.sendTransactionalEmail(event)).status, "duplicate_skipped");
  assert.equal(sends, 1);
  fail = true;
  assert.equal((await sender.sendTransactionalEmail({ ...event, eventKey: "failure" })).status, "failed");
  assert.equal(logs.get("failure").status, "failed");
  console.log("PASS: SMTP routing, TLS, password normalization, disabled mode, HTML escaping, attachment ownership, tiers, size limits, deduplication and failure logging. No real email sent.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
