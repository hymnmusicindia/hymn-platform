import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listOrdersByUser } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const orders = await listOrdersByUser(session.sub);
  return NextResponse.json({ orders });
}

