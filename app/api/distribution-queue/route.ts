import { NextResponse } from "next/server";
import { requireAdmin, requireUser } from "@/lib/access";
import {
  createDistributionQueueEntry,
  getDetailedReleaseByUserId,
  listDistributionQueueEntries,
  transitionDistributionQueueEntry
} from "@/lib/distribution-db";
import type { DistributionQueueStage } from "@/lib/types";

export const runtime = "nodejs";

function parseStage(value: unknown): DistributionQueueStage | undefined {
  return typeof value === "string" ? value as DistributionQueueStage : undefined;
}

export async function POST(request: Request) {
  const result = await requireUser();
  if ("error" in result) return result.error;

  try {
    const body = await request.json();
    const releaseId = Number(body.releaseId);
    if (!Number.isInteger(releaseId) || releaseId <= 0) {
      return NextResponse.json({ error: "Valid releaseId is required." }, { status: 400 });
    }
    if (result.user.role !== "admin") {
      const release = await getDetailedReleaseByUserId(result.user.id, releaseId);
      if (!release) return NextResponse.json({ error: "Release not found." }, { status: 404 });
    }

    const queueEntry = await createDistributionQueueEntry({
      releaseId,
      initialStage: parseStage(body.initialStage) ?? "draft_submitted",
      operatorId: result.user.role === "admin" ? result.user.id : null,
      notes: typeof body.notes === "string" ? body.notes : "Queue entry created.",
      metadata: {
        source: "api",
        requestedBy: result.user.id
      }
    });

    return NextResponse.json({ success: true, queueEntry }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create queue entry.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const result = await requireUser();
  if ("error" in result) return result.error;

  try {
    const { searchParams } = new URL(request.url);
    const stage = parseStage(searchParams.get("stage"));
    const userIdParam = searchParams.get("userId");
    const userId = result.user.role === "admin" && userIdParam ? Number(userIdParam) : result.user.id;
    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ error: "Valid userId is required." }, { status: 400 });
    }

    const entries = await listDistributionQueueEntries({ userId, stage });
    return NextResponse.json({ entries, count: entries.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch queue entries.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const result = await requireAdmin();
  if ("error" in result) return result.error;

  try {
    const body = await request.json();
    const nextStage = parseStage(body.nextStage);
    if (!nextStage) {
      return NextResponse.json({ error: "nextStage is required." }, { status: 400 });
    }

    const queueEntry = await transitionDistributionQueueEntry({
      entryId: body.entryId ? Number(body.entryId) : undefined,
      releaseId: body.releaseId ? Number(body.releaseId) : undefined,
      nextStage,
      operatorId: "sub" in result ? result.sub : null,
      notes: typeof body.notes === "string" ? body.notes : null,
      metadata: typeof body.metadata === "object" && body.metadata ? body.metadata as Record<string, unknown> : undefined
    });

    return NextResponse.json({ success: true, queueEntry });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update queue entry.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
