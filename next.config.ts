import type { NextConfig } from "next";

const developmentCspScriptSources = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
  experimental: {
    proxyClientMaxBodySize: "510mb"
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" }
    ],
    unoptimized: process.env.NEXT_IMAGE_UNOPTIMIZED === "true"
  },
  serverExternalPackages: ["@prisma/client", "mysql2", "bcrypt"],
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
      { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self' https: http: data: blob:", "base-uri 'self'", "frame-ancestors 'self'", "form-action 'self'", "object-src 'none'",
          "img-src 'self' data: blob: https: http:", "media-src 'self' blob: https: http:", "font-src 'self' data: https: http:",
          "style-src 'self' 'unsafe-inline' https:", `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://accounts.google.com https://*.google.com https://*.gstatic.com${developmentCspScriptSources}`, "connect-src 'self' https: http: wss: ws:", "frame-src 'self' https://*.razorpay.com https://accounts.google.com https://*.google.com",
          "upgrade-insecure-requests"
        ].join("; ")
      }
    ];
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  outputFileTracingExcludes: {
    "*": [
      "node_modules/@next/swc-linux-x64-gnu/**/*",
      "node_modules/@next/swc-linux-x64-musl/**/*",
      "node_modules/@next/swc-darwin-arm64/**/*",
      "node_modules/@next/swc-darwin-x64/**/*",
      "node_modules/@next/swc-win32-x64-msvc/**/*",
      "node_modules/@next/swc-win32-arm64-msvc/**/*",
      "node_modules/@swc/core-linux-x64-gnu/**/*",
      "node_modules/@swc/core-linux-x64-musl/**/*",
      "node_modules/@swc/core-darwin-arm64/**/*",
      "node_modules/@swc/core-darwin-x64/**/*",
      "node_modules/@swc/core-win32-x64-msvc/**/*",
      "node_modules/@swc/core-win32-arm64-msvc/**/*",
      "node_modules/prisma/**/*",
      "node_modules/typescript/**/*",
      "public/uploads/**/*",

      ".git/**/*",
      "node_modules/.prisma/client/libquery_engine-darwin-arm64.dylib.node",
      "node_modules/.prisma/client/libquery_engine-darwin-x64.dylib.node",
      "node_modules/.prisma/client/libquery_engine-windows.dll.node",
      "node_modules/tesseract.js-core/**/*.wasm"
    ]
  }
};

export default nextConfig;

// vercel trigger

// vercel trigger 2

// vercel trigger 4
// vercel trigger 9
