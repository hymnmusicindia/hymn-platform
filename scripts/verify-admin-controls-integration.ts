import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { isRecentAdminAuthentication } from "../lib/access";
import { decideFinancialAdjustment, requestFinancialAdjustment } from "../lib/financial-adjustments";
import { prisma } from "../lib/prisma";

async function main() {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const subject = await prisma.user.create({ data: { googleId: `controls-user-${stamp}`, name: "Controls Subject", email: `controls-user-${stamp}@example.test`, role: "CUSTOMER" } });
  const requester = await prisma.user.create({ data: { googleId: `controls-requester-${stamp}`, name: "Controls Requester", email: `controls-requester-${stamp}@example.test`, role: "ADMIN" } });
  const approver = await prisma.user.create({ data: { googleId: `controls-approver-${stamp}`, name: "Controls Approver", email: `controls-approver-${stamp}@example.test`, role: "ADMIN" } });
  await prisma.artistPayoutBalance.create({ data: { userId: subject.id, availableBalance: 100, lifetimeEarnings: 100 } });

  assert.equal(isRecentAdminAuthentication(1000, 1900, 900), true);
  assert.equal(isRecentAdminAuthentication(1000, 1901, 900), false);
  assert.equal(isRecentAdminAuthentication(2000, 1900, 900), false);

  const walletPermission = await prisma.adminPermission.upsert({ where: { key: "wallets.adjust" }, create: { key: "wallets.adjust" }, update: {} });
  const systemPermission = await prisma.adminPermission.upsert({ where: { key: "system.manage" }, create: { key: "system.manage" }, update: {} });
  const roleRecord = await prisma.adminRole.upsert({ where: { key: "finance_operator" }, create: { key: "finance_operator", name: "Finance operator" }, update: {} });
  await prisma.adminRolePermission.upsert({ where: { roleId_permissionId: { roleId: roleRecord.id, permissionId: walletPermission.id } }, create: { roleId: roleRecord.id, permissionId: walletPermission.id }, update: {} });
  await prisma.adminRolePermission.deleteMany({ where: { roleId: roleRecord.id, permissionId: systemPermission.id } });
  const financeRole = await prisma.adminRole.findUniqueOrThrow({ where: { key: "finance_operator" }, include: { permissions: { include: { permission: true } } } });
  const financePermissions = financeRole.permissions.map(row => row.permission.key);
  assert(financePermissions.includes("wallets.adjust"));
  assert(!financePermissions.includes("system.manage"));

  const requested = await requestFinancialAdjustment({ userId: subject.id, amount: "25.123456", reason: "Verified correction for a duplicated royalty withholding.", requestedBy: requester.id, requestKey: `correction-${stamp}` });
  await assert.rejects(() => requestFinancialAdjustment({ userId: subject.id, amount: "25.123456", reason: "Verified correction for a duplicated royalty withholding.", requestedBy: requester.id, requestKey: `correction-${stamp}` }), /unique|constraint/i);
  await assert.rejects(() => decideFinancialAdjustment({ id: requested.id, decision: "approved", note: "Evidence independently reviewed and accepted.", approvedBy: requester.id }), /own financial adjustment/);
  const decisions = await Promise.allSettled([
    decideFinancialAdjustment({ id: requested.id, decision: "approved", note: "Evidence independently reviewed and accepted.", approvedBy: approver.id }),
    decideFinancialAdjustment({ id: requested.id, decision: "approved", note: "Evidence independently reviewed and accepted.", approvedBy: approver.id }),
  ]);
  assert.equal(decisions.filter(result => result.status === "fulfilled").length, 1);
  const balance = await prisma.artistPayoutBalance.findUniqueOrThrow({ where: { userId: subject.id } });
  assert(new Prisma.Decimal(balance.availableBalance).equals("125.123456"));
  assert.equal(await prisma.walletTransaction.count({ where: { referenceType: "financial_adjustment", referenceId: String(requested.id) } }), 1);

  const excessive = await requestFinancialAdjustment({ userId: subject.id, amount: "-200", reason: "Correction that must fail the non-negative balance control.", requestedBy: requester.id, requestKey: `excessive-${stamp}` });
  await assert.rejects(() => decideFinancialAdjustment({ id: excessive.id, decision: "approved", note: "Independent review attempted this excessive debit.", approvedBy: approver.id }), /negative/);
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { entity: "financial_adjustment", entityId: String(requested.id) } });
  await assert.rejects(() => prisma.auditLog.update({ where: { id: audit.id }, data: { action: "TAMPERED" } }), /append-only/);
  await assert.rejects(() => prisma.auditLog.delete({ where: { id: audit.id } }), /append-only/);
  console.log("RBAC freshness, dual-control adjustment, concurrency, non-negative balance, and append-only audit verification passed.");
}

main().finally(() => prisma.$disconnect());
// vercel trigger 9
