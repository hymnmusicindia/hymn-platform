import { NextResponse } from "next/server";
import { contactSchema } from "@/lib/validation";
import { createContactMessage } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Please log in before sending an inquiry." }, { status: 401 });
  }

  try {
    const payload = contactSchema.parse(await request.json());
    const message = await createContactMessage(payload);
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not store contact message.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

