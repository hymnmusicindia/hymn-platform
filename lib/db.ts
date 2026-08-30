import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import mysql from "mysql2/promise";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  AdminNote,
  AnalyticsSummary,
  ArtistProfile,
  Beat,
  ContactMessage,
  Coupon,
  Order,
  OrderItem,
  PartnershipLead,
  ProducerApplication,
  ProducerApplicationStatus,
  ProducerProfile,
  TimedPlaylistDashboard,
  TimedPlaylistTrack,
  TimedPlaylistTrackStatus,
  SiteSettings,
  ProducerEarning,
  Notification,
  NotificationPriority,
  NotificationType,
  SupportTicket,
  SupportTicketStatus,
  Release,
  ReleaseStatus,
  ReferralActivity,
  User,
  UserRole
} from "@/lib/types";
import { buildAnalyticsSummary, ensureReleaseAnalytics } from "@/lib/analytics";
import { createUniqueReferralCode, qualifyReferralInTransaction, registerReferralForNewUser, sendReferralRewardEmails } from "@/lib/referrals";
import { sampleBeats, sampleReleases } from "@/lib/site";
import { searchSpotifyTracks } from "@/lib/spotify";
import { PRODUCER_COMMISSION_CONFIG } from "@/lib/finance-config";
import { resolveGoogleAccountRole } from "@/lib/auth-role";
import { normalizePublicUploadUrl } from "@/lib/storage";

type MemoryState = {
  users: User[];
  releases: Release[];
  beats: Beat[];
  orders: Order[];
  coupons: Coupon[];
  referrals: ReferralActivity[];
  contactMessages: ContactMessage[];
  adminNotes: AdminNote[];
  partnershipLeads: PartnershipLead[];
  producerApplications: ProducerApplication[];
  artistProfiles: ArtistProfile[];
  producerProfiles: ProducerProfile[];
  notifications: Notification[];
  supportTickets: SupportTicket[];
  timedPlaylistTracks: TimedPlaylistTrack[];
  siteSettings: SiteSettings;
};

type OrderRow = Omit<Order, "items"> & { items?: string | null };

type AuthAccountRole = Exclude<UserRole, "admin">;

const globalState = globalThis as typeof globalThis & {
  hymnMemory?: MemoryState;
  hymnPool?: mysql.Pool;
  hymnSiteSettings?: SiteSettings;
  hymnProducerProfiles?: ProducerProfile[];
};

function usesPostgresPrisma() {
  return /^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL?.trim() ?? "");
}

function rethrowProductionPersistenceFailure(error: unknown) {
  if (process.env.NODE_ENV === "production") {
    throw error instanceof Error ? error : new Error("Persistent database operation failed.");
  }
}

function assertNoProductionMemoryStore(feature: string) {
  if (process.env.NODE_ENV === "production") {
    console.warn(`${feature} requires a persistent database table; currently using fallback in-memory storage.`);
  }
}

function toPrismaRole(role: UserRole) {
  return role.toUpperCase() as "CUSTOMER" | "PRODUCER" | "ADMIN";
}

function fromPrismaRole(role: string): UserRole {
  if (role === "ADMIN") return "admin";
  if (role === "PRODUCER") return "producer";
  return "customer";
}

function mapPrismaUser(user: {
  id: number;
  name: string;
  email: string;
  googleId: string;
  avatar?: string | null;
  passwordHash?: string | null;
  role: string;
  status?: string;
  statusReason?: string | null;
  statusChangedAt?: Date | null;
  deletionScheduledAt?: Date | null;
  appealRequestedAt?: Date | null;
  appealMessage?: string | null;
  referralCode: string | null;
  referralCredits: number;
  referredById: number | null;
  firstPaymentRewarded: boolean;
  createdAt: Date;
  mobile?: string | null;
  contactEmail?: string | null;
  dateOfBirth?: Date | null;
  preferredLanguage?: string;
  onboardingPurpose?: string | null;
  onboardingUserType?: string | null;
  referralSource?: string | null;
  onboardingCompletedAt?: Date | null;
}): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    googleId: user.googleId,
    avatarUrl: user.avatar ?? null,
    passwordHash: user.passwordHash ?? undefined,
    role: fromPrismaRole(user.role),
    status: String(user.status || "ACTIVE").toLowerCase() as User["status"],
    statusReason: user.statusReason ?? null,
    statusChangedAt: user.statusChangedAt?.toISOString() ?? null,
    deletionScheduledAt: user.deletionScheduledAt?.toISOString() ?? null,
    appealRequestedAt: user.appealRequestedAt?.toISOString() ?? null,
    appealMessage: user.appealMessage ?? null,
    referralCode: user.referralCode ?? "",
    referralCredits: user.referralCredits ?? 0,
    referredBy: user.referredById ?? null,
    firstPaymentRewarded: user.firstPaymentRewarded ?? false,
    createdAt: user.createdAt.toISOString(),
    mobile: user.mobile ?? null,
    contactEmail: user.contactEmail ?? null,
    dateOfBirth: user.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    preferredLanguage: user.preferredLanguage ?? "en",
    onboardingPurpose: user.onboardingPurpose ?? null,
    onboardingUserType: user.onboardingUserType ?? null,
    referralSource: user.referralSource ?? null,
    onboardingCompletedAt: user.onboardingCompletedAt?.toISOString() ?? null
  };
}

function mapPrismaProducerApplication(application: {
  id: number;
  userId: number;
  producerName: string;
  genre: string;
  portfolioLinks: string[];
  instagram: string | null;
  youtube: string | null;
  soundcloud: string | null;
  spotify: string | null;
  yearsExperience: number;
  pricing: string;
  sampleBeats: string[];
  bio: string;
  status: string;
  reviewedById: number | null;
  reviewedAt: Date | null;
  internalNotes: string | null;
  createdAt: Date;
  user?: { name: string; email: string } | null;
}): ProducerApplication {
  const links = [
    ...application.portfolioLinks,
    application.instagram,
    application.youtube,
    application.soundcloud,
    application.spotify
  ].filter(Boolean);

  return {
    id: application.id,
    userId: application.userId,
    name: application.user?.name ?? application.producerName,
    email: application.user?.email ?? "",
    artistName: application.producerName,
    genreFocus: application.genre,
    beatCatalogSize: application.sampleBeats.length || 1,
    experience: `${application.yearsExperience} years / ${application.pricing}`,
    links: links.join("\n"),
    message: application.bio,
    status: application.status === "APPROVED" ? "approved" : application.status === "REJECTED" ? "rejected" : "pending",
    reviewedBy: application.reviewedById,
    reviewedAt: application.reviewedAt?.toISOString() ?? null,
    reviewNote: application.internalNotes,
    createdAt: application.createdAt.toISOString()
  };
}

const demoCustomerPasswordHash = bcrypt.hashSync("123456", 10);
const demoProducerPasswordHash = bcrypt.hashSync("123456", 10);
const demoAdminPasswordHash = bcrypt.hashSync("admin", 10);

const defaultUsers: User[] = [
  {
    id: 1,
    name: "HYMN Admin",
    email: "admin@hymnmusic.in",
    googleId: "demo-google-admin",
    passwordHash: demoAdminPasswordHash,
    role: "admin",
    referralCode: "HYMNADMIN",
    referralCredits: 0,
    referredBy: null,
    firstPaymentRewarded: false,
    createdAt: new Date().toISOString()
  },
  {
    id: 2,
    name: "HYMN Demo Artist",
    email: "customer@test.com",
    googleId: "demo-google-customer",
    passwordHash: demoCustomerPasswordHash,
    role: "customer",
    referralCode: "HYMNSTART",
    referralCredits: 1500,
    referredBy: null,
    firstPaymentRewarded: false,
    createdAt: new Date().toISOString()
  },
  {
    id: 3,
    name: "HYMN Demo Producer",
    email: "producer@test.com",
    googleId: "demo-google-producer",
    passwordHash: demoProducerPasswordHash,
    role: "producer",
    referralCode: "HYMNPROD",
    referralCredits: 0,
    referredBy: null,
    firstPaymentRewarded: false,
    createdAt: new Date().toISOString()
  }
];

const defaultProducerProfiles: ProducerProfile[] = [];

const defaultSiteSettings: SiteSettings = {
  homeHeroImageUrl: null
};

const defaultTimedPlaylistOptions = [
  { name: "Dusk Till Dawn", url: "https://open.spotify.com/playlist/2soKoURWSXnWJ48ygivet8?si=be915af9a28a4c9f" },
  { name: "Fresh Releases", url: "https://open.spotify.com/playlist/1Gx9l9GVerLbzL3Wc7HPBK?si=178eef56e7c348c1" },
  { name: "Indie Hits", url: "https://open.spotify.com/playlist/5XZL9kya8MYerEUJsvzyyR?si=fecde6c475d4420b" },
  { name: "Ungatekept Gems", url: "https://open.spotify.com/playlist/6SMKwPUHU0T7HKiaz4Qcvv?si=87c364ebcade434d" }
];
const defaultTimedPlaylistNames = defaultTimedPlaylistOptions.map((playlist) => playlist.name);

const demoBeats: Beat[] = sampleBeats.map((beat) => ({  ...beat,
  producerId: 3,
  producerName: "HYMN Demo Producer"
}));

const demoOrders: Order[] = [
  {
    id: 1,
    userId: 2,
    buyerName: "HYMN Demo Artist",
    buyerEmail: "customer@test.com",
    razorpayOrderId: "demo_order_paid_1",
    razorpayPaymentId: "demo_payment_paid_1",
    productId: "beatstore",
    originalPrice: 648,
    discountApplied: 0,
    referralCreditsUsed: 0,
    finalAmount: 648,
    couponCode: null,
    amount: 648,
    paymentStatus: "paid",
    items: [
      {
        beatId: demoBeats[0]?.id ?? 1,
        beatTitle: demoBeats[0]?.title ?? "Midnight Pressure",
        producerId: 3,
        producerName: "HYMN Demo Producer",
        licenseType: "premium",
        price: 538,
        licenseUrl: "/licenses/demo_order_paid_1-1-premium.pdf",
        downloadUrl: demoBeats[0]?.fileUrl ?? "/downloads/midnight-pressure.wav"
      },
      {
        beatId: demoBeats[3]?.id ?? 4,
        beatTitle: demoBeats[3]?.title ?? "Blue Flame",
        producerId: 3,
        producerName: "HYMN Demo Producer",
        licenseType: "basic",
        price: 110,
        licenseUrl: "/licenses/demo_order_paid_1-4-basic.pdf",
        downloadUrl: demoBeats[3]?.fileUrl ?? "/downloads/blue-flame.wav"
      }
    ],
    createdAt: new Date().toISOString()
  }
];

const defaultCoupons: Coupon[] = [
  {
    id: 1,
    code: "WELCOME100",
    discountType: "flat",
    discountValue: 100,
    expiryDate: null,
    usageLimit: 500,
    perUserLimit: 1,
    active: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 2,
    code: "HYMN10",
    discountType: "percentage",
    discountValue: 10,
    expiryDate: null,
    usageLimit: 1000,
    perUserLimit: 2,
    active: true,
    createdAt: new Date().toISOString()
  }
];

const memory = globalState.hymnMemory ?? {
  users: defaultUsers,
  releases: sampleReleases.map((release) => ensureReleaseAnalytics({ ...release, userId: 2 })),
  beats: demoBeats,
  orders: demoOrders,
  coupons: defaultCoupons,
  referrals: [],
  contactMessages: [],
  adminNotes: [],
  partnershipLeads: [],
  producerApplications: [],
  artistProfiles: [],
  producerProfiles: defaultProducerProfiles,
  notifications: [],
  supportTickets: [],
  timedPlaylistTracks: [],
  siteSettings: defaultSiteSettings,
};

globalState.hymnMemory = memory;
globalState.hymnProducerProfiles = memory.producerProfiles;
globalState.hymnSiteSettings = memory.siteSettings;

function getPool() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (usesPostgresPrisma()) return null;
  if (process.env.NODE_ENV === "production") {
    throw new Error("Legacy MySQL persistence is disabled in production; configure PostgreSQL through DATABASE_URL.");
  }
  const looksLikeExample = !databaseUrl || databaseUrl === "mysql://user:password@localhost:3306/hymn";

  if (looksLikeExample) return null;
  if (!globalState.hymnPool) {
    globalState.hymnPool = mysql.createPool({ uri: databaseUrl, connectionLimit: 10 });
  }
  return globalState.hymnPool;
}

function nextId(items: { id: number }[]) {
  return items.length ? Math.max(...items.map((item) => item.id)) + 1 : 1;
}

function randomReferralCode() {
  return `HYMN${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function normalizeReferralCode(value?: string | null) {
  return value?.trim().toUpperCase() || "";
}

async function resolveReferrer(referralCode?: string | null) {
  const code = normalizeReferralCode(referralCode);
  if (!code) return null;
  return findUserByReferralCode(code);
}

function rejectSelfReferral(referrer: User | null, email: string) {
  if (referrer && referrer.email.toLowerCase() === email.toLowerCase()) {
    throw new Error("You cannot use your own referral code.");
  }
}

function createLocalGoogleId(prefix = "local") {
  return `${prefix}-${randomUUID()}`;
}

export async function createPasswordUser(input: {
  name: string;
  email: string;
  passwordHash: string;
  role: AuthAccountRole;
  referralCode?: string;
}) {
  if (usesPostgresPrisma()) {
    const normalizedEmail = input.email.trim().toLowerCase();
    return prisma.$transaction(async tx => {
      const existing = await tx.user.findFirst({ where: { email: { equals: normalizedEmail, mode: "insensitive" } } });
      if (existing) return null;
      const permanentReferralCode = await createUniqueReferralCode(tx, input.name);
      const user = await tx.user.create({ data: {
        name: input.name.trim(), email: normalizedEmail, googleId: createLocalGoogleId(input.role),
        passwordHash: input.passwordHash, role: toPrismaRole(input.role), referralCode: permanentReferralCode
      } });
      await registerReferralForNewUser(tx, { referredUserId: user.id, referredEmail: user.email, referralCode: input.referralCode });
      return mapPrismaUser(user);
    });
  }
  const pool = getPool();
  const referrer = await resolveReferrer(input.referralCode);
  rejectSelfReferral(referrer, input.email);

  if (!pool) {
    const existing = memory.users.find((user) => user.email.toLowerCase() === input.email.toLowerCase());
    if (existing) return null;

    const user: User = {
      id: nextId(memory.users),
      name: input.name,
      email: input.email,
      googleId: createLocalGoogleId(input.role),
      passwordHash: input.passwordHash,
      role: input.role,
      referralCode: randomReferralCode(),
      referralCredits: 0,
      referredBy: referrer?.id ?? null,
      firstPaymentRewarded: false,
      createdAt: new Date().toISOString()
    };
    memory.users.push(user);
    if (referrer) {
      memory.referrals.unshift({
        id: nextId(memory.referrals),
        userId: referrer.id,
        referredUserId: user.id,
        referralCode: referrer.referralCode,
        signupEmail: user.email,
        status: "signed_up",
        purchaseAmount: 0,
        earnings: 0,
        createdAt: new Date().toISOString(),
        rewardedAt: null
      });
    }
    return user;
  }

  const existing = await findUserByEmail(input.email);
  if (existing) return null;

  const [result] = await pool.query(
    "INSERT INTO users (name, email, google_id, password_hash, role, referral_code, referred_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [input.name, input.email, createLocalGoogleId(input.role), input.passwordHash, input.role, randomReferralCode(), referrer?.id ?? null]
  );
  const userId = Number((result as mysql.ResultSetHeader).insertId);
  if (referrer) {
    await pool.query(
      "INSERT IGNORE INTO referrals (user_id, referred_user_id, referral_code, signup_email, status) VALUES (?, ?, ?, ?, 'signed_up')",
      [referrer.id, userId, referrer.referralCode, input.email]
    );
  }
  return findUserByEmail(input.email);
}

const mockLoginAccounts: Record<AuthAccountRole, { name: string; email: string; googleId: string }> = {
  producer: {
    name: "HYMN Demo Producer",
    email: "producer@test.com",
    googleId: "mock-producer"
  },
  customer: {
    name: "HYMN Demo Artist",
    email: "customer@test.com",
    googleId: "mock-customer"
  }
};

export async function ensureMockUser(role: AuthAccountRole) {
  const account = mockLoginAccounts[role];
  const pool = getPool();

  if (!pool) {
    const existing = memory.users.find((user) => user.email.toLowerCase() === account.email.toLowerCase());
    if (existing) {
      existing.name = account.name;
      existing.role = role;
      return existing;
    }

    const user: User = {
      id: nextId(memory.users),
      name: account.name,
      email: account.email,
      googleId: account.googleId,
      role,
      referralCode: randomReferralCode(),
      referralCredits: 0,
      referredBy: null,
      firstPaymentRewarded: false,
      createdAt: new Date().toISOString()
    };
    memory.users.push(user);
    return user;
  }

  const existing = await findUserByEmail(account.email);
  if (existing) {
    await pool.query("UPDATE users SET name = ?, role = ? WHERE id = ?", [account.name, role, existing.id]);
    return (await findUserById(existing.id)) ?? { ...existing, name: account.name, role };
  }

  await pool.query(
    "INSERT INTO users (name, email, google_id, role, referral_code) VALUES (?, ?, ?, ?, ?)",
    [account.name, account.email, account.googleId, role, randomReferralCode()]
  );
  return findUserByEmail(account.email);
}
function normalizePlatforms(value: string | string[]) {
  return Array.isArray(value) ? value : JSON.parse(value);
}

function normalizeOrderItems(items: string | OrderItem[] | null | undefined) {
  if (!items) return [];
  return (Array.isArray(items) ? items : JSON.parse(items)).filter(Boolean) as OrderItem[];
}

function mapOrder(order: Order) {
  return {
    ...order,
    items: order.items.map((item) => ({
      ...item,
      licenseUrl: item.licenseUrl ?? `/licenses/${order.razorpayOrderId}-${item.beatId}-${item.licenseType}.pdf`,
      downloadUrl: item.downloadUrl ?? memory.beats.find((beat) => beat.id === item.beatId)?.fileUrl ?? null
    }))
  };
}

function mapOrders(rows: OrderRow[]) {
  return rows.map((row) => ({ ...row, items: normalizeOrderItems(row.items) }));
}

type PrismaCheckoutOrderRow = Prisma.CheckoutOrderGetPayload<{
  include: { user: true; items: { include: { beat: { include: { user: true; audio: true } } } } };
}>;

const checkoutOrderInclude = {
  user: true,
  items: { include: { beat: { include: { user: true, audio: true } } } }
} as const;

function mapPrismaCheckoutOrder(row: PrismaCheckoutOrderRow): Order {
  return {
    id: row.id, userId: row.userId, buyerName: row.user.name, buyerEmail: row.user.email, productId: row.productId,
    originalPrice: Number(row.originalPrice), discountApplied: Number(row.discountApplied), referralCreditsUsed: row.referralCreditsUsed,
    finalAmount: Number(row.finalAmount), couponCode: row.couponCode, razorpayOrderId: row.razorpayOrderId,
    razorpayPaymentId: row.razorpayPaymentId ?? undefined, amount: Number(row.finalAmount),
    paymentStatus: row.paymentStatus as Order["paymentStatus"], createdAt: row.createdAt.toISOString(),
    items: row.items.map(item => ({
      beatId: item.beatId, beatTitle: item.beat.title, producerId: item.beat.userId, producerName: item.beat.user.name,
      licenseType: item.licenseType as OrderItem["licenseType"], price: Number(item.price), licenseUrl: item.licenseUrl,
      downloadUrl: item.beat.audio?.publicUrl?.startsWith("/api/assets/") ? item.beat.audio.publicUrl : null
    }))
  };
}

async function listPrismaCheckoutOrders(where: Prisma.CheckoutOrderWhereInput = {}) {
  const rows = await prisma.checkoutOrder.findMany({ where, include: checkoutOrderInclude, orderBy: { createdAt: "desc" } });
  return rows.map(mapPrismaCheckoutOrder);
}

function normalizeNotificationType(value?: string | null): NotificationType {
  if (value === "release" || value === "beat" || value === "order" || value === "payout" || value === "account" || value === "system") return value;
  return "system";
}

function normalizeNotificationPriority(value?: string | null): NotificationPriority {
  if (value === "low" || value === "high") return value;
  return "normal";
}

function parseNotificationMetadata(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function mapNotification(row: any): Notification {
  const metadata = parseNotificationMetadata(row.metadata);
  return {
    id: Number(row.id),
    userId: Number(row.userId ?? row.user_id),
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    type: normalizeNotificationType(row.type),
    href: row.href ?? null,
    actionLabel: row.actionLabel ?? row.action_label ?? null,
    priority: normalizeNotificationPriority(row.priority),
    eventKey: typeof metadata?.eventKey === "string" ? metadata.eventKey : null,
    metadata,
    readAt: row.readAt instanceof Date ? row.readAt.toISOString() : row.read_at instanceof Date ? row.read_at.toISOString() : row.readAt ?? row.read_at ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.created_at instanceof Date ? row.created_at.toISOString() : row.createdAt ?? row.created_at ?? new Date().toISOString()
  };
}

export async function createNotification(input: {
  userId: number;
  title: string;
  body: string;
  type?: NotificationType;
  href?: string | null;
  actionLabel?: string | null;
  priority?: NotificationPriority;
  eventKey?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const eventKey = input.eventKey ?? (typeof input.metadata?.eventKey === "string" ? input.metadata.eventKey : null);
  const payload = {
    userId: input.userId,
    title: input.title,
    body: input.body,
    type: input.type ?? "system",
    href: input.href ?? null,
    actionLabel: input.actionLabel ?? null,
    priority: input.priority ?? "normal",
    eventKey,
    metadata: eventKey ? { ...(input.metadata ?? {}), eventKey } : input.metadata ?? null
  };
  const databasePayload = {
    userId: payload.userId,
    title: payload.title,
    body: payload.body,
    type: payload.type,
    href: payload.href,
    actionLabel: payload.actionLabel,
    priority: payload.priority,
    eventKey: payload.eventKey,
    metadata: payload.metadata ? payload.metadata as Prisma.InputJsonValue : Prisma.JsonNull
  };

  if (usesPostgresPrisma()) {
    const notification = eventKey
      ? await prisma.notification.upsert({ where: { eventKey }, create: databasePayload, update: {} })
      : await prisma.notification.create({ data: databasePayload });
    return mapNotification(notification);
  }

  const pool = getPool();
  if (!pool) {
    if (eventKey) {
      const duplicate = memory.notifications.find((notification) => notification.userId === payload.userId && notification.metadata?.eventKey === eventKey);
      if (duplicate) return duplicate;
    }
    const notification: Notification = {
      id: nextId(memory.notifications),
      ...payload,
      readAt: null,
      createdAt: new Date().toISOString()
    };
    memory.notifications.unshift(notification);
    return notification;
  }

  if (eventKey) {
    const [existingRows] = await pool.query(
      `SELECT id, user_id AS userId, title, body, type, href, action_label AS actionLabel, priority, metadata, read_at AS readAt, created_at AS createdAt
       FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
      [payload.userId]
    );
    const duplicate = (existingRows as any[]).map(mapNotification).find((notification) => notification.metadata?.eventKey === eventKey);
    if (duplicate) return duplicate;
  }

  const [result] = await pool.query(
    `INSERT INTO notifications (user_id, title, body, type, href, action_label, priority, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [payload.userId, payload.title, payload.body, payload.type, payload.href, payload.actionLabel, payload.priority, payload.metadata ? JSON.stringify(payload.metadata) : null]
  );
  const notificationId = Number((result as mysql.ResultSetHeader).insertId);
  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, title, body, type, href, action_label AS actionLabel, priority, metadata, read_at AS readAt, created_at AS createdAt
     FROM notifications WHERE id = ? LIMIT 1`,
    [notificationId]
  );
  return mapNotification((rows as any[])[0]);
}

