import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import mysql from "mysql2/promise";
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
  Release,
  ReleaseStatus,
  ReferralActivity,
  User,
  UserRole
} from "@/lib/types";
import { buildAnalyticsSummary, ensureReleaseAnalytics } from "@/lib/analytics";
import { sampleBeats, sampleReleases } from "@/lib/site";
import { searchSpotifyTracks } from "@/lib/spotify";

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
  role: string;
  createdAt: Date;
}): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    googleId: user.googleId,
    role: fromPrismaRole(user.role),
    referralCode: "",
    referralCredits: 0,
    referredBy: null,
    firstPaymentRewarded: false,
    createdAt: user.createdAt.toISOString()
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

const defaultProducerProfiles: ProducerProfile[] = [
  {
    id: 1,
    slug: "noctis-vale",
    name: "Noctis Vale",
    description: "Noctis builds pressure-heavy records for artists who want midnight energy, distorted confidence, and a cinematic punch that feels expensive from the first second.",
    specialty: "Dark Trap / Rage",
    imageUrl: null,
    active: true,
    sortOrder: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 2,
    slug: "aya-serein",
    name: "Aya Serein",
    description: "Aya crafts after-hours production with melodic space, emotional tension, and hooks that feel intimate enough to turn demos into records people replay.",
    specialty: "Alt R&B / Soul Rap",
    imageUrl: null,
    active: true,
    sortOrder: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

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
  timedPlaylistTracks: [],
  siteSettings: defaultSiteSettings,
};

globalState.hymnMemory = memory;
globalState.hymnProducerProfiles = memory.producerProfiles;
globalState.hymnSiteSettings = memory.siteSettings;

function getPool() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (usesPostgresPrisma()) return null;
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

export async function findUserByEmail(email: string) {
  if (usesPostgresPrisma()) {
    const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
    return user ? mapPrismaUser(user) : null;
  }

  const pool = getPool();
  if (!pool) return memory.users.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null;

  const [rows] = await pool.query(
    "SELECT id, name, email, password_hash AS passwordHash, google_id AS googleId, role, referral_code AS referralCode, referral_credits AS referralCredits, referred_by AS referredBy, first_payment_rewarded AS firstPaymentRewarded, created_at AS createdAt FROM users WHERE email = ? LIMIT 1",
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
    "SELECT id, name, email, google_id AS googleId, role, referral_code AS referralCode, referral_credits AS referralCredits, referred_by AS referredBy, first_payment_rewarded AS firstPaymentRewarded, created_at AS createdAt FROM users WHERE id = ? LIMIT 1",
    [id]
  );
  return (rows as User[])[0] ?? null;
}

export async function findUserByReferralCode(referralCode: string) {
  const code = normalizeReferralCode(referralCode);
  if (!code) return null;
  const pool = getPool();
  if (!pool) return memory.users.find((user) => user.referralCode.toUpperCase() === code) ?? null;

  const [rows] = await pool.query(
    "SELECT id, name, email, google_id AS googleId, role, referral_code AS referralCode, referral_credits AS referralCredits, referred_by AS referredBy, first_payment_rewarded AS firstPaymentRewarded, created_at AS createdAt FROM users WHERE referral_code = ? LIMIT 1",
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
    "SELECT id, name, email, google_id AS googleId, role, referral_code AS referralCode, referral_credits AS referralCredits, referred_by AS referredBy, first_payment_rewarded AS firstPaymentRewarded, created_at AS createdAt FROM users ORDER BY created_at DESC"
  );
  return rows as User[];
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

export async function upsertGoogleUser(input: Pick<User, "name" | "email" | "googleId"> & { referralCode?: string; expectedRole?: AuthAccountRole }) {
  if (usesPostgresPrisma()) {
    const adminEmails = (process.env.ADMIN_GOOGLE_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    const existing = await prisma.user.findUnique({ where: { googleId: input.googleId } });
    const role = adminEmails.includes(input.email.toLowerCase())
      ? "admin"
      : input.expectedRole ?? (existing?.role === "PRODUCER" ? "producer" : "customer");
    const user = await prisma.user.upsert({
      where: { googleId: input.googleId },
      create: {
        googleId: input.googleId,
        name: input.name,
        email: input.email,
        avatar: null,
        role: toPrismaRole(role)
      },
      update: {
        name: input.name,
        email: input.email,
        role: toPrismaRole(role)
      }
    });
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: existing ? "LOGIN" : "USER_CREATED_WITH_GOOGLE",
        entity: "users",
        entityId: String(user.id),
        metadata: { googleId: input.googleId, email: input.email }
      }
    });
    return mapPrismaUser(user);
  }

  const pool = getPool();
  const existing = await findUserByEmail(input.email);
  const resolvedRole: AuthAccountRole = input.expectedRole ?? (existing?.role === "producer" ? "producer" : "customer");
  const referrer = existing ? null : await resolveReferrer(input.referralCode);
  rejectSelfReferral(referrer, input.email);

  if (!pool) {
    const localUser = memory.users.find((user) => user.email.toLowerCase() === input.email.toLowerCase());
    if (localUser) {
      localUser.name = input.name;
      localUser.googleId = input.googleId;
      localUser.role = resolvedRole;
      return localUser;
    }

    const user: User = {
      id: nextId(memory.users),
      name: input.name,
      email: input.email,
      googleId: input.googleId,
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
    `INSERT INTO users (name, email, google_id, role, referral_code, referred_by)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), google_id = VALUES(google_id), role = VALUES(role)`,
    [input.name, input.email, input.googleId, resolvedRole, existing?.referralCode || randomReferralCode(), referrer?.id ?? null]
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

export async function listAllBeats() {
  const pool = getPool();
  if (!pool) return [...memory.beats].sort((a, b) => b.id - a.id);
  const [rows] = await pool.query(
    `SELECT b.id, b.producer_id AS producerId, u.name AS producerName, b.title, b.bpm, b.genre, b.mood, b.price,
            b.audio_preview_url AS audioPreviewUrl, b.file_url AS fileUrl, b.artwork_url AS artworkUrl, b.enabled, b.created_at AS createdAt
     FROM beats b
     LEFT JOIN users u ON u.id = b.producer_id
     ORDER BY b.created_at DESC`
  );
  return rows as Beat[];
}

export async function listBeatsByProducer(producerId: number) {
  const beats = await listAllBeats();
  return beats.filter((beat) => beat.producerId === producerId);
}

export async function createBeat(input: Omit<Beat, "id" | "createdAt" | "producerName">) {
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
    [input.producerId, input.title, input.bpm, input.genre, input.mood, input.price, input.audioPreviewUrl, input.fileUrl, input.artworkUrl ?? null, input.enabled]
  );

  return {
    ...input,
    producerName: producer?.name,
    id: Number((result as mysql.ResultSetHeader).insertId),
    createdAt: new Date().toISOString()
  };
}

export async function updateBeat(id: number, input: Partial<Pick<Beat, "title" | "bpm" | "genre" | "mood" | "price" | "audioPreviewUrl" | "fileUrl" | "artworkUrl" | "enabled">>) {
  const pool = getPool();
  if (!pool) {
    const beat = memory.beats.find((item) => item.id === id);
    if (!beat) return null;
    Object.assign(beat, input);
    return beat;
  }

  const fields: string[] = [];
  const values: Array<string | number | boolean | null> = [];
  const mappings: Record<string, string> = {
    title: "title",
    bpm: "bpm",
    genre: "genre",
    mood: "mood",
    price: "price",
    audioPreviewUrl: "audio_preview_url",
    fileUrl: "file_url",
    artworkUrl: "artwork_url",
    enabled: "enabled"
  };

  (Object.keys(input) as Array<keyof typeof input>).forEach((key) => {
    const column = mappings[String(key)];
    if (!column || typeof input[key] === "undefined") return;
    fields.push(`${column} = ?`);
    values.push(input[key] ?? null);
  });

  if (fields.length) {
    await pool.query(`UPDATE beats SET ${fields.join(", ")} WHERE id = ?`, [...values, id]);
  }

  const [rows] = await pool.query(
    `SELECT b.id, b.producer_id AS producerId, u.name AS producerName, b.title, b.bpm, b.genre, b.mood, b.price,
            b.audio_preview_url AS audioPreviewUrl, b.file_url AS fileUrl, b.artwork_url AS artworkUrl, b.enabled, b.created_at AS createdAt
     FROM beats b
     LEFT JOIN users u ON u.id = b.producer_id
     WHERE b.id = ? LIMIT 1`,
    [id]
  );
  return (rows as Beat[])[0] ?? null;
}

export async function createRelease(input: Omit<Release, "id" | "createdAt" | "status"> & { status?: ReleaseStatus }) {
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

export async function listReleasesByUser(userId: number) {
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
  const pool = getPool();
  if (!pool) return memory.orders.filter((order) => order.userId === userId).map(mapOrder).sort((a, b) => b.id - a.id);
  return listOrdersQuery("WHERE o.user_id = ?", [userId]);
}

export async function listOrdersByProducer(producerId: number) {
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
  const pool = getPool();
  if (!pool) return [...memory.orders].map(mapOrder).sort((a, b) => b.id - a.id);
  return listOrdersQuery();
}

export async function findCouponByCode(code: string) {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return null;
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
  const pool = getPool();
  if (!pool) return memory.orders.find((order) => order.razorpayOrderId === razorpayOrderId) ?? null;
  const orders = await listOrdersQuery("WHERE o.razorpay_order_id = ?", [razorpayOrderId]);
  return orders[0] ?? null;
}

function getMilestoneBonus(successfulReferralCount: number) {
  if (successfulReferralCount === 10) return 1000;
  if (successfulReferralCount === 5) return 300;
  return 0;
}

function calculateReferralReward(successfulReferralCount: number) {
  return 100 + getMilestoneBonus(successfulReferralCount);
}

export async function completeCheckoutOrder(razorpayOrderId: string, paymentId: string) {
  const pool = getPool();
  if (!pool) {
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
      const successfulCount = memory.referrals.filter((referral) => referral.userId === user.referredBy && referral.status === "rewarded").length + 1;
      const reward = calculateReferralReward(successfulCount);
      if (referrer) referrer.referralCredits = Number(referrer.referralCredits) + reward;
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
  const pool = getPool();
  if (!pool) {
    const order = memory.orders.find((item) => item.razorpayOrderId === razorpayOrderId);
    if (order && order.paymentStatus !== "paid") order.paymentStatus = "failed";
    return order ?? null;
  }
  await pool.query("UPDATE orders SET payment_status = 'failed' WHERE razorpay_order_id = ? AND payment_status <> 'paid'", [razorpayOrderId]);
  return getCheckoutOrderByRazorpayId(razorpayOrderId);
}

export async function getReferralActivities(userId: number) {
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
    await prisma.notification.create({
      data: {
        userId: input.userId,
        title: "Producer application received",
        body: "HYMN will review your producer profile and sample work."
      }
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
    return application;
  }

  const [result] = await pool.query(
    `INSERT INTO producer_applications (user_id, name, email, artist_name, genre_focus, beat_catalog_size, experience, links, message, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [input.userId, input.name, input.email, input.artistName, input.genreFocus, input.beatCatalogSize, input.experience, input.links, input.message]
  );

  return {
    ...input,
    id: Number((result as mysql.ResultSetHeader).insertId),
    status: "pending",
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: new Date().toISOString()
  };
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
      await tx.notification.create({
        data: {
          userId: updated.userId,
          title: status === "approved" ? "Producer access approved" : "Producer application reviewed",
          body: status === "approved" ? "Your HYMN producer dashboard is now unlocked." : "Your producer application was not approved. Review the notes and try again."
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
  return (rows as ProducerApplication[])[0] ?? null;
}


export async function listAllArtistProfiles() {
  const pool = getPool();
  if (!pool) {
    return [...memory.artistProfiles].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, name, spotify_artist_id AS spotifyArtistId, spotify_url AS spotifyUrl,
            apple_artist_id AS appleArtistId, apple_url AS appleUrl, image_url AS imageUrl, followers,
            is_linked AS isLinked, last_used_at AS lastUsedAt, created_at AS createdAt, updated_at AS updatedAt
     FROM artist_profiles
     ORDER BY updated_at DESC, created_at DESC`
  );
  return rows as ArtistProfile[];
}

function normalizeArtistProfileName(name: string) {
  return name.trim().toLowerCase();
}

export async function listArtistProfilesByUser(userId: number, query = "") {
  const pool = getPool();
  const normalized = normalizeArtistProfileName(query);
  if (!pool) {
    return memory.artistProfiles
      .filter((profile) => profile.userId === userId && (!normalized || profile.name.toLowerCase().includes(normalized)))
      .sort((a, b) => new Date(b.lastUsedAt ?? b.updatedAt).getTime() - new Date(a.lastUsedAt ?? a.updatedAt).getTime());
  }

  const likeQuery = `%${normalized}%`;
  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, name, spotify_artist_id AS spotifyArtistId, spotify_url AS spotifyUrl,
            apple_artist_id AS appleArtistId, apple_url AS appleUrl, image_url AS imageUrl, followers,
            is_linked AS isLinked, last_used_at AS lastUsedAt, created_at AS createdAt, updated_at AS updatedAt
     FROM artist_profiles
     WHERE user_id = ? AND (? = '' OR normalized_name LIKE ?)
     ORDER BY COALESCE(last_used_at, updated_at) DESC, updated_at DESC`,
    [userId, normalized, likeQuery]
  );
  return rows as ArtistProfile[];
}

export async function listRecentArtistProfilesByUser(userId: number, limit = 6) {
  const pool = getPool();
  if (!pool) {
    return memory.artistProfiles
      .filter((profile) => profile.userId === userId)
      .sort((a, b) => new Date(b.lastUsedAt ?? b.updatedAt).getTime() - new Date(a.lastUsedAt ?? a.updatedAt).getTime())
      .slice(0, limit);
  }
  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, name, spotify_artist_id AS spotifyArtistId, spotify_url AS spotifyUrl,
            apple_artist_id AS appleArtistId, apple_url AS appleUrl, image_url AS imageUrl, followers,
            is_linked AS isLinked, last_used_at AS lastUsedAt, created_at AS createdAt, updated_at AS updatedAt
     FROM artist_profiles
     WHERE user_id = ?
     ORDER BY COALESCE(last_used_at, updated_at) DESC, updated_at DESC
     LIMIT ?`,
    [userId, limit]
  );
  return rows as ArtistProfile[];
}

export async function createArtistProfile(input: Omit<ArtistProfile, "id" | "createdAt" | "updatedAt" | "lastUsedAt">) {
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
        (user_id, name, normalized_name, spotify_artist_id, spotify_url, apple_artist_id, apple_url, image_url, followers, is_linked, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [input.userId, input.name, normalizedName, input.spotifyArtistId ?? null, input.spotifyUrl ?? null, input.appleArtistId ?? null, input.appleUrl ?? null, input.imageUrl ?? null, input.followers ?? null, input.isLinked]
    );
    const [rows] = await pool.query(
      `SELECT id, user_id AS userId, name, spotify_artist_id AS spotifyArtistId, spotify_url AS spotifyUrl,
              apple_artist_id AS appleArtistId, apple_url AS appleUrl, image_url AS imageUrl, followers,
              is_linked AS isLinked, last_used_at AS lastUsedAt, created_at AS createdAt, updated_at AS updatedAt
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

export async function touchArtistProfiles(userId: number, profileIds: number[]) {
  if (!profileIds.length) return;
  const uniqueIds = [...new Set(profileIds)];
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

export async function listProducerProfiles() {
  const pool = getPool();
  if (!pool) return [...memory.producerProfiles].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  await ensureProducerProfileSeeds(pool);
  const [rows] = await pool.query(
    `SELECT id, slug, name, description, specialty, image_url AS imageUrl, active, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt
     FROM producer_profiles
     ORDER BY sort_order ASC, created_at ASC`
  );
  return (rows as Array<Record<string, any>>).map(normalizeProducerProfile);
}

export async function createProducerProfile(input: { name: string; description: string; specialty: string; imageUrl?: string | null; active?: boolean; sortOrder?: number }) {
  const pool = getPool();
  const slugBase = slugifyProducerName(input.name);
  if (!pool) {
    const slug = memory.producerProfiles.some((profile) => profile.slug === slugBase) ? `${slugBase}-${nextId(memory.producerProfiles)}` : slugBase;
    const now = new Date().toISOString();
    const profile: ProducerProfile = {
      id: nextId(memory.producerProfiles),
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
  const pool = getPool();
  if (!pool) return memory.siteSettings;

  await ensureSiteSettingsRow(pool);
  const [rows] = await pool.query("SELECT home_hero_image_url AS homeHeroImageUrl FROM site_settings WHERE id = 1 LIMIT 1");
  const row = (rows as Array<Record<string, any>>)[0];
  return { homeHeroImageUrl: row?.homeHeroImageUrl ?? null };
}

export async function updateSiteSettings(input: Partial<SiteSettings>) {
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
  return buildAnalyticsSummary(releases, user.role);
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
