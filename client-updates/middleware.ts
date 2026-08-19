import { NextRequest, NextResponse } from "next/server";

type Role = "customer" | "producer" | "admin";

const protectedRoutes: Array<{ prefix: string; roles: Role[] }> = [
  { prefix: "/dashboard/customer", roles: ["customer"] },
  { prefix: "/dashboard/releases", roles: ["customer"] },
  { prefix: "/dashboard", roles: ["customer"] },
  { prefix: "/producer/dashboard", roles: ["producer"] },
  { prefix: "/producer-dashboard", roles: ["producer"] },
  { prefix: "/admin", roles: ["admin"] }
];

const protectedApis: Array<{ prefix: string; roles: Role[] }> = [
  { prefix: "/api/admin", roles: ["admin"] },
  { prefix: "/api/producer", roles: ["producer", "customer"] },
  { prefix: "/api/distribution", roles: ["customer"] },
  { prefix: "/api/orders", roles: ["customer", "producer"] },
  { prefix: "/api/analytics", roles: ["customer", "producer", "admin"] }
];

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
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
    url.pathname = rule.roles.includes("admin") ? "/admin/login" : "/login";
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
    if (rule.roles.includes("admin")) {
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

async function readSession(request: NextRequest) {
  const token = request.cookies.get("hymn_session")?.value;
  if (!token) return null;
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) return null;

  const secret = process.env.JWT_SECRET || "change-me";
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

  const secret = process.env.ADMIN_JWT_SECRET || `${process.env.JWT_SECRET || "change-me"}:admin`;
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

export const config = {
  matcher: ["/dashboard/:path*", "/producer-dashboard/:path*", "/producer/dashboard/:path*", "/admin/:path*", "/api/admin/:path*", "/api/producer/:path*", "/api/distribution/:path*", "/api/orders/:path*", "/api/analytics/:path*"]
};