export async function listNotificationsByUser(userId: number, limit = 20) {
  const take = Math.max(1, Math.min(limit, 50));
  if (usesPostgresPrisma()) {
    const notifications = await (prisma as any).notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take
    });
    return notifications.map(mapNotification);
  }

  const pool = getPool();
  if (!pool) {
    return memory.notifications
      .filter((notification) => notification.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, take);
  }

  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, title, body, type, href, action_label AS actionLabel, priority, metadata, read_at AS readAt, created_at AS createdAt
     FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
    [userId, take]
  );
  return (rows as any[]).map(mapNotification);
}

export async function listLatestNotifications(limit = 50) {
  const take = Math.max(1, Math.min(limit, 100));
  if (usesPostgresPrisma()) {
    const notifications = await (prisma as any).notification.findMany({
      orderBy: { createdAt: "desc" },
      take
    });
    return notifications.map(mapNotification);
  }

  const pool = getPool();
  if (!pool) {
    return [...memory.notifications]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, take);
  }

  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, title, body, type, href, action_label AS actionLabel, priority, metadata, read_at AS readAt, created_at AS createdAt
     FROM notifications ORDER BY created_at DESC LIMIT ?`,
    [take]
  );
  return (rows as any[]).map(mapNotification);
}

export async function getUnreadNotificationCount(userId: number) {
  if (usesPostgresPrisma()) {
    return (prisma as any).notification.count({ where: { userId, readAt: null } });
  }

  const pool = getPool();
  if (!pool) return memory.notifications.filter((notification) => notification.userId === userId && !notification.readAt).length;

  const [rows] = await pool.query("SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL", [userId]);
  return Number((rows as Array<{ count: number }>)[0]?.count ?? 0);
}

export async function markNotificationRead(userId: number, notificationId: number) {
  const readAt = new Date();
  if (usesPostgresPrisma()) {
    const result = await (prisma as any).notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt }
    });
    return result.count > 0;
  }

  const pool = getPool();
  if (!pool) {
    const notification = memory.notifications.find((item) => item.id === notificationId && item.userId === userId);
    if (!notification) return false;
    notification.readAt = notification.readAt ?? readAt.toISOString();
    return true;
  }

  const [result] = await pool.query("UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE id = ? AND user_id = ?", [notificationId, userId]);
  return Number((result as mysql.ResultSetHeader).affectedRows) > 0;
}

export async function markAllNotificationsRead(userId: number) {
  const readAt = new Date();
  if (usesPostgresPrisma()) {
    await (prisma as any).notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt }
    });
    return true;
  }

  const pool = getPool();
  if (!pool) {
    memory.notifications.forEach((notification) => {
      if (notification.userId === userId && !notification.readAt) notification.readAt = readAt.toISOString();
    });
    return true;
  }

  await pool.query("UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL", [userId]);
  return true;
}

function normalizeTicketStatus(value?: string | null): SupportTicketStatus {
  if (value === "in_progress" || value === "resolved" || value === "closed") return value;
  return "open";
}

function prismaTicketStatus(status: SupportTicketStatus) {
  if (status === "in_progress") return "IN_PROGRESS";
  return status.toUpperCase();
}

function mapSupportTicket(row: any): SupportTicket {
  return {
    id: Number(row.id),
    userId: Number(row.userId ?? row.user_id),
    subject: String(row.subject ?? ""),
    message: String(row.message ?? ""),
    status: normalizeTicketStatus(String(row.status ?? "").toLowerCase()),
    category: row.category ?? "general",
    priority: row.priority ?? "normal",
    relatedReleaseId: row.relatedReleaseId ?? row.related_release_id ?? null,
    relatedPurchaseId: row.relatedPurchaseId ?? row.related_purchase_id ?? null,
    relatedPayoutId: row.relatedPayoutId ?? row.related_payout_id ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.created_at instanceof Date ? row.created_at.toISOString() : row.createdAt ?? row.created_at ?? new Date().toISOString(),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updatedAt ?? row.updated_at ?? new Date().toISOString()
  };
}

export async function listSupportTicketsByUser(userId: number) {
  if (usesPostgresPrisma()) {
    const tickets = await (prisma as any).supportTicket.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" }
    });
    return tickets.map(mapSupportTicket);
  }

  const pool = getPool();
  if (!pool) return memory.supportTickets.filter((ticket) => ticket.userId === userId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, subject, message, status, created_at AS createdAt, updated_at AS updatedAt
     FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC`,
    [userId]
  );
  return (rows as any[]).map(mapSupportTicket);
}

export async function listAllSupportTickets() {
  if (usesPostgresPrisma()) {
    const tickets = await (prisma as any).supportTicket.findMany({ orderBy: { createdAt: "desc" } });
    return tickets.map(mapSupportTicket);
  }

  const pool = getPool();
  if (!pool) return [...memory.supportTickets].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, subject, message, status, created_at AS createdAt, updated_at AS updatedAt
     FROM support_tickets ORDER BY created_at DESC`
  );
  return (rows as any[]).map(mapSupportTicket);
}

export async function createSupportTicket(input: { userId: number; subject: string; message: string; category?: string; priority?: string; relatedReleaseId?: number | null; relatedPurchaseId?: number | null; relatedPayoutId?: number | null }) {
  if (usesPostgresPrisma()) {
    const ticket = await (prisma as any).supportTicket.create({
      data: {
        userId: input.userId,
        subject: input.subject,
        message: input.message,
        category: input.category ?? "general",
        priority: input.priority ?? "normal",
        relatedReleaseId: input.relatedReleaseId ?? null,
        relatedPurchaseId: input.relatedPurchaseId ?? null,
        relatedPayoutId: input.relatedPayoutId ?? null,
        status: "OPEN"
      }
    });
    await createNotification({
      userId: input.userId,
      title: "Support ticket created",
      body: `HYMN received your support request: ${input.subject}`,
      type: "system",
      href: "/dashboard?tab=support",
      actionLabel: "View ticket",
      metadata: { ticketId: ticket.id }
    });
    return mapSupportTicket(ticket);
  }

  const pool = getPool();
  if (!pool) {
    const now = new Date().toISOString();
    const ticket: SupportTicket = {
      id: nextId(memory.supportTickets),
      userId: input.userId,
      subject: input.subject,
      message: input.message,
      status: "open",
      createdAt: now,
      updatedAt: now
    };
    memory.supportTickets.unshift(ticket);
    await createNotification({
      userId: input.userId,
      title: "Support ticket created",
      body: `HYMN received your support request: ${input.subject}`,
      type: "system",
      href: "/dashboard?tab=support",
      actionLabel: "View ticket",
      metadata: { ticketId: ticket.id }
    });
    return ticket;
  }

  const [result] = await pool.query(
    "INSERT INTO support_tickets (user_id, subject, message, status) VALUES (?, ?, ?, 'open')",
    [input.userId, input.subject, input.message]
  );
  const ticketId = Number((result as mysql.ResultSetHeader).insertId);
  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, subject, message, status, created_at AS createdAt, updated_at AS updatedAt
     FROM support_tickets WHERE id = ? LIMIT 1`,
    [ticketId]
  );
  const ticket = mapSupportTicket((rows as any[])[0]);
  await createNotification({
    userId: input.userId,
    title: "Support ticket created",
    body: `HYMN received your support request: ${input.subject}`,
    type: "system",
    href: "/dashboard?tab=support",
    actionLabel: "View ticket",
    metadata: { ticketId: ticket.id }
  });
  return ticket;
}

