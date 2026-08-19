import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access";
import { adminStatusSchema } from "@/lib/validation";
import { updateDetailedReleaseStatus } from "@/lib/distribution-db";
import { submitRelease } from "@/lib/distribution-service";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAdmin();
  if ("error" in result) return result.error;

  const { id } = await params;

  try {
    const payload = adminStatusSchema.parse(await request.json());
    if (payload.status === "approved") {
      const origin = new URL(request.url).origin;
      const submission = await submitRelease(Number(id), { actorId: "sub" in result ? result.sub : null, siteUrl: origin });
      if (!submission.submitted) {
        const messages = submission.validation.issues.map((issue) => issue.message);
        return NextResponse.json(
          { release: submission.release, error: messages[0] ?? "Distributor submission did not complete.", validation: submission.validation, retryable: submission.retryable },
          { status: submission.validation.ok ? 502 : 400 }
        );
      }
      return NextResponse.json({ release: submission.release });
    }
    const release = await updateDetailedReleaseStatus(Number(id), payload.status, payload.note);
    if (!release) return NextResponse.json({ error: "Release not found." }, { status: 404 });
    return NextResponse.json({ release });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Status update failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
