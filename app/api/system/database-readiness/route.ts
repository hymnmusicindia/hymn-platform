import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function connectionFingerprint() {
  const raw = process.env.DATABASE_URL?.trim() ?? "";
  try {
    const url = new URL(raw);
    const identity = `${url.protocol}//${url.hostname}:${url.port || "default"}/${url.pathname.replace(/^\//, "")}`;
    return createHash("sha256").update(identity).digest("hex").slice(0, 16);
  } catch {
    return "invalid-database-url";
  }
}

export async function GET(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  if (tokenHash !== "e508eeaaa7fd46ff1f0174f6b0c649a6342f13b3781f93d5edbbffce214ef218") return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    const [identity] = await prisma.$queryRaw<Array<{
      database: string;
      schema: string;
      users_table: string | null;
      migrations_table: string | null;
      public_table_count: bigint;
    }>>`
      SELECT
        current_database() AS database,
        current_schema() AS schema,
        to_regclass('public.users')::text AS users_table,
        to_regclass('public._prisma_migrations')::text AS migrations_table,
        (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS public_table_count
    `;
    return NextResponse.json({
      ok: Boolean(identity?.users_table),
      endpointFingerprint: connectionFingerprint(),
      database: identity?.database ?? null,
      schema: identity?.schema ?? null,
      publicTableCount: Number(identity?.public_table_count ?? 0),
      usersTablePresent: Boolean(identity?.users_table),
      migrationLedgerPresent: Boolean(identity?.migrations_table)
    }, { status: identity?.users_table ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, endpointFingerprint: connectionFingerprint(), error: error instanceof Error ? error.name : "DatabaseConnectionError" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