export async function updateSupportTicketStatus(ticketId: number, status: SupportTicketStatus) {
  if (usesPostgresPrisma()) {
    const ticket = await (prisma as any).supportTicket.update({
      where: { id: ticketId },
      data: { status: prismaTicketStatus(status) }
    });
    await createNotification({
      userId: ticket.userId,
      title: "Support ticket updated",
      body: `Your support ticket "${ticket.subject}" is now ${status.replace(/_/g, " ")}.`,
      type: "system",
      href: "/dashboard?tab=support",
      actionLabel: "Open support",
      metadata: { ticketId: ticket.id, status }
    });
    return mapSupportTicket(ticket);
  }

  const pool = getPool();
  if (!pool) {
    const ticket = memory.supportTickets.find((item) => item.id === ticketId);
    if (!ticket) return null;
    ticket.status = status;
    ticket.updatedAt = new Date().toISOString();
    return ticket;
  }

  await pool.query("UPDATE support_tickets SET status = ? WHERE id = ?", [status, ticketId]);
  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, subject, message, status, created_at AS createdAt, updated_at AS updatedAt
     FROM support_tickets WHERE id = ? LIMIT 1`,
    [ticketId]
  );
  const ticket = (rows as any[])[0] ? mapSupportTicket((rows as any[])[0]) : null;
  if (ticket) {
    await createNotification({
      userId: ticket.userId,
      title: "Support ticket updated",
      body: `Your support ticket "${ticket.subject}" is now ${status.replace(/_/g, " ")}.`,
      type: "system",
      href: "/dashboard?tab=support",
      actionLabel: "Open support",
      metadata: { ticketId: ticket.id, status }
    });
  }
  return ticket;
}

export async function findUserByEmail(email: string) {
  if (usesPostgresPrisma()) {
    const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
    return user ? mapPrismaUser(user) : null;
  }

  const pool = getPool();
  if (!pool) return memory.users.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null;

  const [rows] = await pool.query(
    "SELECT id, name, email, password_hash AS passwordHash, google_id AS googleId, avatar AS avatarUrl, role, referral_code AS referralCode, referral_credits AS referralCredits, referred_by AS referredBy, first_payment_rewarded AS firstPaymentRewarded, created_at AS createdAt FROM users WHERE email = ? LIMIT 1",
    [email]
  );
  return (rows as User[])[0] ?? null;
}

export async function findUserById(id: number) {
  if (usesPostgresPrisma()) {
    const user = await prisma.user.findUnique({ where: { id } });
    return user ? mapPrismaUser(user) : null;
  }

  const pool = getPool();
  if (!pool) return memory.users.find((user) => user.id === id) ?? null;

  const [rows] = await pool.query(
    "SELECT id, name, email, google_id AS googleId, avatar AS avatarUrl, role, referral_code AS referralCode, referral_credits AS referralCredits, referred_by AS referredBy, first_payment_rewarded AS firstPaymentRewarded, created_at AS createdAt FROM users WHERE id = ? LIMIT 1",
    [id]
  );
  return (rows as User[])[0] ?? null;
}

export async function findUserByReferralCode(referralCode: string) {
  const code = normalizeReferralCode(referralCode);
  if (!code) return null;
  if (usesPostgresPrisma()) {
    const user = await prisma.user.findFirst({ where: { referralCode: { equals: code, mode: "insensitive" } } });
    return user ? mapPrismaUser(user) : null;
  }
  const pool = getPool();
  if (!pool) return memory.users.find((user) => user.referralCode.toUpperCase() === code) ?? null;

  const [rows] = await pool.query(
    "SELECT id, name, email, google_id AS googleId, avatar AS avatarUrl, role, referral_code AS referralCode, referral_credits AS referralCredits, referred_by AS referredBy, first_payment_rewarded AS firstPaymentRewarded, created_at AS createdAt FROM users WHERE UPPER(referral_code) = ? LIMIT 1",
    [code]
  );
  return (rows as User[])[0] ?? null;
}

export async function listUsers() {
  if (usesPostgresPrisma()) {
    const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });
    return users.map(mapPrismaUser);
  }

  const pool = getPool();
  if (!pool) return [...memory.users].sort((a, b) => a.name.localeCompare(b.name));

  const [rows] = await pool.query(
    "SELECT id, name, email, google_id AS googleId, avatar AS avatarUrl, role, referral_code AS referralCode, referral_credits AS referralCredits, referred_by AS referredBy, first_payment_rewarded AS firstPaymentRewarded, created_at AS createdAt FROM users ORDER BY created_at DESC"
  );
  return rows as User[];
}

export async function listRecentGoogleAvatarUrls(limit = 4) {
  const take = Math.max(1, Math.min(limit, 8));

  if (usesPostgresPrisma()) {
    const users = await prisma.user.findMany({
      where: {
        avatar: { not: null },
        googleId: { not: "" },
        role: { in: ["CUSTOMER", "PRODUCER"] }
      },
      select: { avatar: true },
      orderBy: { createdAt: "desc" },
      take
    });
    return users.flatMap((user) => user.avatar ? [user.avatar] : []);
  }

  const pool = getPool();
  if (!pool) {
    return memory.users
      .filter((user) => Boolean(user.googleId && user.avatarUrl && user.role !== "admin"))
      .slice(0, take)
      .flatMap((user) => user.avatarUrl ? [user.avatarUrl] : []);
  }

  const [rows] = await pool.query(
    "SELECT avatar AS avatarUrl FROM users WHERE google_id IS NOT NULL AND google_id <> '' AND avatar IS NOT NULL AND role IN ('customer', 'producer') ORDER BY created_at DESC LIMIT ?",
    [take]
  );
  return (rows as Array<{ avatarUrl?: string | null }>).flatMap((user) => user.avatarUrl ? [user.avatarUrl] : []);
}

export async function updateUserRole(userId: number, role: UserRole) {
  if (usesPostgresPrisma()) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { role: toPrismaRole(role) }
    });
    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: "USER_ROLE_UPDATED",
        entity: "users",
        entityId: String(userId),
        metadata: { role }
      }
    });
    return mapPrismaUser(user);
  }

  const pool = getPool();
  if (!pool) {
    const user = memory.users.find((item) => item.id === userId);
    if (!user) return null;
    user.role = role;
    return user;
  }

  await pool.query("UPDATE users SET role = ? WHERE id = ?", [role, userId]);
  return findUserById(userId);
}

export async function upsertGoogleUser(input: Pick<User, "name" | "email" | "googleId"> & { avatarUrl?: string | null; referralCode?: string; expectedRole?: AuthAccountRole }) {
  if (usesPostgresPrisma()) {
    return prisma.$transaction(async tx => {
      const normalizedEmail = input.email.trim().toLowerCase();
      const existing = await tx.user.findFirst({ where: { OR: [{ googleId: input.googleId }, { email: { equals: normalizedEmail, mode: "insensitive" } }] } });
      const role = resolveGoogleAccountRole(normalizedEmail, existing?.role);
      const permanentReferralCode = existing?.referralCode || await createUniqueReferralCode(tx, input.name);
      const user = existing
        ? await tx.user.update({ where: { id: existing.id }, data: { googleId: input.googleId, name: input.name.trim(), email: normalizedEmail, avatar: input.avatarUrl || existing.avatar, role: toPrismaRole(role) } })
        : await tx.user.create({ data: { googleId: input.googleId, name: input.name.trim(), email: normalizedEmail, avatar: input.avatarUrl || null, role: toPrismaRole(role), referralCode: permanentReferralCode } });
      if (!existing) await registerReferralForNewUser(tx, { referredUserId: user.id, referredEmail: user.email, referralCode: input.referralCode });
      await tx.auditLog.create({ data: { actorId: user.id, action: existing ? "LOGIN" : "USER_CREATED_WITH_GOOGLE", entity: "users", entityId: String(user.id), metadata: { authenticationProvider: "google" } } });
      return mapPrismaUser(user);
    });
  }

  const pool = getPool();
  const existing = await findUserByEmail(input.email);
  const resolvedRole = resolveGoogleAccountRole(input.email, existing?.role);
  const referrer = existing ? null : await resolveReferrer(input.referralCode);
  rejectSelfReferral(referrer, input.email);

  if (!pool) {
    const localUser = memory.users.find((user) => user.email.toLowerCase() === input.email.toLowerCase());
    if (localUser) {
      localUser.name = input.name;
      localUser.googleId = input.googleId;
      localUser.avatarUrl = input.avatarUrl || localUser.avatarUrl;
      localUser.role = resolvedRole;
      return localUser;
    }

    const user: User = {
      id: nextId(memory.users),
      name: input.name,
      email: input.email,
      googleId: input.googleId,
      avatarUrl: input.avatarUrl || null,
      role: resolvedRole,
      referralCode: randomReferralCode(),
      referralCredits: 0,
      referredBy: referrer?.id ?? null,
      firstPaymentRewarded: false,
      createdAt: new Date().toISOString()
    };
    memory.users.push(user);
    if (referrer) {
      memory.referrals.unshift({
        id: nextId(memory.referrals),
        userId: referrer.id,
        referredUserId: user.id,
        referralCode: referrer.referralCode,
        signupEmail: user.email,
        status: "signed_up",
        purchaseAmount: 0,
        earnings: 0,
        createdAt: new Date().toISOString(),
        rewardedAt: null
      });
    }
    return user;
  }

  await pool.query(
    `INSERT INTO users (name, email, google_id, avatar, role, referral_code, referred_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), google_id = VALUES(google_id), avatar = COALESCE(VALUES(avatar), avatar), role = VALUES(role)`,
    [input.name, input.email, input.googleId, input.avatarUrl || null, resolvedRole, existing?.referralCode || randomReferralCode(), referrer?.id ?? null]
  );
  const user = await findUserByEmail(input.email);
  if (referrer && user) {
    await pool.query(
      "INSERT IGNORE INTO referrals (user_id, referred_user_id, referral_code, signup_email, status) VALUES (?, ?, ?, ?, 'signed_up')",
      [referrer.id, user.id, referrer.referralCode, input.email]
    );
  }
  return findUserByEmail(input.email);
}

export async function listBeats() {
  if (usesPostgresPrisma()) {
    const prismaBeats = await prisma.beat.findMany({
      where: { enabled: true },
      include: { user: true, audio: true, preview: true, artwork: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }]
    });
    return prismaBeats.map(mapPrismaBeat);
  }
  const pool = getPool();
  if (!pool) return memory.beats.filter((beat) => beat.enabled).sort((a, b) => b.id - a.id);
  const [rows] = await pool.query(
    `SELECT b.id, b.producer_id AS producerId, u.name AS producerName, b.title, b.bpm, b.genre, b.mood, b.price,
            b.audio_preview_url AS audioPreviewUrl, b.file_url AS fileUrl, b.artwork_url AS artworkUrl, b.enabled, b.created_at AS createdAt
     FROM beats b
     LEFT JOIN users u ON u.id = b.producer_id
     WHERE b.enabled = 1
     ORDER BY b.created_at DESC`
  );
  return rows as Beat[];
}

export async function listAllBeats(limit?: number): Promise<Beat[]> {
  const take = limit == null ? undefined : Math.max(1, Math.min(limit, 48));
  if (usesPostgresPrisma()) {
    try {
      const prismaBeats = await prisma.beat.findMany({
        include: { user: true, audio: true, preview: true, artwork: true },
        orderBy: { createdAt: 'desc' },
        ...(take ? { take } : {})
      });
      if (prismaBeats.length > 0) return prismaBeats.map(mapPrismaBeat);
    } catch (e) {
      rethrowProductionPersistenceFailure(e);
      console.error("Prisma listAllBeats error; using development memory data:", e);
    }
  }

  const pool = getPool();
  if (!pool) return [...memory.beats].sort((a, b) => b.id - a.id).slice(0, take);
  const [rows] = await pool.query(
    `SELECT b.id, b.producer_id AS producerId, u.name AS producerName, b.title, b.bpm, b.genre, b.mood, b.price,
            b.audio_preview_url AS audioPreviewUrl, b.file_url AS fileUrl, b.artwork_url AS artworkUrl, b.enabled, b.created_at AS createdAt
     FROM beats b
     LEFT JOIN users u ON u.id = b.producer_id
     ORDER BY b.created_at DESC${take ? " LIMIT ?" : ""}`,
    take ? [take] : []
  );
  return rows as Beat[];
}

export async function listBeatsByProducer(producerId: number): Promise<Beat[]> {
  if (usesPostgresPrisma()) {
    try {
      const prismaBeats = await prisma.beat.findMany({
        where: { userId: producerId },
        include: { user: true, audio: true, preview: true, artwork: true },
        orderBy: { createdAt: 'desc' }
      });
      return prismaBeats.map(mapPrismaBeat);
    } catch (e) {
      rethrowProductionPersistenceFailure(e);
      console.error("Prisma listBeatsByProducer error:", e);
    }
  }

  const beats = await listAllBeats();
  return beats.filter((beat) => beat.producerId === producerId);
}

export async function createBeat(input: Omit<Beat, "id" | "createdAt" | "producerName"> & { keySignature?: string }) {
  console.log("createBeat() called with input title:", input.title);
  if (usesPostgresPrisma()) {
    console.log("Entered Prisma branch in createBeat()");
    try {
      let audioUploadId = null;
      let previewUploadId = null;
      let artworkUploadId = null;
      
      if (input.fileUrl) {
        console.log("Executing prisma.upload.create() for AUDIO...");
        const audioUpload = await prisma.upload.create({
          data: {
            userId: input.producerId,
            kind: "AUDIO",
            storageKey: `beats/${Date.now()}-audio`,
            fileName: "audio.mp3",
            mimeType: "audio/mpeg",
            sizeBytes: 0,
            publicUrl: input.fileUrl
          }
        });
        audioUploadId = audioUpload.id;
      }

      if (input.previewUrl) {
        const previewUpload = await prisma.upload.create({ data: { userId: input.producerId, kind: "AUDIO", storageKey: `beats/previews/${Date.now()}`, fileName: "preview.mp3", mimeType: "audio/mpeg", sizeBytes: 0, publicUrl: input.previewUrl } });
        previewUploadId = previewUpload.id;
      }
      
      if (input.artworkUrl) {
        const artworkUpload = await prisma.upload.create({
          data: {
            userId: input.producerId,
            kind: "ARTWORK",
            storageKey: `beats/${Date.now()}-artwork`,
            fileName: "artwork.png",
            mimeType: "image/png",
            sizeBytes: 0,
            publicUrl: input.artworkUrl
          }
        });
        artworkUploadId = artworkUpload.id;
      }

      console.log("Executing prisma.beat.create()...");
      const beat = await prisma.beat.create({
        data: {
          userId: input.producerId,
          title: input.title,
          bpm: input.bpm,
          genre: input.genre,
          mood: input.mood,
          keySignature: input.keySignature ?? "Cm",
          priceCents: Math.round(input.price * 100),
          generalPriceCents: Math.round((input.generalPrice ?? input.price) * 100),
          exclusivePriceCents: Math.round((input.exclusivePrice ?? Math.max(input.price * 8, input.price + 100)) * 100),
          description: input.description ?? "",
          subgenre: input.subgenre ?? "",
          tags: input.tags ?? undefined,
          sampleDeclaration: input.sampleDeclaration ?? "NO_UNCONTROLLED_SAMPLES",
          sampleDisclosure: input.sampleDisclosure ?? null,
          sampleDeclaredAt: new Date(),
          enabled: input.enabled ?? true,
          status: input.enabled ? "PUBLISHED" : "PENDING_REVIEW",
          audioUploadId,
          previewUploadId,
          artworkUploadId
        },
        include: { user: true, audio: true, preview: true, artwork: true }
      });
      console.log("Prisma beat creation successful! Beat ID:", beat.id);
      return mapPrismaBeat(beat);
    } catch (e) {
      rethrowProductionPersistenceFailure(e);
      console.error("Prisma createBeat error; using development memory data:", e);
    }
  }

  const pool = getPool();
  const producer = await findUserById(input.producerId);
  if (!pool) {
    const beat: Beat = {
      ...input,
      producerName: producer?.name,
      id: nextId(memory.beats),
      createdAt: new Date().toISOString()
    };
    memory.beats.unshift(beat);
    return beat;
  }

  const [result] = await pool.query(
    `INSERT INTO beats (producer_id, title, bpm, genre, mood, price, audio_preview_url, file_url, artwork_url, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.producerId, input.title, input.bpm, input.genre, input.mood, input.price, input.fileUrl, input.artworkUrl ?? null, input.enabled]
  );

  return {
    ...input,
    producerName: producer?.name,
    id: Number((result as mysql.ResultSetHeader).insertId),
    createdAt: new Date().toISOString()
  };
}

export async function attachBeatAssets(input: {
  beatId: number;
  producerId: number;
  audio: { url: string; storageKey: string; fileName: string; mimeType: string; sizeBytes: number; checksum?: string | null };
  preview?: { url: string; storageKey: string; fileName: string; mimeType: string; sizeBytes: number };
  artwork?: { url: string; storageKey: string; fileName: string; mimeType: string; sizeBytes: number };
}) {
  if (!usesPostgresPrisma()) {
    const beat = memory.beats.find((item) => item.id === input.beatId && item.producerId === input.producerId);
    if (!beat) return null;
    beat.fileUrl = input.audio.url;
    beat.previewUrl = input.preview?.url;
    beat.artworkUrl = input.artwork?.url;
    return beat;
  }

  return prisma.$transaction(async (tx) => {
    const ownedBeat = await tx.beat.findFirst({ where: { id: input.beatId, userId: input.producerId }, select: { id: true } });
    if (!ownedBeat) return null;
    const audio = await tx.upload.create({ data: { userId: input.producerId, kind: "AUDIO", storageKey: input.audio.storageKey, fileName: input.audio.fileName, mimeType: input.audio.mimeType, sizeBytes: input.audio.sizeBytes, checksum: input.audio.checksum || null, publicUrl: input.audio.url } });
    const preview = input.preview ? await tx.upload.create({ data: { userId: input.producerId, kind: "AUDIO", storageKey: input.preview.storageKey, fileName: input.preview.fileName, mimeType: input.preview.mimeType, sizeBytes: input.preview.sizeBytes, publicUrl: input.preview.url } }) : null;
    const artwork = input.artwork ? await tx.upload.create({ data: { userId: input.producerId, kind: "ARTWORK", storageKey: input.artwork.storageKey, fileName: input.artwork.fileName, mimeType: input.artwork.mimeType, sizeBytes: input.artwork.sizeBytes, publicUrl: input.artwork.url } }) : null;
    const updated = await tx.beat.update({ where: { id: input.beatId }, data: { audioUploadId: audio.id, previewUploadId: preview?.id ?? null, artworkUploadId: artwork?.id ?? null }, include: { user: true, audio: true, preview: true, artwork: true } });
    return mapPrismaBeat(updated);
  });
}

export async function updateBeat(id: number, input: Partial<Pick<Beat, "title" | "bpm" | "genre" | "mood" | "price" | "generalPrice" | "exclusivePrice" | "description" | "subgenre" | "tags" | "sampleDeclaration" | "sampleDisclosure" | "fileUrl" | "artworkUrl" | "enabled" | "keySignature">>) {
  if (usesPostgresPrisma()) {
    try {
      const data: any = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.bpm !== undefined) data.bpm = input.bpm;
      if (input.genre !== undefined) data.genre = input.genre;
      if (input.mood !== undefined) data.mood = input.mood;
      if (input.keySignature !== undefined) data.keySignature = input.keySignature;
      if (input.price !== undefined) data.priceCents = Math.round(input.price * 100);
      if (input.generalPrice !== undefined) data.generalPriceCents = Math.round(input.generalPrice * 100);
      if (input.exclusivePrice !== undefined) data.exclusivePriceCents = Math.round(input.exclusivePrice * 100);
      if (input.description !== undefined) data.description = input.description;
      if (input.subgenre !== undefined) data.subgenre = input.subgenre;
      if (input.tags !== undefined) data.tags = input.tags;
      if (input.sampleDeclaration !== undefined) { data.sampleDeclaration = input.sampleDeclaration; data.sampleDeclaredAt = new Date(); }
      if (input.sampleDisclosure !== undefined) data.sampleDisclosure = input.sampleDisclosure;
      if (input.enabled !== undefined) data.enabled = input.enabled;
      
      const updated = await prisma.beat.update({
        where: { id },
        data,
        include: { user: true, audio: true, preview: true, artwork: true }
      });
      return mapPrismaBeat(updated);
    } catch (err) {
      rethrowProductionPersistenceFailure(err);
      console.error("Prisma updateBeat error:", err);
    }
  }

  // Fallback to memory if Prisma fails or is disabled
  const beat = memory.beats.find((item) => item.id === id);
  if (!beat) return null;
  Object.assign(beat, input);
  return beat;
}

export async function createRelease(input: Omit<Release, "id" | "createdAt" | "status"> & { status?: ReleaseStatus }) {
  if (usesPostgresPrisma()) {
    const status = (input.status ?? "submitted").toUpperCase() as Prisma.ReleaseCreateInput["status"];
    const row = await prisma.release.create({ data: {
      user: { connect: { id: input.userId } }, title: input.releaseTitle || input.trackName || "Untitled release",
      artistName: input.artistName, genre: input.primaryGenre || "", releaseDate: new Date(input.releaseDate), status,
      releaseType: input.releaseType, artworkUrl: input.artworkUrl || null, audioUrl: input.audioUrl || null,
      paymentStatus: input.paymentStatus ?? "pending", upc: input.upcCode ?? null,
      metadata: input as unknown as Prisma.InputJsonValue
    }, include: { tracks: true } });
    return (await listReleasesByUser(input.userId)).find(release => release.id === row.id) ?? null;
  }
  const pool = getPool();
  const status = input.status ?? "submitted";
  if (!pool) {
    const release = ensureReleaseAnalytics({ ...input, id: nextId(memory.releases), status, createdAt: new Date().toISOString() });
    memory.releases.unshift(release);
    return release;
  }

  const [result] = await pool.query(
    `INSERT INTO releases (user_id, artist_name, track_name, release_type, audio_url, artwork_url, release_date, platforms, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.userId, input.artistName, input.trackName, input.releaseType, input.audioUrl, input.artworkUrl, input.releaseDate, JSON.stringify(input.platforms), status]
  );

  return ensureReleaseAnalytics({ ...input, id: Number((result as mysql.ResultSetHeader).insertId), status, createdAt: new Date().toISOString() });
}

function mapPostgresReleaseRows(rows: Array<Record<string, any>>, tracks: Array<Record<string, any>>) {
  const tracksByRelease = new Map<number, Array<Record<string, any>>>();
  for (const track of tracks) tracksByRelease.set(Number(track.releaseId), [...(tracksByRelease.get(Number(track.releaseId)) ?? []), track]);
  return rows.map((row) => {
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, any> : {};
    return ensureReleaseAnalytics({ ...metadata, id: Number(row.id), userId: Number(row.userId), artistName: String(row.artistName), trackName: String(row.title), releaseTitle: metadata.releaseTitle ?? row.title, releaseType: (row.releaseType ?? metadata.releaseType ?? "single") as Release["releaseType"], audioUrl: row.audioUrl ?? "", artworkUrl: row.artworkUrl ?? "", releaseDate: new Date(row.releaseDate).toISOString().slice(0, 10), primaryGenre: String(row.genre), mood: typeof metadata.mood === "string" ? metadata.mood : null, language: String(metadata.language ?? ""), platforms: Array.isArray(metadata.platforms) ? metadata.platforms : [], status: String(row.status).toLowerCase() as ReleaseStatus, paymentStatus: row.paymentStatus === "paid" ? "paid" : "pending", upcCode: row.upc ?? null, draftCompletionPercent: Number(row.draftCompletionPercent ?? 0), lastEditedAt: row.lastEditedAt ? new Date(row.lastEditedAt).toISOString() : null, missingFields: Array.isArray(row.missingFields) ? row.missingFields as string[] : [], metadata, createdAt: new Date(row.createdAt).toISOString(), tracks: (tracksByRelease.get(Number(row.id)) ?? []).map((track) => { const trackMetadata = track.metadata && typeof track.metadata === "object" ? track.metadata as Record<string, any> : {}; return { ...trackMetadata, id: Number(track.id), releaseId: Number(row.id), trackTitle: String(track.title), trackNumber: Number(track.trackNumber ?? 1), primaryArtist: track.primaryArtist ?? "", audioUrl: track.audioUrl ?? "", isrc: track.isrc ?? undefined, duration: String(trackMetadata.duration ?? ""), explicitContent: Boolean(trackMetadata.explicitContent), dolbyAtmos: Boolean(trackMetadata.dolbyAtmos), createdAt: new Date(track.createdAt).toISOString() }; }) } as Release);
  });
}

async function listPostgresReleaseSummaries(userId?: number) {
  // Keep customer reads compatible with the deployed legacy schema: Prisma's
  // model now contains optional DireNote fields which are not present until
  // the production migration is deliberately applied.
  const rows = userId == null
    ? await prisma.$queryRaw<Array<Record<string, any>>>(Prisma.sql`SELECT "id", "user_id" AS "userId", "title", "artist_name" AS "artistName", "genre", "release_type" AS "releaseType", "artwork_url" AS "artworkUrl", "audio_url" AS "audioUrl", "release_date" AS "releaseDate", "status", "payment_status" AS "paymentStatus", "metadata", "upc_code" AS "upc", "draft_completion_percent" AS "draftCompletionPercent", "last_edited_at" AS "lastEditedAt", "missing_fields" AS "missingFields", "created_at" AS "createdAt", "updated_at" AS "updatedAt" FROM "releases" ORDER BY "updated_at" DESC`)
    : await prisma.$queryRaw<Array<Record<string, any>>>(Prisma.sql`SELECT "id", "user_id" AS "userId", "title", "artist_name" AS "artistName", "genre", "release_type" AS "releaseType", "artwork_url" AS "artworkUrl", "audio_url" AS "audioUrl", "release_date" AS "releaseDate", "status", "payment_status" AS "paymentStatus", "metadata", "upc_code" AS "upc", "draft_completion_percent" AS "draftCompletionPercent", "last_edited_at" AS "lastEditedAt", "missing_fields" AS "missingFields", "created_at" AS "createdAt", "updated_at" AS "updatedAt" FROM "releases" WHERE "user_id" = ${userId} ORDER BY "updated_at" DESC`);
  const ids = rows.map((row) => Number(row.id)).filter(Number.isInteger);
  const tracks = ids.length ? await prisma.track.findMany({ where: { releaseId: { in: ids } }, orderBy: { trackNumber: "asc" }, select: { id: true, releaseId: true, title: true, trackNumber: true, primaryArtist: true, audioUrl: true, isrc: true, metadata: true, createdAt: true } }) : [];
  return mapPostgresReleaseRows(rows, tracks);
}

export async function listReleasesByUser(userId: number) {
  if (usesPostgresPrisma()) return listPostgresReleaseSummaries(userId);
  const pool = getPool();
  if (!pool) return memory.releases.filter((release) => release.userId === userId).map((release) => ensureReleaseAnalytics(release)).sort((a, b) => b.id - a.id);

  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, artist_name AS artistName, track_name AS trackName, release_type AS releaseType,
            audio_url AS audioUrl, artwork_url AS artworkUrl, release_date AS releaseDate,
            platforms, status, created_at AS createdAt
     FROM releases WHERE user_id = ? ORDER BY created_at DESC`,
    [userId]
  );

  return (rows as Array<Omit<Release, "platforms"> & { platforms: string | string[] }>).map((row) => ensureReleaseAnalytics({
    ...row,
    platforms: normalizePlatforms(row.platforms)
  }));
}

