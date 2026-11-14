import { readClientDetails } from '@/lib/client-details';
import "server-only";
import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CLIENT_INTERESTS, type ClientInterest } from "./client-interests";

type ClientAccount = {
  onboardingPreferences?: unknown;
  id: number;
  name: string;
  email: string;
  mobile: string | null;
  contactEmail: string | null;
  onboardingPurpose: string | null;
  onboardingUserType: string | null;
};

const normalisePhone = (value: string | null | undefined) => value?.replace(/[^+\d]/g, "").slice(0, 40) ?? "";

function accountInterests(account: Pick<ClientAccount, "onboardingPurpose" | "onboardingUserType">): ClientInterest[] {
  const source = `${account.onboardingPurpose ?? ""} ${account.onboardingUserType ?? ""}`.toLowerCase();
  const interests: ClientInterest[] = [];
  if (/distribution|release|artist|label/.test(source)) interests.push("DISTRIBUTION");
  if (/buy.*beat|beat.*buy|find beat/.test(source)) interests.push("BEAT_PURCHASE");
  if (/sell.*beat|beat.*sell|producer/.test(source)) interests.push("BEAT_SALES");
  if (/playlist|curat/.test(source)) interests.push("PLAYLIST_CURATION");
  if (/mix|master|studio/.test(source)) interests.push("MIX_MASTER");
  if (/engineer|audio professional/.test(source)) interests.push("BECOME_ENGINEER");
  return interests;
}

function accountFootnote(account: Pick<ClientAccount, "onboardingPurpose" | "onboardingUserType">) {
  return [
    account.onboardingPurpose ? `Onboarding goal: ${account.onboardingPurpose}` : "",
    account.onboardingUserType ? `Account type: ${account.onboardingUserType}` : ""
  ].filter(Boolean).join("\n");
}

