import { NextResponse } from "next/server";
import { createAdminSession } from "@/lib/session";
import { adminLoginSchema } from "@/lib/validation";
import { consumeRateLimit, requestIdentity } from "@/lib/rate-limit";
import { logAuditEvent } from "@/lib/audit-log";
import { apiRequestId } from "@/lib/api-response";

export async function POST(request: Request) {
  const requestId = apiRequestId(request);
  const ipAddress = requestIdentity(request);
  const userAgent = request.headers.get("user-agent")?.slice(0, 1000) || undefined;
  const rate = await consumeRateLimit({ scope: "admin-dev-login", identity: ipAddress, limit: 5, windowSeconds: 15 * 60 });
  if (!rate.allowed) return NextResponse.json({ error: "Too many login attempts. Try again later.", requestId }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds), "X-Request-ID": requestId } });
  try {
    const payload = adminLoginSchema.parse(await request.json());
    const devUsername = process.env.ADMIN_DEV_USERNAME?.trim();
    const devPassword = process.env.ADMIN_DEV_PASSWORD?.trim();
    const devLoginEnabled = process.env.NODE_ENV !== "production" && devUsername && devPassword;

    if (!devLoginEnabled || payload.username !== devUsername || payload.password !== devPassword) {
      await logAuditEvent({ actorType: "system", entityType: "authentication", entityId: "development-admin", action: "admin_login.failed", reason: "invalid_credentials_or_disabled", requestId, ipAddress, userAgent, riskLevel: "high" });
      return NextResponse.json({ error: "Invalid admin credentials." }, { status: 401 });
    }

    await createAdminSession();
    await logAuditEvent({ actorType: "admin", actorRole: "development_admin", entityType: "authentication", entityId: "development-admin", action: "admin_login.succeeded", requestId, ipAddress, userAgent, riskLevel: "low" });
    return NextResponse.json({ redirectPath: "/admin" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Admin authentication failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}



// vercel trigger
// vercel trigger 9