export async function listAllReleases() {
  if (usesPostgresPrisma()) return listPostgresReleaseSummaries();
  const pool = getPool();
  if (!pool) return [...memory.releases].map((release) => ensureReleaseAnalytics(release)).sort((a, b) => b.id - a.id);

  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, artist_name AS artistName, track_name AS trackName, release_type AS releaseType,
            audio_url AS audioUrl, artwork_url AS artworkUrl, release_date AS releaseDate,
            platforms, status, created_at AS createdAt
     FROM releases ORDER BY created_at DESC`
  );

  return (rows as Array<Omit<Release, "platforms"> & { platforms: string | string[] }>).map((row) => ensureReleaseAnalytics({
    ...row,
    platforms: normalizePlatforms(row.platforms)
  }));
}

export async function updateReleaseStatus(releaseId: number, status: ReleaseStatus, note?: string) {
  if (usesPostgresPrisma()) {
    const { updateDetailedReleaseStatus } = await import("@/lib/distribution-db");
    return updateDetailedReleaseStatus(releaseId, status, note);
  }
  const pool = getPool();
  if (!pool) {
    const release = memory.releases.find((item) => item.id === releaseId);
    if (!release) return null;
    release.status = status;
    if (note) {
      memory.adminNotes.unshift({ id: nextId(memory.adminNotes), releaseId, note, createdAt: new Date().toISOString() });
    }
    return ensureReleaseAnalytics(release);
  }

  await pool.query("UPDATE releases SET status = ? WHERE id = ?", [status, releaseId]);
  if (note) {
    await pool.query("INSERT INTO admin_notes (release_id, note) VALUES (?, ?)", [releaseId, note]);
  }

  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, artist_name AS artistName, track_name AS trackName, release_type AS releaseType,
            audio_url AS audioUrl, artwork_url AS artworkUrl, release_date AS releaseDate, platforms, status, created_at AS createdAt
     FROM releases WHERE id = ? LIMIT 1`,
    [releaseId]
  );
  const row = (rows as Array<Omit<Release, "platforms"> & { platforms: string | string[] }>)[0];
  return row ? ensureReleaseAnalytics({ ...row, platforms: normalizePlatforms(row.platforms) }) : null;
}

export async function createOrder(input: Omit<Order, "id" | "createdAt" | "buyerName" | "buyerEmail">) {
  if (usesPostgresPrisma()) {
    return prisma.$transaction(async tx => {
      await tx.beat.updateMany({ where: { status: "EXCLUSIVE_RESERVED", exclusiveReservationExpiresAt: { lt: new Date() } }, data: { status: "PUBLISHED", exclusiveReservedByUserId: null, exclusiveReservationOrderId: null, exclusiveReservationExpiresAt: null } });
      const beatIds = [...new Set(input.items.map(item => item.beatId))];
      const beats = await tx.beat.findMany({ where: { id: { in: beatIds }, enabled: true }, select: { id: true, status: true, exclusiveReservationExpiresAt: true } });
      if (beats.length !== beatIds.length) throw new Error("One or more selected beats are unavailable.");
      const now = new Date();
      const reservationExpiresAt = new Date(now.getTime() + 15 * 60 * 1000);
      for (const item of input.items) {
        const beat = beats.find((entry) => entry.id === item.beatId);
        if (!beat) throw new Error("One or more selected beats are unavailable.");
        if (item.licenseType === "exclusive") {
          const reserved = await tx.beat.updateMany({
            where: { id: beat.id, enabled: true, OR: [{ status: "PUBLISHED" }, { status: "EXCLUSIVE_RESERVED", exclusiveReservationExpiresAt: { lt: now } }] },
            data: { status: "EXCLUSIVE_RESERVED", exclusiveReservedByUserId: input.userId, exclusiveReservationOrderId: input.razorpayOrderId, exclusiveReservationExpiresAt: reservationExpiresAt }
          });
          if (reserved.count !== 1) throw new Error("This beat is no longer available for exclusive licensing.");
          await tx.auditLog.create({ data: { actorId: input.userId, actorRole: "customer", action: "BEAT_EXCLUSIVE_RESERVED", entity: "beat", entityId: String(beat.id), newValue: { status: "EXCLUSIVE_RESERVED", expiresAt: reservationExpiresAt }, metadata: { razorpayOrderId: input.razorpayOrderId } } });
        } else if (beat.status !== "PUBLISHED") {
          throw new Error("This beat is temporarily unavailable for licensing.");
        }
      }
      const order = await tx.checkoutOrder.create({
        data: {
          userId: input.userId,
          productId: input.productId ?? "beatstore",
          originalPrice: new Prisma.Decimal(input.originalPrice ?? input.amount),
          discountApplied: new Prisma.Decimal(input.discountApplied ?? 0),
          referralCreditsUsed: input.referralCreditsUsed ?? 0,
          finalAmount: new Prisma.Decimal(input.finalAmount ?? input.amount),
          couponCode: input.couponCode ?? null,
          razorpayOrderId: input.razorpayOrderId,
          paymentStatus: input.paymentStatus,
          currency: "INR",
          items: { create: input.items.map(item => ({ beatId: item.beatId, licenseType: item.licenseType, price: new Prisma.Decimal(item.price), licenseUrl: item.licenseUrl ?? null })) }
        },
        include: checkoutOrderInclude
      });
      return mapPrismaCheckoutOrder(order);
    });
  }
  const user = await findUserById(input.userId);
  const mappedItems = input.items.map((item) => {
    const beat = memory.beats.find((entry) => entry.id === item.beatId);
    return {
      ...item,
      beatTitle: beat?.title ?? item.beatTitle,
      producerId: beat?.producerId ?? item.producerId,
      producerName: beat?.producerName ?? item.producerName,
      downloadUrl: beat?.fileUrl ?? item.downloadUrl ?? null,
      licenseUrl: item.licenseUrl ?? null
    };
  });

  const pool = getPool();
  if (!pool) {
    assertNoProductionMemoryStore("Checkout orders");
    const order: Order = {
      ...input,
      productId: input.productId ?? "beatstore",
      originalPrice: input.originalPrice ?? input.amount,
      discountApplied: input.discountApplied ?? 0,
      referralCreditsUsed: input.referralCreditsUsed ?? 0,
      finalAmount: input.finalAmount ?? input.amount,
      couponCode: input.couponCode ?? null,
      buyerName: user?.name,
      buyerEmail: user?.email,
      items: mappedItems,
      id: nextId(memory.orders),
      createdAt: new Date().toISOString()
    };
    memory.orders.unshift(order);
    return order;
  }

  const [result] = await pool.query(
    `INSERT INTO orders (
      user_id, product_id, original_price, discount_applied, referral_credits_used, final_amount,
      coupon_code, razorpay_order_id, amount, payment_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      input.productId ?? "beatstore",
      input.originalPrice ?? input.amount,
      input.discountApplied ?? 0,
      input.referralCreditsUsed ?? 0,
      input.finalAmount ?? input.amount,
      input.couponCode ?? null,
      input.razorpayOrderId,
      input.amount,
      input.paymentStatus
    ]
  );
  const orderId = Number((result as mysql.ResultSetHeader).insertId);

  for (const item of mappedItems) {
    await pool.query(
      "INSERT INTO order_items (order_id, beat_id, license_type, price, license_url) VALUES (?, ?, ?, ?, ?)",
      [orderId, item.beatId, item.licenseType, item.price, item.licenseUrl ?? null]
    );
  }

  return {
    ...input,
    productId: input.productId ?? "beatstore",
    originalPrice: input.originalPrice ?? input.amount,
    discountApplied: input.discountApplied ?? 0,
    referralCreditsUsed: input.referralCreditsUsed ?? 0,
    finalAmount: input.finalAmount ?? input.amount,
    couponCode: input.couponCode ?? null,
    buyerName: user?.name,
    buyerEmail: user?.email,
    items: mappedItems,
    id: orderId,
    createdAt: new Date().toISOString()
  };
}

export async function markOrderPaid(orderId: string, paymentId: string) {
  return completeCheckoutOrder(orderId, paymentId);
}

async function listOrdersQuery(where = "", params: unknown[] = []) {
  const pool = getPool();
  if (!pool) return [] as Order[];

  const [rows] = await pool.query(
    `SELECT o.id, o.user_id AS userId, u.name AS buyerName, u.email AS buyerEmail, o.product_id AS productId,
            o.original_price AS originalPrice, o.discount_applied AS discountApplied, o.referral_credits_used AS referralCreditsUsed,
            o.final_amount AS finalAmount, o.coupon_code AS couponCode, o.razorpay_order_id AS razorpayOrderId,
            o.razorpay_payment_id AS razorpayPaymentId, o.amount, o.payment_status AS paymentStatus, o.created_at AS createdAt,
            COALESCE(JSON_ARRAYAGG(
              CASE WHEN oi.id IS NULL THEN NULL ELSE JSON_OBJECT(
                'beatId', oi.beat_id,
                'beatTitle', b.title,
                'producerId', b.producer_id,
                'producerName', pu.name,
                'licenseType', oi.license_type,
                'price', oi.price,
                'licenseUrl', oi.license_url,
                'downloadUrl', b.file_url
              ) END
            ), JSON_ARRAY()) AS items
     FROM orders o
     LEFT JOIN users u ON u.id = o.user_id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     LEFT JOIN beats b ON b.id = oi.beat_id
     LEFT JOIN users pu ON pu.id = b.producer_id
     ${where}
     GROUP BY o.id
     ORDER BY o.created_at DESC`,
    params
  );

  return mapOrders(rows as OrderRow[]);
}

export async function listOrdersByUser(userId: number) {
  if (usesPostgresPrisma()) return listPrismaCheckoutOrders({ userId });
  const pool = getPool();
  if (!pool) return memory.orders.filter((order) => order.userId === userId).map(mapOrder).sort((a, b) => b.id - a.id);
  return listOrdersQuery("WHERE o.user_id = ?", [userId]);
}

export async function listOrdersByProducer(producerId: number) {
  if (usesPostgresPrisma()) {
    const orders = await listPrismaCheckoutOrders({ items: { some: { beat: { userId: producerId } } } });
    return orders.map(order => ({ ...order, items: order.items.filter(item => item.producerId === producerId) }));
  }
  const pool = getPool();
  if (!pool) {
    return memory.orders
      .map(mapOrder)
      .map((order) => ({ ...order, items: order.items.filter((item) => item.producerId === producerId) }))
      .filter((order) => order.items.length > 0)
      .sort((a, b) => b.id - a.id);
  }
  return listOrdersQuery("WHERE b.producer_id = ?", [producerId]);
}

export async function listAllOrders() {
  if (usesPostgresPrisma()) return listPrismaCheckoutOrders();
  const pool = getPool();
  if (!pool) return [...memory.orders].map(mapOrder).sort((a, b) => b.id - a.id);
  return listOrdersQuery();
}

export async function findCouponByCode(code: string) {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return null;
  if (usesPostgresPrisma()) {
    const coupon = await prisma.coupon.findFirst({ where: { code: normalized, active: true, OR: [{ expiryDate: null }, { expiryDate: { gt: new Date() } }] } });
    return coupon ? { id: coupon.id, code: coupon.code, discountType: coupon.discountType as Coupon["discountType"], discountValue: Number(coupon.discountValue), expiryDate: coupon.expiryDate?.toISOString() ?? null, usageLimit: coupon.usageLimit, perUserLimit: coupon.perUserLimit, active: coupon.active, createdAt: coupon.createdAt.toISOString() } : null;
  }
  const pool = getPool();
  if (!pool) return memory.coupons.find((coupon) => coupon.code.toUpperCase() === normalized && coupon.active) ?? null;

  await ensureDefaultCoupons(pool);
  const [rows] = await pool.query(
    `SELECT id, code, discount_type AS discountType, discount_value AS discountValue, expiry_date AS expiryDate,
            usage_limit AS usageLimit, per_user_limit AS perUserLimit, active, created_at AS createdAt
     FROM coupons
     WHERE code = ? AND active = 1
     LIMIT 1`,
    [normalized]
  );
  return (rows as Coupon[])[0] ?? null;
}

export async function getCouponUsage(code: string, userId: number) {
  const normalized = normalizeReferralCode(code);
  if (usesPostgresPrisma()) {
    const coupon = await prisma.coupon.findUnique({ where: { code: normalized }, select: { id: true } });
    if (!coupon) return { total: 0, byUser: 0 };
    const [total, byUser] = await Promise.all([
      prisma.couponRedemption.count({ where: { couponId: coupon.id } }),
      prisma.couponRedemption.count({ where: { couponId: coupon.id, userId } })
    ]);
    return { total, byUser };
  }
  const pool = getPool();
  if (!pool) {
    const total = memory.orders.filter((order) => order.couponCode?.toUpperCase() === normalized && order.paymentStatus === "paid").length;
    const byUser = memory.orders.filter((order) => order.userId === userId && order.couponCode?.toUpperCase() === normalized && order.paymentStatus === "paid").length;
    return { total, byUser };
  }

  await ensureDefaultCoupons(pool);
  const [rows] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN cr.user_id = ? THEN 1 ELSE 0 END) AS byUser
     FROM coupon_redemptions cr
     INNER JOIN coupons c ON c.id = cr.coupon_id
     WHERE c.code = ?`,
    [userId, normalized]
  );
  const row = (rows as Array<{ total: number; byUser: number | null }>)[0];
  return { total: Number(row?.total ?? 0), byUser: Number(row?.byUser ?? 0) };
}

export async function getCheckoutOrderByRazorpayId(razorpayOrderId: string) {
  if (usesPostgresPrisma()) {
    const order = await prisma.checkoutOrder.findUnique({ where: { razorpayOrderId }, include: checkoutOrderInclude });
    return order ? mapPrismaCheckoutOrder(order) : null;
  }
  const pool = getPool();
  if (!pool) {
    assertNoProductionMemoryStore("Checkout orders");
    return memory.orders.find((order) => order.razorpayOrderId === razorpayOrderId) ?? null;
  }
  const orders = await listOrdersQuery("WHERE o.razorpay_order_id = ?", [razorpayOrderId]);
  return orders[0] ?? null;
}

// Legacy MySQL/memory compatibility. PostgreSQL uses the immutable referral
// ledger and qualification service below.
function calculateReferralReward(successfulReferralCount: number) {
  void successfulReferralCount;
  return 5;
}

