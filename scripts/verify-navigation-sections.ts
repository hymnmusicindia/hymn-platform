import assert from "node:assert/strict";
import { adminNavigation, adminModuleAllowed, adminWorkspaceNavigation } from "../lib/admin-workspace-navigation";
import { consistentWorkspaceNavigation } from "../lib/workspace-navigation";
import { adminModuleKey, sectionItems, teamSectionFor } from "../lib/navigation-sections";

const expected = "overview notifications analytics manual-catalogue releases delivery updates fraud referrals-admin growth revenue royalties earnings-entry reconciliation kyc managed-services artists client-cards-admin promotions playlist-reviews timed-playlists content newsletter operations reviews contracts support studio-admin contributors-admin campaign-redemptions leads-admin audit-admin email-admin webhooks-admin users team activity integrations settings".split(" ");
const permissions = ["system.manage", "users.read", "users.manage", "audit.read", "releases.read", "releases.review", "distribution.retry", "updates.review", "takedowns.review", "fraud.read", "wallets.adjust", "payouts.review", "royalties.import", "royalties.reconcile", "kyc.review", "services.manage"];
const full = adminNavigation(permissions);
assert.deepEqual(full.map(item => item.key).sort(), expected.sort(), "Every existing admin module must remain reachable");
assert.equal(new Set(full.map(item => item.group)).size, 6);
for (const access of [[], ...permissions.map(key => [key]), permissions]) {
  const visible = adminNavigation(access);
  assert(visible.every(item => adminModuleAllowed(item.key, access)));
  assert.deepEqual(sectionItems(visible, item => item.group).flatMap(section => section.items).map(item => item.key).sort(), visible.map(item => item.key).sort());
  assert.equal(visible.length, adminWorkspaceNavigation.filter(item => item.key !== "producers" && adminModuleAllowed(item.key, access)).length);
}
assert.equal(adminModuleKey("payments"), "revenue");
assert.equal(adminModuleKey("distribution-queue"), "releases");
assert.equal(adminModuleKey("producers"), "operations");
const teamKeys = "overview availability work tasks inbox projects chat contacts emails customer-calls calendar creator-applications release-qc directory approvals reports audit settings referral acquisition".split(" ");
const team = sectionItems(teamKeys, teamSectionFor);
assert.equal(team.length, 6);
assert.deepEqual(team.flatMap(section => section.items).sort(), teamKeys.sort());
assert.equal(teamSectionFor("crm"), teamSectionFor("acquisition"));
assert.equal(teamSectionFor('leadership'), 'Leadership');
for (const profile of ["customer", "producer"]) {
  const original = [
    { key: "overview", label: "Overview", group: "Home" },
    { key: "earnings", label: "Earnings", group: profile === "producer" ? "Business" : "Distribution" },
    { key: "payouts", label: "Payouts", group: "Distribution", href: "/payout" },
    { key: "profile", label: "Profile", group: "Account" },
    { key: "support", label: "Support", group: "Support" },
    { key: "settings", label: "Settings", group: "Account" },
    { key: "referral", label: "Referrals", group: "Account" },
  ];
  const merged = consistentWorkspaceNavigation(original);
  for (const item of original) assert(merged.some(next => next.key === item.key), `${profile}: ${item.key} must remain reachable`);
  assert.equal(new Set(merged.map(item => item.key)).size, merged.length);
  assert.equal(merged.find(item => item.key === "payouts")?.href, "/payout");
  assert.equal(merged.find(item => item.key === "earnings")?.group, "Money");
  assert.equal(merged.find(item => item.key === "settings")?.group, "Account & support");
}
console.log("PASS navigation consolidation: all 39 admin modules retained, six admin/team sections, permission subsets, legacy aliases, and customer/producer financial, profile, referral and support modules preserved.");
