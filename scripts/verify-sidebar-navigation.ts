import assert from "node:assert/strict";
import { studioDestinations, usesHymnStudioShell } from "../lib/studio-navigation";
import { workspaceGroupDestination, workspaceGroupForPath } from "../lib/workspace-navigation";
import { consistentWorkspaceNavigation, workspaceGroups } from "../lib/workspace-navigation";
const producer = [
  { key: "overview", label: "Overview", group: "Workspace" },
  { key: "catalog", label: "My beats", group: "Beatstore" },
  { key: "upload", label: "Upload beat", group: "Beatstore" },
  { key: "profile", label: "My storefront", group: "Beatstore" },
  { key: "earnings", label: "Earnings & payouts", group: "Business" },
  { key: "releases", label: "My releases", group: "Distribution", href: "/dashboard/releases" }
];
const result = consistentWorkspaceNavigation(producer);
assert.equal(workspaceGroupDestination('Distribution')?.href, '/dashboard/releases');
assert.equal(studioDestinations.find(item => item.key === 'releases')?.href, '/studio?tab=releases');
for (const path of ['/dashboard/releases', '/dashboard/releases/42', '/dashboard/releases/42/qc-report']) {
  assert.equal(usesHymnStudioShell(path), false, `${path} must retain the public Distribution shell`);
  assert.equal(workspaceGroupForPath(path), 'Distribution');
}
assert.equal(usesHymnStudioShell('/studio'), true);
assert.equal(new Set(result.map(n => n.key)).size, result.length);
assert.deepEqual([...new Set(result.map(n => n.group))], ["Home", 'Library', ...workspaceGroups.map(g => g.title), "Money"]);
for (const key of ["catalog", "upload", "profile", "earnings", "overview"]) assert.equal(result.find(n => n.key === key)?.href, undefined, `${key} must retain its producer callback`);
for (const label of ["Browse beats", 'My library', "Sell beats", "Add release"]) assert.ok(result.some(n => n.label === label));
assert.ok(!workspaceGroups.some(group => group.title === 'Library'));
const legacy = consistentWorkspaceNavigation([...producer, { key: 'files', label: 'My files', group: 'Distribution' }, { key: 'purchases', label: 'My purchases', group: 'Beatstore' }]);
assert.equal(legacy.filter(item => item.label === 'My library').length, 1);
assert.ok(!legacy.some(item => ['files', 'purchases'].includes(item.key)));
const admin = [{ key: "overview", label: "Operations Overview", group: "Command Center" }];
assert.deepEqual(consistentWorkspaceNavigation(admin), admin);
console.log("Shared creator menus, producer callbacks, unique keys and admin permissions preserved.");