export async function completeCheckoutOrder(razorpayOrderId: string, paymentId: string) {
  if (usesPostgresPrisma()) {
    const qualification = await prisma.$transaction(async tx => {
      const order = await tx.checkoutOrder.findUnique({
        where: { razorpayOrderId },
        include: { user: true, items: { include: { beat: true } } }
      });
      if (!order) throw new Error("Order not found.");
      const alreadyPaid = order.paymentStatus === "paid";
      if (alreadyPaid && order.razorpayPaymentId !== paymentId) throw new Error("Order is already fulfilled by a different payment.");
      if (!alreadyPaid && !["created", "authorized"].includes(order.paymentStatus)) throw new Error(`Order cannot be fulfilled from ${order.paymentStatus}.`);
      if (!alreadyPaid && order.referralCreditsUsed > 0) {
        const debited = await tx.user.updateMany({ where: { id: order.userId, referralCredits: { gte: order.referralCreditsUsed } }, data: { referralCredits: { decrement: order.referralCreditsUsed } } });
        if (debited.count !== 1) throw new Error("Referral credit balance changed. Please recreate checkout.");
        await tx.creditLedgerEntry.create({
          data: {
            userId: order.userId,
            type: "CREDIT_REDEMPTION",
            bucket: "HYMN_CREDIT",
            amount: order.referralCreditsUsed,
            direction: "debit",
            sourceType: "checkout_order",
            sourceId: String(order.id),
            description: "HYMN credit applied to checkout",
            idempotencyKey: `CREDIT_REDEMPTION:CHECKOUT:${order.id}`,
            balanceAfter: Number(order.user.referralCredits) - order.referralCreditsUsed,
            metadata: { razorpayOrderId }
          }
        });
      }
      if (!alreadyPaid && order.couponCode) {
        const coupon = await tx.coupon.findFirst({ where: { code: order.couponCode, active: true, OR: [{ expiryDate: null }, { expiryDate: { gt: new Date() } }] } });
        if (!coupon) throw new Error("Coupon is no longer valid.");
        const [total, byUser] = await Promise.all([
          tx.couponRedemption.count({ where: { couponId: coupon.id } }),
          tx.couponRedemption.count({ where: { couponId: coupon.id, userId: order.userId } })
        ]);
        if (coupon.usageLimit != null && total >= coupon.usageLimit) throw new Error("Coupon usage limit was reached before verification.");
        if (byUser >= coupon.perUserLimit) throw new Error("Coupon per-user limit was reached before verification.");
        await tx.couponRedemption.create({ data: { couponId: coupon.id, userId: order.userId, orderId: order.id } });
      }
      for (const item of order.items) {
        if (item.licenseType === "exclusive") {
          const sold = await tx.beat.updateMany({ where: { id: item.beatId, status: "EXCLUSIVE_RESERVED", exclusiveReservationOrderId: razorpayOrderId }, data: { status: "EXCLUSIVELY_SOLD", enabled: false, exclusiveReservedByUserId: null, exclusiveReservationOrderId: null, exclusiveReservationExpiresAt: null } });
          if (sold.count !== 1 && !alreadyPaid) throw new Error("Exclusive reservation is no longer valid; payment requires manual reconciliation.");
          if (!alreadyPaid) await tx.auditLog.create({ data: { actorId: order.userId, actorRole: "customer", action: "BEAT_EXCLUSIVELY_SOLD", entity: "beat", entityId: String(item.beatId), newValue: { status: "EXCLUSIVELY_SOLD" }, metadata: { orderId: order.id, paymentId, priorGeneralLicenses: item.beat.generalLicensesSold } } });
        } else if (!alreadyPaid) {
          const available = await tx.beat.updateMany({ where: { id: item.beatId, status: "PUBLISHED", enabled: true }, data: { generalLicensesSold: { increment: 1 } } });
          if (available.count !== 1) throw new Error("This beat became unavailable before payment completion.");
        }
      }
      for (const item of order.items) {
        const normalizedLicenseType = item.licenseType === "basic" || item.licenseType === "premium" ? "general" : item.licenseType;
        const licenceSnapshot = normalizedLicenseType === "exclusive" ? {
          version: "2026-08-26",
          licenseType: "exclusive",
          legalMode: item.beat.exclusiveLegalMode,
          beat: { id: item.beat.id, title: item.beat.title },
          buyer: { id: order.user.id, name: order.user.name, email: order.user.email },
          producer: { id: item.beat.userId },
          purchaseDate: new Date().toISOString(),
          price: Number(item.price),
          currency: order.currency,
          existingGeneralLicenses: item.beat.generalLicensesSold,
          rights: { commercialUse: true, exclusiveUse: true, copyrightAssigned: item.beat.exclusiveLegalMode === "RIGHTS_ASSIGNMENT" },
          restrictions: { samplesSubjectToProducerDisclosure: true, priorGeneralLicensesRemainValid: true }
        } : {
          version: "2026-08-26",
          licenseType: "general",
          beat: { id: item.beat.id, title: item.beat.title },
          buyer: { id: order.user.id, name: order.user.name, email: order.user.email },
          producer: { id: item.beat.userId },
          purchaseDate: new Date().toISOString(),
          price: Number(item.price),
          currency: order.currency,
          rights: { commercialUse: true, maxCommercialReleases: item.beat.generalMaxCommercialReleases, streamingLimit: item.beat.generalStreamingLimit, videoLimit: item.beat.generalVideoLimit, performanceRights: item.beat.generalPerformanceRights, monetizationAllowed: item.beat.generalMonetizationAllowed, creditRequired: item.beat.generalCreditRequired, contentIdPolicy: item.beat.generalContentIdPolicy, territory: item.beat.generalTerritory, termDurationMonths: item.beat.generalTermDurationMonths },
          restrictions: { nonExclusive: true, samplesSubjectToProducerDisclosure: true }
        };
        await tx.beatPurchase.upsert({
          where: { checkoutOrderItemId: item.id },
          create: { userId: order.userId, beatId: item.beatId, licenseType: normalizedLicenseType, paymentId, checkoutOrderItemId: item.id, hasAccess: true, licenseVersion: "2026-08-26", licenseTermsSnapshot: licenceSnapshot },
          update: { paymentId, hasAccess: true }
        });
        const existingSale = await tx.beatSale.findUnique({ where: { orderId_beatId_licenseType: { orderId: order.id, beatId: item.beatId, licenseType: item.licenseType } } });
        if (!existingSale) {
          const grossAmount = new Prisma.Decimal(item.price);
          const netSaleAmount = Number(order.originalPrice) > 0 ? grossAmount.mul(order.finalAmount).div(order.originalPrice).toDecimalPlaces(2) : new Prisma.Decimal(0);
          const discountAmount = grossAmount.sub(netSaleAmount);
          const hymnCommissionAmount = netSaleAmount.mul(PRODUCER_COMMISSION_CONFIG.hymnCommissionPercent).div(100).toDecimalPlaces(2);
          const producerEarningAmount = netSaleAmount.sub(hymnCommissionAmount);
          const latest = await tx.walletTransaction.findFirst({ where: { userId: item.beat.userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
          const balanceAfter = new Prisma.Decimal(latest?.balanceAfter ?? 0).add(producerEarningAmount);
          const sale = await tx.beatSale.create({ data: { beatId: item.beatId, producerUserId: item.beat.userId, buyerUserId: order.userId, orderId: order.id, paymentId, grossAmount, discountAmount, netSaleAmount, hymnCommissionAmount, producerEarningAmount, producerRateApplied: PRODUCER_COMMISSION_CONFIG.producerSharePercent / 100, platformRateApplied: PRODUCER_COMMISSION_CONFIG.hymnCommissionPercent / 100, licenseType: normalizedLicenseType, status: "paid" } });
          await tx.walletTransaction.create({ data: { userId: item.beat.userId, type: "beat_sale_credit", amount: producerEarningAmount, referenceType: "beat_sale", referenceId: String(sale.id), idempotencyKey: `beat-sale:${sale.id}:producer-credit`, direction: "credit", balanceAfter, note: `${item.beat.title} sale producer share.` } });
          await tx.artistPayoutBalance.upsert({ where: { userId: item.beat.userId }, create: { userId: item.beat.userId, availableBalance: producerEarningAmount, lifetimeEarnings: producerEarningAmount }, update: { availableBalance: { increment: producerEarningAmount }, lifetimeEarnings: { increment: producerEarningAmount } } });
          await tx.notification.upsert({ where: { eventKey: `beat-sale:${sale.id}:producer-credit` }, create: { userId: item.beat.userId, title: "Beat sold", body: `Your beat “${item.beat.title}” was purchased and your producer share was credited.`, type: "beat", href: "/producer/dashboard?module=sales", actionLabel: "View sale", eventKey: `beat-sale:${sale.id}:producer-credit`, metadata: { saleId: sale.id, beatId: item.beatId, orderId: order.id } }, update: {} });
        }
      }
      await tx.notification.upsert({ where: { eventKey: `payment:${order.razorpayOrderId}:success` }, create: { userId: order.userId, title: "Beat purchase successful", body: "Your beat purchase was successful. Check your dashboard for downloads and licence details.", type: "beat", href: "/dashboard?tab=purchases", actionLabel: "Open dashboard", eventKey: `payment:${order.razorpayOrderId}:success`, metadata: { orderId: order.id, razorpayOrderId: order.razorpayOrderId } }, update: {} });
      await tx.checkoutOrderItem.updateMany({ where: { orderId: order.id, licenseUrl: null }, data: { licenseUrl: `/api/licenses/order/${order.id}` } });
      if (!alreadyPaid) {
        const fulfilled = await tx.checkoutOrder.updateMany({ where: { id: order.id, paymentStatus: { in: ["created", "authorized"] } }, data: { paymentStatus: "paid", razorpayPaymentId: paymentId, fulfilledAt: new Date() } });
        if (fulfilled.count !== 1) throw new Error("Order was fulfilled concurrently.");
      }
      return !alreadyPaid ? qualifyReferralInTransaction(tx, { referredUserId: order.userId, transactionType: "checkout_order", transactionId: order.id, paymentId, paidAmountInr: Number(order.finalAmount), source: "verified_payment" }) : { qualified: false as const, reason: "already_paid" as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (qualification.qualified) await sendReferralRewardEmails(qualification.referralId).catch(() => undefined);
    return getCheckoutOrderByRazorpayId(razorpayOrderId);
  }
  const pool = getPool();
  if (!pool) {
    assertNoProductionMemoryStore("Checkout orders");
    const order = memory.orders.find((item) => item.razorpayOrderId === razorpayOrderId);
    if (!order) return null;
    if (order.paymentStatus === "paid") return mapOrder(order);

    const user = memory.users.find((item) => item.id === order.userId);
    if (user && (order.referralCreditsUsed ?? 0) > 0) {
      user.referralCredits = Math.max(0, Number(user.referralCredits) - Number(order.referralCreditsUsed ?? 0));
    }

    order.paymentStatus = "paid";
    order.razorpayPaymentId = paymentId;
    order.items = order.items.map((item) => ({
      ...item,
      licenseUrl: item.licenseUrl ?? `/licenses/${razorpayOrderId}-${item.beatId}-${item.licenseType}.pdf`,
      downloadUrl: item.downloadUrl ?? memory.beats.find((beat) => beat.id === item.beatId)?.fileUrl ?? null
    }));

    if (user?.referredBy && !user.firstPaymentRewarded) {
      const referrer = memory.users.find((item) => item.id === user.referredBy);
      const reward = 5;
      if (referrer) referrer.referralCredits = Number(referrer.referralCredits) + reward;
      user.referralCredits = Number(user.referralCredits) + 3;
      user.firstPaymentRewarded = true;
      const referral = memory.referrals.find((item) => item.referredUserId === user.id);
      if (referral) {
        referral.status = "rewarded";
        referral.purchaseAmount = order.finalAmount ?? order.amount;
        referral.earnings = reward;
        referral.rewardedAt = new Date().toISOString();
      }
    }

    return mapOrder(order);
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [orderRows] = await connection.query(
      "SELECT id, user_id AS userId, referral_credits_used AS referralCreditsUsed, coupon_code AS couponCode, final_amount AS finalAmount, payment_status AS paymentStatus FROM orders WHERE razorpay_order_id = ? FOR UPDATE",
      [razorpayOrderId]
    );
    const orderRow = (orderRows as Array<{ id: number; userId: number; referralCreditsUsed: number; couponCode: string | null; finalAmount: number; paymentStatus: string }>)[0];
    if (!orderRow) throw new Error("Order not found.");

    if (orderRow.paymentStatus === "paid") {
      await connection.commit();
      return getCheckoutOrderByRazorpayId(razorpayOrderId);
    }

    const [userRows] = await connection.query(
      "SELECT id, referred_by AS referredBy, first_payment_rewarded AS firstPaymentRewarded, referral_credits AS referralCredits FROM users WHERE id = ? FOR UPDATE",
      [orderRow.userId]
    );
    const userRow = (userRows as Array<{ id: number; referredBy: number | null; firstPaymentRewarded: boolean; referralCredits: number }>)[0];
    if (!userRow) throw new Error("User not found.");

    if (Number(orderRow.referralCreditsUsed) > 0) {
      if (Number(userRow.referralCredits) < Number(orderRow.referralCreditsUsed)) {
        throw new Error("Referral credit balance changed. Please recreate checkout.");
      }
      await connection.query("UPDATE users SET referral_credits = referral_credits - ? WHERE id = ?", [orderRow.referralCreditsUsed, orderRow.userId]);
    }

    await connection.query("UPDATE orders SET razorpay_payment_id = ?, payment_status = 'paid' WHERE id = ?", [paymentId, orderRow.id]);
    await connection.query(
      "UPDATE order_items SET license_url = CONCAT('/licenses/', ?, '-', beat_id, '-', license_type, '.pdf') WHERE order_id = ?",
      [razorpayOrderId, orderRow.id]
    );

    if (orderRow.couponCode) {
      const [couponRows] = await connection.query("SELECT id, usage_limit AS usageLimit, per_user_limit AS perUserLimit FROM coupons WHERE code = ? AND active = 1 LIMIT 1 FOR UPDATE", [orderRow.couponCode]);
      const coupon = (couponRows as Array<{ id: number; usageLimit: number | null; perUserLimit: number }>)[0];
      if (coupon) {
        const [usageRows] = await connection.query(
          `SELECT
             COUNT(*) AS total,
             SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS byUser
           FROM coupon_redemptions
          WHERE coupon_id = ?`,
          [orderRow.userId, coupon.id]
        );
        const usage = (usageRows as Array<{ total: number; byUser: number | null }>)[0];
        if (coupon.usageLimit != null && Number(usage?.total ?? 0) >= coupon.usageLimit) {
          throw new Error("Coupon usage limit was reached before verification.");
        }
        if (Number(usage?.byUser ?? 0) >= coupon.perUserLimit) {
          throw new Error("Coupon per-user limit was reached before verification.");
        }
        await connection.query(
          "INSERT IGNORE INTO coupon_redemptions (coupon_id, user_id, order_id) VALUES (?, ?, ?)",
          [coupon.id, orderRow.userId, orderRow.id]
        );
      }
    }

    if (userRow.referredBy && !userRow.firstPaymentRewarded) {
      const [countRows] = await connection.query("SELECT COUNT(*) AS count FROM referrals WHERE user_id = ? AND status = 'rewarded'", [userRow.referredBy]);
      const successfulCount = Number((countRows as Array<{ count: number }>)[0]?.count ?? 0) + 1;
      const reward = calculateReferralReward(successfulCount);

      await connection.query("UPDATE users SET referral_credits = referral_credits + ? WHERE id = ?", [reward, userRow.referredBy]);
      await connection.query("UPDATE users SET first_payment_rewarded = 1 WHERE id = ?", [orderRow.userId]);
      await connection.query(
        `UPDATE referrals
         SET status = 'rewarded', purchase_amount = ?, earnings = ?, rewarded_at = CURRENT_TIMESTAMP
         WHERE referred_user_id = ? AND status = 'signed_up'`,
        [orderRow.finalAmount, reward, orderRow.userId]
      );
    }

    await connection.commit();
    return getCheckoutOrderByRazorpayId(razorpayOrderId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function markOrderFailed(razorpayOrderId: string) {
  if (usesPostgresPrisma()) {
    await prisma.checkoutOrder.updateMany({ where: { razorpayOrderId, paymentStatus: "created" }, data: { paymentStatus: "failed" } });
    return getCheckoutOrderByRazorpayId(razorpayOrderId);
  }
  const pool = getPool();
  if (!pool) {
    assertNoProductionMemoryStore("Checkout orders");
    const order = memory.orders.find((item) => item.razorpayOrderId === razorpayOrderId);
    if (order && order.paymentStatus !== "paid") order.paymentStatus = "failed";
    return order ?? null;
  }
  await pool.query("UPDATE orders SET payment_status = 'failed' WHERE razorpay_order_id = ? AND payment_status <> 'paid'", [razorpayOrderId]);
  return getCheckoutOrderByRazorpayId(razorpayOrderId);
}

export async function getReferralActivities(userId: number) {
  if (usesPostgresPrisma()) {
    const rows = await prisma.referral.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" }
    });
    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      referredUserId: row.referredUserId ?? null,
      referralCode: row.referralCode,
      signupEmail: row.signupEmail,
      status: row.status as "signed_up" | "rewarded",
      purchaseAmount: row.purchaseAmount,
      earnings: row.earnings,
      createdAt: row.createdAt.toISOString(),
      rewardedAt: row.rewardedAt?.toISOString() ?? null
    })) as ReferralActivity[];
  }

  const pool = getPool();
  if (!pool) return memory.referrals.filter((referral) => referral.userId === userId).sort((a, b) => b.id - a.id);

  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, referred_user_id AS referredUserId, referral_code AS referralCode, signup_email AS signupEmail,
            status, purchase_amount AS purchaseAmount, earnings, created_at AS createdAt, rewarded_at AS rewardedAt
     FROM referrals
     WHERE user_id = ?
     ORDER BY created_at DESC`,
    [userId]
  );
  return rows as ReferralActivity[];
}

export async function getReferralSocialProofCount() {
  if (usesPostgresPrisma()) {
    const count = await prisma.referral.count({ where: { status: "rewarded" } });
    return Math.max(128, count + 128);
  }

  const pool = getPool();
  if (!pool) return Math.max(128, memory.referrals.filter((referral) => referral.status === "rewarded").length + 128);

  const [rows] = await pool.query("SELECT COUNT(DISTINCT user_id) AS count FROM referrals WHERE status = 'rewarded'");
  return Math.max(128, Number((rows as Array<{ count: number }>)[0]?.count ?? 0) + 128);
}

async function ensureDefaultCoupons(pool: mysql.Pool) {
  for (const coupon of defaultCoupons) {
    await pool.query(
      `INSERT IGNORE INTO coupons (code, discount_type, discount_value, expiry_date, usage_limit, per_user_limit, active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [coupon.code, coupon.discountType, coupon.discountValue, coupon.expiryDate ?? null, coupon.usageLimit ?? null, coupon.perUserLimit, coupon.active]
    );
  }
}

export async function createContactMessage(input: Omit<ContactMessage, "id" | "createdAt">) {
  if (usesPostgresPrisma()) assertNoProductionMemoryStore("Contact messages");
  const pool = getPool();
  if (!pool) {
    const message: ContactMessage = { ...input, id: nextId(memory.contactMessages), createdAt: new Date().toISOString() };
    memory.contactMessages.unshift(message);
    return message;
  }
  const [result] = await pool.query(
    "INSERT INTO contact_messages (name, email, service_interest, message) VALUES (?, ?, ?, ?)",
    [input.name, input.email, input.serviceInterest ?? null, input.message]
  );
  return { ...input, id: Number((result as mysql.ResultSetHeader).insertId), createdAt: new Date().toISOString() };
}

export async function createPartnershipLead(input: Omit<PartnershipLead, "id" | "createdAt">) {
  if (usesPostgresPrisma()) assertNoProductionMemoryStore("Partnership leads");
  const pool = getPool();
  if (!pool) {
    const lead: PartnershipLead = { ...input, id: nextId(memory.partnershipLeads), createdAt: new Date().toISOString() };
    memory.partnershipLeads.unshift(lead);
    return lead;
  }
  const [result] = await pool.query(
    "INSERT INTO partnership_leads (name, email, company, collaboration_type, message) VALUES (?, ?, ?, ?, ?)",
    [input.name, input.email, input.company ?? null, input.collaborationType, input.message]
  );
  return { ...input, id: Number((result as mysql.ResultSetHeader).insertId), createdAt: new Date().toISOString() };
}

export async function listPartnershipLeads() {
  if (usesPostgresPrisma()) assertNoProductionMemoryStore("Partnership leads");
  const pool = getPool();
  if (!pool) return [...memory.partnershipLeads].sort((a, b) => b.id - a.id);
  const [rows] = await pool.query(
    "SELECT id, name, email, company, collaboration_type AS collaborationType, message, created_at AS createdAt FROM partnership_leads ORDER BY created_at DESC"
  );
  return rows as PartnershipLead[];
}

export async function createProducerApplication(input: Omit<ProducerApplication, "id" | "createdAt" | "status" | "reviewedBy" | "reviewedAt" | "reviewNote">) {
  if (usesPostgresPrisma()) {
    const enterpriseInput = input as typeof input & {
      instagram?: string;
      youtube?: string;
      soundcloud?: string;
      spotify?: string;
      pricing?: string;
      sampleBeats?: string[];
      yearsExperience?: number;
      bio?: string;
    };
    const application = await prisma.producerApplication.create({
      data: {
        userId: input.userId,
        producerName: input.artistName,
        genre: input.genreFocus,
        portfolioLinks: input.links.split(/\s+/).filter(Boolean),
        instagram: enterpriseInput.instagram || null,
        youtube: enterpriseInput.youtube || null,
        soundcloud: enterpriseInput.soundcloud || null,
        spotify: enterpriseInput.spotify || null,
        yearsExperience: enterpriseInput.yearsExperience ?? (Number.parseInt(input.experience, 10) || 1),
        pricing: enterpriseInput.pricing || input.experience,
        sampleBeats: enterpriseInput.sampleBeats ?? [],
        bio: enterpriseInput.bio || input.message
      },
      include: { user: { select: { name: true, email: true } } }
    });
    await createNotification({
      userId: input.userId,
      title: "Producer application received",
      body: "HYMN will review your producer profile and sample work.",
      type: "account",
      href: "/dashboard",
      actionLabel: "Open dashboard"
    });
    await prisma.auditLog.create({
      data: {
        actorId: input.userId,
        action: "PRODUCER_APPLICATION_SUBMITTED",
        entity: "producer_applications",
        entityId: String(application.id)
      }
    });
    return mapPrismaProducerApplication(application);
  }

  const pool = getPool();
  if (!pool) {
    const application: ProducerApplication = {
      ...input,
      id: nextId(memory.producerApplications),
      status: "pending",
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      createdAt: new Date().toISOString()
    };
    memory.producerApplications.unshift(application);
    await createNotification({
      userId: input.userId,
      title: "Producer application received",
      body: "HYMN will review your producer profile and sample work.",
      type: "account",
      href: "/dashboard",
      actionLabel: "Open dashboard"
    });
    return application;
  }

  const [result] = await pool.query(
    `INSERT INTO producer_applications (user_id, name, email, artist_name, genre_focus, beat_catalog_size, experience, links, message, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [input.userId, input.name, input.email, input.artistName, input.genreFocus, input.beatCatalogSize, input.experience, input.links, input.message]
  );

  const application = {
    ...input,
    id: Number((result as mysql.ResultSetHeader).insertId),
    status: "pending",
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: new Date().toISOString()
  };
  await createNotification({
    userId: input.userId,
    title: "Producer application received",
    body: "HYMN will review your producer profile and sample work.",
    type: "account",
    href: "/dashboard",
    actionLabel: "Open dashboard"
  });
  return application;
}

export async function findLatestProducerApplicationByUser(userId: number) {
  if (usesPostgresPrisma()) {
    const application = await prisma.producerApplication.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } }
    });
    return application ? mapPrismaProducerApplication(application) : null;
  }

  const pool = getPool();
  if (!pool) return memory.producerApplications.filter((item) => item.userId === userId).sort((a, b) => b.id - a.id)[0] ?? null;
  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, name, email, artist_name AS artistName, genre_focus AS genreFocus, beat_catalog_size AS beatCatalogSize,
            experience, links, message, status, reviewed_by AS reviewedBy, reviewed_at AS reviewedAt, review_note AS reviewNote, created_at AS createdAt
     FROM producer_applications WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  return (rows as ProducerApplication[])[0] ?? null;
}

export async function listProducerApplications() {
  if (usesPostgresPrisma()) {
    const applications = await prisma.producerApplication.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } }
    });
    return applications.map(mapPrismaProducerApplication);
  }

  const pool = getPool();
  if (!pool) return [...memory.producerApplications].sort((a, b) => b.id - a.id);
  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, name, email, artist_name AS artistName, genre_focus AS genreFocus, beat_catalog_size AS beatCatalogSize,
            experience, links, message, status, reviewed_by AS reviewedBy, reviewed_at AS reviewedAt, review_note AS reviewNote, created_at AS createdAt
     FROM producer_applications ORDER BY created_at DESC`
  );
  return rows as ProducerApplication[];
}

export async function reviewProducerApplication(applicationId: number, status: ProducerApplicationStatus, reviewedBy: number, reviewNote?: string) {
  if (usesPostgresPrisma()) {
    const application = await prisma.$transaction(async (tx) => {
      const updated = await tx.producerApplication.update({
        where: { id: applicationId },
        data: {
          status: status.toUpperCase() as "APPROVED" | "REJECTED",
          reviewedById: reviewedBy,
          reviewedAt: new Date(),
          internalNotes: reviewNote ?? null
        },
        include: { user: { select: { name: true, email: true } } }
      });
      if (status === "approved") {
        await tx.user.update({ where: { id: updated.userId }, data: { role: "PRODUCER", onboardingDone: true } });
      }
      await (tx as any).notification.create({
        data: {
          userId: updated.userId,
          title: status === "approved" ? "Producer access approved" : "Producer application reviewed",
          body: status === "approved" ? "Your HYMN producer dashboard is now unlocked." : "Your producer application was not approved. Review the notes and try again.",
          type: "account",
          href: "/producer/dashboard",
          actionLabel: status === "approved" ? "Open producer dashboard" : "Review notes",
          priority: status === "approved" ? "normal" : "high",
          metadata: { reviewNote: reviewNote ?? null }
        }
      });
      await tx.auditLog.create({
        data: {
          actorId: reviewedBy,
          action: `PRODUCER_APPLICATION_${status.toUpperCase()}`,
          entity: "producer_applications",
          entityId: String(applicationId),
          metadata: { reviewNote: reviewNote ?? null }
        }
      });
      return updated;
    });
    return mapPrismaProducerApplication(application);
  }

  const pool = getPool();
  if (!pool) {
    const application = memory.producerApplications.find((item) => item.id === applicationId);
    if (!application) return null;
    application.status = status;
    application.reviewedBy = reviewedBy;
    application.reviewedAt = new Date().toISOString();
    application.reviewNote = reviewNote ?? null;
    if (status === "approved") {
      const user = memory.users.find((entry) => entry.id === application.userId);
      if (user) user.role = "producer";
    }
    await createNotification({
      userId: application.userId,
      title: status === "approved" ? "Producer access approved" : "Producer application reviewed",
      body: status === "approved" ? "Your HYMN producer dashboard is now unlocked." : "Your producer application was not approved. Review the notes and try again.",
      type: "account",
      href: "/producer/dashboard",
      actionLabel: status === "approved" ? "Open producer dashboard" : "Review notes",
      priority: status === "approved" ? "normal" : "high",
      metadata: { reviewNote: reviewNote ?? null }
    });
    return application;
  }

  await pool.query(
    "UPDATE producer_applications SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_note = ? WHERE id = ?",
    [status, reviewedBy, reviewNote ?? null, applicationId]
  );
  if (status === "approved") {
    await pool.query(
      "UPDATE users u JOIN producer_applications p ON p.user_id = u.id SET u.role = 'producer' WHERE p.id = ?",
      [applicationId]
    );
  }
  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, name, email, artist_name AS artistName, genre_focus AS genreFocus, beat_catalog_size AS beatCatalogSize,
            experience, links, message, status, reviewed_by AS reviewedBy, reviewed_at AS reviewedAt, review_note AS reviewNote, created_at AS createdAt
     FROM producer_applications WHERE id = ? LIMIT 1`,
    [applicationId]
  );
  const application = (rows as ProducerApplication[])[0] ?? null;
  if (application) {
    await createNotification({
      userId: application.userId,
      title: status === "approved" ? "Producer access approved" : "Producer application reviewed",
      body: status === "approved" ? "Your HYMN producer dashboard is now unlocked." : "Your producer application was not approved. Review the notes and try again.",
      type: "account",
      href: "/producer/dashboard",
      actionLabel: status === "approved" ? "Open producer dashboard" : "Review notes",
      priority: status === "approved" ? "normal" : "high",
      metadata: { reviewNote: reviewNote ?? null }
    });
  }
  return application;
}


export async function listAllArtistProfiles() {
  if (usesPostgresPrisma()) {
    return listPostgresArtistCards();
  }
  const pool = getPool();
  if (!pool) {
    return [...memory.artistProfiles].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, name, spotify_artist_id AS spotifyArtistId, spotify_url AS spotifyUrl,
            apple_artist_id AS appleArtistId, apple_url AS appleUrl, instagram_url AS instagramUrl, youtube_url AS youtubeUrl,
            image_url AS imageUrl, followers, is_linked AS isLinked, is_primary AS isPrimary, archived_at AS archivedAt,
            last_used_at AS lastUsedAt, created_at AS createdAt, updated_at AS updatedAt
     FROM artist_profiles
     ORDER BY updated_at DESC, created_at DESC`
  );
  return rows as ArtistProfile[];
}

function normalizeArtistProfileName(name: string) {
  return name.trim().toLowerCase();
}

// Keep ordinary artist-card operations compatible with databases where the
// optional DireNote reconciliation migration has not been deployed yet.
const portalArtistCardSelect = {
  id: true,
  userId: true,
  artistName: true,
  spotifyProfileUrl: true,
  spotifyArtistId: true,
  appleMusicProfileUrl: true,
  appleArtistId: true,
  instagramUrl: true,
  youtubeUrl: true,
  imageUrl: true,
  followers: true,
  isPrimary: true,
  archivedAt: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ArtistCardSelect;

function mapPrismaArtistCard(card: any): ArtistProfile {
  let producerLegalName: string | null = null;
  try {
    const role = card.role ? JSON.parse(card.role) : null;
    if (role?.type === "producer" && typeof role.legalName === "string") producerLegalName = role.legalName.trim() || null;
  } catch {
    producerLegalName = null;
  }
  return { id: card.id, userId: card.userId, name: card.artistName, spotifyArtistId: card.spotifyArtistId ?? null, spotifyUrl: card.spotifyProfileUrl ?? null, appleArtistId: card.appleArtistId ?? null, appleUrl: card.appleMusicProfileUrl ?? null, instagramUrl: card.instagramUrl ?? null, youtubeUrl: card.youtubeUrl ?? null, imageUrl: card.imageUrl ?? null, followers: card.followers ?? null, isLinked: Boolean(card.spotifyProfileUrl || card.appleMusicProfileUrl), isPrimary: Boolean(card.isPrimary), isProducer: Boolean(producerLegalName), producerLegalName, archivedAt: card.archivedAt?.toISOString?.() ?? null, lastUsedAt: null, createdAt: card.createdAt.toISOString(), updatedAt: card.updatedAt.toISOString() };
}

function artistProducerRole(input: Pick<ArtistProfile, "isProducer" | "producerLegalName">) {
  return input.isProducer && input.producerLegalName?.trim() ? JSON.stringify({ type: "producer", legalName: input.producerLegalName.trim() }) : null;
}

async function listPostgresArtistCards(input: { userId?: number; query?: string; take?: number } = {}) {
  // The production database predates optional DireNote artist columns. Use an
  // explicit projection so ordinary portal reads work before that migration is
  // deliberately applied; never select `direnote_artist_id` by default.
  const query = input.query?.trim() ?? "";
  const limit = Math.max(1, Math.min(input.take ?? 10_000, 10_000));
  const rows = input.userId == null
    ? await prisma.$queryRaw<Array<Record<string, any>>>(Prisma.sql`
        SELECT "id", "user_id" AS "userId", "artist_name" AS "artistName",
               "spotify_profile_url" AS "spotifyProfileUrl", "spotify_artist_id" AS "spotifyArtistId",
               "apple_music_profile_url" AS "appleMusicProfileUrl", "apple_artist_id" AS "appleArtistId",
               "instagram_url" AS "instagramUrl", "youtube_url" AS "youtubeUrl", "image_url" AS "imageUrl",
               "followers", "is_primary" AS "isPrimary", "archived_at" AS "archivedAt", "role",
               "created_at" AS "createdAt", "updated_at" AS "updatedAt"
          FROM "artist_cards"
         WHERE "archived_at" IS NULL
         ORDER BY "updated_at" DESC
         LIMIT ${limit}`)
    : await prisma.$queryRaw<Array<Record<string, any>>>(Prisma.sql`
        SELECT "id", "user_id" AS "userId", "artist_name" AS "artistName",
               "spotify_profile_url" AS "spotifyProfileUrl", "spotify_artist_id" AS "spotifyArtistId",
               "apple_music_profile_url" AS "appleMusicProfileUrl", "apple_artist_id" AS "appleArtistId",
               "instagram_url" AS "instagramUrl", "youtube_url" AS "youtubeUrl", "image_url" AS "imageUrl",
               "followers", "is_primary" AS "isPrimary", "archived_at" AS "archivedAt", "role",
               "created_at" AS "createdAt", "updated_at" AS "updatedAt"
          FROM "artist_cards"
         WHERE "user_id" = ${input.userId} AND "archived_at" IS NULL
           AND (${query} = '' OR "artist_name" ILIKE ${`%${query}%`})
         ORDER BY "updated_at" DESC
         LIMIT ${limit}`);
  return rows.map(mapPrismaArtistCard);
}

export async function listArtistProfilesByUser(userId: number, query = "") {
  if (usesPostgresPrisma()) {
    return listPostgresArtistCards({ userId, query });
  }
  const pool = getPool();
  const normalized = normalizeArtistProfileName(query);
  if (!pool) {
    return memory.artistProfiles
      .filter((profile) => profile.userId === userId && !profile.archivedAt && (!normalized || profile.name.toLowerCase().includes(normalized)))
      .sort((a, b) => new Date(b.lastUsedAt ?? b.updatedAt).getTime() - new Date(a.lastUsedAt ?? a.updatedAt).getTime());
  }

  const likeQuery = `%${normalized}%`;
  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, name, spotify_artist_id AS spotifyArtistId, spotify_url AS spotifyUrl,
            apple_artist_id AS appleArtistId, apple_url AS appleUrl, instagram_url AS instagramUrl, youtube_url AS youtubeUrl,
            image_url AS imageUrl, followers, is_linked AS isLinked, is_primary AS isPrimary, archived_at AS archivedAt,
            last_used_at AS lastUsedAt, created_at AS createdAt, updated_at AS updatedAt
     FROM artist_profiles
     WHERE user_id = ? AND archived_at IS NULL AND (? = '' OR normalized_name LIKE ?)
     ORDER BY COALESCE(last_used_at, updated_at) DESC, updated_at DESC`,
    [userId, normalized, likeQuery]
  );
  return rows as ArtistProfile[];
}

export async function listRecentArtistProfilesByUser(userId: number, limit = 6) {
  if (usesPostgresPrisma()) {
    return listPostgresArtistCards({ userId, take: limit });
  }
  const pool = getPool();
  if (!pool) {
    return memory.artistProfiles
      .filter((profile) => profile.userId === userId && !profile.archivedAt)
      .sort((a, b) => new Date(b.lastUsedAt ?? b.updatedAt).getTime() - new Date(a.lastUsedAt ?? a.updatedAt).getTime())
      .slice(0, limit);
  }
  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, name, spotify_artist_id AS spotifyArtistId, spotify_url AS spotifyUrl,
            apple_artist_id AS appleArtistId, apple_url AS appleUrl, instagram_url AS instagramUrl, youtube_url AS youtubeUrl,
            image_url AS imageUrl, followers, is_linked AS isLinked, is_primary AS isPrimary, archived_at AS archivedAt,
            last_used_at AS lastUsedAt, created_at AS createdAt, updated_at AS updatedAt
     FROM artist_profiles
     WHERE user_id = ? AND archived_at IS NULL
     ORDER BY COALESCE(last_used_at, updated_at) DESC, updated_at DESC
     LIMIT ?`,
    [userId, limit]
  );
  return rows as ArtistProfile[];
}

export async function createArtistProfile(input: Omit<ArtistProfile, "id" | "createdAt" | "updatedAt" | "lastUsedAt">) {
  if (usesPostgresPrisma()) {
    const card = await prisma.artistCard.create({
      data: { userId: input.userId, artistName: input.name, spotifyProfileUrl: input.spotifyUrl, spotifyArtistId: input.spotifyArtistId, appleMusicProfileUrl: input.appleUrl, appleArtistId: input.appleArtistId, instagramUrl: input.instagramUrl!, youtubeUrl: input.youtubeUrl, imageUrl: input.imageUrl, followers: input.followers, isPrimary: input.isPrimary ?? false, role: artistProducerRole(input) },
      select: portalArtistCardSelect,
    });
    return mapPrismaArtistCard(card);
  }
  const pool = getPool();
  const normalizedName = normalizeArtistProfileName(input.name);
  if (!pool) {
    const duplicate = memory.artistProfiles.find((profile) => profile.userId === input.userId && (profile.spotifyArtistId && input.spotifyArtistId ? profile.spotifyArtistId === input.spotifyArtistId : normalizeArtistProfileName(profile.name) === normalizedName));
    if (duplicate) {
      throw new Error(input.spotifyArtistId ? "This Spotify artist is already saved." : "An artist with this name already exists.");
    }
    const now = new Date().toISOString();
    const profile: ArtistProfile = { ...input, id: nextId(memory.artistProfiles), createdAt: now, updatedAt: now, lastUsedAt: now };
    memory.artistProfiles.unshift(profile);
    return profile;
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO artist_profiles
        (user_id, name, normalized_name, spotify_artist_id, spotify_url, apple_artist_id, apple_url, instagram_url, youtube_url, image_url, followers, is_linked, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [input.userId, input.name, normalizedName, input.spotifyArtistId ?? null, input.spotifyUrl ?? null, input.appleArtistId ?? null, input.appleUrl ?? null, input.instagramUrl ?? null, input.youtubeUrl ?? null, input.imageUrl ?? null, input.followers ?? null, input.isLinked]
    );
    const [rows] = await pool.query(
      `SELECT id, user_id AS userId, name, spotify_artist_id AS spotifyArtistId, spotify_url AS spotifyUrl,
              apple_artist_id AS appleArtistId, apple_url AS appleUrl, instagram_url AS instagramUrl, youtube_url AS youtubeUrl,
              image_url AS imageUrl, followers, is_linked AS isLinked, is_primary AS isPrimary, archived_at AS archivedAt,
              last_used_at AS lastUsedAt, created_at AS createdAt, updated_at AS updatedAt
       FROM artist_profiles WHERE id = ? LIMIT 1`,
      [Number((result as mysql.ResultSetHeader).insertId)]
    );
    return (rows as ArtistProfile[])[0] ?? null;
  } catch (error) {
    if (error instanceof Error && /duplicate|uq_artist_profiles/i.test(error.message)) {
      throw new Error(input.spotifyArtistId ? "This Spotify artist is already saved." : "An artist with this name already exists.");
    }
    throw error;
  }
}

export async function countArtistProfilesByUser(userId: number) {
  if (usesPostgresPrisma()) return prisma.artistCard.count({ where: { userId, archivedAt: null } });
  const pool = getPool();
  if (!pool) return memory.artistProfiles.filter((profile) => profile.userId === userId && !profile.archivedAt).length;
  const [rows] = await pool.query("SELECT COUNT(*) AS count FROM artist_profiles WHERE user_id = ? AND archived_at IS NULL", [userId]);
  return Number((rows as Array<{ count: number }>)[0]?.count ?? 0);
}

export async function updateArtistProfile(userId: number, id: number, patch: Partial<ArtistProfile>) {
  const existing = (await listArtistProfilesByUser(userId)).find((profile) => profile.id === id);
  if (!existing) return null;
  const next = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  if (usesPostgresPrisma()) {
    const result = await prisma.artistCard.updateMany({ where: { id, userId, archivedAt: null }, data: { artistName: next.name, spotifyProfileUrl: next.spotifyUrl, spotifyArtistId: next.spotifyArtistId, appleMusicProfileUrl: next.appleUrl, appleArtistId: next.appleArtistId, instagramUrl: next.instagramUrl!, youtubeUrl: next.youtubeUrl, imageUrl: next.imageUrl, followers: next.followers, role: artistProducerRole(next) } });
    if (!result.count) return null;
    const card = await prisma.artistCard.findUnique({ where: { id }, select: portalArtistCardSelect });
    return card ? mapPrismaArtistCard(card) : null;
  }
  const pool = getPool();
  if (!pool) {
    const index = memory.artistProfiles.findIndex((profile) => profile.id === id && profile.userId === userId);
    if (index >= 0) memory.artistProfiles[index] = next;
    return next;
  }
  await pool.query(
    `UPDATE artist_profiles SET name = ?, normalized_name = ?, spotify_artist_id = ?, spotify_url = ?, apple_artist_id = ?, apple_url = ?, instagram_url = ?, youtube_url = ?, image_url = ?, followers = ?, is_linked = ? WHERE id = ? AND user_id = ? AND archived_at IS NULL`,
    [next.name, normalizeArtistProfileName(next.name), next.spotifyArtistId ?? null, next.spotifyUrl ?? null, next.appleArtistId ?? null, next.appleUrl ?? null, next.instagramUrl ?? null, next.youtubeUrl ?? null, next.imageUrl ?? null, next.followers ?? null, next.isLinked, id, userId]
  );
  return (await listArtistProfilesByUser(userId)).find((profile) => profile.id === id) ?? null;
}

export async function archiveArtistProfile(userId: number, id: number) {
  if (usesPostgresPrisma()) {
    const result = await prisma.artistCard.updateMany({ where: { id, userId, archivedAt: null }, data: { archivedAt: new Date() } });
    return result.count > 0;
  }
  const pool = getPool();
  if (!pool) {
    const profile = memory.artistProfiles.find((item) => item.id === id && item.userId === userId && !item.archivedAt);
    if (!profile) return false;
    profile.archivedAt = new Date().toISOString();
    return true;
  }
  const [result] = await pool.query("UPDATE artist_profiles SET archived_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND archived_at IS NULL", [id, userId]);
  return Number((result as mysql.ResultSetHeader).affectedRows) > 0;
}

export async function touchArtistProfiles(userId: number, profileIds: number[]) {
  if (!profileIds.length) return;
  const uniqueIds = [...new Set(profileIds)];
  if (usesPostgresPrisma()) {
    await prisma.artistCard.updateMany({ where: { userId, id: { in: uniqueIds }, archivedAt: null }, data: { updatedAt: new Date() } });
    return;
  }
  const pool = getPool();
  if (!pool) {
    const now = new Date().toISOString();
    memory.artistProfiles.forEach((profile) => {
      if (profile.userId === userId && uniqueIds.includes(profile.id)) {
        profile.lastUsedAt = now;
        profile.updatedAt = now;
      }
    });
    return;
  }
  const placeholders = uniqueIds.map(() => "?").join(", ");
  await pool.query(
    `UPDATE artist_profiles SET last_used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id IN (${placeholders})`,
    [userId, ...uniqueIds]
  );
}

function slugifyProducerName(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `producer-${randomUUID().slice(0, 8)}`;
}

function normalizeProducerProfile(row: Record<string, any>): ProducerProfile {
  return {
    id: Number(row.id),
    userId: Number(row.userId || row.user_id || 0),
    slug: String(row.slug),
    name: String(row.name),
    description: String(row.description ?? ""),
    specialty: String(row.specialty ?? ""),
    imageUrl: row.imageUrl ?? null,
    active: Boolean(row.active),
    sortOrder: Number(row.sortOrder ?? 0),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt)
  };
}

async function ensureProducerProfileSeeds(pool: mysql.Pool) {
  const [rows] = await pool.query("SELECT id FROM producer_profiles LIMIT 1");
  if ((rows as Array<{ id: number }>).length) return;
  for (const profile of defaultProducerProfiles) {
    await pool.query(
      "INSERT INTO producer_profiles (id, slug, name, description, specialty, image_url, active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [profile.id, profile.slug, profile.name, profile.description, profile.specialty, profile.imageUrl ?? null, profile.active ? 1 : 0, profile.sortOrder]
    );
  }
}

async function ensureSiteSettingsRow(pool: mysql.Pool) {
  const [rows] = await pool.query("SELECT id FROM site_settings LIMIT 1");
  if ((rows as Array<{ id: number }>).length) return;
  await pool.query("INSERT INTO site_settings (id, home_hero_image_url) VALUES (1, NULL)");
}

export async function listProducerProfiles(limit?: number): Promise<ProducerProfile[]> {
  const take = limit == null ? undefined : Math.max(1, Math.min(limit, 48));
  if (usesPostgresPrisma()) {
    try {
      const profiles = await prisma.producerProfile.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        ...(take ? { take } : {})
      });
      if (profiles.length > 0) return profiles.map(mapPrismaProducerProfile);
    } catch (e) {
      rethrowProductionPersistenceFailure(e);
      console.error("Prisma listProducerProfiles error; using development memory data:", e);
    }
  }

  const pool = getPool();
  if (!pool) return [...memory.producerProfiles].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)).slice(0, take);

  await ensureProducerProfileSeeds(pool);
  const [rows] = await pool.query(
    `SELECT id, slug, name, description, specialty, image_url AS imageUrl, active, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt
     FROM producer_profiles
     ORDER BY sort_order ASC, created_at ASC${take ? " LIMIT ?" : ""}`,
    take ? [take] : []
  );
  return (rows as Array<Record<string, any>>).map(normalizeProducerProfile);
}

