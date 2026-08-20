import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
if (process.env.NODE_ENV === "production" && !/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
  throw new Error("DATABASE_URL must contain a PostgreSQL connection URL in production. HYMN will not start with MySQL or in-memory persistence.");
}

const globalForPrisma = globalThis as typeof globalThis & {
  hymnPrisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.hymnPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.hymnPrisma = prisma;
}

// vercel trigger 9
