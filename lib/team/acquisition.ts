import "server-only";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getUserSessionSecret } from "@/lib/env";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { getEmailConfig } from "@/lib/email/email-client";
import { acquisitionEmailStarters } from "./acquisition-email";
import { can, demand, TeamError, type Actor } from "./policy";
import { eligibleNetRevenue, proportionalRefundMinor } from "@/lib/acquisition-revenue";
import { accrueReferralCommission, refreshReferralCommission } from "@/lib/referral-commissions";

type Tx = Prisma.TransactionClient;
export async function acquisitionRead(a: Actor, resource: string, params: URLSearchParams) {
  if (["acquisition-leads", "acquisition-dashboard", "acquisition-ledger", "acquisition-settings", "acquisition-reassign", "acquisition-email-templates", "acquisition-email-events"].includes(resource)) demand(a, "crm.prospects.view");
  if (resource === "acquisition-customer-attribution") {
    demand(a, "acquisition.admin");
    const customerId = Number(params.get("customerId"));
    if (!Number.isSafeInteger(customerId) || customerId <= 0) throw new TeamError("Enter a valid HYMN customer ID.");
    const [customer, lead, referral] = await Promise.all([
      prisma.user.findUnique({ where: { id: customerId }, select: { id: true, name: true, email: true, status: true } }),
      prisma.acquisitionLead.findFirst({ where: { workspaceId: a.workspaceId, customerId }, include: { prospect: { select: { id: true, name: true, stage: true } }, researcher: { select: { id: true, user: { select: { name: true, email: true } } } }, acquisitionEmployee: { select: { id: true, user: { select: { name: true, email: true } } } }, commissions: { orderBy: { createdAt: "desc" }, take: 100 } } }),
      prisma.referral.findUnique({ where: { referredUserId: customerId }, include: { owner: { select: { id: true, name: true, email: true } }, commissions: { where: { level: 1 }, orderBy: { createdAt: "desc" }, take: 100, include: { adjustments: { orderBy: { id: "asc" } } } } } }),
    ]);
    if (!customer) throw new TeamError("Customer not found.", 404);
    return { customer, employeeAttribution: lead, customerReferral: referral ? { id: referral.id, status: referral.status, attributedAt: referral.attributedAt, referrer: referral.owner, commissions: referral.commissions } : null };
  }
  if (resource === "acquisition-email-templates") {
    for (const template of acquisitionEmailStarters) await prisma.acquisitionEmailTemplate.createMany({ data: [{ workspaceId: a.workspaceId, ...template, status: "ACTIVE", createdByEmployeeId: a.id, updatedByEmployeeId: a.id, updatedAt: new Date() }], skipDuplicates: true });
    return { items: await prisma.acquisitionEmailTemplate.findMany({ where: { workspaceId: a.workspaceId, ...(can(a, "acquisition.admin") ? {} : { status: "ACTIVE" }) }, orderBy: [{ status: "asc" }, { name: "asc" }] }) };
  }
  if (resource === "acquisition-email-events") {
    const access = can(a, "crm.all") ? {} : { OR: [
      { ownerId: a.id },
      { acquisitionLead: { is: { OR: [{ researcherEmployeeId: a.id }, { acquisitionEmployeeId: a.id }] } } },
    ] };
    return { items: await prisma.acquisitionEmailEvent.findMany({ where: { workspaceId: a.workspaceId, prospect: access, ...(params.get("prospectId") ? { prospectId: params.get("prospectId")! } : {}) }, take: 100, orderBy: { createdAt: "desc" } }) };
  }
  if (resource === "acquisition-settings") {
    if (!can(a, "acquisition.admin")) throw new TeamError("Administrator access required.", 403);
    const settings = await prisma.acquisitionProgramSettings.findUnique({ where: { workspaceId: a.workspaceId } });
    return settings ? { ...settings, emailSenderConfigured: getEmailConfig().enabled } : { emailSenderConfigured: getEmailConfig().enabled };
  }
  if (resource === "acquisition-leads") {
    const q = params.get("q")?.trim().slice(0, 150); const status = params.get("status");
    const where: Prisma.AcquisitionLeadWhereInput = { workspaceId: a.workspaceId, ...(can(a, "crm.all") && params.get("scope") !== "mine" ? {} : { OR: [{ researcherEmployeeId: a.id }, { acquisitionEmployeeId: a.id }] }), AND: [
      ...(q ? [{ prospect: { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }, { contactName: { contains: q, mode: "insensitive" as const } }] } }] : []),
      ...(status && ["NEW", "QUALIFIED", "ASSIGNED", "CONTACTED", "INTERESTED", "CONVERTED", "UNQUALIFIED", "DUPLICATE", "NOT_INTERESTED", "DO_NOT_CONTACT", "LOST"].includes(status) ? [{ prospect: { stage: status } }] : []),
    ] };
    const orderKey = params.get("sort"); const orderBy = orderKey === "status" ? { prospect: { stage: "asc" as const } } : orderKey === "owner" ? { acquisitionEmployeeId: "asc" as const } : orderKey === "source" ? { prospect: { sourceUrl: "asc" as const } } : { registeredAt: "desc" as const };
    const rows = await prisma.acquisitionLead.findMany({ where, take: resource === "acquisition-leads" ? 100 : 5000, orderBy, include: { prospect: { select: { id: true, name: true, contactName: true, email: true, phone: true, stage: true, sourceUrl: true, discoveredAt: true, notes: true, followUpAt: true, categories: true, contactEligibility: true, suppressed: true } }, researcher: { select: { id: true, user: { select: { name: true } } } }, acquisitionEmployee: { select: { id: true, user: { select: { name: true } } } }, customer: { select: { id: true, name: true, email: true } } } });
    return { items: rows };
  }
  if (resource === "acquisition-leads-export") {
    demand(a, "crm.prospects.view");
    const q = params.get("q")?.trim().slice(0, 150); const status = params.get("status");
    const where: Prisma.AcquisitionLeadWhereInput = { workspaceId: a.workspaceId, ...(can(a, "crm.all") && params.get("scope") !== "mine" ? {} : { OR: [{ researcherEmployeeId: a.id }, { acquisitionEmployeeId: a.id }] }), AND: [
      ...(q ? [{ prospect: { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }, { contactName: { contains: q, mode: "insensitive" as const } }] } }] : []),
      ...(status ? [{ prospect: { stage: status } }] : []),
    ] };
    const rows = await prisma.acquisitionLead.findMany({ where, take: 5000, orderBy: { registeredAt: "desc" }, include: { prospect: true, researcher: { include: { user: { select: { name: true } } } }, acquisitionEmployee: { include: { user: { select: { name: true } } } }, customer: { select: { id: true, name: true, email: true } } } });
    const quote = (value: unknown) => { const raw = String(value ?? "").replace(/[\r\n]+/g, " "); const safe = /^[=+\-@\t]/.test(raw) ? `'${raw}` : raw; return `"${safe.replace(/"/g, '""')}"`; };
    const columns = ["Lead ID", "Business", "Contact", "Email", "Phone", "Category", "Services", "Country", "City", "Status", "Researcher", "Acquisition employee", "Source", "Discovered at", "Follow-up at", "Customer ID", "Customer name", "Contact eligibility"];
    const records = rows.map(row => [row.id, row.prospect.name, row.prospect.contactName, row.prospect.email, row.prospect.phone, row.prospect.leadCategory, row.prospect.categories.join(", "), row.prospect.country, row.prospect.city, row.prospect.stage, row.researcher.user.name, row.acquisitionEmployee?.user.name, row.prospect.sourceUrl, row.prospect.discoveredAt?.toISOString(), row.prospect.followUpAt?.toISOString(), row.customer?.id, row.customer?.name, row.prospect.contactEligibility]);
    return { csv: [columns, ...records].map(record => record.map(quote).join(",")).join("\r\n"), count: rows.length, capped: rows.length === 5000 };
  }
  if (resource === "acquisition-dashboard") {
    const owned = { workspaceId: a.workspaceId, ...(can(a, "crm.all") ? {} : { OR: [{ researcherEmployeeId: a.id }, { acquisitionEmployeeId: a.id }] }) };
    const [leads, rows] = await Promise.all([prisma.acquisitionLead.count({ where: owned }), prisma.acquisitionCommission.findMany({ where: { lead: owned, ...(can(a, "crm.all") ? {} : { employeeId: a.id }) }, include: { payoutItems: { where: { payout: { cancellation: { is: null } } }, select: { payout: { select: { payment: { select: { id: true } } } } } } } })]);
    const disputedPayments = new Set((await prisma.acquisitionRevenueEvidence.findMany({ where: { workspaceId: a.workspaceId, status: "DISPUTED", paymentId: { in: rows.map(row => row.paymentId) } }, select: { paymentId: true } })).map(row => row.paymentId));
    const totals = new Map<string, { amount: number; count: number }>();
    for (const row of rows) { const status = row.payoutItems[0]?.payout.payment ? "PAID" : disputedPayments.has(row.paymentId) ? "DISPUTED" : row.payoutItems.length ? "APPROVED" : row.status; const aggregate = totals.get(status) || { amount: 0, count: 0 }; aggregate.amount += row.amountMinor; aggregate.count++; totals.set(status, aggregate); }
    const attributed = await prisma.acquisitionLead.findMany({ where: owned, select: { customerId: true, prospect: { select: { stage: true } } } });
    const customerIds = [...new Set(attributed.flatMap(row => row.customerId ? [row.customerId] : []))];
    const [completedReleases, purchases, recentActivity] = await Promise.all([
      prisma.release.count({ where: { userId: { in: customerIds }, status: { in: ["LIVE", "DELIVERED", "DISTRIBUTED"] } } }),
      prisma.acquisitionRevenueEvidence.groupBy({ by: ["customerId"], where: { customerId: { in: customerIds }, sourceType: { in: ["distribution_order", "checkout_order", "subscription_payment", "studio_payment"] } }, _count: true }),
      prisma.acquisitionProgramAudit.findMany({ where: { workspaceId: a.workspaceId, ...(can(a, "crm.all") ? {} : { actorEmployeeId: a.id }) }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, action: true, createdAt: true } }),
    ]);
    const outstanding = new Map<string, number>();
    for (const row of rows) if (!row.payoutItems[0]?.payout.payment) outstanding.set(row.employeeId, (outstanding.get(row.employeeId) || 0) + row.amountMinor);
    const commissionLiability = [...outstanding.values()].reduce((sum, value) => sum + Math.max(0, value), 0) / 100;
    const stageCount = (stages: string[]) => attributed.filter(row => stages.includes(row.prospect.stage)).length;
    return { leads, performance: { commissionLiability, qualified: stageCount(["QUALIFIED", "READY_TO_CONTACT"]), contacted: stageCount(["CONTACTED", "REPLIED", "OFFER_SHARED"]), interested: stageCount(["INTERESTED"]), convertedCustomers: customerIds.length, completedReleases, repeatPurchases: purchases.reduce((sum, row) => sum + Math.max(0, row._count - 1), 0), lifetimeEarned: rows.reduce((sum, row) => sum + row.amountMinor, 0) / 100 }, recentActivity, commissions: [...totals].map(([status, row]) => ({ status, amount: row.amount / 100, count: row.count })) };
  }
  if (resource === "acquisition-ledger") {
    const rows = await prisma.acquisitionCommission.findMany({ where: { lead: { workspaceId: a.workspaceId, ...(can(a, "crm.all") ? {} : { OR: [{ researcherEmployeeId: a.id }, { acquisitionEmployeeId: a.id }] }) }, ...(can(a, "crm.all") ? {} : { employeeId: a.id }) }, take: 100, orderBy: { createdAt: "desc" }, include: { payoutItems: { where: { payout: { cancellation: { is: null } } }, select: { payout: { select: { payment: true } } } }, lead: { select: { prospect: { select: { name: true } } } }, customer: { select: { id: true, name: true } }, employee: { select: { user: { select: { name: true } } } } } });
    const disputedPayments = new Set((await prisma.acquisitionRevenueEvidence.findMany({ where: { workspaceId: a.workspaceId, status: "DISPUTED", paymentId: { in: rows.map(row => row.paymentId) } }, select: { paymentId: true } })).map(row => row.paymentId));
    return { items: rows.map(row => ({ ...row, entryKind: row.entryType === "ADJUSTMENT" ? row.amountMinor < 0 ? "REVERSED" : "ADJUSTED" : "EARNED", status: row.payoutItems[0]?.payout.payment ? "PAID" : disputedPayments.has(row.paymentId) ? "DISPUTED" : row.payoutItems.length ? "APPROVED" : row.status, payoutReference: row.payoutItems[0]?.payout.payment?.paymentReference || null, paidAt: row.payoutItems[0]?.payout.payment?.paidAt || null })) };
  }
  if (resource === "acquisition-payouts") {
    demand(a, "acquisition.admin");
    const [payouts, unpaid, settings] = await Promise.all([
      prisma.acquisitionPayout.findMany({ where: { workspaceId: a.workspaceId }, take: 100, orderBy: { approvedAt: "desc" }, include: { payment: true, cancellation: true, items: { select: { commissionId: true, amountMinor: true, commission: { select: { sourceType: true, sourceId: true, paymentId: true, attributionRole: true } } } }, employee: { select: { user: { select: { name: true } } } } } }),
      prisma.acquisitionCommission.findMany({ where: { lead: { workspaceId: a.workspaceId }, status: { in: ["PENDING", "APPROVED"] }, eligibleAt: { lte: new Date() }, payoutItems: { none: { payout: { cancellation: { is: null } } } } }, take: 300, orderBy: { createdAt: "asc" }, include: { employee: { select: { id: true, user: { select: { name: true } } } } } }),
      prisma.acquisitionProgramSettings.findUnique({ where: { workspaceId: a.workspaceId } }),
    ]);
    const groups = new Map<string, { employeeId: string; name: string; currency: string; amountMinor: number; commissionIds: string[] }>();
    for (const row of unpaid) { const key = `${row.employeeId}:${row.currency}`; const group = groups.get(key) || { employeeId: row.employeeId, name: row.employee.user.name, currency: row.currency, amountMinor: 0, commissionIds: [] }; group.amountMinor += row.amountMinor; group.commissionIds.push(row.id); groups.set(key, group); }
    return { payouts: payouts.map(row => ({ ...row, cancelledAt: row.cancellation?.createdAt || null, cancellationReason: row.cancellation?.reason || null })), minimumMinor: settings?.payoutMinimumMinor ?? 50000, schedule: settings?.payoutSchedule ?? "MONTHLY", due: [...groups.values()].filter(group => group.amountMinor > 0).map(group => ({ ...group, minimumMet: group.amountMinor >= (settings?.payoutMinimumMinor ?? 50000) })) };
  }
  if (resource === "acquisition-evidence") {
    demand(a, "acquisition.admin");
    return { items: await prisma.acquisitionRevenueEvidence.findMany({ where: { OR: [{ workspaceId: a.workspaceId }, { workspaceId: null }], ...(params.get("status") ? { status: params.get("status")! } : {}) }, take: 200, orderBy: { createdAt: "desc" }, include: { customer: { select: { id: true, name: true, email: true } } } }) };
  }
  if (resource === "acquisition-link") {
    const leadId = params.get("leadId") || "";
    const lead = await prisma.acquisitionLead.findFirst({ where: { id: leadId, workspaceId: a.workspaceId, acquisitionEmployeeId: a.id, prospect: { stage: { in: ["QUALIFIED", "READY_TO_CONTACT", "INTERESTED"] }, suppressed: false } }, select: { id: true } });
    if (!lead) throw new TeamError("A qualified lead assigned to you is required to create this link.", 404);
    const token = jwt.sign({ purpose: "acquisition_lead", leadId: lead.id, employeeId: a.id, nonce: randomUUID() }, getUserSessionSecret(), { expiresIn: "30d" });
    return { url: `${getPublicAppUrl()}/a/${encodeURIComponent(token)}` };
  }
  if (resource === "acquisition-reassign") {
    demand(a, "acquisition.admin");
    const id = params.get("id") || "";
    return prisma.leadOwnershipEvent.findMany({ where: { lead: { id, workspaceId: a.workspaceId } }, orderBy: { createdAt: "desc" }, include: { actor: { select: { user: { select: { name: true } } } } } });
  }
  throw new TeamError("Unknown acquisition resource.", 404);
}

