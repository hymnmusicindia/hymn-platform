import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { getPayoutCredential, savePayoutCredential } from "@/lib/payout/credentials";

export const runtime = "nodejs";
export async function GET() { const auth = await requireUser(); if ("error" in auth) return auth.error; return NextResponse.json({ credential: await getPayoutCredential(auth.user.id) }); }
async function save(request: Request) { const auth = await requireUser(); if ("error" in auth) return auth.error; const body = await request.json().catch(() => ({})); try { return NextResponse.json({ credential: await savePayoutCredential(auth.user.id, { method: body.method === "BANK" ? "BANK" : "UPI", upiId: body.upiId, accountHolderName: body.accountHolderName, bankAccountNumber: body.bankAccountNumber, ifsc: body.ifsc, taxInfo: body.taxInfo }) }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save payout details." }, { status: 400 }); } }
export const POST = save; export const PATCH = save;
