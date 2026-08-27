import { NextRequest, NextResponse } from "next/server";

type Role = "customer" | "producer" | "admin";

const protectedRoutes: Array<{ prefix: string; roles: Role[] }> = [
  { prefix: "/dashboard/customer", roles: ["customer", "producer", "admin"] },
  { prefix: "/dashboard/releases", roles: ["customer", "producer", "admin"] },
  { prefix: "/dashboard", roles: ["customer", "producer", "admin"] },
  { prefix: "/producer/dashboard", roles: ["producer", "admin"] },
  { prefix: "/producer-dashboard", roles: ["producer", "admin"] },
  { prefix: "/admin", roles: ["admin"] }
];

const protectedApis: Array<{ prefix: string; roles: Role[] }> = [
  { prefix: "/api/admin", roles: ["admin"] },
  { prefix: "/api/producer", roles: ["producer", "customer", "admin"] },
  { prefix: "/api/distribution", roles: ["customer", "producer", "admin"] },
  { prefix: "/api/orders", roles: ["customer", "producer", "admin"] },
  { prefix: "/api/analytics", roles: ["customer", "producer", "admin"] }
];

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/api/admin" || pathname.startsWith("/api/admin/");
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/webhooks/") && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin"); const fetchSite = request.headers.get("sec-fetch-site");
    const normalizedOrigin = origin ? normalizeOrigin(origin) : "";
    const originTrusted = Boolean(normalizedOrigin && trustedMutationOrigins(request).has(normalizedOrigin));
    if ((origin && !originTrusted) || (fetchSite === "cross-site" && !originTrusted)) return NextResponse.json({ error: "Cross-site mutation rejected." }, { status: 403 });
  }
  const rule = [...protectedApis, ...protectedRoutes].find((item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`));
  if (!rule || pathname === "/admin/login" || pathname === "/api/admin/auth/login") return NextResponse.next();

  const session = await readSession(request);
  if (!session) {
    if (rule.roles.includes("admin") && (await readAdminSession(request))) {
      return NextResponse.next();
    }

    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = isAdminRoute ? "/admin/login" : "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (!rule.roles.includes(session.role)) {
    if (rule.roles.includes("admin") && (await readAdminSession(request))) {
      return NextResponse.next();
    }

    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    const url = request.nextUrl.clone();
    if (isAdminRoute) {
      url.pathname = "/admin/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    url.pathname = "/access-denied";
    url.searchParams.set("role", session.role);
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

function trustedMutationOrigins(request: NextRequest) {
  const origins = new Set<string>([normalizeOrigin(request.nextUrl.origin)]);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const protocol = forwardedProtocol === "http" || forwardedProtocol === "https" ? forwardedProtocol : request.nextUrl.protocol.replace(":", "");
  if (host && /^[a-z0-9.-]+(?::\d+)?$/i.test(host)) origins.add(normalizeOrigin(`${protocol}://${host}`));
  for (const value of [process.env.NEXT_PUBLIC_APP_URL, process.env.APP_URL, process.env.PUBLIC_SITE_URL]) {
    if (value?.trim()) origins.add(normalizeOrigin(value));
  }
  return origins;
}

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return "";
  }
}

async function readSession(request: NextRequest) {
  const token = request.cookies.get("hymn_session")?.value;
  if (!token) return null;
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) return null;

  const secret = requiredProxySecret("JWT_SECRET");
  const expected = await hmac(`${header}.${payload}`, secret);
  if (!timingSafeEqual(signature, expected)) return null;

  try {
    const decoded = JSON.parse(base64UrlDecode(payload)) as { exp?: number; role?: Role; sub?: number };
    if (!decoded.sub || !decoded.role || !decoded.exp || decoded.exp * 1000 <= Date.now()) return null;
    return { sub: decoded.sub, role: decoded.role };
  } catch {
    return null;
  }
}

async function readAdminSession(request: NextRequest) {
  const token = request.cookies.get("hymn_admin_session")?.value;
  if (!token) return null;
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) return null;

  const secret = requiredProxySecret("ADMIN_JWT_SECRET");
  const expected = await hmac(`${header}.${payload}`, secret);
  if (!timingSafeEqual(signature, expected)) return null;

  try {
    const decoded = JSON.parse(base64UrlDecode(payload)) as { exp?: number; role?: Role; username?: string };
    if (decoded.role !== "admin" || decoded.username !== "admin" || !decoded.exp || decoded.exp * 1000 <= Date.now()) return null;
    return { role: decoded.role };
  } catch {
    return null;
  }
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64UrlEncode(new Uint8Array(signature));
}

function base64UrlDecode(value: string) {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=").replace(/-/g, "+").replace(/_/g, "/");
  return atob(padded);
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function requiredProxySecret(name: "JWT_SECRET" | "ADMIN_JWT_SECRET") {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (process.env.NODE_ENV !== "production") {
    return name === "JWT_SECRET"
      ? "hymn-development-user-secret-not-for-production"
      : "hymn-development-admin-secret-not-for-production";
  }
  throw new Error(`${name} is required in production.`);
}

export const config = {
  matcher: ["/dashboard/:path*", "/producer-dashboard/:path*", "/producer/dashboard/:path*", "/admin/:path*", "/api/:path*"]
};

// vercel trigger
// vercel trigger 5
// vercel trigger 9
