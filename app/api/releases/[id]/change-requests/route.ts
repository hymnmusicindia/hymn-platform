import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { createReleaseChangeRequest } from "@/lib/release-change-requests";
import type { Prisma } from "@prisma/client";

const schema = z.object({ requestType: z.enum(["correction", "metadata_update", "asset_update", "takedown"]), reason: z.string().trim().min(10).max(2000), desiredEffectiveAt: z.string().datetime().optional(), requestedChanges: z.record(z.string(), z.unknown()).optional() });

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser(); if ("error" in user) return user.error;
  const releaseId = Number((await context.params).id);
  const owned = await prisma.release.count({ where: { id: releaseId, userId: user.user.id } });
  if (!owned) return NextResponse.json({ error: "Release not found." }, { status: 404 });
  return NextResponse.json({ requests: await prisma.releaseChangeRequest.findMany({ where: { releaseId }, orderBy: { submittedAt: "desc" }, take: 100, include: { events: { orderBy: { createdAt: "asc" } } } }) });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser(); if ("error" in user) return user.error;
  try {
    const body = schema.parse(await request.json());
    const result = await createReleaseChangeRequest({ releaseId: Number((await context.params).id), userId: user.user.id, requestType: body.requestType, reason: body.reason, desiredEffectiveAt: body.desiredEffectiveAt ? new Date(body.desiredEffectiveAt) : undefined, requestedChanges: body.requestedChanges as Prisma.InputJsonValue | undefined });
    return NextResponse.json({ request: result }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Change request failed." }, { status: 400 }); }
}
// vercel trigger 9
