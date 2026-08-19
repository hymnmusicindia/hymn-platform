import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access";
import { reviewProducerApplication } from "@/lib/db";
import { producerApplicationReviewSchema } from "@/lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAdmin();
  if ("error" in result) return result.error;

  const { id } = await params;

  try {
    const payload = producerApplicationReviewSchema.parse(await request.json());
    const reviewerId = "sub" in result ? result.sub : 1;
    const application = await reviewProducerApplication(Number(id), payload.status, reviewerId, payload.reviewNote);
    if (!application) return NextResponse.json({ error: "Application not found." }, { status: 404 });
    return NextResponse.json({ application });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update application.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