export async function createProducerProfile(input: { name: string; description: string; specialty: string; imageUrl?: string | null; active?: boolean; sortOrder?: number }) {
  if (usesPostgresPrisma()) assertNoProductionMemoryStore("Legacy producer profile creation");
  const pool = getPool();
  const slugBase = slugifyProducerName(input.name);
  if (!pool) {
    const slug = memory.producerProfiles.some((profile) => profile.slug === slugBase) ? `${slugBase}-${nextId(memory.producerProfiles)}` : slugBase;
    const now = new Date().toISOString();
    const profile: ProducerProfile = {
      id: nextId(memory.producerProfiles),
      userId: 0,
      slug,
      name: input.name,
      description: input.description,
      specialty: input.specialty,
      imageUrl: input.imageUrl ?? null,
      active: input.active ?? true,
      sortOrder: input.sortOrder ?? memory.producerProfiles.length + 1,
      createdAt: now,
      updatedAt: now
    };
    memory.producerProfiles.push(profile);
    return profile;
  }

  const slug = `${slugBase}-${Date.now().toString(36)}`;
  await pool.query(
    `INSERT INTO producer_profiles (slug, name, description, specialty, image_url, active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [slug, input.name, input.description, input.specialty, input.imageUrl ?? null, input.active ?? true, input.sortOrder ?? 0]
  );
  const [rows] = await pool.query("SELECT id, slug, name, description, specialty, image_url AS imageUrl, active, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt FROM producer_profiles WHERE slug = ? LIMIT 1", [slug]);
  return normalizeProducerProfile((rows as Array<Record<string, any>>)[0]);
}

export async function updateProducerProfile(id: number, input: Partial<{ name: string; description: string; specialty: string; imageUrl: string | null; active: boolean; sortOrder: number }>) {
  if (usesPostgresPrisma()) assertNoProductionMemoryStore("Legacy producer profile updates");
  const pool = getPool();
  if (!pool) {
    const profile = memory.producerProfiles.find((item) => item.id === id);
    if (!profile) return null;
    Object.assign(profile, input, { updatedAt: new Date().toISOString() });
    return profile;
  }

  const fields: string[] = [];
  const values: Array<string | number | boolean | null> = [];
  const mappings: Record<string, string> = {
    name: "name",
    description: "description",
    specialty: "specialty",
    imageUrl: "image_url",
    active: "active",
    sortOrder: "sort_order"
  };
  (Object.keys(input) as Array<keyof typeof input>).forEach((key) => {
    const column = mappings[String(key)];
    if (!column || typeof input[key] === "undefined") return;
    fields.push(`${column} = ?`);
    values.push(input[key] ?? null);
  });
  if (fields.length) {
    await pool.query(`UPDATE producer_profiles SET ${fields.join(", ")} WHERE id = ?`, [...values, id]);
  }
  const [rows] = await pool.query("SELECT id, slug, name, description, specialty, image_url AS imageUrl, active, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt FROM producer_profiles WHERE id = ? LIMIT 1", [id]);
  const row = (rows as Array<Record<string, any>>)[0];
  return row ? normalizeProducerProfile(row) : null;
}

export async function deleteProducerProfile(id: number) {
  if (usesPostgresPrisma()) assertNoProductionMemoryStore("Legacy producer profile deletion");
  const pool = getPool();
  if (!pool) {
    const index = memory.producerProfiles.findIndex((item) => item.id === id);
    if (index < 0) return false;
    memory.producerProfiles.splice(index, 1);
    return true;
  }

  const [rows] = await pool.query("SELECT id FROM producer_profiles WHERE id = ? LIMIT 1", [id]);
  if (!(rows as Array<{ id: number }>).length) return false;
  await pool.query("DELETE FROM producer_profiles WHERE id = ?", [id]);
  return true;
}

export async function getSiteSettings() {
  if (usesPostgresPrisma()) assertNoProductionMemoryStore("Legacy site settings");
  const pool = getPool();
  if (!pool) return memory.siteSettings;

  await ensureSiteSettingsRow(pool);
  const [rows] = await pool.query("SELECT home_hero_image_url AS homeHeroImageUrl FROM site_settings WHERE id = 1 LIMIT 1");
  const row = (rows as Array<Record<string, any>>)[0];
  return { homeHeroImageUrl: row?.homeHeroImageUrl ?? null };
}

export async function updateSiteSettings(input: Partial<SiteSettings>) {
  if (usesPostgresPrisma()) assertNoProductionMemoryStore("Legacy site settings");
  const pool = getPool();
  if (!pool) {
    memory.siteSettings = { ...memory.siteSettings, ...input };
    return memory.siteSettings;
  }

  await pool.query(
    `INSERT INTO site_settings (id, home_hero_image_url) VALUES (1, ?) ON DUPLICATE KEY UPDATE home_hero_image_url = VALUES(home_hero_image_url)`,
    [input.homeHeroImageUrl ?? null]
  );
  return getSiteSettings();
}

export async function getProducerEarnings(producerId: number) {
  const orders = await listOrdersByProducer(producerId);
  const producer = await findUserById(producerId);
  const paidOrders = orders.filter((order) => order.paymentStatus === "paid");
  const totalRevenue = paidOrders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.price, 0), 0);
  const beatsSold = paidOrders.reduce((sum, order) => sum + order.items.length, 0);
  return {
    producerId,
    producerName: producer?.name ?? "Producer",
    totalSales: paidOrders.length,
    totalRevenue,
    beatsSold
  } as ProducerEarning;
}

export async function getAnalyticsSummary(user: User): Promise<AnalyticsSummary> {
  const releases = user.role === "admin" ? await listAllReleases() : await listReleasesByUser(user.id);
  if (!usesPostgresPrisma()) return buildAnalyticsSummary([], user.role);
  type VerifiedRow = { releaseId: number; platform: string; country: string; streams: number; saves: number; revenueCents: number; periodStart: Date; periodEnd: Date; dataSource: string; statementPeriod: string | null; importedAt: Date };
  const ownership = user.role === "admin" ? Prisma.empty : Prisma.sql`AND r."user_id" = ${user.id}`;
  const rows = await prisma.$queryRaw<VerifiedRow[]>(Prisma.sql`
    SELECT a."release_id" AS "releaseId", a."platform", a."country", a."streams", a."saves",
           a."revenue_cents" AS "revenueCents", a."period_start" AS "periodStart", a."period_end" AS "periodEnd",
           a."data_source" AS "dataSource", a."statement_period" AS "statementPeriod", a."imported_at" AS "importedAt"
      FROM "analytics" a JOIN "releases" r ON r."id" = a."release_id"
     WHERE a."is_verified" = true ${ownership}
     ORDER BY a."period_end" ASC, a."imported_at" ASC
  `);
  const byRelease = new Map<number, VerifiedRow[]>();
  rows.forEach(row => byRelease.set(row.releaseId, [...(byRelease.get(row.releaseId) ?? []), row]));
  const withAnalytics = releases.flatMap(release => {
    const entries = byRelease.get(release.id); if (!entries?.length) return [];
    const countries: Record<string, number> = {}; const platforms: Record<string, number> = {}; const dailyStreams = new Map<string, number>(); const dailyRevenue = new Map<string, number>();
    entries.forEach(row => { const date = row.periodEnd.toISOString().slice(0, 10); countries[row.country] = (countries[row.country] ?? 0) + row.streams; platforms[row.platform] = (platforms[row.platform] ?? 0) + row.streams; dailyStreams.set(date, (dailyStreams.get(date) ?? 0) + row.streams); dailyRevenue.set(date, (dailyRevenue.get(date) ?? 0) + row.revenueCents / 100); });
    return [{ ...release, analytics: { streams_total: entries.reduce((n,row)=>n+row.streams,0), revenue_total: entries.reduce((n,row)=>n+row.revenueCents,0)/100, platforms, countries, daily_streams: [...dailyStreams].map(([date,value])=>({date,value})), daily_revenue: [...dailyRevenue].map(([date,value])=>({date,value})) } }];
  });
  const latest = rows.at(-1);
  return buildAnalyticsSummary(withAnalytics, user.role, latest ? { dataSource: latest.dataSource, statementPeriod: latest.statementPeriod, importedAt: latest.importedAt.toISOString() } : undefined);
}

function toIsoString(value: unknown) {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toDateOrThrow(value: string, label: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} is invalid.`);
  }
  return parsed;
}

