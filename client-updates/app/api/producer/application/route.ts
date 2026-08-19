import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { createProducerApplication, findLatestProducerApplicationByUser } from "@/lib/db";
import { producerApplicationSchema } from "@/lib/validation";

export async function GET() {
  const result = await requireUser();
  if ("error" in result) return result.error;

  const application = await findLatestProducerApplicationByUser(result.user.id);
  return NextResponse.json({ application });
}

export async function POST(request: Request) {
  const result = await requireUser();
  if ("error" in result) return result.error;

  try {
    if (result.user.role === "producer") {
      return NextResponse.json({ error: "You already have producer access." }, { status: 400 });
    }

    const existing = await findLatestProducerApplicationByUser(result.user.id);
    if (existing?.status === "pending") {
      return NextResponse.json({ error: "An application is already pending review." }, { status: 400 });
    }

    const payload = producerApplicationSchema.parse(await request.json());
    const application = await createProducerApplication({
      userId: result.user.id,
      name: result.user.name,
      email: result.user.email,
      ...payload
    });

    return NextResponse.json({ application }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create producer application.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}


