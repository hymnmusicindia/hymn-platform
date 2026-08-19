import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com"
      }
    ]
  },
  serverExternalPackages: ["@prisma/client", "mysql2", "bcrypt"],
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