function extractSpotifyTrackId(input: string) {
  const match = input.trim().match(/spotify\.com\/track\/([A-Za-z0-9]+)|spotify:track:([A-Za-z0-9]+)/i);
  const trackId = match?.[1] ?? match?.[2] ?? null;
  if (!trackId) {
    throw new Error("Enter a valid Spotify track URL.");
  }
  return trackId;
}

function normalizeTimedPlaylistName(value: string) {
  return value.trim();
}

function getTimedPlaylistStore() {
  if (usesPostgresPrisma()) assertNoProductionMemoryStore("Timed playlists");
  return memory.timedPlaylistTracks;
}

async function ensureTimedPlaylistTable(pool: mysql.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS timed_playlist_tracks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      track_name VARCHAR(255) NOT NULL,
      artist_name VARCHAR(255) NOT NULL,
      spotify_url TEXT NOT NULL,
      spotify_track_id VARCHAR(128) NOT NULL,
      playlist_name VARCHAR(255) NOT NULL,
      playlist_url TEXT NULL,
      start_at DATETIME NOT NULL,
      end_at DATETIME NOT NULL,
      status ENUM('active', 'expired') NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      expired_at DATETIME NULL,
      removed_at DATETIME NULL,
      INDEX idx_timed_playlist_status_end_at (status, end_at),
      INDEX idx_timed_playlist_playlist_name (playlist_name)
    )
  `);
}

function sortTimedPlaylistTracks(tracks: TimedPlaylistTrack[]) {
  return [...tracks].sort((left, right) => {
    const leftRank = left.status === 'active' ? 0 : 1;
    const rightRank = right.status === 'active' ? 0 : 1;
    if (leftRank !== rightRank) return leftRank - rightRank;
    const leftStamp = new Date(left.status === 'active' ? left.endAt : left.expiredAt ?? left.updatedAt).getTime();
    const rightStamp = new Date(right.status === 'active' ? right.endAt : right.expiredAt ?? right.updatedAt).getTime();
    return left.status === 'active' ? leftStamp - rightStamp : rightStamp - leftStamp;
  });
}

function normalizeTimedPlaylistRow(row: Record<string, any>): TimedPlaylistTrack {
  const status = String(row.status ?? 'active') === 'expired' ? 'expired' : 'active';
  return {
    id: Number(row.id),
    trackName: String(row.trackName ?? row.track_name ?? 'Spotify Track'),
    artistName: String(row.artistName ?? row.artist_name ?? 'Unknown Artist'),
    spotifyUrl: String(row.spotifyUrl ?? row.spotify_url ?? ''),
    spotifyTrackId: String(row.spotifyTrackId ?? row.spotify_track_id ?? ''),
    playlistName: String(row.playlistName ?? row.playlist_name ?? 'Unsorted'),
    playlistUrl: row.playlistUrl ?? row.playlist_url ?? null,
    startAt: toIsoString(row.startAt ?? row.start_at) ?? new Date().toISOString(),
    endAt: toIsoString(row.endAt ?? row.end_at) ?? new Date().toISOString(),
    status,
    createdAt: toIsoString(row.createdAt ?? row.created_at) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updatedAt ?? row.updated_at) ?? new Date().toISOString(),
    expiredAt: toIsoString(row.expiredAt ?? row.expired_at),
    removedAt: toIsoString(row.removedAt ?? row.removed_at)
  };
}

function isTimedPlaylistDue(track: TimedPlaylistTrack, now = new Date()) {
  return track.status === 'active' && new Date(track.endAt).getTime() <= now.getTime();
}

async function listTimedPlaylistRecords() {
  const pool = getPool();

  if (!pool) {
    return sortTimedPlaylistTracks(memory.timedPlaylistTracks.map((track) => normalizeTimedPlaylistRow(track as unknown as Record<string, any>)));
  }

  await ensureTimedPlaylistTable(pool);
  const [rows] = await pool.query(
    `SELECT id,
            track_name AS trackName,
            artist_name AS artistName,
            spotify_url AS spotifyUrl,
            spotify_track_id AS spotifyTrackId,
            playlist_name AS playlistName,
            playlist_url AS playlistUrl,
            start_at AS startAt,
            end_at AS endAt,
            status,
            created_at AS createdAt,
            updated_at AS updatedAt,
            expired_at AS expiredAt,
            removed_at AS removedAt
     FROM timed_playlist_tracks
     ORDER BY status = 'active' DESC, end_at ASC, updated_at DESC`
  );
  return sortTimedPlaylistTracks((rows as Array<Record<string, any>>).map(normalizeTimedPlaylistRow));
}

function buildTimedPlaylistDashboard(tracks: TimedPlaylistTrack[]): TimedPlaylistDashboard {
  const activeTracks = tracks.filter((track) => track.status === 'active');
  const expiredTracks = tracks.filter((track) => track.status === 'expired');
  const playlists = Array.from(new Set([...defaultTimedPlaylistNames, ...tracks.map((track) => track.playlistName).filter(Boolean)])).sort((left, right) => left.localeCompare(right));
  const nextExpiryAt = activeTracks.reduce<string | null>((earliest, track) => {
    if (!earliest) return track.endAt;
    return new Date(track.endAt).getTime() < new Date(earliest).getTime() ? track.endAt : earliest;
  }, null);

  return {
    summary: {
      activeCount: activeTracks.length,
      expiredCount: expiredTracks.length,
      playlistCount: playlists.length,
      nextExpiryAt
    },
    playlists,
    activeTracks,
    expiredTracks
  };
}

export async function getTimedPlaylistDashboard() {
  return buildTimedPlaylistDashboard(await listTimedPlaylistRecords());
}

export async function getDueTimedPlaylistTracks() {
  const now = new Date();
  const tracks = await listTimedPlaylistRecords();
  return tracks.filter((track) => isTimedPlaylistDue(track, now));
}

export async function resolveSpotifyTrackMetadata(spotifyUrl: string) {
  const input = spotifyUrl.trim();
  if (!input) {
    throw new Error('Enter a valid Spotify track link or song name.');
  }

  const looksLikeSpotifyUrl = /spotify\.(?:com|link)|spotify:/i.test(input);
  const isSpotifyTrack = /spotify\.com\/track\/|spotify:track:/i.test(input);

  if (isSpotifyTrack) {
    const trackId = extractSpotifyTrackId(input);
    const canonicalUrl = input.startsWith('spotify:track:') ? `https://open.spotify.com/track/${trackId}` : input;
    try {
      const response = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(canonicalUrl)}`, { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json() as { title?: string; author_name?: string };
        return {
          spotifyTrackId: trackId,
          trackName: String(data.title ?? '').trim() || `Spotify Track ${trackId.slice(0, 6).toUpperCase()}`,
          artistName: String(data.author_name ?? '').trim() || 'Unknown Artist',
          spotifyUrl: canonicalUrl
        };
      }
    } catch {
      // Fall back to a safe label if Spotify metadata is not reachable.
    }

    return {
      spotifyTrackId: trackId,
      trackName: `Spotify Track ${trackId.slice(0, 6).toUpperCase()}`,
      artistName: 'Unknown Artist',
      spotifyUrl: canonicalUrl
    };
  }

  if (looksLikeSpotifyUrl) {
    throw new Error('Paste a Spotify track link or type a song name.');
  }

  const results = await searchSpotifyTracks(input);
  const match = results[0];
  if (!match) {
    throw new Error(`No Spotify tracks found for "${input}".`);
  }

  return {
    spotifyTrackId: match.id,
    trackName: match.name,
    artistName: match.artistName,
    spotifyUrl: match.spotifyUrl
  };
}

export async function createTimedPlaylistTrack(input: {
  spotifyUrl: string;
  spotifyTrackId?: string;
  trackName?: string;
  artistName?: string;
  playlistName: string;
  playlistUrl: string;
  startAt: string;
  endAt: string;
}) {
  if (usesPostgresPrisma()) assertNoProductionMemoryStore("Timed playlists");
  const start = toDateOrThrow(input.startAt, 'Start time');
  const end = toDateOrThrow(input.endAt, 'End time');
  if (end.getTime() <= start.getTime()) {
    throw new Error('End time must be after the start time.');
  }

  const resolved = input.spotifyTrackId && input.trackName && input.artistName
    ? { spotifyTrackId: input.spotifyTrackId, trackName: input.trackName, artistName: input.artistName, spotifyUrl: input.spotifyUrl.trim() }
    : await resolveSpotifyTrackMetadata(input.spotifyUrl);

  const now = new Date().toISOString();
  const playlistName = normalizeTimedPlaylistName(input.playlistName);
  const track: TimedPlaylistTrack = {
    id: 0,
    trackName: resolved.trackName,
    artistName: resolved.artistName,
    spotifyUrl: resolved.spotifyUrl ?? input.spotifyUrl.trim(),
    spotifyTrackId: resolved.spotifyTrackId,
    playlistName,
    playlistUrl: input.playlistUrl.trim(),
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    status: 'active',
    createdAt: now,
    updatedAt: now,
    expiredAt: null,
    removedAt: null
  };

  const pool = getPool();
  if (!pool) {
    track.id = nextId(memory.timedPlaylistTracks);
    memory.timedPlaylistTracks.unshift(track);
    return track;
  }

  await ensureTimedPlaylistTable(pool);
  const [result] = await pool.query(
    `INSERT INTO timed_playlist_tracks (
      track_name, artist_name, spotify_url, spotify_track_id, playlist_name, playlist_url, start_at, end_at, status, expired_at, removed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, NULL)`,
    [track.trackName, track.artistName, track.spotifyUrl, track.spotifyTrackId, track.playlistName, track.playlistUrl ?? null, start.toISOString().slice(0, 19).replace('T', ' '), end.toISOString().slice(0, 19).replace('T', ' ')]
  );

  const insertedId = Number((result as mysql.ResultSetHeader).insertId);
  return {
    ...track,
    id: insertedId
  };
}

export async function extendTimedPlaylistTrack(trackId: number, endAt: string) {
  if (usesPostgresPrisma()) assertNoProductionMemoryStore("Timed playlists");
  const end = toDateOrThrow(endAt, 'End time');
  const pool = getPool();
  if (!pool) {
    const track = memory.timedPlaylistTracks.find((item) => item.id === trackId);
    if (!track) return null;
    if (new Date(track.startAt).getTime() >= end.getTime()) {
      throw new Error('End time must be after the start time.');
    }
    const updatedAt = new Date().toISOString();
    Object.assign(track, { endAt: end.toISOString(), status: 'active' as TimedPlaylistTrackStatus, expiredAt: null, removedAt: null, updatedAt });
    return track;
  }

  await ensureTimedPlaylistTable(pool);
  const [existingRows] = await pool.query('SELECT start_at AS startAt FROM timed_playlist_tracks WHERE id = ? LIMIT 1', [trackId]);
  const existing = (existingRows as Array<Record<string, any>>)[0];
  if (!existing) return null;
  if (new Date(String(existing.startAt)).getTime() >= end.getTime()) {
    throw new Error('End time must be after the start time.');
  }

  await pool.query(
    `UPDATE timed_playlist_tracks
     SET end_at = ?, status = 'active', expired_at = NULL, removed_at = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [end.toISOString().slice(0, 19).replace('T', ' '), trackId]
  );

  const [rows] = await pool.query(
    `SELECT id,
            track_name AS trackName,
            artist_name AS artistName,
            spotify_url AS spotifyUrl,
            spotify_track_id AS spotifyTrackId,
            playlist_name AS playlistName,
            playlist_url AS playlistUrl,
            start_at AS startAt,
            end_at AS endAt,
            status,
            created_at AS createdAt,
            updated_at AS updatedAt,
            expired_at AS expiredAt,
            removed_at AS removedAt
     FROM timed_playlist_tracks
     WHERE id = ? LIMIT 1`,
    [trackId]
  );
  const row = (rows as Array<Record<string, any>>)[0];
  return row ? normalizeTimedPlaylistRow(row) : null;
}

