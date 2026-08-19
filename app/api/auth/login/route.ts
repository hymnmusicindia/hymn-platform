import bcrypt from "bcrypt";
import { NextResponse } from "next/server";
import { destinationForRole } from "@/lib/access";
import { profileAvatarDataUrl } from "@/lib/avatar";
import { findUserByEmail } from "@/lib/db";
import { createSession } from "@/lib/session";
import { userLoginSchema } from "@/lib/validation";
import { consumeRateLimit, requestIdentity } from "@/lib/rate-limit";
import { apiRequestId } from "@/lib/api-response";
import { logAuditEvent } from "@/lib/audit-log";

export async function POST(request: Request) {
  const requestId = apiRequestId(request);
  const ipAddress = requestIdentity(request);
  const userAgent = request.headers.get("user-agent")?.slice(0, 1000) || undefined;
  const rate = await consumeRateLimit({ scope: "user-login", identity: ipAddress, limit: 8, windowSeconds: 15 * 60 });
  if (!rate.allowed) return NextResponse.json({ error: "Too many login attempts. Try again later.", requestId }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds), "X-Request-ID": requestId } });
  try {
    const payload = userLoginSchema.parse(await request.json());
    const user = await findUserByEmail(payload.email);

    if (!user || !user.passwordHash) {
      await logAuditEvent({ actorType: "system", entityType: "authentication", entityId: payload.email.toLowerCase(), action: "login.failed", reason: "invalid_credentials", requestId, ipAddress, userAgent, riskLevel: "high" });
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    if (payload.role && payload.role !== user.role) {
      return NextResponse.json({ error: "This account uses a different workspace role." }, { status: 403 });
    }

    const valid = await bcrypt.compare(payload.password, user.passwordHash);
    if (!valid) {
      await logAuditEvent({ actorType: "system", actorId: user.id, actorRole: user.role, entityType: "authentication", entityId: user.id, action: "login.failed", reason: "invalid_credentials", requestId, ipAddress, userAgent, riskLevel: "high" });
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    await createSession({ sub: user.id, email: user.email, name: user.name, role: user.role, avatarUrl: profileAvatarDataUrl(user.name, user.role) }, { ipAddress, userAgent, requestId });
    await logAuditEvent({ actorType: user.role === "admin" ? "admin" : "user", actorId: user.id, actorRole: user.role, entityType: "authentication", entityId: user.id, action: "login.succeeded", requestId, ipAddress, userAgent, riskLevel: "low" });

    return NextResponse.json({ user, redirectPath: destinationForRole(user.role) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
// vercel trigger 9
