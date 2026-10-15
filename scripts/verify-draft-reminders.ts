import assert from "node:assert/strict";
import { draftReminderContent, sendDraftReleaseReminders } from "../lib/email/draft-release-reminder";
import { GET } from "../app/api/cron/draft-reminders/route";
const free = draftReminderContent("Asha <artist>", "My song", "https://hymnmusic.fun/distribution/start?edit=1&campaign=first-release", true);
assert.match(free.text, /base distribution is FREE/);
assert.match(free.text, /Optional add-ons cost extra/);
assert.match(free.html, /Asha &lt;artist&gt;/);
assert.match(free.html, /https:\/\/wa.me\/918793643228/);
assert.match(free.subject, /free release/);
const paid = draftReminderContent("Asha", "My song", "https://hymnmusic.fun/distribution/start?edit=1", false);
assert.doesNotMatch(paid.text, /base distribution is FREE/);
assert.match(paid.text, /current pricing/);
async function main() {
  process.env.EMAIL_ENABLED = "false";
  assert.deepEqual(await sendDraftReleaseReminders(), { enabled: false, sent: 0 });
  process.env.CRON_SECRET = "fixture-secret";
  assert.equal((await GET(new Request("https://fixture/api/cron/draft-reminders"))).status, 401);
  const response = await GET(new Request("https://fixture/api/cron/draft-reminders", { headers: { authorization: "Bearer fixture-secret" } }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { enabled: false, sent: 0 });
  console.log("Draft reminders: free/paid wording, escaped personalisation, WhatsApp and disabled SMTP checks passed.");
}
void main();
