import { NextResponse } from "next/server";
import { contactSchema } from "@/lib/validation";
import { createContactMessage } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const payload = contactSchema.parse(await request.json());
    const message = await createContactMessage(payload);
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not store contact message.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

