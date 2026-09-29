import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { updateUserRole } from "@/lib/db";

const schema = z.object({ producerName: z.string().trim().min(2).max(100), genre: z.string().trim().min(2).max(100), termsAccepted: z.literal(true), rightsConfirmed: z.literal(true), ageConfirmed: z.literal(true) });

export async function POST(request: Request) {
  const result = await requireUser();
  if ("error" in result) return result.error;
  if (result.user.role === "admin") return NextResponse.json({ error: "Administrator accounts cannot be converted." }, { status: 400 });
  if (result.user.role === "producer") return NextResponse.json({ ok: true, href: "/producer/dashboard" });
  try {
    const input = schema.parse(await request.json());
    await updateUserRole(result.user.id, "producer");
    await prisma.auditLog.create({ data: { actorId: result.user.id, action: "PRODUCER_SELF_ENROLLED", entity: "users", entityId: String(result.user.id), metadata: { producerName: input.producerName, genre: input.genre, policy: "producer-terms", policyVersion: "2026-09-30", rightsConfirmed: true, ageConfirmed: true } } });
    await prisma.notification.create({ data: { userId: result.user.id, title: "Your producer workspace is ready", body: "Complete your storefront and submit your first original beat for catalog review.", type: "account", href: "/producer/dashboard", actionLabel: "Open producer workspace" } });
    return NextResponse.json({ ok: true, href: "/producer/dashboard" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not activate producer access." }, { status: 400 });
  }
}