export async function acquisitionMutation(tx: Tx, a: Actor, resource: string, body: Record<string, unknown>) {
  if (resource === "acquisition-email-template-save") {
    demand(a, "acquisition.admin");
    const id = typeof body.id === "string" ? body.id : ""; const slug = String(body.slug || "").trim().toLowerCase();
    const name = String(body.name || "").trim(); const subject = String(body.subject || "").trim(); const text = String(body.body || "").trim();
    const category = String(body.category || "Other"); const status = String(body.status || "DRAFT");
    if (!/^[a-z0-9-]{2,80}$/.test(slug) || !name || name.length > 120 || !subject || subject.length > 200 || !text || text.length > 12000 || !["Distribution", "Playlist curation", "Mixing & mastering", "Other"].includes(category) || !["DRAFT", "ACTIVE", "ARCHIVED"].includes(status)) throw new TeamError("Template details or status are invalid.");
    if ([...subject.matchAll(/{{\s*([^}]+)\s*}}/g), ...text.matchAll(/{{\s*([^}]+)\s*}}/g)].some(match => !["artist_name", "sender_name", "company_name", "service_name", "website_url"].includes(match[1]))) throw new TeamError("Template contains an unsupported placeholder.");
    const previous = id ? await tx.acquisitionEmailTemplate.findFirst({ where: { id, workspaceId: a.workspaceId } }) : null;
    if (id && !previous) throw new TeamError("Template unavailable.", 404);
    const row = id ? await tx.acquisitionEmailTemplate.update({ where: { id }, data: { slug, name, subject, body: text, category, status, updatedByEmployeeId: a.id } }) : await tx.acquisitionEmailTemplate.create({ data: { workspaceId: a.workspaceId, slug, name, subject, body: text, category, status, createdByEmployeeId: a.id, updatedByEmployeeId: a.id } });
    await tx.acquisitionProgramAudit.create({ data: { workspaceId: a.workspaceId, actorEmployeeId: a.id, action: "email.template_saved", entityId: row.id, metadata: { previous, next: { slug, name, subject, body: text, category, status } } } });
    return row;
  }
  if (["acquisition-email-draft", "acquisition-email-queue"].includes(resource)) {
    demand(a, "crm.outreach.manage");
    const prospectId = String(body.prospectId || ""); const templateId = String(body.templateId || "");
    const prospect = await tx.teamProspect.findFirst({ where: {
      id: prospectId, workspaceId: a.workspaceId, suppressed: false, verified: true, stage: { in: ["QUALIFIED", "READY_TO_CONTACT", "INTERESTED"] },
      ...(can(a, "crm.all") ? {} : { OR: [
        { ownerId: a.id },
        { acquisitionLead: { is: { OR: [{ researcherEmployeeId: a.id }, { acquisitionEmployeeId: a.id }] } } },
      ] }),
    }, include: { acquisitionLead: true } });
    if (!prospect || !prospect.email || !["CONSENTED", "LEGITIMATE_INTEREST"].includes(prospect.contactEligibility)) throw new TeamError("Email outreach requires an eligible qualified lead with a verified email address.", 403);
    const template = await tx.acquisitionEmailTemplate.findFirst({ where: { id: templateId, workspaceId: a.workspaceId, status: "ACTIVE" } });
    if (!template) throw new TeamError("Choose an active outreach template.", 404);
    const optedOut = await tx.newsletterSubscriber.findFirst({ where: { email: { equals: prospect.email, mode: "insensitive" }, OR: [{ status: { not: "subscribed" } }, { unsubscribedAt: { not: null } }] }, select: { id: true } });
    if (optedOut) throw new TeamError("This recipient has opted out and cannot receive outreach.", 403);
    const member = await tx.teamMember.findUnique({ where: { id: a.id }, include: { user: { select: { name: true } } } });
    const tokens: Record<string, string> = { artist_name: prospect.contactName || prospect.name, sender_name: member?.user.name || "HYMN Music", company_name: "HYMN Music", service_name: prospect.categories[0] || "artist services", website_url: getPublicAppUrl() };
    const personalize = (value: string) => value.replace(/{{\s*(artist_name|sender_name|company_name|service_name|website_url)\s*}}/g, (_match, key: string) => tokens[key] || "");
    const subject = String(body.subject || personalize(template.subject)).trim(); const emailBody = String(body.body || personalize(template.body)).trim();
    if (!subject || subject.length > 200 || !emailBody || emailBody.length > 12000 || /{{\s*[^}]+\s*}}/.test(subject + emailBody)) throw new TeamError("Review a complete subject and body before saving or sending.");
    if (resource === "acquisition-email-queue") {
      const prior = await tx.acquisitionEmailEvent.findFirst({ where: { prospectId, recipientEmail: prospect.email.toLowerCase(), status: { in: ["QUEUED", "SENT"] }, createdAt: { gte: new Date(Date.now() - 3 * 86_400_000) } }, select: { id: true } });
      if (prior) throw new TeamError("An email to this lead was already queued or sent in the last 3 days.", 429);
    }
    const eventKey = `acquisition-email:${randomUUID()}`;
    const eventId = randomUUID();
    const unsubscribeToken = jwt.sign({ purpose: "acquisition_email_unsubscribe", eventId, prospectId }, getUserSessionSecret(), { expiresIn: "365d" });
    const unsubscribeFooter = `\n\nTo stop future HYMN Music outreach, use this link: ${getPublicAppUrl()}/api/acquisition/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
    const event = await tx.acquisitionEmailEvent.create({ data: { id: eventId, workspaceId: a.workspaceId, prospectId, templateId, createdByEmployeeId: a.id, recipientEmail: prospect.email.toLowerCase(), subject, body: resource === "acquisition-email-queue" ? `${emailBody}${unsubscribeFooter}` : emailBody, eventKey, status: resource === "acquisition-email-queue" ? "QUEUED" : "DRAFT" } });
    await tx.acquisitionProgramAudit.create({ data: { workspaceId: a.workspaceId, actorEmployeeId: a.id, action: resource === "acquisition-email-queue" ? "email.outreach_queued" : "email.outreach_drafted", entityId: event.id, metadata: { prospectId, recipient: event.recipientEmail, templateId } } });
    return event;
  }
  if (resource === "acquisition-settings-save") {
    demand(a, "acquisition.admin");
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const effectiveAt = new Date(String(body.effectiveAt || new Date().toISOString()));
    const eligibleSourceTypes = Array.isArray(body.eligibleSourceTypes) ? body.eligibleSourceTypes.map(String) : ["distribution_order", "checkout_order", "subscription_payment", "studio_payment"];
    if (!Number.isFinite(effectiveAt.getTime()) || !eligibleSourceTypes.length || eligibleSourceTypes.some(value => !["distribution_order", "checkout_order", "subscription_payment", "studio_payment"].includes(value))) throw new TeamError("Choose a valid programme effective date and eligible service categories.");
    const values = { effectiveAt, eligibleSourceTypes, researcherRateBps: Number(body.researcherRateBps), acquisitionRateBps: Number(body.acquisitionRateBps), customerReferralRateBps: Number(body.customerReferralRateBps), maximumRewardRateBps: Number(body.maximumRewardRateBps), holdPeriodDays: Number(body.holdPeriodDays), payoutMinimumMinor: Number(body.payoutMinimumMinor), payoutSchedule: String(body.payoutSchedule || "MONTHLY"), attributionPolicy: String(body.attributionPolicy || "").trim(), revenuePolicy: String(body.revenuePolicy || "").trim(), enabled: body.enabled === true };
    if (!reason || reason.length > 1000 || [values.researcherRateBps, values.acquisitionRateBps, values.customerReferralRateBps, values.maximumRewardRateBps].some(v => !Number.isInteger(v) || v < 0 || v > 10000) || !Number.isInteger(values.holdPeriodDays) || values.holdPeriodDays < 0 || values.holdPeriodDays > 365 || !Number.isSafeInteger(values.payoutMinimumMinor) || values.payoutMinimumMinor < 0 || values.payoutMinimumMinor > 2_000_000_000 || !["WEEKLY", "BIWEEKLY", "MONTHLY"].includes(values.payoutSchedule) || values.attributionPolicy.length < 40 || values.attributionPolicy.length > 5000 || !values.revenuePolicy || values.revenuePolicy.length < 40) throw new TeamError("Provide a reason, valid rates and payout policy, and a documented net revenue policy.");
    if (values.researcherRateBps + values.acquisitionRateBps > values.maximumRewardRateBps) throw new TeamError("Combined researcher and acquisition rates exceed the employee reward cap.");
    const old = await tx.acquisitionProgramSettings.findUnique({ where: { workspaceId: a.workspaceId } });
    const row = await tx.acquisitionProgramSettings.upsert({ where: { workspaceId: a.workspaceId }, create: { workspaceId: a.workspaceId, ...values, updatedByEmployeeId: a.id }, update: { ...values, updatedByEmployeeId: a.id } });
    await tx.acquisitionProgramAudit.create({ data: { workspaceId: a.workspaceId, actorEmployeeId: a.id, action: "programme.settings_changed", entityId: a.workspaceId, metadata: { previous: old, next: values, reason } } });
    await tx.teamAudit.create({ data: { workspaceId: a.workspaceId, actorId: a.id, action: "acquisition.settings_changed", entityId: a.workspaceId, detail: { reason } } });
    return row;
  }
  if (resource === "acquisition-assign") {
    demand(a, "crm.prospects.assign");
    const leadId = String(body.leadId || ""); const employeeId = String(body.employeeId || ""); const reason = String(body.reason || "").trim();
    if (!reason || reason.length < 8 || reason.length > 1000) throw new TeamError("Write a reason for assigning the acquisition representative.");
    const lead = await tx.acquisitionLead.findFirst({ where: { id: leadId, workspaceId: a.workspaceId } });
    if (!lead) throw new TeamError("Lead unavailable.", 404);
    if (!await tx.teamMember.findFirst({ where: { id: employeeId, workspaceId: a.workspaceId, status: "ACTIVE", user: { status: "ACTIVE" } } })) throw new TeamError("Choose an active member of this workspace.");
    const previous = lead.acquisitionEmployeeId;
    await tx.acquisitionLead.update({ where: { id: lead.id }, data: { acquisitionEmployeeId: employeeId } });
    await tx.leadOwnershipEvent.create({ data: { leadId: lead.id, actorEmployeeId: a.id, previousEmployeeId: previous, newEmployeeId: employeeId, attributionRole: "ACQUISITION", reason } });
    await tx.acquisitionProgramAudit.create({ data: { workspaceId: a.workspaceId, actorEmployeeId: a.id, action: "lead.acquisition_employee_assigned", entityId: lead.id, metadata: { previous, employeeId, reason } } });
    return { ok: true };
  }
  if (resource === "acquisition-evidence-dispute") {
    demand(a, "acquisition.admin");
    const id = String(body.id || ""); const reason = String(body.reason || "").trim();
    if (reason.length < 8 || reason.length > 1000) throw new TeamError("Document the dispute or ownership concern before holding rewards.");
    await tx.$queryRaw`SELECT id FROM acquisition_revenue_evidence WHERE id = ${id} FOR UPDATE`;
    const evidence = await tx.acquisitionRevenueEvidence.findFirst({ where: { id, OR: [{ workspaceId: a.workspaceId }, { workspaceId: null }] } });
    if (!evidence) throw new TeamError("Revenue evidence not accessible.", 404);
    if (evidence.status === "DISPUTED") return evidence;
    const held = await tx.acquisitionRevenueEvidence.update({ where: { id }, data: { workspaceId: a.workspaceId, status: "DISPUTED" } });
    await refreshReferralCommission(tx, evidence.paymentId);
    await tx.acquisitionProgramAudit.create({ data: { workspaceId: a.workspaceId, actorEmployeeId: a.id, action: "revenue.dispute_opened", entityId: id, metadata: { previousStatus: evidence.status, paymentId: evidence.paymentId, reason } } });
    return held;
  }
  if (resource === "acquisition-evidence-review") {
    demand(a, "acquisition.admin");
    const id = String(body.id || "");
    // Customer-only evidence can be unassigned. Serialize its first review
    // across workspaces before checking and claiming ownership.
    await tx.$queryRaw`SELECT id FROM acquisition_revenue_evidence WHERE id = ${id} FOR UPDATE`;
    const taxes = Number(body.applicableTaxesMinor); const refunds = Number(body.refundsChargebacksMinor); const costs = Number(body.directPassThroughCostsMinor); const providerFee = Number(body.providerFeeMinor);
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const taxEvidence = Array.isArray(body.taxEvidence) ? body.taxEvidence.filter(value => typeof value === "string" && value.trim()).map(value => String(value).trim()).slice(0, 10) : [];
    const costEvidence = Array.isArray(body.costEvidence) ? body.costEvidence.filter(value => typeof value === "string" && value.trim()).map(value => String(value).trim()).slice(0, 10) : [];
    if (!reason || reason.length < 8 || ![taxes, refunds, costs, providerFee].every(value => Number.isSafeInteger(value) && value >= 0) || !taxEvidence.length || !costEvidence.length) throw new TeamError("Reconciliation requires nonnegative tax, refund, direct-cost and provider-fee amounts plus supporting tax and cost references.");
    const evidence = await tx.acquisitionRevenueEvidence.findFirst({ where: { id, OR: [{ workspaceId: a.workspaceId }, { workspaceId: null }], status: { in: ["RECONCILIATION_REQUIRED", "RECONCILED", "ADJUSTMENT_REQUIRED", "DISPUTED"] } } });
    if (!evidence) throw new TeamError("Reconciliation record not found or already reviewed.", 404);
    if (evidence.status === "DISPUTED" && body.resolveDispute !== true) throw new TeamError("Explicitly confirm that the documented dispute has been resolved before reconciliation.", 409);
    const source = evidence.sourceType === "distribution_order" ? await tx.distributionOrder.findUnique({ where: { id: Number(evidence.sourceId) } }) : evidence.sourceType === "checkout_order" ? await tx.checkoutOrder.findUnique({ where: { id: Number(evidence.sourceId) } }) : evidence.sourceType === "subscription_payment" ? await tx.subscriptionPayment.findUnique({ where: { id: Number(evidence.sourceId) }, include: { subscription: true } }) : evidence.sourceType === "studio_payment" ? await tx.studioPayment.findUnique({ where: { id: Number(evidence.sourceId) }, include: { order: true, refunds: true } }) : null;
    const paymentId = source && "razorpayPaymentId" in source ? source.razorpayPaymentId : null;
    const paid = source && "paymentStatus" in source ? source.paymentStatus === "paid" : source && "status" in source ? (evidence.sourceType === "studio_payment" ? source.status === "CAPTURED" : source.status === "captured") : false;
    if (!source || !paid || paymentId !== evidence.paymentId) throw new TeamError("The source payment is not currently verified and paid.", 409);
    const providerEvents = await tx.paymentWebhookEvent.findMany({ where: { paymentId: evidence.paymentId, signatureValid: true, eventType: { in: ["refund.created", "refund.processed", "refund.failed", "payment.dispute.created", "payment.dispute.won", "payment.dispute.lost"] } }, orderBy: { id: "asc" } });
    const processedRefunds = new Map<string, number>(); const pendingRefunds = new Set<string>();
    for (const event of providerEvents) {
      if (!event.eventType.startsWith("refund.")) continue;
      const refund = (event.payloadRedacted as { entity?: { id?: string } } | null)?.entity; const refundId = refund?.id;
      if (!refundId) throw new TeamError("A provider refund event is missing its refund reference; resolve it before reconciliation.", 409);
      if (event.eventType === "refund.created" && !processedRefunds.has(refundId)) pendingRefunds.add(refundId);
      else if (event.eventType === "refund.failed") pendingRefunds.delete(refundId);
      else if (event.eventType === "refund.processed") { processedRefunds.set(refundId, Math.max(processedRefunds.get(refundId) || 0, event.amountMinor || 0)); pendingRefunds.delete(refundId); }
    }
    if (pendingRefunds.size) throw new TeamError("A provider refund is still pending; reconcile after its final provider status arrives.", 409);
    const hasDispute = providerEvents.some(event => event.eventType === "payment.dispute.created");
    const disputeWon = providerEvents.some(event => event.eventType === "payment.dispute.won");
    const disputeLost = providerEvents.some(event => event.eventType === "payment.dispute.lost");
    if (hasDispute && !disputeWon && !disputeLost) throw new TeamError("A payment dispute is unresolved; keep rewards out of payout until it is decided.", 409);
    const grossPaymentMinor = evidence.sourceType === "subscription_payment" && source && "amount" in source ? Number(source.amount) : evidence.sourceType === "distribution_order" && source && "amount" in source ? Number(source.amount) * 100 : evidence.sourceType === "checkout_order" && source && "finalAmount" in source ? Math.round(Number(source.finalAmount) * 100) : source && "amount" in source ? Math.round(Number(source.amount) * 100) : 0;
    const webhookRefundMinor = [...processedRefunds.values()].reduce((sum, amount) => sum + amount, 0);
    const ledgerRefundMinor = source && "refunds" in source && Array.isArray(source.refunds) ? source.refunds.filter((refund: { status: string }) => refund.status === "PROCESSED").reduce((sum: number, refund: { amountMinor: number }) => sum + refund.amountMinor, 0) : 0;
    const providerRefundMinor = disputeLost ? grossPaymentMinor : Math.max(webhookRefundMinor, ledgerRefundMinor);
    const observedRevenueRefund = grossPaymentMinor > 0 ? proportionalRefundMinor(evidence.recognisedRevenueMinor, grossPaymentMinor, providerRefundMinor) : 0;
    if (refunds < observedRevenueRefund) throw new TeamError(`Recorded refunds are below the verified provider refund allocation (${observedRevenueRefund} minor units).`, 409);
    const net = eligibleNetRevenue({ recognisedRevenueMinor: evidence.recognisedRevenueMinor, applicableTaxesMinor: taxes, refundsChargebacksMinor: refunds, directPassThroughCostsMinor: costs, providerFeeMinor: providerFee });
    const wasReconciled = evidence.eligibleNetRevenueMinor !== null;
    const adjustmentReference = String(body.adjustmentReference || "").trim();
    if (wasReconciled && net !== evidence.eligibleNetRevenueMinor && (!adjustmentReference || adjustmentReference.length > 200)) throw new TeamError("A unique provider adjustment reference is required when changing reconciled eligible revenue.");
    if (wasReconciled && net !== evidence.eligibleNetRevenueMinor) {
      const duplicateAdjustment = await tx.acquisitionCommission.findFirst({ where: { sourceType: evidence.sourceType, sourceId: evidence.sourceId, entryType: "ADJUSTMENT", adjustmentReference } });
      const duplicateAudit = await tx.acquisitionProgramAudit.findFirst({ where: { entityId: evidence.id, action: "revenue.evidence_adjusted", metadata: { path: ["adjustmentReference"], equals: adjustmentReference } }, select: { id: true } });
      if (duplicateAdjustment || duplicateAudit) throw new TeamError("This adjustment reference has already been recorded for this transaction.", 409);
    }
    const updated = await tx.acquisitionRevenueEvidence.update({ where: { id: evidence.id }, data: { workspaceId: a.workspaceId, applicableTaxesMinor: taxes, refundsChargebacksMinor: refunds, directPassThroughCostsMinor: costs, providerFeeMinor: providerFee, eligibleNetRevenueMinor: net, status: "RECONCILED", taxEvidence, costEvidence, reviewedByEmployeeId: a.id, reviewedAt: new Date(), reviewReason: reason } });
    const attribution = await tx.acquisitionLead.findFirst({ where: { customerId: evidence.customerId, workspaceId: a.workspaceId, attributionLockedAt: { not: null }, acquisitionEmployeeId: { not: null } } });
    const settings = await tx.acquisitionProgramSettings.findUnique({ where: { workspaceId: a.workspaceId } });
    if (attribution && settings?.enabled && evidence.paymentVerifiedAt >= settings.effectiveAt && settings.eligibleSourceTypes.includes(evidence.sourceType) && !wasReconciled) {
      // The customer referral programme has separate terms and accounting.
      // Its rewards are intentionally excluded from this employee-only cap.
      const employeeCap = Math.min(settings.maximumRewardRateBps, settings.researcherRateBps + settings.acquisitionRateBps);
      const researcherRate = Math.min(settings.researcherRateBps, employeeCap);
      const acquisitionRate = Math.min(settings.acquisitionRateBps, Math.max(0, employeeCap - researcherRate));
      for (const entry of [{ employeeId: attribution.researcherEmployeeId, role: "RESEARCHER", rate: researcherRate }, { employeeId: attribution.acquisitionEmployeeId!, role: "ACQUISITION", rate: acquisitionRate }]) {
        if (entry.rate <= 0) continue;
        await tx.acquisitionCommission.create({ data: { leadId: attribution.id, sourceType: evidence.sourceType, sourceId: evidence.sourceId, paymentId: evidence.paymentId, customerId: evidence.customerId, employeeId: entry.employeeId, attributionRole: entry.role, eligibleNetRevenueMinor: net, rateBps: entry.rate, amountMinor: Math.floor(net * entry.rate / 10000), currency: evidence.currency, calculationBasis: `Recognised HYMN revenue ${evidence.recognisedRevenueMinor}; less taxes ${taxes}, refunds/chargebacks ${refunds}, direct costs ${costs}, and provider fee ${providerFee}. Tax references and cost references recorded in revenue evidence.`, policyVersion: evidence.policyVersion, paymentVerificationReference: evidence.paymentId, status: "PENDING", eligibleAt: new Date(evidence.paymentVerifiedAt.getTime() + settings.holdPeriodDays * 86_400_000) } });
      }
    }
    if (attribution && wasReconciled && net !== evidence.eligibleNetRevenueMinor) {
      const entries = await tx.acquisitionCommission.findMany({ where: { leadId: attribution.id, sourceType: evidence.sourceType, sourceId: evidence.sourceId, entryType: "EARNED" } });
      for (const earned of entries) {
        const prior = await tx.acquisitionCommission.aggregate({ where: { sourceType: evidence.sourceType, sourceId: evidence.sourceId, employeeId: earned.employeeId, attributionRole: earned.attributionRole, entryType: "ADJUSTMENT" }, _sum: { amountMinor: true } });
        const target = Math.floor(net * earned.rateBps / 10000);
        const delta = target - earned.amountMinor - (prior._sum.amountMinor || 0);
        if (delta) await tx.acquisitionCommission.create({ data: { leadId: attribution.id, sourceType: evidence.sourceType, sourceId: evidence.sourceId, paymentId: evidence.paymentId, customerId: evidence.customerId, employeeId: earned.employeeId, attributionRole: earned.attributionRole, entryType: "ADJUSTMENT", adjustmentReference, eligibleNetRevenueMinor: net, rateBps: earned.rateBps, amountMinor: delta, currency: evidence.currency, calculationBasis: `Post-reconciliation correction ${adjustmentReference}; revised eligible net revenue ${net}; prior earned amount ${earned.amountMinor}; prior adjustments ${prior._sum.amountMinor || 0}. ${reason}`, policyVersion: earned.policyVersion, paymentVerificationReference: evidence.paymentId, status: "PENDING", eligibleAt: delta < 0 ? new Date() : new Date(Date.now() + (settings?.holdPeriodDays ?? 14) * 86_400_000) } });
      }
    }
    await accrueReferralCommission(tx, evidence.sourceType as import("@/lib/referral-commissions").CommissionSource, Number(evidence.sourceId));
    await refreshReferralCommission(tx, evidence.paymentId, new Date(), adjustmentReference);
    if (evidence.status === "DISPUTED") await tx.acquisitionProgramAudit.create({ data: { workspaceId: a.workspaceId, actorEmployeeId: a.id, action: "revenue.dispute_resolved", entityId: evidence.id, metadata: { reason, paymentId: evidence.paymentId } } });
    await tx.acquisitionProgramAudit.create({ data: { workspaceId: a.workspaceId, actorEmployeeId: a.id, action: wasReconciled ? "revenue.evidence_adjusted" : "revenue.evidence_reconciled", entityId: evidence.id, metadata: { previous: { status: evidence.status, eligibleNetRevenueMinor: evidence.eligibleNetRevenueMinor }, next: { status: updated.status, eligibleNetRevenueMinor: net }, adjustmentReference: wasReconciled ? adjustmentReference : null, reason } } });
    return updated;
  }
  if (resource === "acquisition-payout-approve") {
    demand(a, "acquisition.admin");
    const employeeId = String(body.employeeId || ""); const reason = String(body.reason || "").trim();
    const commissionIds = Array.isArray(body.commissionIds) ? [...new Set(body.commissionIds.filter((id): id is string => typeof id === "string"))] : [];
    if (!employeeId || reason.length < 8 || reason.length > 1000 || !commissionIds.length || commissionIds.length > 300) throw new TeamError("Select unpaid ledger entries and provide the approval reason.");
    const entries = await tx.acquisitionCommission.findMany({ where: { id: { in: commissionIds }, employeeId, lead: { workspaceId: a.workspaceId }, status: { in: ["PENDING", "APPROVED"] }, eligibleAt: { lte: new Date() }, payoutItems: { none: { payout: { cancellation: { is: null } } } } } });
    if (entries.length !== commissionIds.length || new Set(entries.map(row => row.currency)).size !== 1) throw new TeamError("One or more entries are still held, already paid, belong to another employee, or use another currency.", 409);
    const evidenceRows = await tx.acquisitionRevenueEvidence.findMany({ where: { workspaceId: a.workspaceId, status: "RECONCILED", OR: entries.map(row => ({ sourceType: row.sourceType, sourceId: row.sourceId, paymentId: row.paymentId })) }, select: { sourceType: true, sourceId: true, paymentId: true } });
    if (evidenceRows.length !== new Set(entries.map(row => `${row.sourceType}:${row.sourceId}:${row.paymentId}`)).size) throw new TeamError("Reconcile every payment, refund, tax, and cost record before approving a payout.", 409);
    if (await tx.paymentWebhookEvent.count({ where: { paymentId: { in: entries.map(row => row.paymentId) }, signatureValid: true, processingState: { not: "processed" }, eventType: { in: ["refund.created", "refund.processed", "payment.dispute.created", "payment.dispute.lost"] } } })) throw new TeamError("A provider adjustment is awaiting processing. Keep this payment on hold.", 409);
    if (await tx.acquisitionCommission.count({ where: { employeeId, lead: { workspaceId: a.workspaceId }, currency: entries[0].currency, amountMinor: { lt: 0 }, payoutItems: { none: { payout: { cancellation: { is: null } } } }, id: { notIn: commissionIds } } })) throw new TeamError("Include all outstanding refund adjustments before approving a payout.", 409);
    const amountMinor = entries.reduce((sum, row) => sum + row.amountMinor, 0);
    if (amountMinor <= 0) throw new TeamError("The selected entries have no positive net payout.");
    const settings = await tx.acquisitionProgramSettings.findUnique({ where: { workspaceId: a.workspaceId } });
    if (amountMinor < (settings?.payoutMinimumMinor ?? 50000)) throw new TeamError("This balance is below the configured minimum and will carry forward; it is not forfeited.");
    const payout = await tx.acquisitionPayout.create({ data: { workspaceId: a.workspaceId, employeeId, currency: entries[0].currency, amountMinor, reason, recordedByEmployeeId: a.id, items: { create: entries.map(row => ({ commissionId: row.id, amountMinor: row.amountMinor })) } } });
    await tx.acquisitionProgramAudit.create({ data: { workspaceId: a.workspaceId, actorEmployeeId: a.id, action: "commission.payout_approved", entityId: payout.id, metadata: { employeeId, commissionIds, amountMinor, currency: payout.currency, reason } } });
    return payout;
  }
  if (resource === "acquisition-payout-cancel") {
    demand(a, "acquisition.admin");
    const payoutId = String(body.payoutId || ""); const reason = String(body.reason || "").trim();
    if (reason.length < 8 || reason.length > 1000) throw new TeamError("Provide the cancellation reason.");
    await tx.$queryRaw`SELECT id FROM acquisition_payouts WHERE id = ${payoutId} FOR UPDATE`;
    const payout = await tx.acquisitionPayout.findFirst({ where: { id: payoutId, workspaceId: a.workspaceId }, include: { payment: true, cancellation: true, items: true } });
    if (!payout || payout.payment || payout.cancellation) throw new TeamError("Only an unpaid approved batch can be cancelled.", 409);
    const cancelled = await tx.acquisitionPayoutCancellation.create({ data: { payoutId, reason, recordedByEmployeeId: a.id } });
    await tx.acquisitionProgramAudit.create({ data: { workspaceId: a.workspaceId, actorEmployeeId: a.id, action: "commission.payout_cancelled", entityId: payoutId, metadata: { reason, amountMinor: payout.amountMinor, items: payout.items } } });
    return { id: payoutId, cancelledAt: cancelled.createdAt, cancelledItems: payout.items };
  }
  if (resource === "acquisition-payout-record") {
    demand(a, "acquisition.admin");
    const payoutId = String(body.payoutId || ""); const paymentReference = String(body.paymentReference || "").trim(); const reason = String(body.reason || "").trim();
    if (!paymentReference || paymentReference.length > 200 || reason.length < 8 || reason.length > 1000) throw new TeamError("Provide the actual payment reference and evidence after transferring the payout.");
    await tx.$queryRaw`SELECT id FROM acquisition_payouts WHERE id = ${payoutId} FOR UPDATE`;
    const payout = await tx.acquisitionPayout.findFirst({ where: { id: payoutId, workspaceId: a.workspaceId }, include: { payment: true, cancellation: true, items: { include: { commission: true } } } });
    if (!payout || payout.payment || payout.cancellation) throw new TeamError("Approved payout unavailable or already paid.", 409);
    const sources = payout.items.map(row => ({ sourceType: row.commission.sourceType, sourceId: row.commission.sourceId, paymentId: row.commission.paymentId }));
    const reconciled = await tx.acquisitionRevenueEvidence.count({ where: { workspaceId: a.workspaceId, status: "RECONCILED", OR: sources } });
    if (reconciled !== new Set(sources.map(row => `${row.sourceType}:${row.sourceId}:${row.paymentId}`)).size || !sources.length) throw new TeamError("An approved payment is disputed or awaits reconciliation. Resolve it or cancel this batch before payment.", 409);
    if (await tx.paymentWebhookEvent.count({ where: { paymentId: { in: sources.map(row => row.paymentId) }, signatureValid: true, processingState: { not: "processed" }, eventType: { in: ["refund.created", "refund.processed", "payment.dispute.created", "payment.dispute.lost"] } } })) throw new TeamError("A provider adjustment is awaiting processing. Keep this payment on hold.", 409);
    if (await tx.acquisitionCommission.count({ where: { employeeId: payout.employeeId, lead: { workspaceId: a.workspaceId }, currency: payout.currency, amountMinor: { lt: 0 }, payoutItems: { none: { payout: { cancellation: { is: null } } } } } })) throw new TeamError("New refund adjustments changed the balance. Cancel and rebuild this batch before payment.", 409);
    const payment = await tx.acquisitionPayoutPayment.create({ data: { payoutId, paymentReference, recordedByEmployeeId: a.id } });
    await tx.acquisitionProgramAudit.create({ data: { workspaceId: a.workspaceId, actorEmployeeId: a.id, action: "commission.payout_paid", entityId: payoutId, metadata: { amountMinor: payout.amountMinor, currency: payout.currency, paymentReference, reason } } });
    return payment;
  }
  if (resource === "acquisition-reassign") {
    demand(a, "acquisition.admin");
    const leadId = String(body.leadId || ""); const employeeId = String(body.employeeId || ""); const role = body.role === "RESEARCHER" ? "RESEARCHER" : "ACQUISITION"; const reason = String(body.reason || "").trim();
    if (!reason || reason.length < 8 || reason.length > 1000) throw new TeamError("Admin reassignment requires an explanatory reason.");
    const lead = await tx.acquisitionLead.findFirst({ where: { id: leadId, workspaceId: a.workspaceId } });
    if (!lead) throw new TeamError("Lead unavailable.", 404);
    if (!await tx.teamMember.findFirst({ where: { id: employeeId, workspaceId: a.workspaceId } })) throw new TeamError("Choose a member of this workspace.");
    const previous = role === "RESEARCHER" ? lead.researcherEmployeeId : lead.acquisitionEmployeeId;
    await tx.acquisitionLead.update({ where: { id: lead.id }, data: role === "RESEARCHER" ? { researcherEmployeeId: employeeId } : { acquisitionEmployeeId: employeeId } });
    await tx.leadOwnershipEvent.create({ data: { leadId: lead.id, actorEmployeeId: a.id, previousEmployeeId: previous, newEmployeeId: employeeId, attributionRole: role, reason } });
    await tx.acquisitionProgramAudit.create({ data: { workspaceId: a.workspaceId, actorEmployeeId: a.id, action: "lead.attribution_overridden", entityId: lead.id, metadata: { role, previous, employeeId, reason } } });
    return { ok: true };
  }
  throw new TeamError("Unknown acquisition action.", 404);
}
