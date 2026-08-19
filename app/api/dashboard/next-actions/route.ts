import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { getNextActionsForUser } from "@/lib/next-actions";
export async function GET() { const user = await requireUser(); if ("error" in user) return user.error; return NextResponse.json({ actions: await getNextActionsForUser(user.user.id) }); }