async function importAccounts(tx: Prisma.TransactionClient, workspaceId: string, ownerId: string, accounts: ClientAccount[]) {
  if (!accounts.length) return 0;
  const emails = accounts.flatMap(account => [account.email,account.contactEmail]).filter((value):value is string=>Boolean(value)).map(value=>value.toLowerCase());
  const linkedUserIds = accounts.map(account => account.id);
  const linkedCards = await tx.teamClient.findMany({ where: { userId: { in: linkedUserIds } } });
  const linkedCardByUser = new Map(linkedCards.map(card => [card.userId!, card]));
  const emailCards = await tx.teamClient.findMany({
    where: { workspaceId, userId: null, mergedIntoId:null, OR: [{ email: { in: emails, mode: "insensitive" } }, { secondaryEmail: { in: emails, mode: "insensitive" } },{additionalEmails:{hasSome:emails}}] },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
  const emailCardByEmail = new Map<string, (typeof emailCards)[number]>();
  for (const card of emailCards) {
    const email = card.email.toLowerCase();
    if (email && !emailCardByEmail.has(email)) emailCardByEmail.set(email, card);
    for(const alias of card.additionalEmails)if(alias&&!emailCardByEmail.has(alias.toLowerCase()))emailCardByEmail.set(alias.toLowerCase(),card);
    const secondary = card.secondaryEmail.toLowerCase();
    if (secondary && !emailCardByEmail.has(secondary)) emailCardByEmail.set(secondary, card);
  }
  const creates: Prisma.TeamClientCreateManyInput[] = [];
  let linked = 0;
  for (const account of accounts) {
    const raw=account.onboardingPreferences as {clientDetails?:unknown}|null;
    const details=readClientDetails(raw?.clientDetails);
    const customerDetails=raw?.clientDetails?{clientDetails:{...details,source:"CUSTOMER"},city:details.city,state:details.state}:{};
    const existing = linkedCardByUser.get(account.id);
    if (existing) {
      const phone = normalisePhone(account.mobile);
      const interests = accountInterests(account);
      const notes = accountFootnote(account);
      const fields = {
        ...(Object.keys((existing.clientDetails as object)||{}).length===0?customerDetails:{}),
        ...(!existing.phone && phone ? { phone } : {}),
        ...(!existing.email ? { email: account.email } : {}),
        ...(!existing.secondaryEmail && account.contactEmail && account.contactEmail.toLowerCase() !== account.email.toLowerCase() ? { secondaryEmail: account.contactEmail } : {}),
        ...(!existing.interests.length && interests.length ? { interests } : {}),
        ...(!existing.notes && notes ? { notes } : {})
      };
      if (Object.keys(fields).length) await tx.teamClient.update({ where: { id: existing.id }, data: { ...fields, version: { increment: 1 } } });
      continue;
    }
    const contact = emailCardByEmail.get(account.email.toLowerCase()) || (account.contactEmail ? emailCardByEmail.get(account.contactEmail.toLowerCase()) : undefined);
    if (contact) {
      const interests = contact.interests.length ? contact.interests : accountInterests(account);
      const notes = contact.notes || accountFootnote(account);
      await tx.teamClient.update({
        where: { id: contact.id },
        data: {
          ...(Object.keys((contact.clientDetails as object)||{}).length===0?customerDetails:{}),
          userId: account.id,
          ...(contact.phone || !normalisePhone(account.mobile) ? {} : { phone: normalisePhone(account.mobile) }),
          ...(contact.secondaryEmail || !account.contactEmail || account.contactEmail.toLowerCase() === account.email.toLowerCase() ? {} : { secondaryEmail: account.contactEmail }),
          ...(contact.interests.length ? {} : { interests }),
          ...(contact.notes ? {} : { notes }),
          version: { increment: 1 }
        }
      });
      for (const [email, candidate] of emailCardByEmail) if (candidate.id === contact.id) emailCardByEmail.delete(email);
      linked += 1;
      continue;
    }
    const purpose = account.onboardingPurpose?.trim() || "";
    const userType = account.onboardingUserType?.trim() || "";
    creates.push({
      workspaceId,
      ownerId,
      userId: account.id,
      name: account.name,
      phone: normalisePhone(account.mobile),
      email: account.email,
      secondaryEmail: account.contactEmail?.toLowerCase() === account.email.toLowerCase() ? "" : account.contactEmail ?? "",
      interests: accountInterests(account),
      state: "",
      city: "",
      ...customerDetails,
      notes: accountFootnote({ onboardingPurpose: purpose, onboardingUserType: userType }),
      status: "ACTIVE"
    });
  }
  if (creates.length) await tx.teamClient.createMany({ data: creates, skipDuplicates: true });
  return linked + creates.length;
}

export async function importWorkspaceClientAccounts(workspaceId: string) {
  return prisma.$transaction(async tx => {
    const workspace = await tx.teamWorkspace.findUnique({ where: { id: workspaceId }, select: { id: true, clientCardsImportedAt: true } });
    if (!workspace || workspace.clientCardsImportedAt) return 0;
    await tx.$queryRaw`SELECT id FROM team_workspaces WHERE id = ${workspaceId} FOR UPDATE`;
    const current = await tx.teamWorkspace.findUnique({ where: { id: workspaceId }, select: { clientCardsImportedAt: true } });
    if (current?.clientCardsImportedAt) return 0;
    const owner = await tx.teamMember.findFirst({ where: { workspaceId, status: "ACTIVE", role: { owner: true } }, orderBy: { joinedAt: "asc" }, select: { id: true } });
    if (!owner) return 0;
    const accounts = await tx.user.findMany({
      where: { role: { in: [UserRole.CUSTOMER, UserRole.PRODUCER] }, status: { notIn: ["BANNED", "DELETION_SCHEDULED"] } },
      select: { id: true, name: true, email: true, mobile: true, contactEmail: true, onboardingPurpose: true, onboardingUserType: true, onboardingPreferences:true },
      orderBy: { id: "asc" }
    });
    const count = await importAccounts(tx, workspaceId, owner.id, accounts);
    await tx.teamWorkspace.update({ where: { id: workspaceId }, data: { clientCardsImportedAt: new Date() } });
    return count;
  }, { maxWait: 10000, timeout: 30000 });
}

export async function ensureAccountClientCard(userId: number, options: { syncMobileToCard?: boolean; mobile?: string } = {}) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, status: true, name: true, email: true, mobile: true, contactEmail: true, onboardingPurpose: true, onboardingUserType: true, onboardingPreferences:true }
  });
  if (!user || (user.role !== UserRole.CUSTOMER && user.role !== UserRole.PRODUCER) || ["BANNED", "DELETION_SCHEDULED"].includes(user.status)) return null;
  const account = { ...user, mobile: options.mobile ?? user.mobile };
  const workspace = await prisma.teamWorkspace.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!workspace) return null;
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM team_workspaces WHERE id = ${workspace.id} FOR UPDATE`;
    const owner = await tx.teamMember.findFirst({ where: { workspaceId: workspace.id, status: "ACTIVE", role: { owner: true } }, orderBy: { joinedAt: "asc" }, select: { id: true } });
    if (!owner) return null;
    if (options.mobile !== undefined) {
      const updated = await tx.user.updateMany({
        where: { id: userId, role: UserRole.CUSTOMER, status: "ACTIVE" },
        data: { mobile: options.mobile }
      });
      if (updated.count !== 1) throw new Error("Customer account is no longer active.");
    }
    const count = await importAccounts(tx, workspace.id, owner.id, [account]);
    const card = await tx.teamClient.findUnique({ where: { userId: account.id }, select: { id: true, phone: true, alternatePhones: true } });
    let contactCardSynced = Boolean(card);
    if (card && options.syncMobileToCard) {
      const phone = normalisePhone(account.mobile);
      const previousPhone = normalisePhone(card.phone);
      const alternatePhones = [...new Set([
        ...card.alternatePhones.map(normalisePhone),
        ...(previousPhone && previousPhone !== phone ? [previousPhone] : [])
      ].filter(value => value && value !== phone))];
      await tx.teamClient.update({ where: { id: card.id }, data: { phone, alternatePhones, version: { increment: 1 } } });
      contactCardSynced = true;
    }
    return { createdOrLinked: count > 0 || Boolean(card), contactCardSynced };
  }, { maxWait: 10000, timeout: 30000 });
}

export { CLIENT_INTERESTS };
