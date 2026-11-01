import "server-only";
import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";
import { getUserSessionSecret } from "@/lib/env";
import { consumeRateLimit } from "@/lib/rate-limit";
import { assertNotMergedIdentity } from "@/lib/merged-account-identity";
import { getEmailClient, getEmailConfig } from "@/lib/email/email-client";
import { emailLayout, emailText } from "@/lib/email/email-templates";

const PURPOSE = "hymn-team-email-code-v1";
const TTL = 10 * 60;
export class TeamEmailSignInError extends Error {
  constructor(message: string, readonly status = 400, readonly retryAfter = 0) { super(message); }
}
function mac(value: string) {
  return createHmac("sha256", getUserSessionSecret()).update(`${PURPOSE}:${value}`).digest("hex");
}
function equal(a: string, b: string) {
  return /^[a-f0-9]{64}$/.test(a) && /^[a-f0-9]{64}$/.test(b) && timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
async function limit(scope: string, identity: string, count: number, seconds: number) {
  const rate = await consumeRateLimit({ scope: `team-email-${scope}`, identity, limit: count, windowSeconds: seconds });
  if (!rate.allowed) throw new TeamEmailSignInError("Too many attempts. Please wait before trying again.", 429, rate.retryAfterSeconds);
}
async function eligible(email: string) {
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, status: "ACTIVE", teamMemberships: { some: { status: "ACTIVE" } } },
    select: { id: true, name: true, email: true, role: true, avatar: true }
  });
  if (user) await assertNotMergedIdentity({ email: user.email });
  return user;
}
export type CodeDelivery = (email: string, code: string) => Promise<void>;
async function deliverCode(email: string, code: string) {
  const config = getEmailConfig(), client = getEmailClient({ timeoutMs: 15000 });
  if (!config.enabled || !client) throw new Error("Email unavailable");
  const template = {
    title: "Your HYMN Team sign-in code",
    body: `Your verification code is ${code}.\n\nEnter this code in the HYMN Team app. It expires in 10 minutes and can be used once.`,
    ctaLabel: "", ctaUrl: "", audience: "team" as const,
    notice: "Never share this code. HYMN will not ask you for it. If you did not request this sign-in, ignore this email."
  };
  const result = await client.emails.send({ from: config.from, to: email, subject: template.title, html: emailLayout(template), text: emailText(template), ...(config.replyTo ? { replyTo: config.replyTo } : {}) });
  if (result.error) throw new Error("Email delivery failed");
}

export async function requestTeamEmailCode(email: string, ip: string, deliver: CodeDelivery = deliverCode) {
  email = email.trim().toLowerCase();
  await limit("request-ip", ip, 10, 15 * 60);
  await limit("request-email", email, 3, 15 * 60);
  await limit("resend", email, 1, 60);
  const id = randomUUID(), code = String(randomInt(0, 1000000)).padStart(6, "0");
  // The challenge contains no account ID, existence flag, role or offline-guessable code hash.
  // Its HMAC is secret-keyed; attempts and single-use consumption are durable database operations.
  const user = await eligible(email);
  const challenge = jwt.sign({ purpose: PURPOSE, e: mac(`email:${email}`), u: mac(`account:${user?.id ?? 0}`), c: mac(`code:${id}:${email}:${code}`) }, getUserSessionSecret(), { algorithm: "HS256", jwtid: id, expiresIn: TTL, audience: PURPOSE, issuer: "hymn-team" });
  if (user) {
    try { await deliver(user.email, code); }
    catch { console.error("TEAM_EMAIL_SIGN_IN_DELIVERY_FAILED"); }
  }
  // Identical responses for unknown, inactive and active members. Never return/log the code.
  return { challenge, expiresIn: TTL, resendAfter: 60, message: "If this email has an active HYMN team membership, a sign-in code has been sent. Check your inbox and spam folder." };
}

export async function verifyTeamEmailCode(email: string, challenge: string, code: string, ip: string) {
  email = email.trim().toLowerCase();
  await limit("verify-ip", ip, 30, 15 * 60);
  const invalid = () => new TeamEmailSignInError("This code is incorrect, expired or already used. Request a new code.", 401);
  let claims: jwt.JwtPayload;
  try {
    const payload = jwt.verify(challenge, getUserSessionSecret(), { algorithms: ["HS256"], audience: PURPOSE, issuer: "hymn-team", maxAge: TTL });
    if (typeof payload === "string" || payload.purpose !== PURPOSE || typeof payload.jti !== "string" || typeof payload.e !== "string" || typeof payload.c !== "string" || !equal(payload.e, mac(`email:${email}`))) throw invalid();
    claims = payload;
  } catch { throw invalid(); }
  await limit("code-attempt", claims.jti!, 5, TTL + 60);
  if (!equal(claims.c, mac(`code:${claims.jti}:${email}:${code}`))) throw invalid();
  const user = await eligible(email);
  if (!user || typeof claims.u !== "string" || !equal(claims.u, mac(`account:${user.id}`))) throw invalid();
  // Atomic rate-limit row locking prevents simultaneous redemption on different server instances.
  const used = await consumeRateLimit({ scope: "team-email-code-used", identity: claims.jti!, limit: 1, windowSeconds: TTL + 60 });
  if (!used.allowed) throw invalid();
  return user;
}