export async function removeTimedPlaylistTrack(trackId: number) {
  if (usesPostgresPrisma()) assertNoProductionMemoryStore("Timed playlists");
  const pool = getPool();
  const now = new Date();
  if (!pool) {
    const track = memory.timedPlaylistTracks.find((item) => item.id === trackId);
    if (!track) return null;
    const stamp = now.toISOString();
    Object.assign(track, { status: 'expired' as TimedPlaylistTrackStatus, expiredAt: track.expiredAt ?? stamp, removedAt: track.removedAt ?? stamp, updatedAt: stamp });
    return track;
  }

  await ensureTimedPlaylistTable(pool);
  await pool.query(
    `UPDATE timed_playlist_tracks
     SET status = 'expired', expired_at = COALESCE(expired_at, CURRENT_TIMESTAMP), removed_at = COALESCE(removed_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [trackId]
  );

  const [rows] = await pool.query(
    `SELECT id,
            track_name AS trackName,
            artist_name AS artistName,
            spotify_url AS spotifyUrl,
            spotify_track_id AS spotifyTrackId,
            playlist_name AS playlistName,
            playlist_url AS playlistUrl,
            start_at AS startAt,
            end_at AS endAt,
            status,
            created_at AS createdAt,
            updated_at AS updatedAt,
            expired_at AS expiredAt,
            removed_at AS removedAt
     FROM timed_playlist_tracks
     WHERE id = ? LIMIT 1`,
    [trackId]
  );
  const row = (rows as Array<Record<string, any>>)[0];
  return row ? normalizeTimedPlaylistRow(row) : null;
}

export async function getSubscriptionByUserId(userId: number) {
  if (usesPostgresPrisma()) {
    const sub = await prisma.subscription.findUnique({ where: { userId }, include: { planVersion: true, payments: { orderBy: { createdAt: "desc" }, take: 50 } } });
    if (!sub) return null;
    const releasesUsed = await prisma.subscriptionReleaseUsage.count({ where: { subscriptionId: sub.id, ...(sub.currentPeriodStart ? { createdAt: { gte: sub.currentPeriodStart } } : {}) } });
    
    const now = new Date();
    const expiryDate = new Date(sub.currentPeriodEnd || sub.expiryDate || sub.updatedAt);
    const daysRemaining = Math.max(0, Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    const status = sub.razorpaySubscriptionId ? sub.status : (daysRemaining > 0 ? sub.status : "expired");
    
    return {
      id: sub.id,
      userId: sub.userId,
      plan: (sub.plan || "one_time") as any,
      planName: sub.planName || undefined,
      purchasedAt: sub.purchasedAt?.toISOString() || undefined,
      expiryDate: (sub.expiryDate || sub.updatedAt).toISOString(),
      status: status,
      releasesUsed,
      releaseLimit: sub.releaseLimit ?? null,
      artistLimit: sub.artistLimit || 5,
      availableFeatures: sub.availableFeatures ? JSON.parse(sub.availableFeatures) : [],
      daysRemaining: daysRemaining,
      autoRenewal: sub.autoRenewal ?? true,
      nextRenewalDate: sub.nextRenewalDate?.toISOString() || undefined,
      razorpaySubscriptionId: sub.razorpaySubscriptionId || undefined,
      razorpayPlanId: sub.razorpayPlanId || undefined,
      currentPeriodStart: sub.currentPeriodStart?.toISOString() || undefined,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() || undefined,
      startedAt: sub.startedAt?.toISOString() || undefined,
      cancelledAt: sub.cancelledAt?.toISOString() || undefined,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      amount: sub.planVersion ? sub.planVersion.amount / 100 : undefined,
      currency: sub.planVersion?.currency || "INR",
      billingInterval: sub.planVersion?.billingInterval,
      billingHistory: sub.payments.map((payment) => ({ id: payment.id, paymentId: payment.razorpayPaymentId, invoiceId: payment.razorpayInvoiceId, amount: payment.amount / 100, currency: payment.currency, status: payment.status, billingPeriodStart: payment.billingPeriodStart?.toISOString(), billingPeriodEnd: payment.billingPeriodEnd?.toISOString(), createdAt: payment.createdAt.toISOString() })),
      createdAt: sub.createdAt.toISOString(),
      updatedAt: sub.updatedAt.toISOString()
    };
  }
  return null;
}

export async function createTestSubscription(email: string) {
  if (usesPostgresPrisma()) {
    const user = await prisma.user.findFirst({ where: { email } });
    if (!user) return;
    
    const expiryDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365);
    await prisma.subscription.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        plan: "yearly" as any,
        planName: "Yearly",
        expiryDate: expiryDate,
        status: "active",
        releasesUsed: 0,
        releaseLimit: 12,
        artistLimit: 7,
        availableFeatures: JSON.stringify(["all"]),
        daysRemaining: 365,
        autoRenewal: true,
        purchasedAt: new Date()
      },
      update: {
        plan: "yearly" as any,
        planName: "Yearly",
        expiryDate: expiryDate,
        status: "active",
        releaseLimit: 12,
        artistLimit: 7,
        daysRemaining: 365
      }
    });
  }
}

export async function createOrUpdateSubscription(userId: number, plan: string, durationDays: number, artistLimit: number = 5, features: string[] = []) {
  if (usesPostgresPrisma()) {
    const expiryDate = new Date(Date.now() + durationDays * 1000 * 60 * 60 * 24);
    const subscription = await prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        plan: plan as any,
        planName: plan.charAt(0).toUpperCase() + plan.slice(1).replace("_", " "),
        expiryDate,
        status: "active",
        purchasedAt: new Date(),
        releasesUsed: 0,
        artistLimit,
        availableFeatures: JSON.stringify(features),
        daysRemaining: durationDays,
        autoRenewal: true
      },
      update: {
        plan: plan as any,
        expiryDate,
        status: "active",
        artistLimit,
        availableFeatures: JSON.stringify(features),
        daysRemaining: durationDays,
        updatedAt: new Date()
      }
    });
    return subscription;
  }
  return null;
}

export async function updateSubscriptionStatus(userId: number) {
  if (usesPostgresPrisma()) {
    const sub = await prisma.subscription.findUnique({
      where: { userId }
    });
    
    if (!sub) return null;
    
    const now = new Date();
    const expiryDate = new Date(sub.expiryDate);
    const daysRemaining = Math.max(0, Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    const status = daysRemaining > 0 ? "active" : "expired";
    
    if (sub.status !== status || sub.daysRemaining !== daysRemaining) {
      await prisma.subscription.update({
        where: { userId },
        data: {
          status,
          daysRemaining,
          updatedAt: new Date()
        }
      });
    }
    
    return await getSubscriptionByUserId(userId);
  }
  return null;
}

export async function downgradeSubscription(userId: number, newPlan: string, newDurationDays: number, newArtistLimit: number) {
  if (usesPostgresPrisma()) {
    const expiryDate = new Date(Date.now() + newDurationDays * 1000 * 60 * 60 * 24);
    const subscription = await prisma.subscription.update({
      where: { userId },
      data: {
        plan: newPlan as any,
        planName: newPlan.charAt(0).toUpperCase() + newPlan.slice(1).replace("_", " "),
        expiryDate,
        artistLimit: newArtistLimit,
        daysRemaining: newDurationDays,
        updatedAt: new Date()
      }
    });
    return subscription;
  }
  return null;
}

export async function upgradeSubscription(userId: number, newPlan: string, newArtistLimit: number, extendDays: number = 365) {
  if (usesPostgresPrisma()) {
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    if (!sub) return null;
    
    const expiryDate = new Date(Math.max(new Date().getTime(), sub.expiryDate.getTime()) + extendDays * 1000 * 60 * 60 * 24);
    const subscription = await prisma.subscription.update({
      where: { userId },
      data: {
        plan: newPlan as any,
        planName: newPlan.charAt(0).toUpperCase() + newPlan.slice(1).replace("_", " "),
        expiryDate,
        artistLimit: newArtistLimit,
        updatedAt: new Date()
      }
    });
    return subscription;
  }
  return null;
}

export async function getAnalyticsByUserId(userId: number) {
  if (usesPostgresPrisma()) {
    const analytics = await prisma.analytics.findMany({
      where: {
        release: {
          userId: userId
        }
      },
      include: {
        release: true
      }
    });
    return analytics;
  }
  return [];
}

export async function getOrCreateArtistCard(userId: number, artistName: string) {
  if (usesPostgresPrisma()) {
    const card = await prisma.artistCard.findUnique({
      where: {
        userId_artistName: { userId, artistName }
      },
      select: portalArtistCardSelect,
    });
    
    if (card) {
      return {
        id: card.id,
        userId: card.userId,
        artistName: card.artistName,
        spotifyProfileUrl: card.spotifyProfileUrl || undefined,
        appleMusicProfileUrl: card.appleMusicProfileUrl || undefined,
        role: card.role || undefined,
        createdAt: card.createdAt.toISOString(),
        updatedAt: card.updatedAt.toISOString()
      };
    }
    
    const newCard = await prisma.artistCard.create({
      data: { userId, artistName },
      select: portalArtistCardSelect,
    });
    
    return {
      id: newCard.id,
      userId: newCard.userId,
      artistName: newCard.artistName,
      spotifyProfileUrl: newCard.spotifyProfileUrl || undefined,
      appleMusicProfileUrl: newCard.appleMusicProfileUrl || undefined,
      role: newCard.role || undefined,
      createdAt: newCard.createdAt.toISOString(),
      updatedAt: newCard.updatedAt.toISOString()
    };
  }
  return null;
}

export async function listArtistCardsByUser(userId: number) {
  if (usesPostgresPrisma()) {
    const cards = await prisma.artistCard.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: portalArtistCardSelect,
    });
    
    return cards.map(card => ({
      id: card.id,
      userId: card.userId,
      artistName: card.artistName,
      spotifyProfileUrl: card.spotifyProfileUrl || undefined,
      appleMusicProfileUrl: card.appleMusicProfileUrl || undefined,
      role: card.role || undefined,
      createdAt: card.createdAt.toISOString(),
      updatedAt: card.updatedAt.toISOString()
    }));
  }
  return [];
}

export async function createBeatPurchase(userId: number, beatId: number, licenseType: "general" | "basic" | "premium" | "exclusive", paymentId?: string | null) {
  if (usesPostgresPrisma()) {
    const existing = await prisma.beatPurchase.findFirst({ where: paymentId ? { userId, beatId, licenseType, paymentId } : { userId, beatId, licenseType, paymentId: null } });
    const purchase = existing
      ? await prisma.beatPurchase.update({ where: { id: existing.id }, data: { hasAccess: true, paymentId: paymentId ?? undefined } })
      : await prisma.beatPurchase.create({ data: {
        userId,
        beatId,
        licenseType,
        purchasedAt: new Date(),
        hasAccess: true,
        paymentId: paymentId ?? null
      } });
    
    return {
      id: purchase.id,
      userId: purchase.userId,
      beatId: purchase.beatId,
      licenseType: purchase.licenseType as any,
      purchasedAt: purchase.purchasedAt.toISOString(),
      licenseUploadedAt: purchase.licenseUploadedAt?.toISOString() || undefined,
      licenseUrl: purchase.licenseUrl || undefined,
      releaseId: purchase.releaseId ?? null,
      paymentId: purchase.paymentId ?? null,
      hasAccess: purchase.hasAccess,
      createdAt: purchase.createdAt.toISOString(),
      updatedAt: purchase.updatedAt.toISOString()
    };
  }
  return null;
}

export async function getBeatPurchasesByUser(userId: number) {
  if (usesPostgresPrisma()) {
    const purchases = await prisma.beatPurchase.findMany({
      where: { userId, hasAccess: true },
      orderBy: { purchasedAt: "desc" }
    });
    
    return purchases.map(p => ({
      id: p.id,
      userId: p.userId,
      beatId: p.beatId,
      licenseType: p.licenseType as any,
      purchasedAt: p.purchasedAt.toISOString(),
      licenseUploadedAt: p.licenseUploadedAt?.toISOString() || undefined,
      licenseUrl: p.licenseUrl || undefined,
      releaseId: p.releaseId ?? null,
      paymentId: p.paymentId ?? null,
      hasAccess: p.hasAccess,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString()
    }));
  }
  return [];
}

export async function uploadBeatLicense(purchaseId: number, licenseUrl: string) {
  if (usesPostgresPrisma()) {
    const purchase = await prisma.beatPurchase.update({
      where: { id: purchaseId },
      data: {
        licenseUrl,
        licenseUploadedAt: new Date(),
        updatedAt: new Date()
      }
    });
    
    return {
      id: purchase.id,
      userId: purchase.userId,
      beatId: purchase.beatId,
      licenseType: purchase.licenseType as any,
      purchasedAt: purchase.purchasedAt.toISOString(),
      licenseUploadedAt: purchase.licenseUploadedAt?.toISOString() || undefined,
      licenseUrl: purchase.licenseUrl || undefined,
      hasAccess: purchase.hasAccess,
      createdAt: purchase.createdAt.toISOString(),
      updatedAt: purchase.updatedAt.toISOString()
    };
  }
  return null;
}

export async function revokeOrRestoreBeatAccess(purchaseId: number, hasAccess: boolean) {
  if (usesPostgresPrisma()) {
    const purchase = await prisma.beatPurchase.update({
      where: { id: purchaseId },
      data: { hasAccess, updatedAt: new Date() }
    });
    
    return {
      id: purchase.id,
      userId: purchase.userId,
      beatId: purchase.beatId,
      licenseType: purchase.licenseType as any,
      purchasedAt: purchase.purchasedAt.toISOString(),
      licenseUploadedAt: purchase.licenseUploadedAt?.toISOString() || undefined,
      licenseUrl: purchase.licenseUrl || undefined,
      hasAccess: purchase.hasAccess,
      createdAt: purchase.createdAt.toISOString(),
      updatedAt: purchase.updatedAt.toISOString()
    };
  }
  return null;
}

export async function deleteBeat(id: number) {
  if (usesPostgresPrisma()) {
    try {
      await prisma.beat.delete({ where: { id } });
      return true;
    } catch (err) {
      rethrowProductionPersistenceFailure(err);
      console.error("Prisma deleteBeat error:", err);
    }
  }

  const idx = memory.beats.findIndex((b) => b.id === id);
  if (idx !== -1) memory.beats.splice(idx, 1);
  return true;
}

export function mapPrismaBeat(prismaBeat: any): Beat {
  return {
    id: prismaBeat.id,
    producerId: prismaBeat.userId,
    producerName: prismaBeat.user?.name ?? "Unknown Producer",
    title: prismaBeat.title,
    bpm: prismaBeat.bpm,
    genre: prismaBeat.genre,
    mood: prismaBeat.mood,
    keySignature: prismaBeat.keySignature,
    price: prismaBeat.priceCents / 100,
    generalPrice: prismaBeat.generalPriceCents / 100,
    exclusivePrice: prismaBeat.exclusivePriceCents / 100,
    description: prismaBeat.description,
    subgenre: prismaBeat.subgenre,
    tags: Array.isArray(prismaBeat.tags) ? prismaBeat.tags : [],
    sampleDeclaration: prismaBeat.sampleDeclaration,
    sampleDisclosure: prismaBeat.sampleDisclosure,
    generalMaxCommercialReleases: prismaBeat.generalMaxCommercialReleases,
    generalStreamingLimit: prismaBeat.generalStreamingLimit,
    generalVideoLimit: prismaBeat.generalVideoLimit,
    generalPerformanceRights: prismaBeat.generalPerformanceRights,
    generalMonetizationAllowed: prismaBeat.generalMonetizationAllowed,
    generalCreditRequired: prismaBeat.generalCreditRequired,
    generalContentIdPolicy: prismaBeat.generalContentIdPolicy,
    generalTermDurationMonths: prismaBeat.generalTermDurationMonths,
    generalTerritory: prismaBeat.generalTerritory,
    exclusiveLegalMode: prismaBeat.exclusiveLegalMode,
    generalLicensesSold: prismaBeat.generalLicensesSold,
    exclusiveReservationExpiresAt: prismaBeat.exclusiveReservationExpiresAt?.toISOString() ?? null,
    fileUrl: "",
    previewUrl: normalizePublicUploadUrl(prismaBeat.preview?.publicUrl) ?? "",
    artworkUrl: normalizePublicUploadUrl(prismaBeat.artwork?.publicUrl) ?? undefined,
    enabled: prismaBeat.enabled,
    status: prismaBeat.status,
    reviewIssues: prismaBeat.reviewIssues ?? null,
    createdAt: prismaBeat.createdAt.toISOString()
  };
}

export function mapPrismaProducerProfile(prismaProfile: any): ProducerProfile {
  const coverPhotoUrl = normalizePublicUploadUrl(prismaProfile.coverPhotoUrl);
  const avatarUrl = normalizePublicUploadUrl(prismaProfile.avatarUrl);
  return {
    id: prismaProfile.id,
    userId: prismaProfile.userId,
    slug: prismaProfile.slug,
    name: prismaProfile.displayName,
    description: prismaProfile.bio ?? "",
    specialty: prismaProfile.specialty ?? "",
    imageUrl: coverPhotoUrl ?? avatarUrl,
    coverPhotoUrl,
    avatarUrl,
    instagramUrl: prismaProfile.instagramUrl ?? null,
    youtubeUrl: prismaProfile.youtubeUrl ?? null,
    spotifyUrl: prismaProfile.spotifyUrl ?? null,
    websiteUrl: prismaProfile.websiteUrl ?? null,
    tags: Array.isArray(prismaProfile.tags) ? prismaProfile.tags : [],
    location: prismaProfile.location ?? null,
    status: prismaProfile.status ?? (prismaProfile.active ? "active" : "disabled"),
    active: prismaProfile.active,
    sortOrder: prismaProfile.sortOrder,
    createdAt: prismaProfile.createdAt.toISOString(),
    updatedAt: prismaProfile.updatedAt.toISOString()
  };
}

// trigger vercel deploy

// vercel trigger

// vercel trigger
// vercel trigger 7
// vercel trigger 9

// vercel trigger 11
