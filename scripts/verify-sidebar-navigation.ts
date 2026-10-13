import assert from "node:assert/strict";
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
assert.equal(new Set(result.map(n => n.key)).size, result.length);
assert.deepEqual([...new Set(result.map(n => n.group))], ["Home", ...workspaceGroups.map(g => g.title)]);
for (const key of ["catalog", "upload", "profile", "earnings", "overview"]) assert.equal(result.find(n => n.key === key)?.href, undefined, `${key} must retain its producer callback`);
for (const label of ["Browse beats", "My purchases", "Sell beats", "Add release", "My files"]) assert.ok(result.some(n => n.label === label));
const admin = [{ key: "overview", label: "Operations Overview", group: "Command Center" }];
assert.deepEqual(consistentWorkspaceNavigation(admin), admin);
console.log("Shared creator menus, producer callbacks, unique keys and admin permissions preserved.");
