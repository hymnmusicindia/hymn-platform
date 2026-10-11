import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  return NextResponse.json({ user:session ? { name:session.name, email:session.email, avatarUrl:session.avatarUrl } : null }, {headers:{"Cache-Control":"private, no-store"}});
}
