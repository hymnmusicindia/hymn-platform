import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function GET() { const admin = await requireAdminPermission("royalties.import"); if ("error" in admin) return admin.error; if (!process.env.DATABASE_URL?.trim()) return NextResponse.json({ error: "Royalty import history is unavailable because DATABASE_URL is not configured on the server." }, { status: 503 }); const imports = await prisma.royaltyStatement.findMany({ include: { importedBy: { select: { name: true, email: true } }, jobs: { orderBy: { startedAt: "desc" }, take: 1 } }, orderBy: { createdAt: "desc" }, take: 100 }); return NextResponse.json({ imports }); }

// vercel trigger 14
