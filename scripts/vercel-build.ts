import { execFileSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const production = process.env.VERCEL_ENV === "production";

if (production) {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required for a Vercel Production deployment so Prisma migrations can be applied safely.");
  }
  console.log("Applying Prisma migrations for the Vercel Production deployment…");
  execFileSync(npm, ["run", "db:migrate:deploy"], { stdio: "inherit" });
} else {
  console.log("Skipping Prisma migrations outside Vercel Production.");
}

execFileSync(npm, ["run", "build"], { stdio: "inherit" });
